import { cache } from "react";
import { loadEvents, loadPrices, loadSubject, loadIndustryFor, loadSectorEvents, type IndustryRef } from "./store/read";
import { PricePoint, TimelineEvent } from "./types";
import { requestSubject } from "./ingest/queue";
import { firstPassCompany, firstPassTopic } from "./ingest/firstPass";
import { dropCompanyPrehistory } from "./history";


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
  summary: string;
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
  siteDomain: string | null;
  prices: PricePoint[];
  events: TimelineEvent[];
  industry: IndustryRef | null;
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
    const subject = await loadSubject(topic);
    if (subject) {
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
          refreshedAt: subject.refreshedAt,
        };
      }
    }
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
      const subject = await loadSubject(topic);
      if (subject) {
        const [events, prices] = await Promise.all([loadEvents(subject.id), loadPrices(subject.id)]);
        if (events.length) {
          await requestSubject(topic, "topic"); // queue the deepening pass
          return {
            title: subject.displayName,
            summary: subject.summary ?? "",
            events,
            prices,
            refreshedAt: subject.refreshedAt,
          };
        }
      }
    }
    // Record the demand so the scheduled run picks it up, and tell the visitor.
    await requestSubject(topic, "topic");
    return null;
  } catch (err) {
    // The database is the only source a page has now, so an outage is an outage — it must not
    // silently become eleven live fetches per page view.
    console.warn("[chronolens] db read failed:", (err as Error).message);
    return null;
  }
}

/** Database-only, for the reasons set out above `getTopicPageDataImpl`. */
async function getCompanyPageDataImpl(ticker: string): Promise<CompanyPageData | null> {
  try {
    const subject = await loadSubject(ticker);
    if (subject?.ticker) {
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
          refreshedAt: subject.refreshedAt,
        };
      }
    }
    // Not indexed — the bounded first pass (EDGAR + the price chart, the two sources whose
    // conjunction flips this page's render gate), then one re-read. Same contract as the
    // topic path above; lib/ingest/firstPass.ts carries the argument.
    const outcome = await firstPassCompany(ticker);
    if (outcome === "ingested" || outcome === "already_attempted") {
      const subject = await loadSubject(ticker);
      if (subject?.ticker) {
        const [events, prices] = await Promise.all([loadEvents(subject.id), loadPrices(subject.id)]);
        if (events.length && prices.length) {
          await requestSubject(ticker, "company", ticker); // queue the deepening pass
          return {
            name: subject.displayName,
            ticker: subject.ticker,
            siteDomain: subject.siteDomain,
            prices,
            events: dropCompanyPrehistory(events),
            industry: null,
            refreshedAt: subject.refreshedAt,
          };
        }
      }
    }
    // Record the demand for the scheduled run rather than fetching more under a visitor.
    await requestSubject(ticker, "company", ticker);
    return null;
  } catch (err) {
    console.warn("[chronolens] db read failed:", (err as Error).message);
    return null;
  }
}

