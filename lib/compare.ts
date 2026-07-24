import { resolveCompany } from "./sec";
import { getCompanyPageData, getTopicPageData } from "./page-data";
import type { PricePoint, TimelineEvent } from "./types";

/**
 * Loads either kind of subject into one shape for the /compare page. Reuses the exact same
 * loaders the company and topic pages use — one source of truth — and resolves a raw query the
 * same way the search box does: a ticker/name that resolves to a company is a company, anything
 * else is a topic.
 */
export interface CompareSubject {
  kind: "company" | "topic";
  /** canonical key echoed back into the URL (ticker for a company, the query for a topic) */
  key: string;
  label: string;
  href: string;
  events: TimelineEvent[];
  prices: PricePoint[];
}

export async function loadCompareSubject(query: string): Promise<CompareSubject | null> {
  const q = query.trim();
  if (!q) return null;

  const company = await resolveCompany(q).catch(() => null);
  if (company) {
    const data = await getCompanyPageData(company.ticker);
    if (data) {
      return {
        kind: "company",
        key: data.ticker,
        label: `${data.name} (${data.ticker})`,
        href: `/company/${data.ticker}`,
        events: data.events,
        prices: data.prices,
      };
    }
  }

  const topic = await getTopicPageData(q);
  if (topic) {
    return {
      kind: "topic",
      key: q,
      label: topic.title,
      href: `/topic/${encodeURIComponent(q)}`,
      events: topic.events,
      prices: [],
    };
  }

  return null;
}
