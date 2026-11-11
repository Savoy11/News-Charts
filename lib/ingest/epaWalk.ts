import type { PoolClient } from "pg";
import { andSpellings } from "../edgarName";
import { epaEvents, fetchCaseFile, type CaseFileAnswer, type EpaCase, unitKeysOf } from "../epaCases";
import { isNotesRecord } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * EPA's case file, read once a month for every company (batch 95), kept in db/037. A copy EPA has
 * not changed since the last read (its Last-Modified) is not read again; a changed one replaces the
 * kept cases whole, in one transaction, and only when it read as a whole file. One read a process.
 */
export const READ_EVERY_DAYS = 30;
/** What a process may still ask, shared by every company it ingests: one read of the file. */
export const epaBudget = { left: 1 };
/** Rows per insert statement. */
const CHUNK = 2_000;

export interface EpaWalk {
  due: boolean;
  /** what the read found: a new copy, the same copy, or nothing asked */
  read?: "stored" | "unchanged";
  cases: number;
  stopped?: string;
  failure?: { outcome: "throttled" | "error"; httpStatus?: number; detail?: string };
}

const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Reads the file when the last read is `READ_EVERY_DAYS` old or there is none. `fetchFile` is replaceable so the check can run it offline. */
export async function walkEpaCases(
  client: PoolClient,
  { budget = epaBudget, fetchFile = fetchCaseFile }: { budget?: { left: number }; fetchFile?: (since: string | null) => Promise<CaseFileAnswer> } = {},
): Promise<EpaWalk> {
  const { rows } = await client.query<{ modified: string | null; stale: boolean }>(
    `SELECT modified, read_at < now() - make_interval(days => ${READ_EVERY_DAYS}) AS stale FROM epa_reads WHERE id = 1`,
  );
  const kept = rows[0];
  if (kept && !kept.stale) return { due: false, cases: 0 };
  if (budget.left <= 0) return { due: true, cases: 0, stopped: "this run's read is spent" };
  budget.left--;
  let got: CaseFileAnswer;
  try {
    got = await fetchFile(kept?.modified ?? null);
  } catch (err) {
    got = { cases: [], modified: null, outcome: "error", detail: String(err).slice(0, 200) };
  }
  if (got.outcome === "unchanged") {
    await client.query("UPDATE epa_reads SET read_at = now() WHERE id = 1");
    return { due: true, read: "unchanged", cases: 0 };
  }
  if (got.outcome !== "ok") {
    return { due: true, cases: 0, stopped: got.outcome, failure: { outcome: got.outcome, httpStatus: got.httpStatus, detail: got.detail } };
  }
  await store(client, got.cases, got.modified);
  return { due: true, read: "stored", cases: got.cases.length };
}

async function store(client: PoolClient, cases: readonly EpaCase[], modified: string | null): Promise<void> {
  const unique = [...new Map(cases.map((c) => [c.number, c])).values()];
  await client.query("BEGIN");
  try {
    await client.query("DELETE FROM epa_cases");
    for (let i = 0; i < unique.length; i += CHUNK) {
      const part = unique.slice(i, i + CHUNK);
      await client.query(
        `INSERT INTO epa_cases (case_number, name, court, filed_on, step, penalty, laws, defendants, docket, name_keys, penalty_settled, work_ordered, summary,
                                suit_filed, settlement_days, settlement_lodged, settlement_penalties, settlement_work, cost_recovery, settlement_cost_recovery,
                                projects_figure, projects, settlement_projects_figure, settlement_projects)
         SELECT n, nm, ct, d, st, p::numeric, string_to_array(l, '|'), string_to_array(df, '|'), dk, k, ps, w::numeric, sm,
                sf, string_to_array(sd, '|')::date[], string_to_array(sl, '|')::boolean[], string_to_array(sp, '|', '')::numeric(16, 2)[], string_to_array(sw, '|', '')::numeric(16, 2)[],
                cr::numeric, string_to_array(sc, '|', '')::numeric(16, 2)[],
                pf::numeric, string_to_array(pj, chr(10)), string_to_array(spf, '|', '')::numeric(16, 2)[], string_to_array(spj, chr(30))
           FROM unnest($1::text[], $2::text[], $3::boolean[], $4::date[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::boolean[], $12::text[], $13::text[],
                       $14::date[], $15::text[], $16::text[], $17::text[], $18::text[], $19::text[], $20::text[], $21::text[], $22::text[], $23::text[], $24::text[])
             AS t(n, nm, ct, d, st, p, l, df, dk, k, ps, w, sm, sf, sd, sl, sp, sw, cr, sc, pf, pj, spf, spj)`,
        [
          part.map((c) => c.number),
          part.map((c) => c.name),
          part.map((c) => c.court),
          part.map((c) => c.day),
          part.map((c) => c.step),
          part.map((c) => c.penalty),
          part.map((c) => c.laws.join("|")),
          part.map((c) => c.defendants.map((d) => d.replaceAll("|", "/")).join("|")),
          part.map((c) => c.docket),
          part.map((c) => c.defendants.map(alnum).join("|")),
          part.map((c) => !!c.settled),
          part.map((c) => c.workOrdered ?? null),
          part.map((c) => c.summary ?? null),
          // the suit's day and each settlement's (batch 122), the arrays in step, "" a figure of none; but a
          // case of one settlement with no such figure stores that figure's array empty, read back as none
          part.map((c) => c.suitFiled ?? null),
          part.map((c) => (c.settlements ?? []).map((x) => x.day).join("|")),
          part.map((c) => (c.settlements ?? []).map((x) => String(x.lodged)).join("|")),
          part.map((c) => (c.settlements ?? []).map((x) => x.penalty ?? "").join("|")),
          part.map((c) => (c.settlements ?? []).map((x) => x.work ?? "").join("|")),
          // the cost recovery, the case's and each settlement's (batch 129), by the same rule
          part.map((c) => c.costRecovery ?? null),
          part.map((c) => (c.settlements ?? []).map((x) => x.costRecovery ?? "").join("|")),
          // the supplemental environmental projects (batch 141): the case's figure and texts, a text a line,
          // and each settlement's in step, its texts a line each; a text holds no line break (`projectText`)
          part.map((c) => c.projectsFigure ?? null),
          part.map((c) => (c.projects ?? []).join("\n")),
          part.map((c) => (c.settlements ?? []).map((x) => x.projectsFigure ?? "").join("|")),
          part.map((c) => (c.settlements ?? []).map((x) => (x.projects ?? []).join("\n")).join("\u001e")),
        ],
      );
    }
    await client.query(
      `INSERT INTO epa_reads (id, modified, cases) VALUES (1, $1, $2)
       ON CONFLICT (id) DO UPDATE SET modified = EXCLUDED.modified, cases = EXCLUDED.cases, read_at = now()`,
      [modified, unique.length],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

/** The kept cases a defendant of which holds one of `keys` (names in lower-case letters and digits), from `from` on. */
export async function storedEpaCases(client: PoolClient, keys: readonly string[], from: string): Promise<EpaCase[]> {
  if (!keys.length) return [];
  const { rows } = await client.query<{
    case_number: string;
    name: string;
    court: boolean;
    day: string;
    step: EpaCase["step"];
    penalty: string | null;
    laws: string[];
    defendants: string[];
    docket: string | null;
    penalty_settled: boolean;
    work_ordered: string | null;
    summary: string | null;
    suit_filed: string | null;
    settlement_days: string[];
    settlement_lodged: boolean[];
    settlement_penalties: (string | null)[];
    settlement_work: (string | null)[];
    cost_recovery: string | null;
    settlement_cost_recovery: (string | null)[];
    projects_figure: string | null;
    projects: string[] | null;
    settlement_projects_figure: (string | null)[] | null;
    settlement_projects: string[] | null;
  }>(
    `SELECT case_number, name, court, filed_on::text AS day, step, penalty::text AS penalty, laws, defendants, docket, penalty_settled, work_ordered::text AS work_ordered, summary,
            suit_filed::text AS suit_filed, settlement_days::text[] AS settlement_days, settlement_lodged, settlement_penalties::text[] AS settlement_penalties, settlement_work::text[] AS settlement_work,
            cost_recovery::text AS cost_recovery, settlement_cost_recovery::text[] AS settlement_cost_recovery,
            projects_figure::text AS projects_figure, projects, settlement_projects_figure::text[] AS settlement_projects_figure, settlement_projects
       FROM epa_cases WHERE filed_on >= $1::date AND name_keys LIKE ANY ($2::text[]) ORDER BY filed_on, case_number`,
    [from, keys.map((k) => `%${k}%`)],
  );
  // numeric comes back as "11000000.00": the cases' own form drops cents that are none
  const money = (x: string | null) => (x === null ? null : x.replace(/\.00$/, ""));
  return rows.map((r) => ({
    number: r.case_number,
    name: r.name,
    court: r.court,
    day: r.day,
    step: r.step,
    penalty: money(r.penalty),
    settled: r.penalty_settled,
    workOrdered: money(r.work_ordered),
    costRecovery: money(r.cost_recovery),
    projectsFigure: money(r.projects_figure),
    projects: r.projects ?? [],
    summary: r.summary,
    laws: r.laws,
    defendants: r.defendants,
    docket: r.docket,
    suitFiled: r.suit_filed,
    settlements: (r.settlement_days ?? []).map((d, k) => ({
      day: d,
      lodged: r.settlement_lodged?.[k] !== false,
      penalty: money(r.settlement_penalties?.[k] ?? null),
      work: money(r.settlement_work?.[k] ?? null),
      costRecovery: money(r.settlement_cost_recovery?.[k] ?? null),
      projectsFigure: money(r.settlement_projects_figure?.[k] ?? null),
      projects: (r.settlement_projects?.[k] ?? "").split("\n").filter(Boolean),
    })),
  }));
}

/**
 * The company's cases: the walk first, then every kept case one of whose defendants is the
 * company under the names it had that year, its legal names among them (`partyNamesFor`), from
 * its first price on. A bank's notes record takes none, nor a fund's series.
 */
export async function epaCasesFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }, walked: EpaWalk): Promise<FetchResult> {
  const failure = walked.failure;
  const failed = failure ? { outcome: failure.outcome, httpStatus: failure.httpStatus, detail: failure.detail } : null;
  if (plan.fundSeries) return failed ? { events: [], ...failed } : FUND_SERIES();
  if (isNotesRecord(plan.cik)) return failed ? { events: [], ...failed } : { events: [], outcome: "empty", detail: "a bank's notes record: its cases are its group's page's" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return failed ? { events: [], ...failed } : NO_PRICES();
  const years = Array.from({ length: Math.max(1, new Date().getUTCFullYear() - Number(listed.slice(0, 4)) + 1) }, (_, k) => Number(listed.slice(0, 4)) + k);
  // …and the units it owned (`UNITS`): Sunoco, Inc.'s cases are filed under Sunoco's name
  const keys = [...new Set([...years.flatMap(namesIn).flatMap(andSpellings).map(alnum).filter((k) => k.length >= 2), ...unitKeysOf(plan.cik)])];
  const events = epaEvents(await storedEpaCases(client, keys, listed), namesIn, { cik: plan.cik, from: listed });
  // every kept row the rules give it: a complete answer, so a row they no longer give comes off (batch 108)
  if (failed) return { events, ...failed, complete: {} };
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, complete: {} };
}
