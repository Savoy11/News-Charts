/**
 * The one reading of a model's scoring reply, for both places a model scores headlines: the
 * operator's relevance pass (lib/enrich/relevance.ts) and a visitor's own model narrowing a
 * timeline (lib/ai/client.ts). Pure and dependency-free, so it is safe in the browser bundle.
 */
/**
 * Validate a scoring reply against the batch it answers.
 *
 * Model output that read untrusted headlines is a trust boundary: an item must name a headline
 * that was sent (an integer 1..n, once) and carry a score in [0, 1]. Anything else is dropped and
 * counted rather than clamped into range — a "-5" or a "2" is not a strong opinion, it is a reply
 * that is not following the instructions.
 */
export function parseScoreReply(
  text: string,
  batchSize: number
): { scores: Map<number, number>; rejected: number } {
  const scores = new Map<number, number>();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return { scores, rejected: 0 };
  let items: unknown;
  try {
    items = JSON.parse(match[0]);
  } catch {
    return { scores, rejected: 0 }; // unparseable — leave the batch unscored rather than guess
  }
  if (!Array.isArray(items)) return { scores, rejected: 0 };

  let rejected = 0;
  for (const item of items) {
    const { i, s } = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const ok =
      Number.isInteger(i) &&
      (i as number) >= 1 &&
      (i as number) <= batchSize &&
      !scores.has(i as number) &&
      typeof s === "number" &&
      Number.isFinite(s) &&
      s >= 0 &&
      s <= 1;
    if (ok) scores.set(i as number, s as number);
    else rejected++;
  }
  return { scores, rejected };
}

