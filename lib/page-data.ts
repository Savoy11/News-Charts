import { cache } from "react";
import { getPool } from "./db";
import { loadEvents, loadPrices, loadSubject, loadIndustryFor, loadSectorEvents, isStale, type IndustryRef } from "./store/read";
import { ensureSources, emptyStats, upsertEvent, upsertSubject, upsertTopicSubject, linkToIndustry } from "./ingest/store";
import { PricePoint, TimelineEvent } from "./types";
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
 * Persist what we just fetched. Best-effort: a write failure must never take down a
 * page that already has its data in hand.
 */
async function persist(
  subject: Parameters<typeof upsertSubject>[1],
  events: TimelineEvent[],
  prices?: PricePoint[],
  industry?: Industry | null
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
          `INSERT INTO prices (subject_id, on_date, close)
           SELECT $1, d, c FROM unnest($2::date[], $3::numeric[]) AS t(d, c)
           ON CONFLICT (subject_id, on_date) DO UPDATE SET close = EXCLUDED.close`,
          [subjectId, prices.map((p) => p.time), prices.map((p) => p.value)]
        );
      }
      if (industry) await linkToIndustry(client, subjectId, industry);
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
  events: TimelineEvent[]
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

async function getTopicPageDataImpl(topic: string): Promise<TopicPageData | null> {
  // 1. serve from the database when we have a fresh copy
  try {
    const subject = await loadSubject(topic);
    if (subject && !isStale(subject.refreshedAt, TOPIC_TTL_MINUTES)) {
      const events = await loadEvents(subject.id);
      if (events.length) {
        return {
          title: subject.displayName,
          summary: subject.summary ?? "",
          events,
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

  const [pressCandidates, news, nyt, guardian, newsdata, gnews, currents] = await Promise.all([
    getPressMentions(topic),
    getNews(topic),
    getNytNews(topic),
    getGuardianNews(topic),
    getNewsdataNews(topic),
    getGnewsNews(topic),
    getCurrentsNews(topic),
  ]);
  const firstEventOn = wiki.events[0]?.date ?? null;
  const floor = firstEventOn ? Number(firstEventOn.slice(0, 4)) : 0;
  const events = dedupByUrl(
    wiki.events,
    dropImplausiblePress(pressCandidates, floor),
    news.slice(0, 30),
    nyt,
    guardian,
    newsdata,
    gnews,
    currents
  );

  await persistTopic(
    { searchTerm: topic, wikipediaTitle: wiki.title, displayName: wiki.title,
      summary: wiki.summary, firstEventOn },
    events
  );

  return { title: wiki.title, summary: wiki.summary, events, servedFrom: "live" };
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

  const [prices, filings, news, yahoo, nyt, guardian, newsdata, gnews, currents, marketaux, eodhd, finnhub, pressCandidates, siteDomain, sicIndustry, story] =
    await Promise.all([
      getDailyPrices(company.ticker),
      getFilings(company),
      getNews(company.name),
      getYahooFinanceNews(company.ticker),
      getNytNews(commonName(company.name)),
      getGuardianNews(commonName(company.name)),
      getNewsdataNews(commonName(company.name)),
      getGnewsNews(commonName(company.name)),
      getCurrentsNews(commonName(company.name)),
      // finance-native: query by ticker, not name — their entity tagging is the point
      getMarketauxNews(commonName(company.name), company.ticker),
      getEodhdNews(company.ticker),
      getFinnhubNews(company.ticker),
      // period newspaper scans for the pre-IPO era of old companies
      getPressMentions(commonName(company.name)).catch(() => []),
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
  const events = dedupByUrl(
    [...filings, ...(story?.events ?? []), ...press],
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
    prices,
    sicIndustry
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
    prices,
    events: dropCompanyPrehistory([...events, ...sector]),
    industry,
    servedFrom: "live",
  };
}
