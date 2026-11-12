import type { PoolClient } from "pg";
import { fdaFirmsFor } from "../fdaRecalls";
import {
  deviceRecallEvents,
  fetchDeviceRecords,
  fetchEventClass,
  fetchReportedEvents,
  type DeviceRecord,
} from "../fdaDeviceRecalls";
import type { FetchResult } from "../types";
import { firstPriceDay, NO_PRICES } from "./secPressWalk";

/**
 * The FDA's device recalls of 2000 to mid-2012 on a mapped company's page (batch 144,
 * lib/fdaDeviceRecalls.ts): the company's firms' records from openFDA, less the reports' own events,
 * each recall's class from the FDA's recall-database page for it, read once and kept (db/051).
 */

/** The recall-database pages a process may read, shared by every company it ingests. */
export const CLASS_READS_PER_RUN = 200;
export const classBudget = { left: CLASS_READS_PER_RUN };
/** One page every 1.3 s, as the other FDA reads ask. */
export const CLASS_GAP_MS = 1300;
/** A page that listed no product is asked again after this long. */
const RETRY_EMPTY_DAYS = 30;

/** The reports' events begun before 2012-06-20, read once a process: they never change. */
let reportedOnce: ReturnType<typeof fetchReportedEvents> | null = null;
export const resetReported = () => {
  reportedOnce = null;
};

export interface DeviceRecallDeps {
  budget?: { left: number };
  fetchRecords?: typeof fetchDeviceRecords;
  fetchReported?: typeof fetchReportedEvents;
  fetchClass?: typeof fetchEventClass;
  sleep?: (ms: number) => Promise<unknown>;
}

async function storedClasses(client: PoolClient, events: readonly string[]): Promise<Map<string, 1 | 2 | 3 | null>> {
  if (!events.length) return new Map();
  const { rows } = await client.query<{ event_number: number; class: number | null }>(
    `SELECT event_number, class FROM fda_device_classes
      WHERE event_number = ANY ($1::int[])
        AND (class IS NOT NULL OR read_at > now() - make_interval(days => ${RETRY_EMPTY_DAYS}))`,
    [events.map(Number)],
  );
  return new Map(rows.map((r) => [String(r.event_number), r.class as 1 | 2 | 3 | null]));
}

async function keepClass(client: PoolClient, event: string, cls: 1 | 2 | 3 | null, products: number): Promise<void> {
  await client.query(
    `INSERT INTO fda_device_classes (event_number, class, products) VALUES ($1, $2, $3)
     ON CONFLICT (event_number) DO UPDATE SET class = EXCLUDED.class, products = EXCLUDED.products, read_at = now()`,
    [Number(event), cls, products],
  );
}

/**
 * The company's device recalls before the reports. A recall whose class is not kept yet is read now,
 * oldest first, while the process's budget lasts; the rest wait for the next run, and the answer says
 * how many. A refused page stops the reads for the process, the recalls already classed still given.
 */
export async function deviceRecallsFor(client: PoolClient, subjectId: number, cik: number | string, deps: DeviceRecallDeps = {}): Promise<FetchResult> {
  const {
    budget = classBudget,
    fetchRecords = fetchDeviceRecords,
    fetchReported = fetchReportedEvents,
    fetchClass = fetchEventClass,
    sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
  } = deps;
  const firms = fdaFirmsFor(cik);
  if (!firms) return { events: [], outcome: "empty", detail: "no FDA-regulated firm mapped to this company" };
  const from = await firstPriceDay(client, subjectId);
  if (from === null) return NO_PRICES();
  const records = await fetchRecords(firms);
  if (!records.ok) return records.failure;
  // the real reader is shared by the process; a replaced one (the check's) is asked each time
  const reported = deps.fetchReported ? await fetchReported() : await (reportedOnce ??= fetchReported());
  if (!reported.ok) {
    if (!deps.fetchReported) reportedOnce = null;
    return reported.failure;
  }
  const recs: DeviceRecord[] = records.value;
  const ids = [...new Set(recs.map((r) => String(r.res_event_number ?? "")).filter((id) => /^\d+$/.test(id)))];
  const classes = await storedClasses(client, ids);
  const plan = { classes, reported: reported.value, from };
  let { awaiting } = deviceRecallEvents(recs, firms, plan);
  let read = 0;
  let stopped: string | undefined;
  for (const event of awaiting) {
    if (budget.left <= 0) {
      stopped ??= "this run's class reads are spent";
      break;
    }
    if (read) await sleep(CLASS_GAP_MS);
    const got = await fetchClass(event, { gapMs: CLASS_GAP_MS, sleep });
    budget.left -= got.requests;
    if (!got.ok) {
      stopped = `the recall database refused event ${event}: ${got.outcome}${got.httpStatus ? ` ${got.httpStatus}` : ""}`;
      // a refusal stops every company's reads in this process
      if (got.outcome === "throttled") budget.left = 0;
      break;
    }
    await keepClass(client, event, got.cls, got.products);
    classes.set(event, got.cls);
    read++;
  }
  const result = deviceRecallEvents(recs, firms, plan);
  awaiting = result.awaiting;
  const notes = [
    read ? `${read} recall classes read` : "",
    awaiting.length ? `${awaiting.length} recalls await their class${stopped ? ` (${stopped})` : ""}` : "",
  ].filter(Boolean);
  return {
    events: result.events,
    outcome: result.events.length ? "ok" : "empty",
    httpStatus: records.httpStatus,
    ...(notes.length ? { detail: notes.join("; ") } : {}),
  };
}
