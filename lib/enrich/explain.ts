import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { Signal } from "../signals";
import { dataBlock, untrustedNotice } from "./untrusted";

export const EXPLAIN_MODEL = "claude-haiku-4-5-20251001";
/**
 * 2: events go in as a delimited data block rather than inline (NC-153). Version-1 rows were
 * written from undelimited input, so the page stops showing them until `npm run explain` has
 * regenerated each under the new prompt.
 */
export const PROMPT_VERSION = 2;

export interface CitableEvent {
  id: number;
  date: string;
  kind: string;
  title: string;
  source: string | null;
  contentHash: Buffer;
}

export interface Explanation {
  body: string;
  citedEventIds: number[];
  inputTokens: number;
  outputTokens: number;
}

/**
 * Identity of a generation: the signal plus the exact content it was shown. If an event's
 * text changes the hash changes and the explanation is regenerated; otherwise it is never
 * paid for twice.
 */
export function explanationHash(signal: Signal, events: CitableEvent[]): Buffer {
  const h = createHash("sha256");
  h.update(`${signal.kind}|${signal.windowStart}|${signal.windowEnd}|${signal.headline}`);
  for (const e of [...events].sort((a, b) => a.id - b.id)) {
    h.update(`|${e.id}:`);
    h.update(e.contentHash);
  }
  return h.digest();
}

/** Load the rows a signal points at, with the fields the model is allowed to see. */
export async function loadCitableEvents(
  client: PoolClient,
  eventIds: number[]
): Promise<CitableEvent[]> {
  if (!eventIds.length) return [];
  const { rows } = await client.query(
    `SELECT e.id, to_char(e.occurred_on,'YYYY-MM-DD') AS date, e.kind::text AS kind,
            e.title, e.content_hash, a.source_label
       FROM events e
       LEFT JOIN event_attestations a ON a.event_id = e.id AND a.is_primary
      WHERE e.id = ANY($1::bigint[])
      ORDER BY e.occurred_on`,
    [eventIds]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    date: r.date,
    kind: r.kind,
    title: r.title,
    source: r.source_label,
    contentHash: r.content_hash as Buffer,
  }));
}

/**
 * The prompt for one anomaly.
 *
 * The anomaly itself is ours — computed from counts and prices — and goes in as instructions. The
 * events are not: titles come from news feeds and source labels from Wikipedia citations, which
 * anyone can edit, so they go in as a delimited data block the model is told not to obey (NC-153).
 */
export function explainPrompt(signal: Signal, subjectName: string, events: CitableEvent[]): string {
  const items = events.map((e, i) => ({
    n: i + 1,
    date: e.date,
    kind: e.kind,
    title: e.title.replace(/\s+/g, " ").slice(0, 220),
    ...(e.source ? { source: e.source.slice(0, 120) } : {}),
  }));

  return (
    `A statistical check on a research timeline flagged an anomaly. Explain what it was about.\n\n` +
    `Sector: ${subjectName}\n` +
    `Anomaly: ${signal.headline} (${signal.detail})\n` +
    `Window: ${signal.windowStart} to ${signal.windowEnd}\n\n` +
    `The events in that window, one JSON object per line, numbered by "n":\n` +
    `${untrustedNotice("events")}\n\n` +
    `${dataBlock("events", items)}\n\n` +
    `Rules:\n` +
    `- Use ONLY the events listed. Do not add outside knowledge, company background or market commentary.\n` +
    `- If the events do not explain the anomaly, say so plainly. That is a valid and useful answer.\n` +
    `- Do not speculate about causes, prices or consequences that the events do not state.\n` +
    `- 2 to 4 sentences, plain prose, no bullet points, no links.\n\n` +
    `Return ONLY JSON: {"explanation":"...","cites":[1,4,7]}\n` +
    `"cites" must list the "n" of each event your explanation actually rests on. ` +
    `An explanation citing nothing will be discarded.`
  );
}

/** Generous against the 2–4 sentences asked for; a reply far past it is not answering the rules. */
const MAX_BODY = 1200;

export type ParsedExplanation = { body: string; cites: number[] } | { refusal: string };

/**
 * Check a reply's shape before anything in it is kept.
 *
 * This runs on model output that read untrusted text, so it is a trust boundary, and it refuses
 * rather than repairs: a reply citing an event it was never shown (a "7" when six were listed) is
 * not partly right, it is evidence the model was not working from the list — so the whole reply
 * goes, rather than the bad index being quietly dropped and the rest published (NC-153).
 */
export function parseExplanationReply(text: string, eventCount: number): ParsedExplanation {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { refusal: "no JSON in the reply" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return { refusal: "unparseable reply" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { refusal: "reply was not a JSON object" };
  }
  const { explanation, cites } = parsed as Record<string, unknown>;

  if (typeof explanation !== "string" || !explanation.trim()) return { refusal: "no explanation" };
  const body = explanation.trim();
  if (body.length > MAX_BODY) return { refusal: "explanation far longer than asked" };
  // Nothing in the rules calls for a link, and a link is what injected text would most want shown.
  if (/https?:\/\/|\bwww\./i.test(body)) return { refusal: "explanation carries a link" };

  if (!Array.isArray(cites) || !cites.length) return { refusal: "cites nothing" };
  if (!cites.every((n) => Number.isInteger(n) && n >= 1 && n <= eventCount)) {
    return { refusal: "cited an event that was not listed" };
  }
  return { body, cites: [...new Set(cites as number[])] };
}

/** max_tokens on every call — also the per-call ceiling the pre-flight estimate assumes. */
export const EXPLAIN_MAX_TOKENS = 700;

export interface ExplainAttempt {
  explanation: Explanation | null;
  /** why nothing was kept, when nothing was */
  refusal: string | null;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Ask the model to explain one anomaly. Never returns an uncited claim — a synthesis that rests on
 * no events is exactly what the citation rule forbids — but always returns what the call cost,
 * because a refused reply was paid for just the same (NC-149).
 */
export async function explainSignal(
  signal: Signal,
  subjectName: string,
  events: CitableEvent[],
  apiKey: string
): Promise<ExplainAttempt> {
  if (!events.length) return { explanation: null, refusal: "no events to cite", inputTokens: 0, outputTokens: 0 };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: EXPLAIN_MODEL,
      max_tokens: EXPLAIN_MAX_TOKENS,
      temperature: 0,
      messages: [{ role: "user", content: explainPrompt(signal, subjectName, events) }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const json = await res.json();
  const inputTokens: number = json?.usage?.input_tokens ?? 0;
  const outputTokens: number = json?.usage?.output_tokens ?? 0;
  const text: string =
    json?.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";

  const reply = parseExplanationReply(text, events.length);
  if ("refusal" in reply) return { explanation: null, refusal: reply.refusal, inputTokens, outputTokens };

  return {
    // map the model's 1-based numbers back to real event ids
    explanation: {
      body: reply.body,
      citedEventIds: reply.cites.map((n) => events[n - 1].id),
      inputTokens,
      outputTokens,
    },
    refusal: null,
    inputTokens,
    outputTokens,
  };
}

/**
 * Whether this exact input has already been paid for, kept or refused.
 *
 * Both tables are keyed on the prompt version too: the cache check used to ignore it, so a new
 * prompt would have found the old version's row, skipped regeneration, and left the page — which
 * shows only the current version — with nothing.
 */
export async function alreadyAttempted(
  client: PoolClient,
  subjectId: number,
  signal: Signal,
  inputHash: Buffer
): Promise<"kept" | "refused" | null> {
  const { rows } = await client.query<{ outcome: "kept" | "refused" }>(
    `SELECT 'kept' AS outcome FROM syntheses
      WHERE subject_id=$1 AND kind=$2 AND window_start=$3 AND window_end=$4
        AND model=$5 AND prompt_version=$6 AND input_hash=$7
     UNION ALL
     SELECT 'refused' FROM synthesis_refusals
      WHERE subject_id=$1 AND kind=$2 AND window_start=$3 AND window_end=$4
        AND model=$5 AND prompt_version=$6 AND input_hash=$7
     LIMIT 1`,
    [subjectId, signal.kind, signal.windowStart, signal.windowEnd, EXPLAIN_MODEL, PROMPT_VERSION, inputHash]
  );
  return rows[0]?.outcome ?? null;
}

/** Record a paid call that produced nothing worth keeping, so it is neither repeated nor lost. */
export async function saveRefusal(
  client: PoolClient,
  subjectId: number,
  signal: Signal,
  inputHash: Buffer,
  attempt: ExplainAttempt
): Promise<void> {
  await client.query(
    `INSERT INTO synthesis_refusals
       (subject_id, kind, window_start, window_end, model, prompt_version, input_hash, reason,
        input_tokens, output_tokens)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT DO NOTHING`,
    [
      subjectId,
      signal.kind,
      signal.windowStart,
      signal.windowEnd,
      EXPLAIN_MODEL,
      PROMPT_VERSION,
      inputHash,
      attempt.refusal ?? "refused",
      attempt.inputTokens,
      attempt.outputTokens,
    ]
  );
}

/** Store the explanation and its citations together, or not at all. */
export async function saveExplanation(
  client: PoolClient,
  subjectId: number,
  signal: Signal,
  inputHash: Buffer,
  explanation: Explanation
): Promise<number | null> {
  await client.query("BEGIN");
  try {
    const { rows } = await client.query<{ id: string }>(
      // Tokens are stored with the row (db/013) so what a run cost survives the terminal it was
      // printed to — otherwise cumulative AI spend is unanswerable from the database.
      `INSERT INTO syntheses
         (subject_id, kind, window_start, window_end, model, prompt_version, input_hash, body,
          input_tokens, output_tokens)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        subjectId,
        signal.kind,
        signal.windowStart,
        signal.windowEnd,
        EXPLAIN_MODEL,
        PROMPT_VERSION,
        inputHash,
        explanation.body,
        explanation.inputTokens,
        explanation.outputTokens,
      ]
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return null; // already explained with this exact input
    }
    const synthesisId = Number(rows[0].id);
    for (const [i, eventId] of explanation.citedEventIds.entries()) {
      await client.query(
        `INSERT INTO synthesis_citations (synthesis_id, event_id, ordinal)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [synthesisId, eventId, i]
      );
    }
    await client.query("COMMIT");
    return synthesisId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}
