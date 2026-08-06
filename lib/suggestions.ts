export interface Suggestion {
  label: string;
  href: string;
  kind: "company" | "topic";
  /**
   * True for a seed-pool entry standing in because the corpus could not fill the row.
   *
   * Load-bearing rather than decorative: a padded chip is a subject we may not have, so the
   * display pick offers it only after every real one is spoken for. Blending the corpus in was
   * not enough on its own — a uniform shuffle over a pool of three real and nine curated
   * subjects still showed a row of five that led nowhere.
   */
  padded?: boolean;
}

/**
 * Seed pool — a **fallback**, not the homepage's first choice.
 *
 * These 44 subjects are hardcoded, so nothing guarantees a single one of them is in the corpus.
 * They used to be the pool the chips were drawn from, with real subjects merely appended, which
 * meant the homepage advertised GME, quantum computing and nuclear power to a database that had
 * none of them: every example a first-time visitor clicked led to "Not on News Charts yet".
 *
 * A suggestion is a promise. `blend` below keeps these for the one case where the promise cannot
 * be made from the corpus — a fresh install, or a database we cannot reach.
 *
 * Deliberately mixes household tickers with topics that show off the long-range timeline — a
 * 19th-century subject demonstrates the product better than another mega-cap does.
 */
export const CURATED: Suggestion[] = [
  ...["AAPL", "NVDA", "TSLA", "MSFT", "AMZN", "GOOGL", "META", "AMD", "INTC", "NFLX",
    "BA", "JPM", "XOM", "DIS", "UBER", "PLTR", "COIN", "KO", "PFE", "GME"].map(
    (t): Suggestion => ({ label: t, href: `/company/${t}`, kind: "company" })
  ),
  ...["bicycle", "artificial intelligence", "semiconductors", "electric vehicles",
    "solar power", "penicillin", "space exploration", "vaccines", "smartphones",
    "telegraph", "railways", "container shipping", "3d printing", "quantum computing",
    "cryptocurrency", "wind power", "antibiotics", "printing press", "photography",
    "refrigeration", "radio", "aviation", "submarine cables", "nuclear power"].map(
    (t): Suggestion => ({ label: t, href: `/topic/${encodeURIComponent(t)}`, kind: "topic" })
  ),
];

/** Rendered on the server and during hydration, so it must be stable. */
export const INITIAL: Suggestion[] = [
  CURATED[0],
  CURATED[1],
  CURATED[2],
  CURATED.find((s) => s.label === "bicycle")!,
  CURATED.find((s) => s.label === "artificial intelligence")!,
];

export function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Always show a blend rather than five tickers or five topics in a row — and always prefer a
 * subject we actually hold.
 *
 * Real subjects are shuffled among themselves, so the row still varies; padding is only reached
 * for when there are not enough of them. A uniform shuffle over the whole pool is what put five
 * curated chips on a homepage backed by three real subjects.
 */
export function pickMix(pool: Suggestion[], count = 5, companies = 2): Suggestion[] {
  const ofKind = (kind: Suggestion["kind"], want: number): Suggestion[] => {
    const mine = pool.filter((s) => s.kind === kind);
    const real = shuffle(mine.filter((s) => !s.padded));
    const stand_in = shuffle(mine.filter((s) => s.padded));
    return [...real, ...stand_in].slice(0, want);
  };
  const c = ofKind("company", companies);
  const t = ofKind("topic", count - c.length);
  return shuffle([...c, ...t]);
}

/**
 * Enough suggestions to rotate through without repeating the same five.
 *
 * `pickMix` shows five at a time and the chips swap one at a time, so a pool this size keeps the
 * rotation from cycling visibly while staying small enough that everything in it is a subject
 * worth being sent to.
 */
export const MIN_POOL = 12;

/**
 * What the homepage should offer: the corpus first, topped up from the seed pool only if the
 * corpus cannot fill the row.
 *
 * The order matters and is the whole fix. Padding is per *kind*, because the mix wants two
 * companies and three topics — a corpus of fifteen topics and no companies still needs a ticker
 * from somewhere, or the chips silently become topic-only.
 *
 * Pure so the rule can be argued with in `npm run check:index` rather than judged by eye against
 * a homepage whose contents rotate every 3.8 seconds.
 */
export function blend(fromCorpus: Suggestion[], minimum = MIN_POOL): Suggestion[] {
  const seen = new Set(fromCorpus.map((s) => s.label.toLowerCase()));
  const out = [...fromCorpus];

  for (const kind of ["company", "topic"] as const) {
    // Half the floor per kind: enough that a mix of two and three is always available.
    const want = Math.ceil(minimum / 2);
    let have = out.filter((s) => s.kind === kind).length;
    if (have >= want) continue;
    for (const candidate of CURATED.filter((s) => s.kind === kind)) {
      if (have >= want) break;
      if (seen.has(candidate.label.toLowerCase())) continue;
      seen.add(candidate.label.toLowerCase());
      // Marked, so the display pick can keep it behind everything we actually hold.
      out.push({ ...candidate, padded: true });
      have++;
    }
  }
  return out;
}
