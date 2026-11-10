import type { PoolClient } from "pg";
import { andSpellings } from "../edgarName";
import { cpscEvents, fetchRecalls, type CpscRecall, type RecallsAnswer, unitKeysOf } from "../cpscRecalls";
import { isNotesRecord } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The CPSC's recalls, read once a week for every company (batch 96), kept in db/038. The service
 * answers every recall at once, so a read is one request, and a whole answer replaces the kept
 * recalls in one transaction. One read a process.
 */
export const READ_EVERY_DAYS = 7;
export const cpscBudget = { left: 1 };
const CHUNK = 2_000;

export interface CpscWalk {
  due: boolean;
  recalls: number;
  stopped?: string;
  failure?: { outcome: "throttled" | "error"; httpStatus?: number; detail?: string };
}

const letters = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
const joined = (list: readonly string[]) => list.map((x) => x.replaceAll("|", "/")).join("|");

/** Reads the service when the last read is `READ_EVERY_DAYS` old or there is none. `fetchAll` is replaceable so the check can run it offline. */
export async function walkCpsc(
  client: PoolClient,
  { budget = cpscBudget, fetchAll = fetchRecalls }: { budget?: { left: number }; fetchAll?: () => Promise<RecallsAnswer> } = {},
): Promise<CpscWalk> {
  const { rows } = await client.query<{ stale: boolean }>(`SELECT read_at < now() - make_interval(days => ${READ_EVERY_DAYS}) AS stale FROM cpsc_reads WHERE id = 1`);
  if (rows[0] && !rows[0].stale) return { due: false, recalls: 0 };
  if (budget.left <= 0) return { due: true, recalls: 0, stopped: "this run's read is spent" };
  budget.left--;
  let got: RecallsAnswer;
  try {
    got = await fetchAll();
  } catch (err) {
    got = { recalls: [], outcome: "error", detail: String(err).slice(0, 200) };
  }
  if (got.outcome !== "ok") return { due: true, recalls: 0, stopped: got.outcome, failure: { outcome: got.outcome, httpStatus: got.httpStatus, detail: got.detail } };
  const recalls = [...new Map(got.recalls.map((r) => [r.number, r])).values()];
  await client.query("BEGIN");
  try {
    await client.query("DELETE FROM cpsc_recalls");
    for (let i = 0; i < recalls.length; i += CHUNK) {
      const part = recalls.slice(i, i + CHUNK);
      await client.query(
        `INSERT INTO cpsc_recalls (recall_number, recalled_on, title, url, hazard, units, makers, importers, distributors, sold_at, name_keys, injuries)
         SELECT n, d, t, u, h, un, string_to_array(m, '|'), string_to_array(im, '|'), string_to_array(di, '|'), s, k, inj
           FROM unnest($1::text[], $2::date[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text[], $12::text[])
             AS x(n, d, t, u, h, un, m, im, di, s, k, inj)`,
        [
          part.map((r) => r.number),
          part.map((r) => r.day),
          part.map((r) => r.title),
          part.map((r) => r.url),
          part.map((r) => r.hazard),
          part.map((r) => r.units),
          part.map((r) => joined(r.makers)),
          part.map((r) => joined(r.importers)),
          part.map((r) => joined(r.distributors)),
          part.map((r) => r.soldAt),
          part.map((r) => letters([...r.makers, ...r.importers, ...r.distributors, r.soldAt].join(" "))),
          // the Commission's injury statement (batch 136)
          part.map((r) => r.injuries),
        ],
      );
    }
    await client.query(
      `INSERT INTO cpsc_reads (id, recalls) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET recalls = EXCLUDED.recalls, read_at = now()`,
      [recalls.length],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  return { due: true, recalls: recalls.length };
}

/** The kept recalls whose firms or stores hold one of `keys`, from `from` on. */
export async function storedRecalls(client: PoolClient, keys: readonly string[], from: string): Promise<CpscRecall[]> {
  if (!keys.length) return [];
  const { rows } = await client.query<{
    recall_number: string;
    day: string;
    title: string;
    url: string | null;
    hazard: string | null;
    injuries: string | null;
    units: string | null;
    makers: string[];
    importers: string[];
    distributors: string[];
    sold_at: string;
  }>(
    `SELECT recall_number, recalled_on::text AS day, title, url, hazard, injuries, units, makers, importers, distributors, sold_at
       FROM cpsc_recalls WHERE recalled_on >= $1::date AND name_keys LIKE ANY ($2::text[]) ORDER BY recalled_on, recall_number`,
    [from, keys.map((k) => `%${k}%`)],
  );
  return rows.map((r) => ({
    number: r.recall_number,
    day: r.day,
    title: r.title,
    url: r.url,
    hazard: r.hazard,
    injuries: r.injuries ?? null,
    units: r.units,
    makers: r.makers ?? [],
    importers: r.importers ?? [],
    distributors: r.distributors ?? [],
    soldAt: r.sold_at,
  }));
}

/**
 * The company's recalls: the walk first, then every kept recall naming it as maker, importer,
 * distributor or a store that sold the product, under the names it had that year, from its first
 * price on. A bank's notes record takes none, nor a fund's series.
 */
export async function cpscFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }, walked: CpscWalk): Promise<FetchResult> {
  const failure = walked.failure;
  const failed = failure ? { outcome: failure.outcome, httpStatus: failure.httpStatus, detail: failure.detail } : null;
  if (plan.fundSeries) return failed ? { events: [], ...failed } : FUND_SERIES();
  if (isNotesRecord(plan.cik)) return failed ? { events: [], ...failed } : { events: [], outcome: "empty", detail: "a bank's notes record: no recall is its" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return failed ? { events: [], ...failed } : NO_PRICES();
  const first = Number(listed.slice(0, 4));
  const years = Array.from({ length: Math.max(1, new Date().getUTCFullYear() - first + 1) }, (_, k) => first + k);
  // …and the units it owned (`UNITS`): Graco Children's Products' recalls name Graco
  const keys = [...new Set([...years.flatMap(namesIn).flatMap(andSpellings).map(letters).filter((k) => k.length >= 2), ...unitKeysOf(plan.cik)])];
  const events = cpscEvents(await storedRecalls(client, keys, listed), namesIn, { cik: plan.cik, from: listed });
  // every kept row the rules give it: a complete answer, so a row they no longer give comes off (batch 108)
  if (failed) return { events, ...failed, complete: {} };
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, complete: {} };
}
