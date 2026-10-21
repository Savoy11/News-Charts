import type { SecuritySuggestion } from "./sec";
import type { SubjectCandidate } from "./store/read";

/**
 * Settling a search that matched several held subjects about equally (NC-039). Kept apart from
 * lib/resolveSearch.ts so the search box (a client component) and the offline checks can use it
 * without loading the database layer.
 */

/** One answer offered when a query matches several held subjects about equally well. */
export interface SearchOption {
  label: string;
  /** the ticker for a security, else what kind of page it is */
  detail: string;
  /** the page's address, already encoded */
  href: string;
  /** how the query matched — shown, because "matched the name" and "looked similar" differ */
  via: SubjectCandidate["via"];
}

/** Candidates within this of the best are a tie the visitor should settle, not the sort order. */
export const TIE_MARGIN = 0.03;

/**
 * The candidates too close to call, or [] when the best one is clear.
 *
 * "Ford" matched Ford Motor Co and Ford Motor Credit equally, and "APPLE" Apple Inc and Apple
 * Hospitality REIT; the shorter name won silently (NC-039). An exact ticker is never a tie — a
 * ticker is an identifier, and "F" means one thing.
 */
export function closeCandidates(candidates: SubjectCandidate[]): SubjectCandidate[] {
  const [best, second] = candidates;
  if (!best || !second || best.via === "ticker") return [];
  if (best.score - second.score > TIE_MARGIN) return [];
  return candidates.filter((c) => best.score - c.score <= TIE_MARGIN);
}

export function optionFor(c: SubjectCandidate): SearchOption {
  const href =
    c.kind === "company" && c.ticker
      ? `/company/${c.ticker}`
      : c.kind === "industry"
        ? `/industry/${c.slug}`
        : `/topic/${encodeURIComponent(c.slug)}`;
  return { label: c.displayName, detail: c.ticker ?? c.kind, href, via: c.via };
}

/** A near match from the committed index, offered when a search found nothing (a `suggest`). */
export function optionForSuggestion(s: SecuritySuggestion): SearchOption {
  return { label: s.name, detail: s.ticker, href: `/company/${s.ticker}`, via: s.via };
}

/**
 * The option's page, narrowed to what the query asked about (NC-008). A search that offered a
 * choice still asked its question — "how did covid affect Ford" settles on one of two Fords, and
 * whichever is picked opens on its covid events.
 */
export function withFocus(option: SearchOption, focus: string | null): SearchOption {
  return focus ? { ...option, href: focusHref(option.href, focus) } : option;
}

/** A page address with the focus on it — the one way every caller writes `?focus=`. */
export function focusHref(href: string, focus: string | null | undefined): string {
  return focus ? `${href}${href.includes("?") ? "&" : "?"}focus=${encodeURIComponent(focus)}` : href;
}
