import { resolveCompany } from "./sec";
import { getCompanyPageData, getTopicPageData } from "./page-data";
import { loadSubject } from "./store/read";
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

  // A subject that fails to load (a throttled live source, a flaky fetch) must resolve to null,
  // not throw — /compare loads two of these together, so one failure would otherwise 500 the whole
  // page instead of showing a "couldn't find it" notice for the side that didn't load.
  try {
    // Ask the database what this is before asking the network. resolveCompany() reads the
    // EDGAR ticker file, so whenever that is throttled or unreachable a real ticker used to
    // fall through to the topic branch below — which still finds the company by slug, but
    // returns it as a topic with no prices. The page then loses its price overlay, the one
    // thing /compare exists for, while /company/<ticker> beside it renders fine from the
    // same rows. Every other loader is database-first; this one no longer isn't.
    const known = await loadSubject(q).catch(() => null);
    if (known?.kind === "company" && known.ticker) {
      const data = await getCompanyPageData(known.ticker);
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
  } catch {
    /* fall through to null — the page shows a "couldn't find" notice for this side */
  }

  return null;
}
