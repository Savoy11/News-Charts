export interface Suggestion {
  label: string;
  href: string;
  kind: "company" | "topic";
}

/**
 * Seed pool. Deliberately mixes household tickers with topics that show off the
 * long-range timeline — a 19th-century subject demonstrates the product better than
 * another mega-cap does.
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

/** Always show a blend rather than five tickers or five topics in a row. */
export function pickMix(pool: Suggestion[], count = 5, companies = 2): Suggestion[] {
  const c = shuffle(pool.filter((s) => s.kind === "company")).slice(0, companies);
  const t = shuffle(pool.filter((s) => s.kind === "topic")).slice(0, count - c.length);
  return shuffle([...c, ...t]);
}
