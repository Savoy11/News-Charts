import { cache } from "react";
import { getPool } from "./db";
import { loadEvents, loadPrices, loadSubject, loadIndustryFor, loadSectorEvents, loadLastFetched, isStale, type IndustryRef } from "./store/read";
import { ensureSources, emptyStats, logFetch, upsertEvent, upsertSubject, upsertTopicSubject, linkToIndustry } from "./ingest/store";
import { selectStaleSources } from "./ingest/refresh";
import { LOOSE_SOURCES, applyRelevanceFloor, collapseNearDuplicates } from "./newsQuality";
import { PricePoint, SourceKey, TimelineEvent } from "./types";
import { getTopicTimeline } from "./wiki";
import { getPressMentions, dropImplausiblePress } from "./loc";
import { getNews } from "./news";
import { resolveCompany, getFilings, getIndustry, commonName, type Industry } from "./sec";
import { getDailyPrices } from "./prices";
import { getOfficialDomain } from "./wikidata";
import { dropCompanyPrehistory } from "./history";
import {
  getYahooFinanceNews,
  getNytNews,
  getGuardianNews,
  getNewsdataNews,
  getGnewsNews,
  getCurrentsNews,
  getMarketauxNews,
  getEodhdNews,
  getFinnhubNews,
  dedupByUrl,
} from "./newsExtra";

const TOPIC_TTL_MINUTES = 360; // 6h — topic history barely moves
const COMPANY_TTL_MINUTES = 60; // 1h — prices and filings do

// Request-memoised so a page and its generateMetadata share one load instead of fetching twice.
// (Function declarations below are hoisted, so referencing them here is fine.)
export const getTopicPageData = cache(
  (topic: string): Promise<TopicPageData | null> => getTopicPageDataImpl(topic)
);
export const getCompanyPageData = cache(
  (ticker: string): Promise<CompanyPageData | null> => getCompanyPageDataImpl(ticker)
);

export type ServedFrom = "database" | "live";

export interface TopicPageData {
  title: string;
  summary: string;
  events: TimelineEvent[];
  /**
   * Empty for ordinary topics. A crypto asset is modelled as a topic but has a continuous
   * price series, so its page renders the same chart a company page does.
   */
  prices: PricePoint[];
  servedFrom: ServedFrom;
}

export interface CompanyPageData {
  name: string;
  ticker: string;
  siteDomain: string | null;
  prices: PricePoint[];
  events: TimelineEvent[];
  industry: IndustryRef | null;
  servedFrom: ServedFrom;
}

/**
 * Which sources are due a refresh for a subject we may or may not have seen before.
 *
 * Fails open: if the freshness lookup itself fails, every source is treated as stale, which is
 * exactly the behaviour this replaced. A page must never lose a feed because a bookkeeping
 * query had a bad day.
 */
async function dueSources(slug: string, keys: readonly SourceKey[]): Promise<Set<SourceKey>> {
  try {
    const subject = await loadSubject(slug);
    if (!subject) return new Set(keys); // never ingested — nothing is fresh
    const lastFetched = await loadLastFetched(subject.id);
    return new Set(selectStaleSources(keys, lastFetched));
  } catch {
    return new Set(keys);
  }
}

/**
 * Record that these sources were asked, so the next request can skip the ones still inside
 * their window. Without this the page path has no memory and re-asks everything every time —
 * which is what drained the small free tiers.
 */
async function recordFetches(subjectId: number, asked: readonly SourceKey[], client: import("pg").PoolClient): Promise<void> {
  for (const key of asked) {
    await logFetch(client, key, subjectId, "page", "ok", 0).catch(() => {});
  }
}

/**
 * Persist what we just fetched. Best-effort: a write failure must never take down a
 * page that already has its data in hand.
 */
async function persist(
  subject: Parameters<typeof upsertSubject>[1],
  events: TimelineEvent[],
  prices?: PricePoint[],
  industry?: Industry | null,
  asked: readonly SourceKey[] = []
): Promise<void> {
  let client;
  try {
    client = await getPool().connect();
    await ensureSources(client);
    const subjectId = await upsertSubject(client, subject);
    const stats = emptyStats();
    await client.query("BEGIN");
    try {
      for (const ev of events) {
        if (ev.sourceKey) await upsertEvent(client, ev, subjectId, stats);
      }
      if (prices?.length) {
        await client.query(
          `INSERT INTO prices (subject_id, on_date, close, volume)
           SELECT $1, d, c, v FROM unnest($2::date[], $3::numeric[], $4::bigint[]) AS t(d, c, v)
           ON CONFLICT (subject_id, on_date) DO UPDATE
              SET close = EXCLUDED.close,
                  -- keep a known volume rather than overwrite it with a null from a
                  -- response that happened to omit the field
                  volume = COALESCE(EXCLUDED.volume, prices.volume)`,
          [
            subjectId,
            prices.map((p) => p.time),
            prices.map((p) => p.value),
            prices.map((p) => p.volume ?? null),
          ]
        );
      }
      if (industry) await linkToIndustry(client, subjectId, industry);
      await recordFetches(subjectId, asked, client);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } catch (err) {
    console.warn("[news-charts] persist skipped:", (err as Error).message);
  } finally {
    client?.release();
  }
}

async function persistTopic(
  subject: Parameters<typeof upsertTopicSubject>[1],
  events: TimelineEvent[],
  asked: readonly SourceKey[] = []
): Promise<void> {
  let client;
  try {
    client = await getPool().connect();
    await ensureSources(client);
    const subjectId = await upsertTopicSubject(client, subject);
    const stats = emptyStats();
    await client.query("BEGIN");
    try {
      for (const ev of events) {
        if (ev.sourceKey) await upsertEvent(client, ev, subjectId, stats);
      }
      await recordFetches(subjectId, asked, client);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } catch (err) {
    console.warn("[news-charts] persist skipped:", (err as Error).message);
  } finally {
    client?.release();
  }
}

/**
 * After a partial refresh the in-memory merge holds only the sources we just asked, so the
 * union has to come back out of the database — the skipped sources' events are already there.
 * Falls back to what we fetched if the read fails, which is degraded but never empty.
 */
async function unionFromDatabase(slug: string, fetched: TimelineEvent[]): Promise<TimelineEvent[]> {
  try {
    const subject = await loadSubject(slug);
    if (!subject) return fetched;
    const stored = await loadEvents(subject.id);
    return stored.length >= fetched.length ? stored : fetched;
  } catch {
    return fetched;
  }
}

async function getTopicPageDataImpl(topic: string): Promise<TopicPageData | null> {
  // 1. serve from the database when we have a fresh copy
  try {
    const subject = await loadSubject(topic);
    if (subject && !isStale(subject.refreshedAt, TOPIC_TTL_MINUTES)) {
      const [events, prices] = await Promise.all([
        loadEvents(subject.id),
        loadPrices(subject.id),
      ]);
      if (events.length) {
        return {
          title: subject.displayName,
          summary: subject.summary ?? "",
          events,
          prices,
          servedFrom: "database",
        };
      }
    }
  } catch (err) {
    // database unavailable — the site keeps working on live sources alone
    console.warn("[news-charts] db read failed, falling back to live:", (err as Error).message);
  }

  // 2. otherwise fetch live, then store what we got for next time
  const wiki = await getTopicTimeline(topic);
  if (!wiki) return null;

  // Only ask the sources actually due a refresh. Everything skipped is already in the database
  // and comes back in the union below, so a partial refresh costs the page nothing.
  const TOPIC_SOURCES = ["loc_chronam", "gdelt", "nyt", "guardian", "newsdata", "gnews", "currents"] as const;
  const due = await dueSources(topic, TOPIC_SOURCES);
  const ask = <T>(key: SourceKey, run: () => Promise<T[]>): Promise<T[]> =>
    due.has(key) ? run() : Promise.resolve([]);

  const [pressCandidates, news, nyt, guardian, newsdata, gnews, currents] = await Promise.all([
    ask("loc_chronam", () => getPressMentions(topic)),
    ask("gdelt", () => getNews(topic)),
    ask("nyt", () => getNytNews(topic)),
    ask("guardian", () => getGuardianNews(topic)),
    ask("newsdata", () => getNewsdataNews(topic)),
    ask("gnews", () => getGnewsNews(topic)),
    ask("currents", () => getCurrentsNews(topic)),
  ]);
  const firstEventOn = wiki.events[0]?.date ?? null;
  const floor = firstEventOn ? Number(firstEventOn.slice(0, 4)) : 0;
  // URL dedup first (the same document twice), then story-level collapsing (the same happening
  // reported by several outlets), then the keyword-search floor.
  const events = applyRelevanceFloor(
    collapseNearDuplicates(
      dedupByUrl(
        wiki.events,
        dropImplausiblePress(pressCandidates, floor),
        news.slice(0, 30),
        nyt,
        guardian,
        newsdata,
        gnews,
        currents
      )
    ),
    wiki.title,
    LOOSE_SOURCES,
    [topic]
  );

  await persistTopic(
    { searchTerm: topic, wikipediaTitle: wiki.title, displayName: wiki.title,
      summary: wiki.summary, firstEventOn },
    events,
    // wikipedia was fetched unconditionally above — it is what decides the subject exists
    ["wikipedia", ...due]
  );

  // A live topic render has no price series: prices reach a topic through ingest (crypto
  // assets), not through the Wikipedia path this branch takes.
  return {
    title: wiki.title,
    summary: wiki.summary,
    events: await unionFromDatabase(topic, events),
    prices: [],
    servedFrom: "live",
  };
}

async function getCompanyPageDataImpl(ticker: string): Promise<CompanyPageData | null> {
  try {
    const subject = await loadSubject(ticker);
    if (subject?.ticker && !isStale(subject.refreshedAt, COMPANY_TTL_MINUTES)) {
      const [events, prices, industry] = await Promise.all([
        loadEvents(subject.id),
        loadPrices(subject.id),
        loadIndustryFor(subject.id),
      ]);
      if (events.length && prices.length) {
        const sector = industry ? await loadSectorEvents(industry.id).catch(() => []) : [];
        return {
          name: subject.displayName,
          ticker: subject.ticker,
          siteDomain: subject.siteDomain,
          prices,
          events: dropCompanyPrehistory([...events, ...sector]),
          industry,
          servedFrom: "database",
        };
      }
    }
  } catch (err) {
    console.warn("[news-charts] db read failed, falling back to live:", (err as Error).message);
  }

  const company = await resolveCompany(ticker);
  if (!company) return null;

  // Per-source windows: a stale subject no longer means fifteen requests. The keyed feeds sit
  // on free tiers small enough that re-asking them hourly drains the day's budget.
  const COMPANY_SOURCES = [
    "sec_edgar", "gdelt", "yahoo_finance", "nyt", "guardian", "newsdata",
    "gnews", "currents", "marketaux", "eodhd", "finnhub", "loc_chronam",
  ] as const;
  const due = await dueSources(company.ticker, COMPANY_SOURCES);
  const ask = <T>(key: SourceKey, run: () => Promise<T[]>): Promise<T[]> =>
    due.has(key) ? run() : Promise.resolve([]);

  const [priceData, filings, news, yahoo, nyt, guardian, newsdata, gnews, currents, marketaux, eodhd, finnhub, pressCandidates, siteDomain, sicIndustry, story] =
    await Promise.all([
      getDailyPrices(company.ticker),
      ask("sec_edgar", () => getFilings(company)),
      ask("gdelt", () => getNews(company.name)),
      ask("yahoo_finance", () => getYahooFinanceNews(company.ticker)),
      ask("nyt", () => getNytNews(commonName(company.name))),
      ask("guardian", () => getGuardianNews(commonName(company.name))),
      ask("newsdata", () => getNewsdataNews(commonName(company.name))),
      ask("gnews", () => getGnewsNews(commonName(company.name))),
      ask("currents", () => getCurrentsNews(commonName(company.name))),
      // finance-native: query by ticker, not name — their entity tagging is the point
      ask("marketaux", () => getMarketauxNews(commonName(company.name), company.ticker)),
      ask("eodhd", () => getEodhdNews(company.ticker)),
      ask("finnhub", () => getFinnhubNews(company.ticker)),
      // period newspaper scans for the pre-IPO era of old companies
      ask("loc_chronam", () => getPressMentions(commonName(company.name)).catch(() => [])),
      getOfficialDomain(company.name),
      getIndustry(company),
      // the company's story predates its ticker: Wikipedia history + cited articles
      // cover the run-up to going public, which filings and news feeds can't reach
      getTopicTimeline(commonName(company.name)).catch(() => null),
    ]);
  // Press scans only make sense from the company's founding onward — same implausibility
  // guard as topics ("Apple" in an 1890 paper is the fruit). No wiki story → no floor →
  // skip press entirely rather than let OCR noise in.
  const firstStoryYear = story?.events[0]?.date ? Number(story.events[0].date.slice(0, 4)) : null;
  const press = firstStoryYear ? dropImplausiblePress(pressCandidates, firstStoryYear) : [];
  // citations first so a story cited by Wikipedia keeps its curated form when a feed
  // also carries the same URL; every list after it drops duplicates by URL
  // Same three passes as the topic path. The floor is given both the legal name and the common
  // one, because a headline says "Ford", not "Ford Motor Company".
  const events = applyRelevanceFloor(
    collapseNearDuplicates(
      dedupByUrl(
        [...filings, ...priceData.actions, ...(story?.events ?? []), ...press],
        news,
        yahoo,
        nyt,
        guardian,
        newsdata,
        gnews,
        currents,
        marketaux,
        eodhd,
        finnhub
      )
    ),
    company.name,
    LOOSE_SOURCES,
    [commonName(company.name), company.ticker]
  );

  await persist(
    {
      kind: "company",
      slug: company.ticker,
      displayName: company.name,
      ticker: company.ticker,
      cik: company.cik,
      sic: sicIndustry?.sic ?? null,
      siteDomain,
    },
    events,
    priceData.points,
    sicIndustry,
    // wikipedia and the price/actions fetch run unconditionally; the rest is whatever was due
    ["wikipedia", "yahoo_finance", ...due]
  );

  // read the membership back so the peer count reflects everyone ingested so far
  let industry: IndustryRef | null = null;
  if (sicIndustry) {
    const subject = await loadSubject(company.ticker).catch(() => null);
    if (subject) industry = await loadIndustryFor(subject.id).catch(() => null);
  }
  const sector = industry ? await loadSectorEvents(industry.id).catch(() => []) : [];

  return {
    name: company.name,
    ticker: company.ticker,
    siteDomain,
    prices: priceData.points,
    events: dropCompanyPrehistory([...(await unionFromDatabase(company.ticker, events)), ...sector]),
    industry,
    servedFrom: "live",
  };
}
