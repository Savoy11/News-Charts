import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { Signal } from "../signals";

export const EXPLAIN_MODEL = "claude-haiku-4-5-20251001";
export const PROMPT_VERSION = 1;

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

function buildPrompt(signal: Signal, subjectName: string, events: CitableEvent[]): string {
  const list = events
    .map(
      (e, i) =>
        `${i + 1}. [${e.date}] (${e.kind}) ${e.title.replace(/\s+/g, " ").slice(0, 220)}${
          e.source ? ` — ${e.source}` : ""
        }`
    )
    .join("\n");

  return (
    `A statistical check on a research timeline flagged an anomaly. Explain what it was about.\n\n` +
    `Sector: ${subjectName}\n` +
    `Anomaly: ${signal.headline} (${signal.detail})\n` +
    `Window: ${signal.windowStart} to ${signal.windowEnd}\n\n` +
    `The events in that window:\n${list}\n\n` +
    `Rules:\n` +
    `- Use ONLY the events listed. Do not add outside knowledge, company background or market commentary.\n` +
    `- If the events do not explain the anomaly, say so plainly. That is a valid and useful answer.\n` +
    `- Do not speculate about causes, prices or consequences that the events do not state.\n` +
    `- 2 to 4 sentences, plain prose, no bullet points.\n\n` +
    `Return ONLY JSON: {"explanation":"...","cites":[1,4,7]}\n` +
    `"cites" must list the numbers of the events your explanation actually rests on. ` +
    `An explanation citing nothing will be discarded.`
  );
}

/**
 * Ask the model to explain one anomaly. Returns null rather than an uncited claim —
 * a synthesis that rests on no events is exactly what the citation rule forbids.
 */
export async function explainSignal(
  signal: Signal,
  subjectName: string,
  events: CitableEvent[],
  apiKey: string
): Promise<Explanation | null> {
  if (!events.length) return null;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: EXPLAIN_MODEL,
      max_tokens: 700,
      temperature: 0,
      messages: [{ role: "user", content: buildPrompt(signal, subjectName, events) }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const json = await res.json();
  const text: string =
    json?.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  let parsed: { explanation?: string; cites?: number[] };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }

  const body = (parsed.explanation ?? "").trim();
  const cites = Array.isArray(parsed.cites) ? parsed.cites : [];
  // map the model's 1-based indices back to real event ids, dropping anything invented
  const citedEventIds = [
    ...new Set(
      cites
        .map((n) => events[Number(n) - 1]?.id)
        .filter((id): id is number => typeof id === "number")
    ),
  ];

  if (!body || !citedEventIds.length) return null;

  return {
    body,
    citedEventIds,
    inputTokens: json?.usage?.input_tokens ?? 0,
    outputTokens: json?.usage?.output_tokens ?? 0,
  };
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
