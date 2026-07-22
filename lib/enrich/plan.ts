import type { SourceKey } from "../types";

export const PLAN_MODEL = "claude-haiku-4-5-20251001";

/**
 * The only sources a plan may target. The model chooses *what to ask*, never *where to
 * go* — it emits a source key from this list plus a search term, and deterministic code
 * does the fetching. A model that could name a URL would be a fetch-anything proxy, which
 * is the same reason visitor-supplied sources accept terms rather than addresses.
 */
export const PLANNABLE: Record<
  Extract<SourceKey, "federal_register" | "gdelt" | "loc_chronam">,
  { label: string; covers: string }
> = {
  federal_register: {
    label: "Federal Register",
    covers: "US rules, proposed rules and notices, 1994 to today",
  },
  gdelt: { label: "GDELT news", covers: "worldwide English news, 2017 to today" },
  loc_chronam: {
    label: "Chronicling America",
    covers: "digitised US newspapers, 1770 to 1963",
  },
};

export type PlannableSource = keyof typeof PLANNABLE;

export interface QueryPlan {
  source: PlannableSource;
  query: string;
  rationale: string;
}

export interface PlanContext {
  subjectName: string;
  subjectKind: string;
  /** queries already run, so the model proposes gaps rather than repeats */
  alreadyQueried: string[];
  /** a sample of what the timeline already holds */
  sampleTitles: string[];
}

const MAX_PLANS = 6;
const MAX_QUERY = 60;

/**
 * Reject anything that isn't a plain search term against a known source. This runs on
 * model output, so it is a trust boundary: unknown sources, URLs, operators, control
 * characters and over-long strings are dropped rather than repaired.
 */
export function validatePlans(raw: unknown, alreadyQueried: string[] = []): QueryPlan[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(alreadyQueried.map((q) => q.trim().toLowerCase()));
  const out: QueryPlan[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { source, query, rationale } = item as Record<string, unknown>;

    if (typeof source !== "string" || !(source in PLANNABLE)) continue;
    if (typeof query !== "string") continue;

    // strip control characters (written as escapes: literal ones make the file binary)
    // eslint-disable-next-line no-control-regex
    const q = query.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    if (q.length < 3 || q.length > MAX_QUERY) continue;
    // a term, not an address or an injected instruction
    if (/https?:|\/\/|[<>{}\\|`$]/.test(q)) continue;
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      source: source as PlannableSource,
      query: q,
      rationale:
        typeof rationale === "string" ? rationale.replace(/\s+/g, " ").trim().slice(0, 200) : "",
    });
    if (out.length >= MAX_PLANS) break;
  }
  return out;
}

function buildPrompt(ctx: PlanContext): string {
  const sources = Object.entries(PLANNABLE)
    .map(([key, v]) => `- ${key}: ${v.label} — ${v.covers}`)
    .join("\n");

  return (
    `A research timeline is being assembled for: ${ctx.subjectName} (a ${ctx.subjectKind}).\n\n` +
    `Available sources:\n${sources}\n\n` +
    (ctx.alreadyQueried.length
      ? `Already searched: ${ctx.alreadyQueried.slice(0, 20).join("; ")}\n\n`
      : "") +
    (ctx.sampleTitles.length
      ? `A sample of what the timeline already holds:\n${ctx.sampleTitles
          .slice(0, 15)
          .map((t) => `- ${t.slice(0, 110)}`)
          .join("\n")}\n\n`
      : "") +
    `Propose up to ${MAX_PLANS} further searches that would surface events this timeline is ` +
    `MISSING. Favour concrete themes over restating the subject's name — supply chains, ` +
    `regulation, disputes, materials, standards, adjacent technologies.\n\n` +
    `Rules:\n` +
    `- Each search is a plain search term of at most ${MAX_QUERY} characters.\n` +
    `- No URLs, no boolean operators, no field syntax.\n` +
    `- Do not repeat anything already searched.\n` +
    `- Match the source to its coverage: a 19th-century newspaper archive cannot answer a ` +
    `question about last month.\n\n` +
    `Return ONLY JSON: [{"source":"federal_register","query":"...","rationale":"..."}]`
  );
}

export interface PlanResult {
  plans: QueryPlan[];
  inputTokens: number;
  outputTokens: number;
}

export async function planQueries(ctx: PlanContext, apiKey: string): Promise<PlanResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: PLAN_MODEL,
      max_tokens: 900,
      temperature: 0,
      messages: [{ role: "user", content: buildPrompt(ctx) }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const json = await res.json();
  const text: string = json?.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
  const match = text.match(/\[[\s\S]*\]/);

  let parsed: unknown = [];
  if (match) {
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      parsed = [];
    }
  }

  return {
    plans: validatePlans(parsed, ctx.alreadyQueried),
    inputTokens: json?.usage?.input_tokens ?? 0,
    outputTokens: json?.usage?.output_tokens ?? 0,
  };
}
