import type { SourceKey } from "./types";

/**
 * The house form for "who is this from".
 *
 * Every event already carried a source label and an outward link, but across eleven feeds the
 * labels meant different things: GDELT reported a bare domain, NYT and the Guardian reported a
 * masthead, the archives reported an institution, and the aggregators reported **their own name**
 * whenever the article arrived without an outlet. That last one is not an inconsistency, it is a
 * false statement — GNews did not publish the article, it found it.
 *
 * The form is the same one the on-chain attribution work settled on: **who it came from, then
 * how we reached it**. `Reuters · via GNews` says two true things. `GNews` says one false one.
 *
 *   Reuters                        publisher known, found directly
 *   Reuters · via GNews            publisher known, found through an aggregator
 *   Unattributed · via GNews       the aggregator gave us no outlet
 *   Chronicling America · …        an institution is the publisher of record
 */

/** Aggregators: how an article was found, never who wrote it. */
const AGGREGATOR_NAMES: Partial<Record<SourceKey, string>> = {
  gdelt: "GDELT",
  newsdata: "Newsdata.io",
  gnews: "GNews",
  currents: "Currents",
  marketaux: "Marketaux",
  eodhd: "EODHD",
  finnhub: "Finnhub",
};

/** Said when a feed hands over an article without telling us who published it. */
export const UNATTRIBUTED = "Unattributed";

/**
 * A bare domain, tidied but not embellished.
 *
 * `www.` and a trailing slash are noise. The masthead is *not* inferred: turning "nytimes.com"
 * into "The New York Times" would be a guess dressed as a fact, and turning it into "Nytimes"
 * is worse than the domain it replaced. A domain is a real, checkable publisher identity — it
 * just isn't a pretty one.
 */
export function cleanDomain(raw: string | undefined): string | null {
  const d = (raw ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
}

/**
 * Build the label.
 *
 * `publisher` is whatever the feed told us about the outlet — often nothing. `via` is the feed
 * itself, included only when it adds information: a story from the NYT's own API is just "The
 * New York Times", because "via NYT" says nothing twice.
 */
export function sourceLabel(publisher: string | null | undefined, via?: SourceKey): string {
  const name = (publisher ?? "").trim();
  const feed = via ? AGGREGATOR_NAMES[via] : undefined;
  if (!feed) return name || UNATTRIBUTED;
  if (!name) return `${UNATTRIBUTED} · via ${feed}`;
  // An aggregator sometimes reports itself as the outlet; saying it twice helps nobody.
  if (name.toLowerCase() === feed.toLowerCase()) return `${UNATTRIBUTED} · via ${feed}`;
  return `${name} · via ${feed}`;
}

/**
 * Attribution a licence *requires* on screen, as opposed to credit we give by choice.
 *
 * Wikipedia is the one that actually binds: CC BY-SA obliges crediting the contributors and
 * naming the licence wherever the text is reused. The others here are public domain or open
 * data, where credit is courtesy and accuracy rather than a condition — but recording which is
 * which is the point, because the difference is invisible once both are just strings on a page.
 */
export const LICENCE_CREDIT: Partial<Record<SourceKey, string>> = {
  wikipedia: "Wikipedia contributors, CC BY-SA 4.0",
};

/** Whether a row must carry a licence line rather than just a source name. */
export const requiresLicenceCredit = (key: SourceKey | undefined): boolean =>
  key !== undefined && key in LICENCE_CREDIT;
