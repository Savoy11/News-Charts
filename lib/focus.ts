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
  // The parser's qualifier markers and question words, which a search now carries in (NC-008):
  // "what happened to Nvidia after the export rules" must narrow on "export rules", and "after"
  // alone would match every "shares fall after earnings" headline on the page.
  "after", "before", "during", "since", "until", "between", "throughout", "across",
  "what", "happened", "about",
]);

/** A year, which narrows by date rather than by a word in a headline. */
const YEAR = /^(?:1[89]|20)\d{2}$/;

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
    if (w.length < 3 || WEAK.has(w) || YEAR.test(w)) continue;
    seen.add(stem(w));
  }
  return [...seen];
}

/** The dates a focus confines the timeline to — either end open — and how to say so. */
export interface FocusWindow {
  /** first day inside, YYYY-MM-DD, or null for no lower bound */
  from: string | null;
  /** last day inside, YYYY-MM-DD, or null for no upper bound */
  to: string | null;
  /** "in 2020", "2019–2021", "since 2020", "before 2020" */
  label: string;
}

/**
 * The years a focus names, read as a window on the timeline.
 *
 * "Impact of tariffs on Ford in 2025" asks for 2025's tariff events, and a headline rarely says
 * "2025" — matched as a word, the year narrowed to whatever happened to print it. So a year is a
 * date range: one year is that year, two or more span from the first to the last ("between 2019
 * and 2021"), and a lone year after "since"/"after"/"from" or "before"/"until" opens one end.
 */
export function focusWindow(focus: string): FocusWindow | null {
  const words = normalise(focus).split(" ");
  const years = words.filter((w) => YEAR.test(w)).map(Number);
  if (years.length === 0) return null;
  const lo = Math.min(...years);
  const hi = Math.max(...years);
  if (lo === hi) {
    const before = words[words.indexOf(String(lo)) - 1];
    if (before === "since" || before === "from") return { from: `${lo}-01-01`, to: null, label: `since ${lo}` };
    if (before === "after") return { from: `${lo + 1}-01-01`, to: null, label: `after ${lo}` };
    if (before === "before" || before === "until") return { from: null, to: `${lo - 1}-12-31`, label: `before ${lo}` };
    return { from: `${lo}-01-01`, to: `${lo}-12-31`, label: `in ${lo}` };
  }
  return { from: `${lo}-01-01`, to: `${hi}-12-31`, label: `${lo}–${hi}` };
}

/** An event dated to a month or a year counts from its first day. */
function inWindow(ev: TimelineEvent, w: FocusWindow | null): boolean {
  if (!w) return true;
  const day = `${ev.date}-01-01`.slice(0, 10);
  return (w.from === null || day >= w.from) && (w.to === null || day <= w.to);
}

/**
 * How much this event concerns the focus, in [0, 1].
 *
 * The gate (`matchesFocus`) stays any-term — a headline says "Trump signs order", not "Donald
 * Trump's presidency", and requiring every term would quietly empty the page. But the *grade*
 * distinguishes what the gate cannot: covering 2 of 2 terms beats 1 of 2, a term in the title
 * is worth double one in the description or source line, and consecutive focus terms appearing
 * as an adjacent pair ("battery fire") earn a bonus — the phrase the reader typed, not two
 * words that both happen to occur.
 */
export function focusScore(ev: TimelineEvent, terms: string[]): number {
  if (terms.length === 0) return 0;
  const titleToks = normalise(ev.title).split(" ").map(stem);
  const restToks = normalise(`${ev.description ?? ""} ${ev.source ?? ""}`).split(" ").map(stem);
  const inTitle = new Set(titleToks);
  const inRest = new Set(restToks);

  let weight = 0;
  for (const t of terms) {
    if (inTitle.has(t)) weight += 2;
    else if (inRest.has(t)) weight += 1;
  }
  if (weight === 0) return 0;
  let score = weight / (2 * terms.length); // 1.0 = every term, all in the title

  // Adjacent stemmed bigram of consecutive focus terms, in either field.
  const adjacent = (toks: string[]): boolean => {
    for (let i = 0; i < terms.length - 1; i++) {
      for (let j = 0; j < toks.length - 1; j++) {
        if (toks[j] === terms[i] && toks[j + 1] === terms[i + 1]) return true;
      }
    }
    return false;
  };
  if (terms.length > 1 && (adjacent(titleToks) || adjacent(restToks))) score = Math.min(1, score + 0.15);
  return score;
}

/**
 * Does this event concern the focus? Exactly `focusScore > 0` (with the empty-terms
 * convention preserved), so the gate and the grade can never disagree about membership.
 */
export function matchesFocus(ev: TimelineEvent, terms: string[]): boolean {
  if (terms.length === 0) return true;
  return focusScore(ev, terms) > 0;
}

export interface FocusResult {
  /** what to render — the matches, or everything when narrowing would mislead */
  events: TimelineEvent[];
  matched: number;
  total: number;
  /** true when the filter is actually narrowing the view */
  active: boolean;
  terms: string[];
  /** the dates the focus confines the view to, when it names a year */
  window: FocusWindow | null;
  /**
   * The matches again, best-first: focus grade, then stored subject-relevance (unscored rows
   * take a neutral 0.7 prior — never treated as evidence against the event), then recency.
   * A ranking for the "Best matches" strip; the chronological timeline is untouched by it.
   * Empty when the focus isn't narrowing.
   */
  ranked: TimelineEvent[];
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
  const window = focus ? focusWindow(focus) : null;
  if (!focus || (terms.length === 0 && !window)) {
    return { events, matched: events.length, total: events.length, active: false, terms, window, ranked: [] };
  }
  // Both, when both are named: "tariffs in 2025" is 2025's tariff events, not either alone.
  const hits = events.filter((e) => inWindow(e, window) && matchesFocus(e, terms));
  const ranked =
    hits.length > 0
      ? [...hits].sort((a, b) => {
          const byGrade = focusScore(b, terms) - focusScore(a, terms);
          if (byGrade !== 0) return byGrade;
          const byRelevance = (b.relevance ?? 0.7) - (a.relevance ?? 0.7);
          if (byRelevance !== 0) return byRelevance;
          return b.date.localeCompare(a.date);
        })
      : [];
  return {
    events: hits.length > 0 ? hits : events,
    matched: hits.length,
    total: events.length,
    active: hits.length > 0,
    terms,
    window,
    ranked,
  };
}

/**
 * The part of a focus that could be a subject in its own right, for the focus bar's "on its own
 * timeline" compare — or null. "Donald Trumps presidency" can be drawn on its own; "in 2020" and
 * "after the export rules" are qualifiers of the question, not things with a timeline. A focus
 * that carries both ("tariffs · in 2025") offers its first part, which is where the parser puts
 * the influence.
 */
export function composableFocus(focus: string): string | null {
  const first = focus.split(" · ")[0].trim();
  if (/^(?:in|during|since|until|before|after|between|throughout|across|from|as)\b/i.test(first)) return null;
  return focusTerms(first).length > 0 ? first : null;
}
