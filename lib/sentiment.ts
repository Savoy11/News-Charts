import type { TimelineEvent } from "./types";

/**
 * A keyless, lexicon-based read of a headline's tone.
 *
 * The point is not to be right about sentiment — it is to let a reader see *perceived* tone
 * against the *actual* price move, which is interesting precisely when the two disagree. A
 * headline can read as a disaster on a day the stock rose.
 *
 * So this is deliberately shallow and deliberately shy. It scores titles only, it abstains far
 * more readily than it commits, and it never claims a sentiment it cannot point at a word for.
 * A confident wrong label on a financial timeline is worse than no label, because a colour reads
 * as a judgement we have made.
 *
 * A BYO-model pass can refine this later; nothing here costs a request or a key.
 */

export type Tone = "positive" | "negative" | "neutral";

/**
 * Words that carry tone in a *market* context, which is not the same as general English.
 * "Beat", "miss" and "cut" are near-meaningless elsewhere and unambiguous here.
 */
const POSITIVE = new Set([
  "beat", "beats", "tops", "topped", "surge", "surges", "surged", "soar", "soars", "soared",
  "jump", "jumps", "jumped", "rally", "rallies", "rallied", "climb", "climbs", "climbed",
  "gain", "gains", "gained", "rise", "rises", "rose", "record", "profit", "profits",
  "growth", "grew", "upgrade", "upgraded", "raises", "raised", "boost", "boosts", "boosted",
  "wins", "won", "approval", "approves", "approved", "expands", "expansion", "strong", "outperform",
  "breakthrough", "milestone", "launch", "launches", "launched", "partnership", "dividend",
]);

const NEGATIVE = new Set([
  "miss", "misses", "missed", "plunge", "plunges", "plunged", "slump", "slumps", "slumped",
  "fall", "falls", "fell", "drop", "drops", "dropped", "sink", "sinks", "sank", "slide",
  "slides", "slid", "tumble", "tumbles", "tumbled", "loss", "losses", "cut", "cuts",
  "downgrade", "downgraded", "lawsuit", "sued", "probe", "investigation", "recall", "recalls",
  "recalled", "fine", "fined", "penalty", "layoffs", "layoff", "bankruptcy", "default",
  "delay", "delays", "delayed", "warns", "warning", "weak", "underperform", "halt", "halted",
  "strike", "shortage", "defect", "fraud", "breach", "scandal", "resign", "resigns", "resigned",
]);

/**
 * Flips the polarity of a sentiment word that follows shortly after.
 *
 * The window is three tokens, not one, because English rarely puts them adjacent: "not **a**
 * miss", "avoids **a** strike", "denies **any** breach". Checking only the previous word missed
 * every realistic phrasing.
 */
const NEGATORS = new Set(["no", "not", "never", "without", "avoids", "avoided", "denies", "denied"]);
const NEGATION_WINDOW = 3;

const tokenise = (title: string): string[] =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/**
 * Abstains whenever a headline pulls both ways.
 *
 * Not "whichever side has more" — *any* opposing evidence means neutral. "Profit rises but
 * deliveries miss expectations" carries two positive words and one negative and is, to a reader,
 * plainly mixed; calling it positive on a 2–1 count would be inventing a signal from arithmetic.
 * Tone is only asserted when nothing in the headline contradicts it.
 */
export function scoreTone(title: string): Tone {
  const words = tokenise(title);
  let positive = 0;
  let negative = 0;

  const negatedAt = (i: number): boolean => {
    for (let back = 1; back <= NEGATION_WINDOW && i - back >= 0; back++) {
      if (NEGATORS.has(words[i - back])) return true;
    }
    return false;
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const flipped = negatedAt(i);
    if (POSITIVE.has(w)) {
      if (flipped) negative++;
      else positive++;
    } else if (NEGATIVE.has(w)) {
      if (flipped) positive++;
      else negative++;
    }
  }

  if (positive > 0 && negative > 0) return "neutral"; // mixed — say nothing
  if (positive > 0) return "positive";
  if (negative > 0) return "negative";
  return "neutral";
}

/**
 * Tone is only meaningful for reported coverage. A filing, a halving or a reader's own note is
 * not "positive news" — scoring them would put a judgement on a fact.
 */
export function tonedKinds(type: TimelineEvent["type"]): boolean {
  return type === "news" || type === "press" || type === "citation";
}

export function toneOf(ev: TimelineEvent): Tone {
  return tonedKinds(ev.type) ? scoreTone(ev.title) : "neutral";
}
