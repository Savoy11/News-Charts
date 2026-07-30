import type { TimelineEvent } from "./types";

/**
 * The keyless half of a focused search.
 *
 * "How did Donald Trump's presidency affect IBM stock" is a question about an *intersection*:
 * the reader wants IBM's price with the IBM events that also concern Trump, not Trump's own
 * timeline drawn beside it. Everything on a subject's page is already about that subject, so
 * narrowing it by the influence is exactly that intersection — including the sector regulations
 * that reach the page through the industry graph, which for a political influence are usually
 * the events that matter most.
 *
 * Until now `focus` only pre-filled the AI panel, so a visitor without a model key asked the
 * question and got an unfiltered timeline with their phrase sitting in a text box.
 *
 * This is deliberately a *filter the reader can see and undo*, never a silent one. Hiding most
 * of a timeline because a keyword did not appear is the same class of error as inventing a date:
 * the page would look complete and be a subset.
 */

/** Words too common to narrow anything, plus the scaffolding a prompt leaves behind. */
const WEAK = new Set([
  "the", "and", "of", "for", "on", "in", "to", "a", "an", "at", "by", "with", "from",
  "his", "her", "its", "their", "this", "that", "these", "those",
  "how", "did", "does", "do", "has", "have", "had", "was", "were", "is", "are", "be",
  "effect", "effects", "impact", "impacts", "influence", "affected", "affect",
  "stock", "stocks", "share", "shares", "price", "prices", "company", "inc", "corp",
]);

const normalise = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Singular-ish form, so "Trumps" matches "Trump" and "tariffs" matches "tariff".
 *
 * Crude on purpose. A real stemmer would also fold "presidency" and "president", which sounds
 * like an improvement until it folds two genuinely different words together and the reader
 * cannot tell why an article is in their results.
 */
const stem = (w: string): string => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w);

/** The parts of a focus phrase worth matching on. Empty when the phrase says nothing specific. */
export function focusTerms(focus: string): string[] {
  const seen = new Set<string>();
  for (const w of normalise(focus).split(" ")) {
    if (w.length < 3 || WEAK.has(w)) continue;
    seen.add(stem(w));
  }
  return [...seen];
}

/**
 * Does this event concern the focus?
 *
 * Any term, not all of them: a headline says "Trump signs order", not "Donald Trump's
 * presidency". Requiring every term would match almost nothing and quietly empty the page.
 */
export function matchesFocus(ev: TimelineEvent, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const hay = normalise(`${ev.title} ${ev.description ?? ""} ${ev.source ?? ""}`)
    .split(" ")
    .map(stem);
  const bag = new Set(hay);
  return terms.some((t) => bag.has(t));
}

export interface FocusResult {
  /** what to render — the matches, or everything when narrowing would mislead */
  events: TimelineEvent[];
  matched: number;
  total: number;
  /** true when the filter is actually narrowing the view */
  active: boolean;
  terms: string[];
}

/**
 * Applies a focus, and declines to when the result would be a lie by omission.
 *
 * A focus that matches nothing is a real and useful answer — "nothing on IBM's timeline mentions
 * this" — but it must be *said*, not shown as an empty page, because an empty page reads as "we
 * have no data on IBM" rather than "no overlap". So on zero matches everything is returned and
 * the caller reports the zero.
 */
export function applyFocus(events: TimelineEvent[], focus: string | null): FocusResult {
  const terms = focus ? focusTerms(focus) : [];
  if (!focus || terms.length === 0) {
    return { events, matched: events.length, total: events.length, active: false, terms };
  }
  const hits = events.filter((e) => matchesFocus(e, terms));
  return {
    events: hits.length > 0 ? hits : events,
    matched: hits.length,
    total: events.length,
    active: hits.length > 0,
    terms,
  };
}
