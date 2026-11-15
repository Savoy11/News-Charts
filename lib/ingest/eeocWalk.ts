import type { PoolClient } from "pg";
import { EEOC_PAGE_SIZE, eeocEvents, eeocNamesParty, eeocUnitNamesAsked, fetchEeocPage, fetchEeocRelease, type EeocAnswer, type EeocRelease } from "../eeoc";
import { companyNames } from "../frCompany";
import { isNotesRecord, releaseNamesAsked, releaseNamesBefore, releaseNamesOn } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The EEOC's newsroom listing, read for every company at once (batch 152), in the CFTC's walk's shape
 * (`cftcWalk.ts`): the whole listing once a year, else its newest page once a day, with further pages
 * only while each holds no release already kept. At most `PAGES_PER_RUN` pages a process, `GAP_MS`
 * apart; the whole listing is begun only while `LIST_PAGES` are left. A read is stored only when every
 * page it asked answered. Measured 2026-11-15: 318 pages, 7,625 releases.
 *
 * A release the listing gives no day, and whose excerpt's date line gives none either, has its own page
 * read once when a company's rule keeps it, at most `RELEASE_PAGES_PER_RUN` a process (the owner's call
 * (a) of 2026-11-15).
 */
export const PAGES_PER_RUN = 420;
export const GAP_MS = 1_300;
export const LIST_PAGES = 400;
export const LIST_EVERY_DAYS = 365;
export const RELEASE_PAGES_PER_RUN = 60;

export const eeocBudget = { left: PAGES_PER_RUN };
export const eeocReleaseBudget = { left: RELEASE_PAGES_PER_RUN };

export interface EeocWalk {
  due: "list" | "newest" | null;
  pages: number;
  releases: number;
  stopped?: string;
  failure?: { outcome: "throttled" | "error"; httpStatus?: number; detail?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function walkEeoc(
  client: PoolClient,
  { budget = eeocBudget, gapMs = GAP_MS, fetchPage = fetchEeocPage }: { budget?: { left: number }; gapMs?: number; fetchPage?: (page: number) => Promise<EeocAnswer> } = {},
): Promise<EeocWalk> {
  const { rows } = await client.query<{ kind: "list" | "newest"; old: boolean; stale: boolean }>(
    `SELECT kind, read_at < now() - make_interval(days => ${LIST_EVERY_DAYS}) AS old, read_at < now() - interval '1 day' AS stale FROM eeoc_reads`,
  );
  const list = rows.find((r) => r.kind === "list");
  const newest = rows.find((r) => r.kind === "newest");
  const due = !list || list.old ? "list" : list.stale && (!newest || newest.stale) ? "newest" : null;
  const walk: EeocWalk = { due, pages: 0, releases: 0 };
  if (!due) return walk;
  const ask = async (page: number): Promise<EeocAnswer> => {
    budget.left--;
    if (gapMs && walk.pages) await sleep(gapMs);
    walk.pages++;
    try {
      return await fetchPage(page);
    } catch (err) {
      return { releases: [], total: null, outcome: "error", detail: String(err).slice(0, 200) };
    }
  };
  const failed = (got: EeocAnswer, where: string): EeocWalk => ({
    ...walk,
    stopped: got.outcome,
    failure: { outcome: got.outcome as "throttled" | "error", httpStatus: got.httpStatus, detail: `${where}${got.detail ? `: ${got.detail}` : ""}` },
  });

  const read: EeocRelease[] = [];
  if (due === "list") {
    if (budget.left < LIST_PAGES) return { ...walk, stopped: "this run's pages are spent" };
    const first = await ask(0);
    if (first.outcome !== "ok") return failed(first, "page 0");
    const last = Math.ceil((first.total ?? 0) / EEOC_PAGE_SIZE) - 1;
    if (last + 1 > LIST_PAGES) return { ...walk, stopped: "error", failure: { outcome: "error", httpStatus: first.httpStatus, detail: `the listing has more than ${LIST_PAGES} pages` } };
    read.push(...first.releases);
    for (let p = 1; p <= last; p++) {
      const got = await ask(p);
      if (got.outcome !== "ok") return failed(got, `page ${p}`);
      read.push(...got.releases);
    }
    walk.releases = await store(client, "list", walk.pages, read);
    return walk;
  }
  const known = new Set((await client.query<{ path: string }>("SELECT path FROM eeoc_releases")).rows.map((r) => r.path));
  for (let p = 0; ; p++) {
    if (budget.left <= 0) return { ...walk, stopped: "this run's pages are spent" };
    const got = await ask(p);
    if (got.outcome !== "ok") return failed(got, `page ${p}`);
    read.push(...got.releases);
    if (got.releases.length < EEOC_PAGE_SIZE || got.releases.some((r) => known.has(r.path))) break;
    if (p + 1 >= LIST_PAGES) return { ...walk, stopped: "error", failure: { outcome: "error", httpStatus: got.httpStatus, detail: `no kept release in ${LIST_PAGES} pages` } };
  }
  walk.releases = await store(client, "newest", walk.pages, read);
  return walk;
}

async function store(client: PoolClient, kind: "list" | "newest", pages: number, read: EeocRelease[]): Promise<number> {
  const releases = [...new Map(read.map((r) => [r.path, r])).values()];
  await client.query("BEGIN");
  try {
    // a day read from the release's own page is kept where the listing still gives none
    const { rowCount } = await client.query(
      `INSERT INTO eeoc_releases (path, title, day, summary)
       SELECT * FROM unnest($1::text[], $2::text[], $3::date[], $4::text[])
       ON CONFLICT (path) DO UPDATE SET title = EXCLUDED.title, day = coalesce(EXCLUDED.day, eeoc_releases.day), summary = EXCLUDED.summary, read_at = now()
        WHERE (eeoc_releases.title, eeoc_releases.day, eeoc_releases.summary) IS DISTINCT FROM (EXCLUDED.title, coalesce(EXCLUDED.day, eeoc_releases.day), EXCLUDED.summary)`,
      [releases.map((r) => r.path), releases.map((r) => r.title), releases.map((r) => r.day), releases.map((r) => r.summary)],
    );
    await client.query(
      `INSERT INTO eeoc_reads (kind, pages, releases) VALUES ($1, $2, $3)
       ON CONFLICT (kind) DO UPDATE SET pages = EXCLUDED.pages, releases = EXCLUDED.releases, read_at = now()`,
      [kind, pages, releases.length],
    );
    await client.query("COMMIT");
    return rowCount ?? 0;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

export async function storedEeocReleases(client: PoolClient): Promise<(EeocRelease & { pageRead: boolean })[]> {
  const { rows } = await client.query<EeocRelease & { pageRead: boolean }>(
    `SELECT path, title, day::text AS day, summary, page_read_at IS NOT NULL AS "pageRead" FROM eeoc_releases ORDER BY day NULLS FIRST, path`,
  );
  return rows;
}

/**
 * Reads the own pages of the undated releases the company's names make it the party to, once each,
 * at most what the process's budget leaves, and keeps the day each gives. Returns how many it read.
 */
export async function readUndatedDays(
  client: PoolClient,
  releases: readonly (EeocRelease & { pageRead: boolean })[],
  names: readonly string[],
  cik: number | string,
  { budget = eeocReleaseBudget, gapMs = GAP_MS, fetchRelease = fetchEeocRelease }: { budget?: { left: number }; gapMs?: number; fetchRelease?: typeof fetchEeocRelease } = {},
): Promise<{ read: number; dated: number; failure?: { outcome: "throttled" | "error"; httpStatus?: number; detail?: string } }> {
  const due = releases.filter((r) => !r.day && !r.pageRead && eeocNamesParty(r.title, names, cik));
  let read = 0;
  let dated = 0;
  for (const r of due) {
    if (budget.left <= 0) break;
    budget.left--;
    if (gapMs && read) await sleep(gapMs);
    read++;
    const got = await fetchRelease(r.path);
    if (got.outcome !== "ok") return { read, dated, failure: { outcome: got.outcome, httpStatus: got.httpStatus, detail: `${r.path}${got.detail ? `: ${got.detail}` : ""}` } };
    await client.query("UPDATE eeoc_releases SET day = coalesce($2::date, day), page_read_at = now() WHERE path = $1", [r.path, got.day]);
    if (got.day) {
      r.day = got.day;
      dated++;
    }
    r.pageRead = true;
  }
  return { read, dated };
}

/**
 * The company's releases: the walk first, then the undated ones its names keep read for their days,
 * then every kept release whose title makes it the party under its names (its former and legal names
 * among them, from `partyNamesFor`'s years) and the units it then owned, from its first price on. A
 * bank's notes record takes none, nor a fund's series.
 */
export async function eeocFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }, walked: EeocWalk): Promise<FetchResult> {
  const failure = walked.failure;
  const failed = failure ? { outcome: failure.outcome, httpStatus: failure.httpStatus, detail: failure.detail } : null;
  if (plan.fundSeries) return failed ? { events: [], ...failed } : FUND_SERIES();
  if (isNotesRecord(plan.cik)) return failed ? { events: [], ...failed } : { events: [], outcome: "empty", detail: "a bank's notes record: its releases are its group's page's" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return failed ? { events: [], ...failed } : NO_PRICES();
  const releases = await storedEeocReleases(client);
  const names = companyNames(plan.edgarName, plan.alsoKnownAs);
  const undated = await readUndatedDays(client, releases, [...names, ...releaseNamesAsked(plan.cik), ...eeocUnitNamesAsked(plan.cik)], plan.cik);
  const events = eeocEvents(releases, names, {
    cik: plan.cik,
    from: listed,
    namesOn: (day) => [...namesIn(Number(day.slice(0, 4))), ...releaseNamesOn(plan.cik, day)],
    namesBefore: (day) => releaseNamesBefore(plan.cik, day),
  });
  const pagesNote = undated.read ? `; ${undated.read} undated releases read for their days, ${undated.dated} dated` : "";
  // every kept row the rules give it: a complete answer, so a row they no longer give comes off (batch 108)
  if (failed) return { events, ...failed, complete: {} };
  if (undated.failure) return { events, outcome: undated.failure.outcome, httpStatus: undated.failure.httpStatus, detail: `a release's page: ${undated.failure.detail}`, complete: {} };
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, ...(pagesNote ? { detail: pagesNote.slice(2) } : {}), complete: {} };
}
