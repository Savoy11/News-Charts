import type { PoolClient } from "pg";
import { CFPB_PAGE_SIZE, cfpbEvents, fetchCfpbPage, type CfpbAction, type CfpbAnswer } from "../cfpb";
import { isNotesRecord, releaseNamesBefore, releaseNamesOn } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The Consumer Financial Protection Bureau's enforcement actions, read once for every company
 * (batch 89), in the shape of the SEC's cases' walk (`secCasesWalk.ts`).
 *
 * The list is the Bureau's, not a company's, so it is read once and kept (db/035): every page of it
 * once a month, which also picks up a title, summary or day the Bureau corrects, and its first page
 * once a day, with further pages only while each holds no action already kept — on most days the
 * first page alone. Each company's ingest then keeps the kept actions whose title names it as a
 * respondent (`cfpbEvents`).
 *
 * Bounded: at most `PAGES_PER_RUN` pages a process, `GAP_MS` apart, and the whole list is begun
 * only while `LIST_PAGES` are left. It stops at the first refusal or failure, and a read is stored
 * only when every page it asked answered. Measured 2026-11-05: 386 actions on 16 pages, every one
 * of them shown once.
 */
export const PAGES_PER_RUN = 40;
export const GAP_MS = 1_000;
/** more pages than the list has held — the whole list is begun only with this many left */
export const LIST_PAGES = 30;
/** how old the last whole read may be before the list is read whole again */
export const LIST_EVERY_DAYS = 30;

/** What a process may still ask, shared by every company it ingests. */
export const cfpbBudget = { left: PAGES_PER_RUN };

export interface CfpbWalk {
  /** what was due: the whole list, its newest page, or nothing */
  due: "list" | "newest" | null;
  pages: number;
  /** actions stored, new or corrected */
  actions: number;
  /** actions the list's own count holds that its pages never showed */
  short?: number;
  stopped?: string;
  failure?: { outcome: "throttled" | "error"; httpStatus?: number; detail?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reads the whole list when it has never been read whole or that read is `LIST_EVERY_DAYS` old,
 * else its newest page when the last read of either kind is a day old. `fetchPage` and `gapMs` are
 * replaceable so the check can run it offline.
 */
export async function walkCfpb(
  client: PoolClient,
  {
    budget = cfpbBudget,
    gapMs = GAP_MS,
    fetchPage = fetchCfpbPage,
  }: { budget?: { left: number }; gapMs?: number; fetchPage?: (page: number) => Promise<CfpbAnswer> } = {}
): Promise<CfpbWalk> {
  const { rows } = await client.query<{ kind: "list" | "newest"; old: boolean; stale: boolean }>(
    `SELECT kind, read_at < now() - make_interval(days => ${LIST_EVERY_DAYS}) AS old, read_at < now() - interval '1 day' AS stale FROM cfpb_reads`
  );
  const list = rows.find((r) => r.kind === "list");
  const newest = rows.find((r) => r.kind === "newest");
  const due = !list || list.old ? "list" : list.stale && (!newest || newest.stale) ? "newest" : null;
  const walk: CfpbWalk = { due, pages: 0, actions: 0 };
  if (!due) return walk;

  const ask = async (page: number): Promise<CfpbAnswer> => {
    budget.left--;
    if (gapMs) await sleep(gapMs);
    walk.pages++;
    try {
      return await fetchPage(page);
    } catch (err) {
      return { actions: [], outcome: "error", detail: String(err).slice(0, 200) };
    }
  };
  const failed = (got: CfpbAnswer, where: string): CfpbWalk => {
    const detail = `${where}${got.detail ? `: ${got.detail}` : ""}`;
    return { ...walk, stopped: got.outcome, failure: { outcome: got.outcome as "throttled" | "error", httpStatus: got.httpStatus, detail } };
  };
  const tooLong = (httpStatus?: number): CfpbWalk => {
    const detail = `the list has more than ${LIST_PAGES} pages`;
    return { ...walk, stopped: "error", failure: { outcome: "error", httpStatus, detail } };
  };

  const read: CfpbAction[] = [];
  if (due === "list") {
    if (budget.left < LIST_PAGES) return { ...walk, stopped: "this run's pages are spent" };
    const first = await ask(1);
    if (first.outcome !== "ok") return failed(first, "page 1");
    if (first.total === undefined) return { ...walk, stopped: "error", failure: { outcome: "error", httpStatus: first.httpStatus, detail: "page 1 gave no count" } };
    // past its last page the Bureau serves the last page again, so the count says where to stop
    const pages = Math.max(1, Math.ceil(first.total / CFPB_PAGE_SIZE));
    if (pages > LIST_PAGES) return tooLong(first.httpStatus);
    read.push(...first.actions);
    for (let p = 2; p <= pages; p++) {
      const got = await ask(p);
      if (got.outcome !== "ok") return failed(got, `page ${p}`);
      read.push(...got.actions);
    }
    const shown = new Set(read.map((a) => a.path)).size;
    if (shown < first.total) walk.short = first.total - shown;
    walk.actions = await store(client, "list", walk.pages, read, first.total);
    return walk;
  }

  // the newest: page by page until one holds an action already kept
  const known = new Set((await client.query<{ path: string }>("SELECT path FROM cfpb_actions")).rows.map((r) => r.path));
  let listed: number | undefined;
  for (let p = 1; ; p++) {
    if (budget.left <= 0) return { ...walk, stopped: "this run's pages are spent" };
    const got = await ask(p);
    if (got.outcome !== "ok") return failed(got, `page ${p}`);
    if (p === 1) listed = got.total;
    read.push(...got.actions);
    if (got.actions.length < CFPB_PAGE_SIZE || got.actions.some((a) => known.has(a.path))) break;
    if (p >= LIST_PAGES) return tooLong(got.httpStatus);
  }
  walk.actions = await store(client, "newest", walk.pages, read, listed);
  return walk;
}

/** Stores the actions a read showed and that it was made; returns how many were new or changed. */
async function store(client: PoolClient, kind: "list" | "newest", pages: number, read: CfpbAction[], listed?: number): Promise<number> {
  // one row an action: a statement may not write a row twice
  const actions = [...new Map(read.map((a) => [a.path, a])).values()];
  await client.query("BEGIN");
  try {
    const { rowCount } = await client.query(
      `INSERT INTO cfpb_actions (path, filed_on, title, description)
       SELECT * FROM unnest($1::text[], $2::date[], $3::text[], $4::text[])
       ON CONFLICT (path) DO UPDATE
          SET filed_on = EXCLUDED.filed_on, title = EXCLUDED.title, description = EXCLUDED.description, read_at = now()
        WHERE (cfpb_actions.filed_on, cfpb_actions.title, cfpb_actions.description) IS DISTINCT FROM (EXCLUDED.filed_on, EXCLUDED.title, EXCLUDED.description)`,
      [actions.map((a) => a.path), actions.map((a) => a.day), actions.map((a) => a.title), actions.map((a) => a.description)]
    );
    await client.query(
      `INSERT INTO cfpb_reads (kind, pages, actions, listed) VALUES ($1, $2, $3, $4)
       ON CONFLICT (kind) DO UPDATE
          SET pages = EXCLUDED.pages, actions = EXCLUDED.actions, listed = EXCLUDED.listed, read_at = now()`,
      [kind, pages, actions.length, listed ?? null]
    );
    await client.query("COMMIT");
    return rowCount ?? 0;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

/** Every action kept, oldest first. */
export async function storedCfpbActions(client: PoolClient): Promise<CfpbAction[]> {
  const { rows } = await client.query<{ path: string; day: string; title: string; description: string }>(
    "SELECT path, filed_on::text AS day, title, description FROM cfpb_actions ORDER BY filed_on, path"
  );
  return rows.map((r) => ({ day: r.day, path: r.path, title: r.title, description: r.description }));
}

/**
 * The company's actions: the walk first, then every kept action whose title names it as a
 * respondent under the names it had that year, its legal names among them (`partyNamesFor`), and
 * the units it then owned, from its first price on, as the SEC's cases are kept (`secCasesFor`). A
 * bank's notes record takes none, nor a fund's series.
 */
export async function cfpbFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }, walked: CfpbWalk): Promise<FetchResult> {
  const failure = walked.failure;
  const failed = failure ? { outcome: failure.outcome, httpStatus: failure.httpStatus, detail: failure.detail } : null;
  if (plan.fundSeries) return failed ? { events: [], ...failed } : FUND_SERIES();
  if (isNotesRecord(plan.cik)) return failed ? { events: [], ...failed } : { events: [], outcome: "empty", detail: "a bank's notes record: its actions are its group's page's" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return failed ? { events: [], ...failed } : NO_PRICES();
  const events = cfpbEvents(await storedCfpbActions(client), namesIn, {
    cik: plan.cik,
    from: listed,
    namesOn: (day) => releaseNamesOn(plan.cik, day),
    namesBefore: (day) => releaseNamesBefore(plan.cik, day),
  });
  if (failed) return { events, ...failed };
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
}
