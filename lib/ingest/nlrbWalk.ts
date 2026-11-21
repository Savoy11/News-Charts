import type { PoolClient } from "pg";
import { NLRB_PAGE_SIZE, fetchNlrbPage, inNightWindow, nlrbEvents, type NlrbAnswer, type NlrbDecision } from "../nlrbDecisions";
import { isNotesRecord, releaseNamesOn } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The NLRB's decision listing, read for every company at once (batch 161), in the EEOC's walk's shape
 * (`eeocWalk.ts`): the whole listing once a year, else its newest page once a day, with further pages only
 * while each holds no decision already kept. The whole read is asked only in the NLRB's night window for
 * bulk reads, 11 pm to 6 am Eastern with room in it (`inNightWindow`); by day a run whose whole read is due
 * reads the newest page instead, or nothing before the first whole read. One page at a time, `GAP_MS` apart,
 * well inside the NLRB's limit of 5 at once and 20 per 200 ms.
 *
 * The whole read goes across runs and nights (batch 162, db/055): the first night read, 2026-11-21, was
 * refused by the site's firewall at page 340 of 667 ("Request Rejected", as HTTP 200), so each page is kept
 * as it comes and the 'partial' row holds the next page to read. A run reads at most `PAGES_PER_RUN` pages;
 * a refusal ends the whole reading until the next night (`refused_at`, `REST_HOURS`); the next run resumes a
 * page before where the last stopped, as the listing, newest first, only grows at its head, so a page read
 * again overlaps and none is skipped; a read begun over `RESUME_DAYS` ago begins again. Every page but the
 * last holds 100 rows, dated or not, or the listing is cut. The 'list' row is written when the last page is
 * read, and only then is a company's answer complete.
 *
 * Once a process and polite after a failure (batch 164, the 2026-11-21 audit's finding 1): the walk is asked
 * once a process, every company after the first taking its answer, a failure included (`walkNlrbOnce`, as the
 * OCC's list is read, `cachedOccList`); any failure, a refusal or an error, rests the read that failed for
 * `REST_HOURS` (`refused_at` on its row, the newest read's too), so the runs after it ask nothing; the newest
 * read takes at most `NEWEST_PAGES`, a year's decisions and more; and a page whose rows give no decision is an
 * error, the listing's form having changed, never a page to read past.
 */
export const PAGES_PER_RUN = 300;
export const GAP_MS = 3_000;
export const LIST_PAGES = 700;
export const LIST_EVERY_DAYS = 365;
export const RESUME_DAYS = 14;
export const REST_HOURS = 12;
/** The newest read's most pages: 500 decisions, more than the Board issues in a year. */
export const NEWEST_PAGES = 5;

export const nlrbBudget = { left: PAGES_PER_RUN };

export interface NlrbWalk {
  due: "list" | "newest" | null;
  pages: number;
  decisions: number;
  /** whether the whole listing has been read and kept, so a company's answer is complete */
  whole: boolean;
  /** the whole read in progress: the next page to read */
  nextPage?: number;
  stopped?: string;
  failure?: { outcome: "throttled" | "error"; httpStatus?: number; detail?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function walkNlrb(
  client: PoolClient,
  { budget = nlrbBudget, gapMs = GAP_MS, fetchPage = fetchNlrbPage, now = new Date() }: { budget?: { left: number }; gapMs?: number; fetchPage?: (page: number) => Promise<NlrbAnswer>; now?: Date } = {},
): Promise<NlrbWalk> {
  const { rows } = await client.query<{ kind: "list" | "newest" | "partial"; next_page: number | null; old: boolean; stale: boolean; lapsed: boolean; resting: boolean }>(
    `SELECT kind, next_page, read_at < now() - make_interval(days => ${LIST_EVERY_DAYS}) AS old, read_at < now() - interval '1 day' AS stale, read_at < now() - make_interval(days => ${RESUME_DAYS}) AS lapsed, coalesce(refused_at > now() - make_interval(hours => ${REST_HOURS}), false) AS resting FROM nlrb_reads`,
  );
  const list = rows.find((r) => r.kind === "list");
  const newest = rows.find((r) => r.kind === "newest");
  const partial = rows.find((r) => r.kind === "partial");
  const night = inNightWindow(now);
  const listDue = !list || list.old;
  const newestWanted = (!list || list.stale) && (!newest || newest.stale);
  const newestDue = newestWanted && !newest?.resting;
  // the whole read only at night, by the NLRB's policy, and not again the night the firewall refused it
  const due = listDue && night && !partial?.resting ? "list" : list && newestDue ? "newest" : null;
  const walk: NlrbWalk = { due, pages: 0, decisions: 0, whole: !!list, ...(partial?.next_page != null ? { nextPage: partial.next_page } : {}) };
  if (!due) {
    if (list && newestWanted && newest?.resting) return { ...walk, stopped: "the newest page rests: the site refused or failed it within the last 12 hours" };
    if (!listDue) return walk;
    if (partial?.resting && night) return { ...walk, stopped: "the whole listing rests until the next night: the site refused or failed its last page" };
    return list ? walk : { ...walk, stopped: "the whole listing waits for the NLRB's night window, 11 pm to 6 am Eastern" };
  }
  const ask = async (page: number): Promise<NlrbAnswer> => {
    budget.left--;
    if (gapMs && walk.pages) await sleep(gapMs);
    walk.pages++;
    try {
      return await fetchPage(page);
    } catch (err) {
      return { decisions: [], rows: 0, lastPage: null, outcome: "error", detail: String(err).slice(0, 200) };
    }
  };
  const failed = (got: NlrbAnswer, where: string): NlrbWalk => ({
    ...walk,
    stopped: got.outcome,
    failure: { outcome: got.outcome as "throttled" | "error", httpStatus: got.httpStatus, detail: `${where}${got.detail ? `: ${got.detail}` : ""}` },
  });

  if (due === "list") {
    // resume a page before where the last run stopped, unless that read began too long ago
    const resume = partial && !partial.lapsed && partial.next_page != null ? Math.max(0, partial.next_page - 1) : null;
    if (resume === null) await client.query(PARTIAL_BEGIN);
    let p = resume ?? 0;
    for (; ; p++) {
      if (budget.left <= 0) return { ...walk, nextPage: p, stopped: "this run's pages are spent" };
      const got = unread(await ask(p));
      if (got.outcome !== "ok") {
        // a refusal or an error rests the whole read until the next night (the audit's finding 1)
        await client.query("UPDATE nlrb_reads SET refused_at = now() WHERE kind = 'partial'");
        return { ...failed(got, `page ${p}`), nextPage: p };
      }
      // the pager names the last page on every page but the last
      const last = got.lastPage ?? p;
      // a listing longer than any it could be, or a page short before the last, is a cut listing: rest it too
      const cut =
        last + 1 > LIST_PAGES ? `the listing has more than ${LIST_PAGES} pages` : p < last && got.rows < NLRB_PAGE_SIZE ? `${got.rows} rows, not ${NLRB_PAGE_SIZE}` : null;
      if (cut) {
        await client.query("UPDATE nlrb_reads SET refused_at = now() WHERE kind = 'partial'");
        return { ...failed({ ...got, outcome: "error", detail: cut }, `page ${p}`), nextPage: p };
      }
      walk.decisions += await keep(client, got.decisions);
      await client.query("UPDATE nlrb_reads SET next_page = $1, decisions = decisions + $2, pages = pages + 1 WHERE kind = 'partial'", [p + 1, got.decisions.length]);
      if (p >= last) break;
    }
    await finish(client, p + 1);
    return { ...walk, whole: true, nextPage: undefined };
  }
  const known = new Set((await client.query<{ document: string }>("SELECT document FROM nlrb_decisions")).rows.map((r) => r.document));
  const read: NlrbDecision[] = [];
  // a failed newest read rests 12 hours, its row made if it had none, stale so a good read is due after the rest
  const rest = () =>
    client.query(
      `INSERT INTO nlrb_reads (kind, pages, decisions, read_at, refused_at) VALUES ('newest', 0, 0, now() - interval '2 days', now())
       ON CONFLICT (kind) DO UPDATE SET refused_at = now()`,
    );
  for (let p = 0; ; p++) {
    if (budget.left <= 0) return { ...walk, stopped: "this run's pages are spent" };
    const got = unread(await ask(p));
    if (got.outcome !== "ok") {
      await rest();
      return failed(got, `page ${p}`);
    }
    read.push(...got.decisions);
    if (got.rows < NLRB_PAGE_SIZE || got.decisions.some((d) => known.has(d.document))) break;
    if (p + 1 >= NEWEST_PAGES) {
      await rest();
      return { ...walk, stopped: "error", failure: { outcome: "error", httpStatus: got.httpStatus, detail: `no kept decision in the newest ${NEWEST_PAGES} pages` } };
    }
  }
  await client.query("BEGIN");
  try {
    walk.decisions = await keep(client, read);
    await client.query(
      `INSERT INTO nlrb_reads (kind, pages, decisions) VALUES ('newest', $1, $2)
       ON CONFLICT (kind) DO UPDATE SET pages = EXCLUDED.pages, decisions = EXCLUDED.decisions, read_at = now()`,
      [walk.pages, read.length],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  return walk;
}

/** A page whose rows give no decision is an error: the listing's form changed, and the parser reads none of it. */
const unread = (got: NlrbAnswer): NlrbAnswer =>
  got.outcome === "ok" && got.rows > 0 && got.decisions.length === 0
    ? { ...got, outcome: "error", detail: `${got.rows} rows and no decision read: the listing's form may have changed` }
    : got;

let once: Promise<NlrbWalk> | null = null;

/**
 * The walk, asked once a process for every company (the audit's finding 1, as `cachedOccList`): the companies
 * after the first take its answer, its failure included, and ask nothing; the next run asks anew.
 */
export function walkNlrbOnce(client: PoolClient): Promise<NlrbWalk> {
  if (!once) {
    once = walkNlrb(client);
    once.catch(() => undefined);
    return once;
  }
  return once.then((w) => ({ ...w, due: null, pages: 0, decisions: 0 }));
}

/** For the checks: forget the process's walk. */
export const forgetNlrbWalk = () => {
  once = null;
};

/** A whole read begun afresh: its progress row, the day it began. */
const PARTIAL_BEGIN = `INSERT INTO nlrb_reads (kind, pages, decisions, next_page, refused_at) VALUES ('partial', 0, 0, 0, NULL)
  ON CONFLICT (kind) DO UPDATE SET pages = 0, decisions = 0, next_page = 0, refused_at = NULL, read_at = now()`;

/** A page's decisions, kept; the number new or changed. */
async function keep(client: PoolClient, read: NlrbDecision[]): Promise<number> {
  const decisions = [...new Map(read.map((d) => [d.document, d])).values()];
  if (!decisions.length) return 0;
  const { rowCount } = await client.query(
    `INSERT INTO nlrb_decisions (document, day, citation, case_name, case_number)
     SELECT * FROM unnest($1::text[], $2::date[], $3::text[], $4::text[], $5::text[])
     ON CONFLICT (document) DO UPDATE SET day = EXCLUDED.day, citation = EXCLUDED.citation, case_name = EXCLUDED.case_name, case_number = EXCLUDED.case_number, read_at = now()
      WHERE (nlrb_decisions.day, nlrb_decisions.citation, nlrb_decisions.case_name, nlrb_decisions.case_number) IS DISTINCT FROM (EXCLUDED.day, EXCLUDED.citation, EXCLUDED.case_name, EXCLUDED.case_number)`,
    [decisions.map((d) => d.document), decisions.map((d) => d.day), decisions.map((d) => d.citation), decisions.map((d) => d.name), decisions.map((d) => d.caseNumber)],
  );
  return rowCount ?? 0;
}

/** The whole read done: the 'list' row written, its progress row gone. */
async function finish(client: PoolClient, pages: number): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO nlrb_reads (kind, pages, decisions) SELECT 'list', $1, count(*) FROM nlrb_decisions
       ON CONFLICT (kind) DO UPDATE SET pages = EXCLUDED.pages, decisions = EXCLUDED.decisions, read_at = now()`,
      [pages],
    );
    await client.query("DELETE FROM nlrb_reads WHERE kind = 'partial'");
    await client.query("COMMIT");
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
