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
 * Free tier. Only scores what is certain from provenance; everything ambiguous returns
 * null and is left for the model (or left unscored, which still displays).
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
  // A filing is indexed under the company's own CIK — it cannot be about anyone else.
  if (row.kind === "filing" || row.kind === "earnings") {
    return { score: 1, reason: "filed under the subject's CIK" };
  }
  // History sentences were extracted from the article the subject resolves to.
  if (row.kind === "history") {
    return { score: 1, reason: "extracted from the subject's own article" };
  }
  // Press cards are built from a phrase search for the topic, but OCR is noisy.
  if (row.kind === "press") {
    return { score: 0.7, reason: "phrase match in a digitised newspaper page" };
  }
  if (row.kind === "news") {
    if (mentions(row.title, aliases)) {
      return { score: 0.9, reason: "headline names the subject" };
    }
    if (strictHeadline) {
      return { score: 0.2, reason: "headline never names the subject" };
    }
  }
  return null;
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
