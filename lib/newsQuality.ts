import type { TimelineEvent } from "./types";

/**
 * Two noise controls for the aggregator feeds, kept pure so they can be argued with in tests
 * rather than judged by eye against a live page.
 *
 * The feeds are keyword-searched, and a keyword search is not a relevance judgement: a listicle
 * that mentions a company once ranks alongside a story about it. And the same wire story reaches
 * us through several aggregators under different URLs, so URL dedup — which is all we had
 * outside GDELT — leaves three copies of one event on the timeline.
 */

/** Outlet garnish that varies between aggregators carrying the same wire story. */
const OUTLET_SUFFIX = /\s*[-–—|:]\s*(?:[A-Z][\w.&']*\s*){1,4}$/;

/**
 * The identity of a *story*, as opposed to a document: its headline on a given day.
 *
 * GDELT has always keyed on this; every other adapter keyed on its URL, which is why one wire
 * story syndicated to three outlets produced three events. Normalisation has to be aggressive
 * enough to survive the small edits aggregators make — case, punctuation, a trailing outlet
 * name, a leading exclusive tag — without being so aggressive that two genuinely different
 * stories on the same day collide.
 */
export function storyKey(title: string, date: string): string {
  // Outlet stripping runs first, on the original casing: a trailing *capitalised* phrase after a
  // dash or pipe is what marks it as a masthead rather than part of the headline. Lowercasing
  // first would throw that signal away and start eating real words.
  const normalised = title
    .replace(/[“”"'’‘]/g, "")
    .replace(/^\s*(?:exclusive|update \d+|breaking|analysis|explainer)\s*[-–—:]\s*/i, "")
    .replace(OUTLET_SUFFIX, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${normalised}|${date.slice(0, 10)}`;
}

/**
 * Collapse stories that are the same happening reported twice.
 *
 * Keeps the *richest* copy rather than the first: aggregators differ in whether they return a
 * description or an image, and the version with more to show is the better row even when it
 * arrived later. Order is otherwise preserved, so the caller's precedence (curated citations
 * first) still holds.
 */
export function collapseNearDuplicates(events: TimelineEvent[]): TimelineEvent[] {
  const bestAt = new Map<string, number>();
  const out: TimelineEvent[] = [];

  const richness = (e: TimelineEvent): number =>
    (e.description ? 2 : 0) + (e.imageUrl ? 1 : 0) + (e.url ? 1 : 0);

  for (const ev of events) {
    // Only news-shaped events collapse. A filing and a news story about that filing on the same
    // day are two different things, and a history sentence is not a wire story at all.
    if (ev.type !== "news") {
      out.push(ev);
      continue;
    }
    const key = storyKey(ev.title, ev.date);
    const at = bestAt.get(key);
    if (at === undefined) {
      bestAt.set(key, out.length);
      out.push(ev);
      continue;
    }
    if (richness(ev) > richness(out[at])) out[at] = ev;
  }
  return out;
}

/**
 * Words too common to prove a story is about the subject on their own.
 *
 * Exported (as `WEAK_TOKENS`) because the relevance scorer's alias builder needs the same
 * judgement: "Ford Motor Company" must not contribute "motor" as a full-strength alias, or
 * "Motor racing season opens" displays as strong Ford news. One list, one place to argue it.
 */
export const WEAK_TOKENS = new Set([
  "the", "and", "of", "for", "inc", "corp", "corporation", "company", "co", "group",
  "holdings", "holding", "limited", "ltd", "plc", "sa", "nv", "ag", "se", "motor",
  "motors", "international", "technologies", "technology", "systems", "industries",
]);

const normalise = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Does this story's headline actually name the subject?
 *
 * The bar is a *distinctive* token, not any token: "Ford Motor Company" contributes "ford", and
 * matching on "motor" or "company" would let almost anything through. A subject whose every
 * token is weak (there are few) falls back to requiring the whole phrase, which is strict but
 * never wrong.
 *
 * Deliberately conservative about what it rejects. A headline like "Automaker recalls SUVs" is
 * a genuine miss, so this is only for the keyword-searched general aggregators — the
 * finance-native feeds query by ticker and their own entity tagging is better evidence than
 * anything we could infer from a title.
 */
export function titleNamesSubject(title: string, subject: string, aliases: string[] = []): boolean {
  const haystack = normalise(title);
  if (!haystack) return false;

  const candidates = [subject, ...aliases].map(normalise).filter(Boolean);
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (haystack.includes(candidate)) return true;
    const strong = candidate.split(" ").filter((t) => t.length > 2 && !WEAK_TOKENS.has(t));
    // every distinctive token present (in any order) counts as naming the subject
    if (strong.length && strong.every((t) => new RegExp(`\\b${t}\\b`).test(haystack))) return true;
  }
  return false;
}

/**
 * Drop keyword-search results whose headline never names the subject.
 *
 * Applied only to the sources passed in `looseSources`, and never to an event carrying no
 * source key — a caller should have to opt a feed into this, because the cost of over-filtering
 * (a real story silently missing) is worse than the cost of a little noise.
 */
export function applyRelevanceFloor(
  events: TimelineEvent[],
  subject: string,
  looseSources: ReadonlySet<string>,
  aliases: string[] = []
): TimelineEvent[] {
  return events.filter((ev) => {
    if (!ev.sourceKey || !looseSources.has(ev.sourceKey)) return true;
    return titleNamesSubject(ev.title, subject, aliases);
  });
}

/**
 * The general-purpose aggregators: keyword-searched, no entity tagging, and the ones the
 * checklist recorded as pulling listicles and passing mentions.
 */
export const LOOSE_SOURCES: ReadonlySet<string> = new Set([
  "newsdata",
  "gnews",
  "currents",
]);
