import type { PoolClient } from "pg";
import { dojEvents } from "../doj";
import { archiveMonths, asDojRelease, fetchArchiveMonth, type ArchiveRelease, type MonthAnswer } from "../dojArchive";
import { isNotesRecord, releaseNamesBefore, releaseNamesOn } from "../releaseNames";
import type { FetchResult, TimelineEvent } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import type { PressPlan } from "./secPressWalk";

/**
 * The Justice Department's archive of 2001–2008, read once for every company (batch 94), in the
 * shape of the SEC's and the Bureau's walks (`secCasesWalk.ts`, `cfpbWalk.ts`).
 *
 * The archive is closed, so a month is read once and never again: a month kept in
 * `doj_archive_months` is not asked twice. At most `MONTHS_PER_RUN` months a process, `GAP_MS`
 * apart, oldest first; the first refusal or failure stops the walk, and a month is stored only
 * when its page answered with releases it could read. Measured 2026-11-05: 96 pages, 2.3 MB, 5,712
 * releases read and 5 rows not (four days typed wrong, one row with no day).
 */
export const MONTHS_PER_RUN = 24;
export const GAP_MS = 1_000;

/** What a process may still ask, shared by every company it ingests. */
export const dojArchiveBudget = { left: MONTHS_PER_RUN };

export interface ArchiveWalk {
  /** months asked this run, and kept */
  asked: number;
  kept: number;
  /** months the archive holds that are not kept yet, after this run */
  left: number;
  releases: number;
  stopped?: string;
  failure?: { outcome: "throttled" | "error"; httpStatus?: number; detail?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reads the months not kept yet, oldest first. `fetchMonth` and `gapMs` are replaceable so the check can run it offline. */
export async function walkDojArchive(
  client: PoolClient,
  {
    budget = dojArchiveBudget,
    gapMs = GAP_MS,
    fetchMonth = fetchArchiveMonth,
  }: { budget?: { left: number }; gapMs?: number; fetchMonth?: (year: number, month: number) => Promise<MonthAnswer> } = {},
): Promise<ArchiveWalk> {
  const { rows } = await client.query<{ month: string }>("SELECT to_char(month, 'YYYY-MM') AS month FROM doj_archive_months");
  const kept = new Set(rows.map((r) => r.month));
  const due = archiveMonths().filter((m) => !kept.has(m.key));
  const walk: ArchiveWalk = { asked: 0, kept: 0, left: due.length, releases: 0 };
  for (const { year, month } of due) {
    if (budget.left <= 0) return { ...walk, stopped: "this run's months are spent" };
    budget.left--;
    if (gapMs && walk.asked) await sleep(gapMs);
    walk.asked++;
    let got: MonthAnswer;
    try {
      got = await fetchMonth(year, month);
    } catch (err) {
      got = { releases: [], outcome: "error", detail: String(err).slice(0, 200) };
    }
    if (got.outcome !== "ok") {
      const detail = `${year}-${String(month).padStart(2, "0")}${got.detail ? `: ${got.detail}` : ""}`;
      return { ...walk, stopped: got.outcome, failure: { outcome: got.outcome, httpStatus: got.httpStatus, detail } };
    }
    walk.releases += await store(client, year, month, got.releases, got.unread?.length ?? 0);
    walk.kept++;
    walk.left--;
  }
  return walk;
}

/** Stores a month's releases and that it was read; returns how many were new. */
async function store(client: PoolClient, year: number, month: number, read: ArchiveRelease[], unread: number): Promise<number> {
  const releases = [...new Map(read.map((r) => [r.path, r])).values()];
  await client.query("BEGIN");
  try {
    const { rowCount } = await client.query(
      `INSERT INTO doj_archive_releases (path, filed_on, number, title, teaser)
       SELECT * FROM unnest($1::text[], $2::date[], $3::text[], $4::text[], $5::text[])
       ON CONFLICT (path) DO NOTHING`,
      [releases.map((r) => r.path), releases.map((r) => r.day), releases.map((r) => r.number), releases.map((r) => r.title), releases.map((r) => r.teaser)],
    );
    await client.query(
      `INSERT INTO doj_archive_months (month, releases, unread) VALUES ($1::date, $2, $3)
       ON CONFLICT (month) DO NOTHING`,
      [`${year}-${String(month).padStart(2, "0")}-01`, releases.length, unread],
    );
    await client.query("COMMIT");
    return rowCount ?? 0;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

/** Every release kept, oldest first. */
export async function storedArchiveReleases(client: PoolClient): Promise<ArchiveRelease[]> {
  const { rows } = await client.query<{ path: string; day: string; number: string | null; title: string; teaser: string | null }>(
    "SELECT path, filed_on::text AS day, number, title, teaser FROM doj_archive_releases ORDER BY filed_on, path",
  );
  return rows.map((r) => ({ day: r.day, path: r.path, number: r.number, title: r.title, teaser: r.teaser }));
}

/**
 * The company's releases from the archive: every kept release whose title names it as a party
 * under the names it had that year, its legal names among them (`partyNamesFor`), and the units it
 * then owned, from its first price on, the units marked to count before it aside — as the API's
 * releases are kept (`fetchJusticeReleases`). `null` when the company has no price yet.
 */
export async function dojArchiveFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }): Promise<TimelineEvent[] | null> {
  if (plan.fundSeries || isNotesRecord(plan.cik)) return [];
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return null;
  return dojEvents(
    (await storedArchiveReleases(client)).map(asDojRelease),
    [],
    (day) => [...namesIn(Number(day.slice(0, 4))), ...releaseNamesOn(plan.cik, day)],
    listed,
    (day) => releaseNamesBefore(plan.cik, day),
  );
}

/**
 * The API's answer with the archive's releases beside it, under the one source, `doj_press`. The
 * two never hold the same release: the API's begin in 2009, where the archive's end. The API's
 * own failure is the run's, else the walk's, so either is asked again; the releases each part
 * found are kept either way.
 */
export function withArchive(api: FetchResult, archive: readonly TimelineEvent[], walked: ArchiveWalk | null): FetchResult {
  const events = [...api.events, ...archive];
  if (api.outcome !== "ok" && api.outcome !== "empty") return { ...api, events };
  if (walked?.failure) return { events, outcome: walked.failure.outcome, httpStatus: walked.failure.httpStatus, detail: `the 2001–2008 archive, ${walked.failure.detail ?? walked.stopped}` };
  return { ...api, events, outcome: events.length ? "ok" : "empty" };
}
