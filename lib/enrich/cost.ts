/**
 * What a model pass costs, worked out *before* it runs.
 *
 * Both enrichment scripts reported spend after the fact — an accurate number, arriving too late
 * to act on. That is fine at a handful of events and wrong at the scale this project is heading
 * for: a 600-event subject is one command away, and the first warning should not be the bill.
 *
 * So the price table lives here rather than in a comment beside each `* 1e-6`, the estimate is
 * shown before anything is sent, and a pass that would cost more than `DEFAULT_CAP_USD` stops
 * and asks. None of that is about the money being large; it is about a number nobody chose being
 * spent by a script nobody watched.
 */

/** List prices in USD per million tokens. Update alongside the model constants. */
export const PRICING: Record<string, { inPerMTok: number; outPerMTok: number }> = {
  "claude-haiku-4-5-20251001": { inPerMTok: 1, outPerMTok: 5 },
};

/**
 * Falls back to the most expensive row rather than to zero.
 *
 * An unknown model is usually a *newer* one, and guessing cheap would under-report a bill that
 * has already been paid. Estimating high is the error that gets noticed and corrected.
 */
export function priceFor(model: string): { inPerMTok: number; outPerMTok: number } {
  const known = PRICING[model];
  if (known) return known;
  const rows = Object.values(PRICING);
  return {
    inPerMTok: Math.max(...rows.map((r) => r.inPerMTok)),
    outPerMTok: Math.max(...rows.map((r) => r.outPerMTok)),
  };
}

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  return (inputTokens / 1e6) * p.inPerMTok + (outputTokens / 1e6) * p.outPerMTok;
}

/** Sub-cent figures are the normal case here, so they must not round to "$0.00". */
export function formatUsd(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

/**
 * Tokens per character, used only for the pre-flight estimate.
 *
 * English averages nearer 4 characters per token; 3 is deliberately pessimistic, because an
 * estimate that undershoots defeats the point of having one. It is never used to bill anything —
 * actual usage comes back from the API and is what gets recorded.
 */
const CHARS_PER_TOKEN = 3;

export interface Estimate {
  items: number;
  batches: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
}

/**
 * A pre-flight estimate for a batched pass.
 *
 * `overheadTokens` is the prompt scaffolding sent with every batch — small per batch and not
 * small across two hundred of them, which is exactly the kind of cost that hides from a
 * per-item mental model.
 */
export function estimateBatched(
  model: string,
  texts: string[],
  batchSize: number,
  overheadTokens = 200,
  outputTokensPerItem = 12
): Estimate {
  const items = texts.length;
  const batches = batchSize > 0 ? Math.ceil(items / batchSize) : 0;
  const contentTokens = Math.ceil(texts.join("").length / CHARS_PER_TOKEN);
  const inputTokens = contentTokens + batches * overheadTokens;
  const outputTokens = items * outputTokensPerItem;
  return { items, batches, inputTokens, outputTokens, usd: costUsd(model, inputTokens, outputTokens) };
}

/** Above this, a pass stops and asks rather than spending. Override with `--max-usd`. */
export const DEFAULT_CAP_USD = 1;

export interface CapVerdict {
  allowed: boolean;
  reason: string;
}

/**
 * Whether a pass may proceed.
 *
 * The cap is small on purpose. It is not a budget, it is a tripwire: any single enrichment run
 * costing more than about a dollar means something changed — a bigger subject, a wider limit, a
 * pricier model — and that is worth a human looking at once, not a policy to argue with.
 */
export function withinCap(estimate: Estimate, capUsd = DEFAULT_CAP_USD): CapVerdict {
  if (estimate.items === 0) return { allowed: false, reason: "nothing to send" };
  if (estimate.usd <= capUsd) return { allowed: true, reason: `${formatUsd(estimate.usd)} estimated` };
  return {
    allowed: false,
    reason: `estimated ${formatUsd(estimate.usd)} exceeds the ${formatUsd(capUsd)} cap — re-run with --max-usd to raise it`,
  };
}
