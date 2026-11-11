import type { PoolClient } from "pg";
import {
  fetchMineFiles,
  fetchMineFindings,
  mineAccidentEvents,
  mineControllersFor,
  type MineAccident,
  type MineFilesAnswer,
  type MineFindingsAnswer,
  type MineViolation,
} from "../mineAccidents";
import type { FetchResult } from "../types";
import { NO_PRICES, firstPriceDay } from "./secPressWalk";

/**
 * MSHA's Accidents and Mines files, read once a week for every company (batch 134), the deaths kept
 * in db/046. A copy MSHA has not changed since the last read (its Last-Modified) is not read again; a
 * changed one replaces the kept accidents whole, in one transaction, and only when it read as a
 * whole file. One read a process.
 */
export const READ_EVERY_DAYS = 7;
/** What a process may still ask, shared by every company it ingests: one read of the files. */
export const mineBudget = { left: 1 };
/** MSHA's findings files (Inspections, Assessed Violations) are read once a month (batch 139): about 184 MB a read. */
export const FINDINGS_EVERY_DAYS = 30;
/** …one read a process, apart from the accidents' read. */
export const findingsBudget = { left: 1 };

export interface MineWalk {
  due: boolean;
  /** what the read found: a new copy, the same copy, or nothing asked */
  read?: "stored" | "unchanged";
  accidents: number;
  stopped?: string;
  failure?: { outcome: "throttled" | "error"; httpStatus?: number; detail?: string };
  /** MSHA's findings, read on their own month (batch 139); a failure here leaves the kept findings and the rows. */
  findings?: FindingsWalk;
}

export interface FindingsWalk {
  due: boolean;
  read?: "stored";
  investigations: number;
  violations: number;
  stopped?: string;
  failure?: { outcome: "throttled" | "error"; httpStatus?: number; detail?: string };
}

/**
 * Reads the accidents' files when the last read is `READ_EVERY_DAYS` old or there is none, then MSHA's
 * findings files when theirs is `FINDINGS_EVERY_DAYS` old or none, linked to the accidents kept.
 * `fetchFiles` and `fetchFindings` are replaceable so the check can run it offline.
 */
export async function walkMineAccidents(
  client: PoolClient,
  {
    budget = mineBudget,
    fetchFiles = fetchMineFiles,
    findingsBudget: findingsLeft = findingsBudget,
    fetchFindings = fetchMineFindings,
  }: {
    budget?: { left: number };
    fetchFiles?: (since: string | null) => Promise<MineFilesAnswer>;
    findingsBudget?: { left: number };
    fetchFindings?: (accidents: readonly { key: string; mine: string; day: string }[]) => Promise<MineFindingsAnswer>;
  } = {},
): Promise<MineWalk> {
  const walked = await walkAccidents(client, budget, fetchFiles);
  return { ...walked, findings: await walkFindings(client, findingsLeft, fetchFindings) };
}

async function walkAccidents(client: PoolClient, budget: { left: number }, fetchFiles: (since: string | null) => Promise<MineFilesAnswer>): Promise<MineWalk> {
  const { rows } = await client.query<{ modified: string | null; stale: boolean }>(
    `SELECT modified, read_at < now() - make_interval(days => ${READ_EVERY_DAYS}) AS stale FROM mine_reads WHERE id = 1`,
  );
  const kept = rows[0];
  if (kept && !kept.stale) return { due: false, accidents: 0 };
  if (budget.left <= 0) return { due: true, accidents: 0, stopped: "this run's read is spent" };
  budget.left--;
  let got: MineFilesAnswer;
  try {
    got = await fetchFiles(kept?.modified ?? null);
  } catch (err) {
    got = { accidents: [], modified: null, outcome: "error", detail: String(err).slice(0, 200) };
  }
  if (got.outcome === "unchanged") {
    await client.query("UPDATE mine_reads SET read_at = now() WHERE id = 1");
    return { due: true, read: "unchanged", accidents: 0 };
  }
  if (got.outcome !== "ok") {
    return { due: true, accidents: 0, stopped: got.outcome, failure: { outcome: got.outcome, httpStatus: got.httpStatus, detail: got.detail } };
  }
  await store(client, got.accidents, got.modified);
  return { due: true, read: "stored", accidents: got.accidents.length };
}

async function walkFindings(
  client: PoolClient,
  budget: { left: number },
  fetchFindings: (accidents: readonly { key: string; mine: string; day: string }[]) => Promise<MineFindingsAnswer>,
): Promise<FindingsWalk> {
  const { rows } = await client.query<{ stale: boolean }>(
    `SELECT findings_read_at IS NULL OR findings_read_at < now() - make_interval(days => ${FINDINGS_EVERY_DAYS}) AS stale FROM mine_reads WHERE id = 1`,
  );
  // nothing to link before the accidents are kept, and nothing to ask within the month
  if (!rows[0]?.stale) return { due: false, investigations: 0, violations: 0 };
  if (budget.left <= 0) return { due: true, investigations: 0, violations: 0, stopped: "this run's read is spent" };
  budget.left--;
  const { rows: kept } = await client.query<{ accident_key: string; mine_id: string; day: string }>("SELECT accident_key, mine_id, day::text AS day FROM mine_accidents");
  let got: MineFindingsAnswer;
  try {
    got = await fetchFindings(kept.map((r) => ({ key: r.accident_key, mine: r.mine_id, day: r.day })));
  } catch (err) {
    got = { investigations: [], violations: [], modified: null, outcome: "error", detail: String(err).slice(0, 200) };
  }
  if (got.outcome !== "ok") {
    return { due: true, investigations: 0, violations: 0, stopped: got.outcome, failure: { outcome: got.outcome, httpStatus: got.httpStatus, detail: got.detail } };
  }
  const investigations = [...new Map(got.investigations.map((i) => [i.event, i])).values()];
  const violations = [...new Map(got.violations.map((v) => [`${v.event}|${v.number}`, v])).values()];
  await client.query("BEGIN");
  try {
    await client.query("DELETE FROM mine_violations");
    await client.query("DELETE FROM mine_investigations");
    await client.query(
      `INSERT INTO mine_investigations (event_no, accident_key, mine_id, begin_day, activity_code)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::date[], $5::text[])`,
      [investigations.map((i) => i.event), investigations.map((i) => i.accident), investigations.map((i) => i.mine), investigations.map((i) => i.begin), investigations.map((i) => i.code)],
    );
    await client.query(
      `INSERT INTO mine_violations (event_no, violation_no, violator_type, violator_name, action, assessment, proposed_amount, current_amount)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::numeric[], $8::numeric[])`,
      [
        violations.map((v) => v.event),
        violations.map((v) => v.number),
        violations.map((v) => v.violatorType),
        violations.map((v) => v.violator),
        violations.map((v) => v.action),
        violations.map((v) => v.assessment),
        violations.map((v) => v.proposed),
        violations.map((v) => v.current),
      ],
    );
    await client.query("UPDATE mine_reads SET findings_modified = $1, findings_read_at = now() WHERE id = 1", [got.modified]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  return { due: true, read: "stored", investigations: investigations.length, violations: violations.length };
}

/**
 * The kept findings of the given accidents, by accident key: the violations assessed under the
 * investigations linked to each. A missing table (db/048 not yet applied) gives none: an enrichment never
 * breaks the rows it adds to.
 */
export async function storedMineFindings(client: PoolClient, keys: readonly string[]): Promise<Map<string, MineViolation[]>> {
  const out = new Map<string, MineViolation[]>();
  if (!keys.length) return out;
  let rows: {
    accident_key: string;
    event_no: string;
    violation_no: string;
    violator_type: string;
    violator_name: string;
    action: string;
    assessment: string;
    proposed: string;
    current: string;
  }[];
  try {
    ({ rows } = await client.query(
      `SELECT i.accident_key, v.event_no, v.violation_no, v.violator_type, v.violator_name, v.action, v.assessment,
              v.proposed_amount::text AS proposed, v.current_amount::text AS current
         FROM mine_investigations i JOIN mine_violations v ON v.event_no = i.event_no
        WHERE i.accident_key = ANY ($1::text[]) ORDER BY i.accident_key, v.event_no, v.violation_no`,
      [[...keys]],
    ));
  } catch {
    return out;
  }
  for (const r of rows) {
    const v: MineViolation = {
      event: r.event_no,
      number: r.violation_no,
      violatorType: r.violator_type,
      violator: r.violator_name,
      action: r.action,
      assessment: r.assessment,
      proposed: r.proposed,
      current: r.current,
    };
    out.set(r.accident_key, [...(out.get(r.accident_key) ?? []), v]);
  }
  return out;
}

async function store(client: PoolClient, accidents: readonly MineAccident[], modified: string | null): Promise<void> {
  const unique = [...new Map(accidents.map((a) => [a.key, a])).values()];
  const col = <T>(f: (a: MineAccident) => T) => unique.map(f);
  await client.query("BEGIN");
  try {
    await client.query("DELETE FROM mine_accidents");
    await client.query(
      `INSERT INTO mine_accidents (accident_key, mine_id, day, time_of_day, dead, contractor_dead, controller_id, controller_name, operator_name,
                                   classification, accident_type, subunit, coal, narrative, documents, mine_name, county, state, town)
       SELECT k, m, d, t, n, cn, ci, cname, op, cl, ty, su, co, na, string_to_array(docs, '|'), mn, cy, st, tw
         FROM unnest($1::text[], $2::text[], $3::date[], $4::text[], $5::int[], $6::int[], $7::text[], $8::text[], $9::text[],
                     $10::text[], $11::text[], $12::text[], $13::boolean[], $14::text[], $15::text[], $16::text[], $17::text[], $18::text[], $19::text[])
           AS t(k, m, d, t, n, cn, ci, cname, op, cl, ty, su, co, na, docs, mn, cy, st, tw)`,
      [
        col((a) => a.key),
        col((a) => a.mine),
        col((a) => a.day),
        col((a) => a.time),
        col((a) => a.dead),
        col((a) => a.contractorDead),
        col((a) => a.controllerId),
        col((a) => a.controllerName),
        col((a) => a.operatorName),
        col((a) => a.classification),
        col((a) => a.accidentType),
        col((a) => a.subunit),
        col((a) => a.coal),
        col((a) => a.narrative),
        col((a) => a.documents.map((d) => d.replaceAll("|", "/")).join("|")),
        col((a) => a.mineName),
        col((a) => a.county),
        col((a) => a.state),
        col((a) => a.town),
      ],
    );
    await client.query(
      `INSERT INTO mine_reads (id, modified, accidents) VALUES (1, $1, $2)
       ON CONFLICT (id) DO UPDATE SET modified = EXCLUDED.modified, accidents = EXCLUDED.accidents, read_at = now()`,
      [modified, unique.length],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

/** The kept accidents under the given controller IDs, from `from` on. */
export async function storedMineAccidents(client: PoolClient, controllerIds: readonly string[], from: string): Promise<MineAccident[]> {
  if (!controllerIds.length) return [];
  const { rows } = await client.query<{
    accident_key: string;
    mine_id: string;
    day: string;
    time_of_day: string;
    dead: number;
    contractor_dead: number;
    controller_id: string;
    controller_name: string;
    operator_name: string;
    classification: string;
    accident_type: string;
    subunit: string;
    coal: boolean;
    narrative: string;
    documents: string[];
    mine_name: string;
    county: string;
    state: string;
    town: string;
  }>(
    `SELECT accident_key, mine_id, day::text AS day, time_of_day, dead, contractor_dead, controller_id, controller_name, operator_name,
            classification, accident_type, subunit, coal, narrative, documents, mine_name, county, state, town
       FROM mine_accidents WHERE day >= $1::date AND controller_id = ANY ($2::text[]) ORDER BY day, mine_id`,
    [from, [...controllerIds]],
  );
  return rows.map((r) => ({
    key: r.accident_key,
    mine: r.mine_id,
    day: r.day,
    time: r.time_of_day,
    dead: r.dead,
    contractorDead: r.contractor_dead,
    controllerId: r.controller_id,
    controllerName: r.controller_name,
    operatorName: r.operator_name,
    classification: r.classification,
    accidentType: r.accident_type,
    subunit: r.subunit,
    coal: r.coal,
    narrative: r.narrative,
    documents: r.documents,
    mineName: r.mine_name,
    county: r.county,
    state: r.state,
    town: r.town,
  }));
}

/**
 * The company's accidents: the walk first, then every kept accident under a controller mapped to it,
 * between that controller's days, from its first price on. The kept copy is the whole file's, so the
 * answer is complete (a row the map no longer gives comes off, batch 108), unless no copy was ever kept.
 */
export async function mineAccidentsFor(client: PoolClient, subjectId: number, cik: number | string, walked: MineWalk): Promise<FetchResult> {
  const failure = walked.failure;
  const failed = failure ? { outcome: failure.outcome, httpStatus: failure.httpStatus, detail: failure.detail } : null;
  const controllers = mineControllersFor(cik);
  if (!controllers) return failed ? { events: [], ...failed } : { events: [], outcome: "empty", detail: "no mine controller mapped to this company" };
  const listed = await firstPriceDay(client, subjectId);
  if (listed === null) return failed ? { events: [], ...failed } : NO_PRICES();
  const { rows } = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM mine_reads");
  const everRead = rows[0]?.n > 0;
  const accidents = await storedMineAccidents(client, controllers.map((c) => c.id), listed);
  // MSHA's own finding on each, from the kept findings (batch 139); none kept, none said
  const findings = await storedMineFindings(client, accidents.map((a) => a.key));
  const events = mineAccidentEvents(accidents, controllers, { from: listed, findings });
  // a findings read that failed leaves the kept findings, and says so in the log line
  const findingsNote = walked.findings?.failure ? { detail: `MSHA's findings files: ${walked.findings.failure.outcome}${walked.findings.failure.detail ? ` (${walked.findings.failure.detail})` : ""}; the kept findings stand` } : {};
  if (failed) return everRead ? { events, ...failed, complete: {} } : { events, ...failed };
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, ...findingsNote, ...(everRead ? { complete: {} } : {}) };
}
