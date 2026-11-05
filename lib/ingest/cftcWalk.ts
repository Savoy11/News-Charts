import type { PoolClient } from "pg";
import { CFTC_PAGE_SIZE, cftcEvents, fetchCftcPage, type CftcAction, type CftcAnswer } from "../cftc";
import { companyNames } from "../frCompany";
import { isNotesRecord, releaseNamesBefore, releaseNamesOn } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The CFTC's enforcement list, read for every company at once (batch 97), in the shape of the
 * CFPB's walk (`cfpbWalk.ts`): the whole list once a year, else its newest page once a day, with
 * further pages only while each holds no action already kept. At most `PAGES_PER_RUN` pages a
 * process, `GAP_MS` apart; the whole list is begun only while `LIST_PAGES` are left. A read is
 * stored only when every page it asked answered. Measured 2026-11-05: 261 pages, 2,610 actions.
 */
export const PAGES_PER_RUN = 320;
export const GAP_MS = 1_000;
export const LIST_PAGES = 300;
export const LIST_EVERY_DAYS = 365;

export const cftcBudget = { left: PAGES_PER_RUN };

export interface CftcWalk {
  due: "list" | "newest" | null;
  pages: number;
  actions: number;
  stopped?: string;
  failure?: { outcome: "throttled" | "error"; httpStatus?: number; detail?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function walkCftc(
  client: PoolClient,
  { budget = cftcBudget, gapMs = GAP_MS, fetchPage = fetchCftcPage }: { budget?: { left: number }; gapMs?: number; fetchPage?: (page: number) => Promise<CftcAnswer> } = {},
): Promise<CftcWalk> {
  const { rows } = await client.query<{ kind: "list" | "newest"; old: boolean; stale: boolean }>(
    `SELECT kind, read_at < now() - make_interval(days => ${LIST_EVERY_DAYS}) AS old, read_at < now() - interval '1 day' AS stale FROM cftc_reads`,
  );
  const list = rows.find((r) => r.kind === "list");
  const newest = rows.find((r) => r.kind === "newest");
  const due = !list || list.old ? "list" : list.stale && (!newest || newest.stale) ? "newest" : null;
  const walk: CftcWalk = { due, pages: 0, actions: 0 };
  if (!due) return walk;
  const ask = async (page: number): Promise<CftcAnswer> => {
    budget.left--;
    if (gapMs && walk.pages) await sleep(gapMs);
    walk.pages++;
    try {
      return await fetchPage(page);
    } catch (err) {
      return { actions: [], outcome: "error", detail: String(err).slice(0, 200) };
    }
  };
  const failed = (got: CftcAnswer, where: string): CftcWalk => ({
    ...walk,
    stopped: got.outcome,
    failure: { outcome: got.outcome as "throttled" | "error", httpStatus: got.httpStatus, detail: `${where}${got.detail ? `: ${got.detail}` : ""}` },
  });

  const read: CftcAction[] = [];
  if (due === "list") {
    if (budget.left < LIST_PAGES) return { ...walk, stopped: "this run's pages are spent" };
    const first = await ask(0);
    if (first.outcome !== "ok") return failed(first, "page 0");
    const last = first.lastPage ?? 0;
    if (last + 1 > LIST_PAGES) return { ...walk, stopped: "error", failure: { outcome: "error", httpStatus: first.httpStatus, detail: `the list has more than ${LIST_PAGES} pages` } };
    read.push(...first.actions);
    for (let p = 1; p <= last; p++) {
      const got = await ask(p);
      if (got.outcome !== "ok") return failed(got, `page ${p}`);
      read.push(...got.actions);
    }
    walk.actions = await store(client, "list", walk.pages, read);
    return walk;
  }
  const known = new Set((await client.query<{ path: string }>("SELECT path FROM cftc_actions")).rows.map((r) => r.path));
  for (let p = 0; ; p++) {
    if (budget.left <= 0) return { ...walk, stopped: "this run's pages are spent" };
    const got = await ask(p);
    if (got.outcome !== "ok") return failed(got, `page ${p}`);
    read.push(...got.actions);
    if (got.actions.length < CFTC_PAGE_SIZE || got.actions.some((a) => known.has(a.path))) break;
    if (p + 1 >= LIST_PAGES) return { ...walk, stopped: "error", failure: { outcome: "error", httpStatus: got.httpStatus, detail: `no kept action in ${LIST_PAGES} pages` } };
  }
  walk.actions = await store(client, "newest", walk.pages, read);
  return walk;
}

async function store(client: PoolClient, kind: "list" | "newest", pages: number, read: CftcAction[]): Promise<number> {
  const actions = [...new Map(read.map((a) => [a.path, a])).values()];
  await client.query("BEGIN");
  try {
    const { rowCount } = await client.query(
      `INSERT INTO cftc_actions (path, filed_on, title)
       SELECT * FROM unnest($1::text[], $2::date[], $3::text[])
       ON CONFLICT (path) DO UPDATE SET filed_on = EXCLUDED.filed_on, title = EXCLUDED.title, read_at = now()
        WHERE (cftc_actions.filed_on, cftc_actions.title) IS DISTINCT FROM (EXCLUDED.filed_on, EXCLUDED.title)`,
      [actions.map((a) => a.path), actions.map((a) => a.day), actions.map((a) => a.title)],
    );
    await client.query(
      `INSERT INTO cftc_reads (kind, pages, actions) VALUES ($1, $2, $3)
       ON CONFLICT (kind) DO UPDATE SET pages = EXCLUDED.pages, actions = EXCLUDED.actions, read_at = now()`,
      [kind, pages, actions.length],
    );
    await client.query("COMMIT");
    return rowCount ?? 0;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

export async function storedCftcActions(client: PoolClient): Promise<CftcAction[]> {
  const { rows } = await client.query<CftcAction>("SELECT path, filed_on::text AS day, title FROM cftc_actions ORDER BY filed_on, path");
  return rows;
}

/**
 * The company's actions: the walk first, then every kept action whose title makes it the party
 * under its names (its former and legal names among them, from `partyNamesFor`'s years) and the
 * units it then owned, from its first price on. A bank's notes record takes none, nor a fund's
 * series.
 */
export async function cftcFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }, walked: CftcWalk): Promise<FetchResult> {
  const failure = walked.failure;
  const failed = failure ? { outcome: failure.outcome, httpStatus: failure.httpStatus, detail: failure.detail } : null;
  if (plan.fundSeries) return failed ? { events: [], ...failed } : FUND_SERIES();
  if (isNotesRecord(plan.cik)) return failed ? { events: [], ...failed } : { events: [], outcome: "empty", detail: "a bank's notes record: its actions are its group's page's" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return failed ? { events: [], ...failed } : NO_PRICES();
  const actions = await storedCftcActions(client);
  const events = cftcEvents(actions, companyNames(plan.edgarName, plan.alsoKnownAs), {
    cik: plan.cik,
    from: listed,
    namesOn: (day) => [...namesIn(Number(day.slice(0, 4))), ...releaseNamesOn(plan.cik, day)],
    namesBefore: (day) => releaseNamesBefore(plan.cik, day),
  });
  if (failed) return { events, ...failed };
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
}
