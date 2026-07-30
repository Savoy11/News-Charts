import { storyKey } from "./newsQuality";
import type { TimelineEvent } from "./types";

/**
 * Which events two compared subjects have in common.
 *
 * Kept apart from `lib/compare.ts` on purpose: that module reaches EDGAR and the database, and
 * /compare renders in the browser. These rules are pure, so they can live in the client bundle
 * and be argued with in tests instead of judged by eye against a live page.
 */

/**
 * Kinds whose titles are real headlines, and so mean something when two of them match.
 *
 * Filings, earnings and corporate actions are excluded because their titles are boilerplate the
 * subject did not write: every large issuer files "10-K — Annual report for the fiscal year ended
 * December 31, 2025" in the same few weeks, and two of them landing on one day is a calendar, not
 * a shared event. That merge shipped for exactly one screenshot before this list existed.
 *
 * History is excluded for the same reason in reverse — a history sentence is about one subject by
 * construction, so a match would be a coincidence of phrasing.
 */
const HEADLINE_KINDS = new Set(["news", "press", "citation"]);

/**
 * What makes two rows the same happening.
 *
 * Sector events (a Federal Register rule) reach both companies as the *same* database row, so
 * they arrive with identical ids — that is the exact case this exists for. A wire story written
 * about both subjects arrives twice with different ids, so headline-and-day identity catches it
 * too, using the same normalisation that collapses syndicated copies elsewhere.
 *
 * Ids are only trusted for sector events. Every other id is scoped to the row it came from, so
 * two subjects can never share one, and comparing them would find nothing while looking as
 * though it had looked. Anything that is neither gets an identity unique to itself, which is the
 * safe answer: failing to spot a shared event understates, inventing one misleads.
 */
export function identity(ev: TimelineEvent): string {
  if (ev.id.startsWith("sector-")) return ev.id;
  if (HEADLINE_KINDS.has(ev.type)) return storyKey(ev.title, ev.date);
  return `unshared:${ev.id}`;
}

/**
 * Events that landed on both subjects.
 *
 * Two companies under one regulation is a different fact from two companies that each had
 * something happen on a Tuesday, and rendering it as two separate markers states the weaker one.
 * The reader is here to see what the two have in common; this makes that legible.
 */
export function intersect(a: TimelineEvent[], b: TimelineEvent[]): Set<string> {
  const onA = new Set(a.map(identity));
  const shared = new Set<string>();
  for (const ev of b) {
    const key = identity(ev);
    if (onA.has(key)) shared.add(key);
  }
  return shared;
}
