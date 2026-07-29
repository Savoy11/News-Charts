import { EventType } from "../types";

export const MODEL = "claude-haiku-4-5-20251001";

/** Below this, a scored event is hidden from the timeline. Unscored (NULL) always shows. */
export const RELEVANCE_THRESHOLD = 0.4;

export interface ScorableRow {
  eventId: number;
  kind: EventType;
  title: string;
}

export interface SubjectContext {
  kind: "topic" | "company";
  displayName: string;
  ticker?: string | null;
}

export interface Scored {
  score: number;
  reason: string;
}

/** Distinctive lowercase tokens that identify the subject in a headline. */
export function aliasesFor(subject: SubjectContext): string[] {
  const stop = new Set(["inc", "inc.", "corp", "corp.", "co", "co.", "the", "company", "plc", "ltd", "holdings", "group"]);
  const words = subject.displayName
    .toLowerCase()
    .replace(/[.,]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w));
  const aliases = new Set<string>(words);
  aliases.add(subject.displayName.toLowerCase());
  if (subject.ticker) aliases.add(subject.ticker.toLowerCase());
  return [...aliases];
}

function mentions(title: string, aliases: string[]): boolean {
  const t = title.toLowerCase();
  return aliases.some((a) => new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t));
}

/**
 * Free tier. Scores what provenance already settles, and returns null only where the answer
 * genuinely needs judgement — which is what the paid model tier is for.
 *
 * **Exhaustive over `EventType` on purpose.** This used to end in a bare `return null`, so a new
 * event kind fell through to the *paid* tier by default and nobody found out until a bill.
 * On-chain was exactly that case: a USDC mint read off the USDC contract is as certain as a
 * filing under a CIK, and it was being sent to a model to have its aboutness assessed. The
 * switch below has no default arm, so adding a kind stops compiling until someone decides which
 * side of the line it is on.
 *
 * `strictHeadline` is a product decision rather than a fact: it demotes company news whose
 * *headline* never names the subject. That removes market-roundup noise, at the cost of
 * demoting oblique headlines like "iPhone maker rebounds".
 */
export function deterministicScore(
  row: ScorableRow,
  subject: SubjectContext,
  aliases: string[],
  strictHeadline = false
): Scored | null {
  switch (row.kind) {
    // Indexed under the company's own CIK — it cannot be about anyone else.
    case "filing":
    case "earnings":
      return { score: 1, reason: "filed under the subject's CIK" };

    // Extracted from the article the subject resolves to.
    case "history":
      return { score: 1, reason: "extracted from the subject's own article" };

    /**
     * A split or a dividend comes from the price adapter for this ticker. Same standing as a
     * filing: it is a corporate action *of* the subject, not a report about one.
     */
    case "corporate_action":
      return { score: 1, reason: "a corporate action on the subject's own ticker" };

    /**
     * Read from the subject's own contract or its own chain — a USDC mint is a transfer on the
     * USDC contract, a halving is a Bitcoin block. Certainty here is the point of on-chain data,
     * and paying a model to re-assess it would be paying to weaken it.
     *
     * Materiality is already settled upstream: a supply move below the token's bar is never
     * ingested, so every on-chain row that exists is one we judged worth showing.
     */
    case "onchain":
      return { score: 1, reason: "read from the subject's own contract or chain" };

    /**
     * The reader placed it on this subject themselves. Never persisted today — annotations live
     * in the browser — but scored explicitly so that if they ever are, nobody pays a model to
     * decide whether someone's own note is about the thing they attached it to.
     */
    case "annotation":
      return { score: 1, reason: "the reader attached it to this subject" };

    /**
     * Mined from the reference list of the subject's own article, so the link to the subject is
     * structural. Below a filing because the *cited work* can be broader than the subject — it
     * supports a sentence about them rather than being about them.
     */
    case "citation":
      return { score: 0.9, reason: "cited by the subject's own article" };

    // Phrase search over digitised pages, and OCR is noisy enough to keep this off 1.
    case "press":
      return { score: 0.7, reason: "phrase match in a digitised newspaper page" };

    case "news":
      if (mentions(row.title, aliases)) return { score: 0.9, reason: "headline names the subject" };
      if (strictHeadline) return { score: 0.2, reason: "headline never names the subject" };
      // headline is oblique — a real judgement call, so it goes to the model
      return null;

    /**
     * Left for the model deliberately, and this is the case the others are measured against.
     * A Federal Register rule reaches an industry through a *keyword query* built from the
     * industry's name, so whether it actually bears on that sector is exactly the judgement we
     * cannot make from provenance. Scoring it here would be inventing certainty.
     */
    case "regulation":
      return null;

    /**
     * A proposal read from the protocol's own governance space is about that protocol by
     * construction, the same way a filing is about its filer. Scored here so a high-volume
     * governance feed never becomes a model bill.
     */
    case "governance":
      return { score: 1, reason: "a vote in the subject's own governance space" };
  }
}

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens: number; output_tokens: number };
}

export interface ModelScoreResult {
  scores: Map<number, number>;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Paid tier, batched: one request scores many headlines, so cost scales with new
 * content rather than with rows or pageviews.
 */
export async function scoreBatchWithModel(
  rows: ScorableRow[],
  subject: SubjectContext,
  apiKey: string
): Promise<ModelScoreResult> {
  const subjectLine =
    subject.kind === "company"
      ? `${subject.displayName} (a publicly traded company, ticker ${subject.ticker ?? "?"})`
      : `${subject.displayName} (a general topic)`;

  const list = rows.map((r, i) => `${i + 1}. ${r.title.replace(/\s+/g, " ").slice(0, 200)}`).join("\n");

  const prompt =
    `Subject: ${subjectLine}\n\n` +
    `Score how much each headline below is *about* that subject.\n` +
    `1.0 = primarily about the subject\n` +
    `0.6 = subject is a significant secondary subject\n` +
    `0.3 = passing mention only\n` +
    `0.0 = not about the subject (e.g. a general market roundup, or about a different company)\n\n` +
    `${list}\n\n` +
    `Reply with ONLY a JSON array, one object per headline: [{"i":1,"s":0.9}, ...]`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const json = (await res.json()) as AnthropicResponse;
  const text = json.content?.find((c) => c.type === "text")?.text ?? "";
  const match = text.match(/\[[\s\S]*\]/);
  const scores = new Map<number, number>();
  if (match) {
    try {
      for (const item of JSON.parse(match[0]) as { i: number; s: number }[]) {
        const row = rows[item.i - 1];
        if (row && typeof item.s === "number") {
          scores.set(row.eventId, Math.min(1, Math.max(0, item.s)));
        }
      }
    } catch {
      /* unparseable reply — leave the batch unscored rather than guessing */
    }
  }
  return {
    scores,
    inputTokens: json.usage?.input_tokens ?? 0,
    outputTokens: json.usage?.output_tokens ?? 0,
  };
}
