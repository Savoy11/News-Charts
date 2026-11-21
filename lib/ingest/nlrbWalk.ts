import type { PoolClient } from "pg";
import { NLRB_PAGE_SIZE, fetchNlrbPage, inNightWindow, nlrbEvents, type NlrbAnswer, type NlrbDecision } from "../nlrbDecisions";
import { isNotesRecord, releaseNamesOn } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The NLRB's decision listing, read for every company at once (batch 161), in the EEOC's walk's shape
 * (`eeocWalk.ts`): the whole listing once a year, else its newest page once a day, with further pages only
 * while each holds no decision already kept. The whole read is begun only in the NLRB's night window for
 * bulk reads, 11 pm to 6 am Eastern with room to finish (`inNightWindow`); outside it, a run whose whole
 * read is due reads the newest page instead, or nothing before the first whole read. One page at a time,
 * `GAP_MS` apart, well inside the NLRB's limit of 5 at once and 20 per 200 ms. A read is stored only when
 * every page it asked answered. Measured 2026-11-18: 667 pages, 66,645 decisions.
 */
export const PAGES_PER_RUN = 720;
export const GAP_MS = 1_300;
export const LIST_PAGES = 700;
export const LIST_EVERY_DAYS = 365;

export const nlrbBudget = { left: PAGES_PER_RUN };

export interface NlrbWalk {
  due: "list" | "newest" | null;
  pages: number;
  decisions: number;
  /** whether the whole listing has been read and kept, so a company's answer is complete */
  whole: boolean;
  stopped?: string;
  failure?: { outcome: "throttled" | "error"; httpStatus?: number; detail?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function walkNlrb(
  client: PoolClient,
  { budget = nlrbBudget, gapMs = GAP_MS, fetchPage = fetchNlrbPage, now = new Date() }: { budget?: { left: number }; gapMs?: number; fetchPage?: (page: number) => Promise<NlrbAnswer>; now?: Date } = {},
): Promise<NlrbWalk> {
  const { rows } = await client.query<{ kind: "list" | "newest"; old: boolean; stale: boolean }>(
    `SELECT kind, read_at < now() - make_interval(days => ${LIST_EVERY_DAYS}) AS old, read_at < now() - interval '1 day' AS stale FROM nlrb_reads`,
  );
  const list = rows.find((r) => r.kind === "list");
  const newest = rows.find((r) => r.kind === "newest");
  const night = inNightWindow(now);
  const listDue = !list || list.old;
  const newestDue = (!list || list.stale) && (!newest || newest.stale);
  // the whole read only at night, by the NLRB's policy; by day a run whose whole read is due reads the newest page
  const due = listDue && night ? "list" : list && newestDue ? "newest" : null;
  const walk: NlrbWalk = { due, pages: 0, decisions: 0, whole: !!list };
  if (!due) return listDue && !list ? { ...walk, stopped: "the whole listing waits for the NLRB's night window, 11 pm to 6 am Eastern" } : walk;
  const ask = async (page: number): Promise<NlrbAnswer> => {
    budget.left--;
    if (gapMs && walk.pages) await sleep(gapMs);
    walk.pages++;
    try {
      return await fetchPage(page);
    } catch (err) {
      return { decisions: [], lastPage: null, outcome: "error", detail: String(err).slice(0, 200) };
    }
  };
  const failed = (got: NlrbAnswer, where: string): NlrbWalk => ({
    ...walk,
    stopped: got.outcome,
    failure: { outcome: got.outcome as "throttled" | "error", httpStatus: got.httpStatus, detail: `${where}${got.detail ? `: ${got.detail}` : ""}` },
  });

  const read: NlrbDecision[] = [];
  if (due === "list") {
    if (budget.left < LIST_PAGES) return { ...walk, stopped: "this run's pages are spent" };
    const first = await ask(0);
    if (first.outcome !== "ok") return failed(first, "page 0");
    const last = first.lastPage ?? 0;
    if (last + 1 > LIST_PAGES) return { ...walk, stopped: "error", failure: { outcome: "error", httpStatus: first.httpStatus, detail: `the listing has more than ${LIST_PAGES} pages` } };
    read.push(...first.decisions);
    for (let p = 1; p <= last; p++) {
      const got = await ask(p);
      if (got.outcome !== "ok") return failed(got, `page ${p}`);
      // every page but the last is full: a short one is a listing cut, not the end
      if (p < last && got.decisions.length < NLRB_PAGE_SIZE) return failed({ ...got, outcome: "error", detail: `${got.decisions.length} decisions, not ${NLRB_PAGE_SIZE}` }, `page ${p}`);
      read.push(...got.decisions);
    }
    walk.decisions = await store(client, "list", walk.pages, read);
    return { ...walk, whole: true };
  }
  const known = new Set((await client.query<{ document: string }>("SELECT document FROM nlrb_decisions")).rows.map((r) => r.document));
  for (let p = 0; ; p++) {
    if (budget.left <= 0) return { ...walk, stopped: "this run's pages are spent" };
    const got = await ask(p);
    if (got.outcome !== "ok") return failed(got, `page ${p}`);
    read.push(...got.decisions);
    if (got.decisions.length < NLRB_PAGE_SIZE || got.decisions.some((d) => known.has(d.document))) break;
    if (p + 1 >= LIST_PAGES) return { ...walk, stopped: "error", failure: { outcome: "error", httpStatus: got.httpStatus, detail: `no kept decision in ${LIST_PAGES} pages` } };
  }
  walk.decisions = await store(client, "newest", walk.pages, read);
  return walk;
}

async function store(client: PoolClient, kind: "list" | "newest", pages: number, read: NlrbDecision[]): Promise<number> {
  const decisions = [...new Map(read.map((d) => [d.document, d])).values()];
  await client.query("BEGIN");
  try {
    const { rowCount } = await client.query(
      `INSERT INTO nlrb_decisions (document, day, citation, case_name, case_number)
       SELECT * FROM unnest($1::text[], $2::date[], $3::text[], $4::text[], $5::text[])
       ON CONFLICT (document) DO UPDATE SET day = EXCLUDED.day, citation = EXCLUDED.citation, case_name = EXCLUDED.case_name, case_number = EXCLUDED.case_number, read_at = now()
        WHERE (nlrb_decisions.day, nlrb_decisions.citation, nlrb_decisions.case_name, nlrb_decisions.case_number) IS DISTINCT FROM (EXCLUDED.day, EXCLUDED.citation, EXCLUDED.case_name, EXCLUDED.case_number)`,
      [decisions.map((d) => d.document), decisions.map((d) => d.day), decisions.map((d) => d.citation), decisions.map((d) => d.name), decisions.map((d) => d.caseNumber)],
    );
    await client.query(
      `INSERT INTO nlrb_reads (kind, pages, decisions) VALUES ($1, $2, $3)
       ON CONFLICT (kind) DO UPDATE SET pages = EXCLUDED.pages, decisions = EXCLUDED.decisions, read_at = now()`,
      [kind, pages, decisions.length],
    );
    await client.query("COMMIT");
    return rowCount ?? 0;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

export async function storedNlrbDecisions(client: PoolClient): Promise<NlrbDecision[]> {
  const { rows } = await client.query<NlrbDecision>(
    `SELECT document, day::text AS day, citation, case_name AS name, case_number AS "caseNumber" FROM nlrb_decisions ORDER BY day, document`,
  );
  return rows;
}

/**
 * The company's decisions: the walk first, then every kept decision in its own cases under its names (its
 * former and legal names among them, from `partyNamesFor`'s years) and the units it then owned, from its
 * first price on. The answer is complete only once the whole listing has been read and kept, so a row the
 * rules no longer give comes off (`FetchResult.complete`, batch 108); before the first whole read it is the
 * newest pages' alone. A bank's notes record takes none, nor a fund's series.
 */
export async function nlrbFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }, walked: NlrbWalk): Promise<FetchResult> {
  const failure = walked.failure;
  const failed = failure ? { outcome: failure.outcome, httpStatus: failure.httpStatus, detail: failure.detail } : null;
  if (plan.fundSeries) return failed ? { events: [], ...failed } : FUND_SERIES();
  if (isNotesRecord(plan.cik)) return failed ? { events: [], ...failed } : { events: [], outcome: "empty", detail: "a bank's notes record: its decisions are its group's page's" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return failed ? { events: [], ...failed } : NO_PRICES();
  const events = nlrbEvents(await storedNlrbDecisions(client), namesIn, { cik: plan.cik, from: listed, namesOn: (day) => releaseNamesOn(plan.cik, day) });
  const complete = walked.whole ? { complete: {} } : {};
  if (failed) return { events, ...failed, ...complete };
  if (!walked.whole) return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, detail: walked.stopped ?? "the whole listing is not yet read" };
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, ...complete };
}
