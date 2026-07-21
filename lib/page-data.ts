import { getPool } from "./db";
import { loadEvents, loadPrices, loadSubject, isStale } from "./store/read";
import { ensureSources, emptyStats, upsertEvent, upsertSubject } from "./ingest/store";
import { PricePoint, TimelineEvent } from "./types";
import { getTopicTimeline } from "./wiki";
import { getPressMentions, dropImplausiblePress } from "./loc";
import { getNews } from "./news";
import { resolveCompany, getFilings } from "./sec";
import { getDailyPrices } from "./prices";
import { getOfficialDomain } from "./wikidata";

const TOPIC_TTL_MINUTES = 360; // 6h — topic history barely moves
const COMPANY_TTL_MINUTES = 60; // 1h — prices and filings do

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
  servedFrom: ServedFrom;
}

/**
 * Persist what we just fetched. Best-effort: a write failure must never take down a
 * page that already has its data in hand.
 */
async function persist(
  subject: Parameters<typeof upsertSubject>[1],
  events: TimelineEvent[],
  prices?: PricePoint[]
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
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } catch (err) {
    console.warn("[chronolens] persist skipped:", (err as Error).message);
  } finally {
    client?.release();
  }
}

export async function getTopicPageData(topic: string): Promise<TopicPageData | null> {
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
    console.warn("[chronolens] db read failed, falling back to live:", (err as Error).message);
  }

  // 2. otherwise fetch live, then store what we got for next time
  const wiki = await getTopicTimeline(topic);
  if (!wiki) return null;

  const [pressCandidates, news] = await Promise.all([getPressMentions(topic), getNews(topic)]);
  const firstEventOn = wiki.events[0]?.date ?? null;
  const floor = firstEventOn ? Number(firstEventOn.slice(0, 4)) : 0;
  const events = [
    ...wiki.events,
    ...dropImplausiblePress(pressCandidates, floor),
    ...news.slice(0, 30),
  ];

  await persist(
    {
      kind: "topic",
      slug: topic,
      displayName: wiki.title,
      wikipediaTitle: wiki.title,
      summary: wiki.summary,
      firstEventOn,
    },
    events
  );

  return { title: wiki.title, summary: wiki.summary, events, servedFrom: "live" };
}

export async function getCompanyPageData(ticker: string): Promise<CompanyPageData | null> {
  try {
    const subject = await loadSubject(ticker);
    if (subject?.ticker && !isStale(subject.refreshedAt, COMPANY_TTL_MINUTES)) {
      const [events, prices] = await Promise.all([
        loadEvents(subject.id),
        loadPrices(subject.id),
      ]);
      if (events.length && prices.length) {
        return {
          name: subject.displayName,
          ticker: subject.ticker,
          siteDomain: subject.siteDomain,
          prices,
          events,
          servedFrom: "database",
        };
      }
    }
  } catch (err) {
    console.warn("[chronolens] db read failed, falling back to live:", (err as Error).message);
  }

  const company = await resolveCompany(ticker);
  if (!company) return null;

  const [prices, filings, news, siteDomain] = await Promise.all([
    getDailyPrices(company.ticker),
    getFilings(company),
    getNews(company.name),
    getOfficialDomain(company.name),
  ]);
  const events = [...filings, ...news];

  await persist(
    {
      kind: "company",
      slug: company.ticker,
      displayName: company.name,
      ticker: company.ticker,
      cik: company.cik,
      siteDomain,
    },
    events,
    prices
  );

  return {
    name: company.name,
    ticker: company.ticker,
    siteDomain,
    prices,
    events,
    servedFrom: "live",
  };
}
