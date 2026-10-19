import { cache } from "react";
import { unstable_cache } from "next/cache";
import { heldTickers, loadEvents, loadPrices, loadSubject, loadIndustryFor, loadSectorEvents, type IndustryRef } from "./store/read";
import { PricePoint, TimelineEvent } from "./types";
import { requestSubject } from "./ingest/queue";
import { firstPassCompany, firstPassTopic } from "./ingest/firstPass";
import { dropCompanyPrehistory } from "./history";
import { withoutSharedSectorRows } from "./eventMerge";
import { resolveTickerLocally, siblingFunds } from "./sec";
import { loadSectorStanding, type SectorStanding } from "./signals";


// Request-memoised so a page and its generateMetadata share one load instead of fetching twice.
// (Function declarations below are hoisted, so referencing them here is fine.)
export const getTopicPageData = cache(
  (topic: string): Promise<TopicPageData | null> => getTopicPageDataImpl(topic)
);
export const getCompanyPageData = cache(
  (ticker: string): Promise<CompanyPageData | null> => getCompanyPageDataImpl(ticker)
);

/**
 * When `npm run refresh` last wrote this subject.
 *
 * This replaces a `servedFrom: "database" | "live"` flag. Commit 813d505 removed live fetching
 * from the render path, after which `"live"` was unreachable and the badge on every page said
 * `stored` unconditionally — a two-valued badge implying a comparison the code no longer
 * performs. What a reader actually needs from a provenance badge on a database-only site is not
 * *which* path served the page but *how old* what it served is, which is this.
 */
export type RefreshedAt = Date | null;

export interface TopicPageData {
  title: string;
  /**
   * The stored subject slug — the page's one canonical address. Not the URL segment the visitor
   * arrived on: that may be an alias ("electric car" for "electric cars"), and Next hands it over
   * still percent-encoded, so building links from it double-encoded them (NC-158).
   */
  slug: string;
  summary: string;
  /** the Wikipedia article the summary is quoted from, for its CC BY-SA credit */
  wikipediaTitle: string | null;
  events: TimelineEvent[];
  /**
   * Empty for ordinary topics. A crypto asset is modelled as a topic but has a continuous
   * price series, so its page renders the same chart a company page does.
   */
  prices: PricePoint[];
  refreshedAt: RefreshedAt;
}

export interface CompanyPageData {
  name: string;
  ticker: string;
  /** Wikipedia's lede, kept by `ingestCompany` only when the article answers the name; "" if none */
  summary: string;
  /** the Wikipedia article the summary is quoted from, for its CC BY-SA credit */
  wikipediaTitle: string | null;
  siteDomain: string | null;
  prices: PricePoint[];
  events: TimelineEvent[];
  industry: IndustryRef | null;
  /** every member's return against the sector median; null below three members with prices */
  standing: SectorStanding | null;
  /** for a fund, the other series its registrant files, those the site holds first; else null */
  siblings: { registrantCik: string; funds: { ticker: string; name: string; held: boolean }[] } | null;
  refreshedAt: RefreshedAt;
}






/**
 * Pages read the database and nothing else.
 *
 * This used to fall through to a live fetch whenever the stored copy was stale *or* the database
 * was unreachable, which cost three things. The visitor arriving first after a TTL expired waited
 * on eleven feeds. Several arriving together each triggered their own fetch. And a database
 * outage turned every page view into a live fetch, burning the free tiers precisely when they
 * could least be spared.
 *
 * `npm run refresh` owns fetching now, so the cost is a function of how many subjects exist —
 * a number we choose — instead of how much traffic arrives, which is not. A subject we do not
 * have renders a notice and is queued; it is not fetched under a visitor.
 *
 * Staleness no longer hides a stored copy either: showing what we have, dated, beats showing
 * nothing while a scheduler catches up.
 */
async function getTopicPageDataImpl(topic: string): Promise<TopicPageData | null> {
  try {
    const held = await heldTopic(topic);
    if (held) return held;
    /**
     * Not indexed — run the bounded first pass while this visitor waits, then read again.
     *
     * This is the deliberate, quantitative exception to the database-only rule above (see
     * lib/ingest/firstPass.ts for the full argument): one keyless source, claimed through an
     * attempt ledger before any fetch, under a deadline, on its own two-connection pool. The
     * scheduler still owns depth — the request queue below is what deepens this page later.
     */
    const outcome = await firstPassTopic(topic);
    if (outcome === "ingested" || outcome === "already_attempted") {
      // read live, not through the cache: this is the read that finds what was just written
      const fresh = await heldTopicPage(topic);
      if (fresh) {
        await requestSubject(topic, "topic"); // queue the deepening pass
        return fresh;
      }
    }
    // Record the demand so the scheduled run picks it up, and tell the visitor.
    await requestSubject(topic, "topic");
    return null;
  } catch (err) {
    // The database is the only source a page has now, so an outage is an outage — it must not
    // silently become eleven live fetches per page view.
    console.warn("[news-charts] db read failed:", (err as Error).message);
    return null;
  }
}

/** Database-only, for the reasons set out above `getTopicPageDataImpl`. */
/** A topic we hold, if it holds anything to render. */
async function heldTopicPage(topic: string): Promise<TopicPageData | null> {
  const subject = await loadSubject(topic);
  if (!subject) return null;
  const [events, prices] = await Promise.all([loadEvents(subject.id), loadPrices(subject.id)]);
  if (!events.length) return null;
  return {
    title: subject.displayName,
    slug: subject.slug,
    summary: subject.summary ?? "",
    wikipediaTitle: subject.wikipediaTitle ?? null,
    events,
    prices,
    refreshedAt: subject.refreshedAt,
  };
}

/**
 * The held-page reads, cached for the 15 minutes the routes' `revalidate = 900` promised and never
 * delivered (NC-159).
 *
 * With no `generateStaticParams`, the build marked the subject routes dynamic and every view —
 * bots included — ran the full query set on a four-connection pool. Full-page caching is not the
 * fix for these two routes: a miss runs a first-visit gather and must never be cached, and under
 * Next 14 opting one render out of a cached route is a 500 ("Page changed from static to dynamic
 * at runtime"). So the routes stay dynamic and their reads are cached instead.
 *
 * Only a held page is trusted from the cache. A cached "not held" is checked against the database
 * again straight away, so a subject ingested a minute ago is never hidden behind it, while a held
 * page costs no queries until its 15 minutes are up. Values cross the cache as JSON, so the one
 * Date is revived on the way out.
 */
const PAGE_CACHE_SECONDS = 900;
const cachedHeldCompany = unstable_cache((key: string) => heldCompanyPage(key), ["held-company-page", "v4"], {
  revalidate: PAGE_CACHE_SECONDS,
  tags: ["subject-pages"],
});
const cachedHeldTopic = unstable_cache((key: string) => heldTopicPage(key), ["held-topic-page", "v1"], {
  revalidate: PAGE_CACHE_SECONDS,
  tags: ["subject-pages"],
});

function revive<T extends { refreshedAt: RefreshedAt }>(page: T): T {
  return { ...page, refreshedAt: page.refreshedAt ? new Date(page.refreshedAt) : null };
}

async function heldCompany(key: string): Promise<CompanyPageData | null> {
  const k = key.trim().toLowerCase();
  const cached = await cachedHeldCompany(k);
  return cached ? revive(cached) : heldCompanyPage(k);
}

async function heldTopic(topic: string): Promise<TopicPageData | null> {
  const k = topic.trim().toLowerCase();
  const cached = await cachedHeldTopic(k);
  return cached ? revive(cached) : heldTopicPage(k);
}

/**
 * A company we hold, if it holds enough to render: events. Prices used to be required too, so a
 * company whose chart fetch failed showed "not on News Charts yet" over a timeline we held, and
 * was queued for a gather it did not need (NC-103). The page says the chart is missing instead.
 */
async function heldCompanyPage(key: string): Promise<CompanyPageData | null> {
  const subject = await loadSubject(key);
  if (!subject?.ticker) return null;
  const [events, prices, industry] = await Promise.all([
    loadEvents(subject.id),
    loadPrices(subject.id),
    loadIndustryFor(subject.id),
  ]);
  if (!events.length) return null;
  const siblings = await fundSiblings(subject.ticker);
  const [sector, standing] = industry
    ? await Promise.all([
        loadSectorEvents(industry.id).catch(() => []),
        // an enrichment: a page without its sector comparison still renders
        loadSectorStanding(industry.id).catch(() => null),
      ])
    : [[], null];
  return {
    name: subject.displayName,
    ticker: subject.ticker,
    summary: subject.summary ?? "",
    wikipediaTitle: subject.wikipediaTitle ?? null,
    siteDomain: subject.siteDomain,
    prices,
    events: dropCompanyPrehistory([...events, ...withoutSharedSectorRows(events, sector)]),
    industry,
    standing,
    siblings,
    refreshedAt: subject.refreshedAt,
  };
}

/**
 * A fund's siblings, marked by whether the site holds each: a held one is a page, an unheld one
 * is a first-visit gather, and the link has to say which (2026-10-17 proposal 8). If the database
 * cannot answer, all are shown as unheld — the cautious reading, since that only costs a crawler
 * hint, where the other would promise pages that may not exist.
 */
async function fundSiblings(ticker: string): Promise<CompanyPageData["siblings"]> {
  const found = siblingFunds(ticker);
  if (!found) return null;
  const held = await heldTickers(found.funds.map((f) => f.ticker)).catch(() => new Set<string>());
  const funds = found.funds.map((f) => ({ ...f, held: held.has(f.ticker) }));
  return {
    registrantCik: found.registrantCik,
    funds: [...funds.filter((f) => f.held), ...funds.filter((f) => !f.held)],
  };
}

async function getCompanyPageDataImpl(query: string): Promise<CompanyPageData | null> {
  try {
    const held = await heldCompany(query);
    if (held) return held;

    /**
     * A name rather than a symbol — /company/Ford. The corpus is keyed by ticker, so this read
     * missed even with F on the site; the first pass then resolved Ford to F and re-fetched EDGAR
     * and Yahoo for a company we already held, re-read by "Ford", missed again, and queued a
     * request for a ticker named "Ford" (NC-161). Resolve first: a held company is served as it
     * is (the page redirects to its ticker), and anything else is gathered and queued under the
     * ticker the name resolved to. The committed index alone: anything it cannot name goes to
     * the first pass unchanged, whose attempt ledger is what may spend a request on it.
     */
    const ticker = resolveTickerLocally(query) ?? query;
    if (ticker.toLowerCase() !== query.toLowerCase()) {
      const byTicker = await heldCompany(ticker);
      if (byTicker) return byTicker;
    }

    // Not indexed — the bounded first pass (EDGAR + the price chart, the two sources whose
    // conjunction flips this page's render gate), then one re-read. Same contract as the
    // topic path above; lib/ingest/firstPass.ts carries the argument.
    const outcome = await firstPassCompany(ticker);
    if (outcome === "ingested" || outcome === "already_attempted") {
      const fresh = await heldCompanyPage(ticker);
      if (fresh) {
        await requestSubject(ticker, "company", ticker); // queue the deepening pass
        return fresh;
      }
    }
    // Record the demand for the scheduled run rather than fetching more under a visitor.
    await requestSubject(ticker, "company", ticker);
    return null;
  } catch (err) {
    console.warn("[news-charts] db read failed:", (err as Error).message);
    return null;
  }
}

