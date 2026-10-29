import type { PoolClient } from "pg";
import { companyNames } from "../frCompany";
import { SEC_PRESS_FROM, SEC_PRESS_PAGE_SIZE, fetchListingPage, releaseKey, secPressEvents, type ListingPage, type SecRelease } from "../secPress";
import type { FetchResult } from "../types";
import { namesForYear, storedFormerNames } from "./frBackfill";

/**
 * The SEC newsroom's press releases, read a year at a time, once for every company (batch 73).
 *
 * The listing is per year, not per company, so it is read once and kept (db/032): each year from
 * 1997 to last year is read once, every page of it, and marked complete; the current year is read
 * again when its last read is a day old, from its newest page until a page holding a release
 * already kept — on most days the first page alone. Each company's ingest then keeps the kept
 * releases whose headline makes it the party (`secReleaseNamesParty`).
 *
 * Bounded as the Federal Register year walk is (`frBackfill.ts`): at most `PAGES_PER_RUN` pages a
 * process, `GAP_MS` apart, newest year first, and a year is begun only while a whole year's pages
 * are left, so a year is never cut in half. It stops at the first refusal or failure, and a year
 * is stored only when every page it asked answered, so a refused year is read again later.
 * Measured 2026-10-29: 1997–2026 is 293 pages and 6,898 releases, the most in one year 14 pages
 * (2020's 344 releases), so the past is read in three processes.
 */
export const PAGES_PER_RUN = 120;
export const GAP_MS = 1_000;
/** more pages than any year has held (2020's 14) — a year is begun only with this many left */
export const YEAR_PAGES = 20;

/** What a process may still ask, shared by every company it ingests. */
export const pressBudget = { left: PAGES_PER_RUN };

export interface PressWalk {
  /** years not yet read, or the current year a day after its last read */
  due: number;
  /** of them, the years read in full this time */
  read: number;
  pages: number;
  /** releases stored from them, new or corrected */
  releases: number;
  /** why it stopped short, if it did */
  stopped?: string;
  /** the refusal or failure that stopped it, for the ingest's fetch log */
  failure?: { outcome: "throttled" | "error"; httpStatus?: number; detail?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reads the years not yet read, and the current year when its last read is a day old. `fetchPage`
 * and `gapMs` are replaceable so the check can run it offline.
 */
export async function walkSecPress(
  client: PoolClient,
  {
    today = new Date().toISOString().slice(0, 10),
    budget = pressBudget,
    gapMs = GAP_MS,
    fetchPage = fetchListingPage,
  }: {
    today?: string;
    budget?: { left: number };
    gapMs?: number;
    fetchPage?: (year: number, page: number) => Promise<ListingPage>;
  } = {}
): Promise<PressWalk> {
  const current = Number(today.slice(0, 4));
  const { rows } = await client.query<{ year: number; complete: boolean; stale: boolean }>(
    "SELECT year, complete, read_at < now() - interval '1 day' AS stale FROM sec_press_years"
  );
  const held = new Map(rows.map((r) => [Number(r.year), r]));
  const due: number[] = [];
  const now = held.get(current);
  if (!now || now.stale) due.push(current);
  for (let y = current - 1; y >= SEC_PRESS_FROM; y--) if (!held.get(y)?.complete) due.push(y);

  const walk: PressWalk = { due: due.length, read: 0, pages: 0, releases: 0 };
  for (const year of due) {
    if (budget.left < YEAR_PAGES) return { ...walk, stopped: "this run's pages are spent" };
    // a current year read in full once is read again only down to the releases already kept
    const known = year === current && now ? await keptNumbers(client, year) : null;
    const releases: SecRelease[] = [];
    let page = 0;
    for (;;) {
      budget.left--;
      if (gapMs) await sleep(gapMs);
      let got: ListingPage;
      try {
        got = await fetchPage(year, page);
      } catch (err) {
        got = { releases: [], outcome: "error", detail: String(err).slice(0, 200) };
      }
      walk.pages++;
      if (got.outcome !== "ok") {
        const detail = `${year} page ${page + 1}${got.detail ? `: ${got.detail}` : ""}`;
        return { ...walk, stopped: got.outcome, failure: { outcome: got.outcome, httpStatus: got.httpStatus, detail } };
      }
      releases.push(...got.releases);
      page++;
      if (got.releases.length < SEC_PRESS_PAGE_SIZE) break;
      if (known && got.releases.some((r) => known.has(releaseKey(r)))) break;
      // more pages than any year has held: the listing has changed, and a year cut short must
      // not be marked read
      if (page >= YEAR_PAGES) {
        const detail = `${year} has more than ${YEAR_PAGES} pages`;
        return { ...walk, stopped: "error", failure: { outcome: "error", httpStatus: got.httpStatus, detail } };
      }
    }
    walk.releases += await storeYear(client, year, year < current, page, releases);
    walk.read++;
  }
  return walk;
}

/** The releases already kept for a year, by `releaseKey`. */
async function keptNumbers(client: PoolClient, year: number): Promise<Set<string>> {
  const { rows } = await client.query<{ release_no: string; day: string }>(
    "SELECT release_no, released_on::text AS day FROM sec_press_releases WHERE released_on >= $1::date AND released_on < $2::date",
    [`${year}-01-01`, `${year + 1}-01-01`]
  );
  return new Set(rows.map((r) => releaseKey({ number: r.release_no, day: r.day })));
}

/** Stores a year's releases and that it was read; returns how many rows were new or changed. */
async function storeYear(client: PoolClient, year: number, complete: boolean, pages: number, read: SecRelease[]): Promise<number> {
  // one row a release: the listing has shown one twice (2006-198), and a statement may not
  // write a row twice
  const releases = [...new Map(read.map((r) => [releaseKey(r), r])).values()];
  await client.query("BEGIN");
  try {
    const { rowCount } = await client.query(
      `INSERT INTO sec_press_releases (release_no, released_on, title, url)
       SELECT * FROM unnest($1::text[], $2::date[], $3::text[], $4::text[])
       ON CONFLICT (release_no, released_on) DO UPDATE
          SET title = EXCLUDED.title, url = EXCLUDED.url, read_at = now()
        WHERE (sec_press_releases.title, sec_press_releases.url) IS DISTINCT FROM (EXCLUDED.title, EXCLUDED.url)`,
      [releases.map((r) => r.number), releases.map((r) => r.day), releases.map((r) => r.title), releases.map((r) => r.url)]
    );
    await client.query(
      `INSERT INTO sec_press_years (year, complete, pages, releases) VALUES ($1, $2, $3, $4)
       ON CONFLICT (year) DO UPDATE
          SET complete = EXCLUDED.complete, pages = EXCLUDED.pages, releases = EXCLUDED.releases, read_at = now()`,
      [year, complete, pages, releases.length]
    );
    await client.query("COMMIT");
    return rowCount ?? 0;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

/** Every release kept, oldest first. */
export async function storedSecReleases(client: PoolClient): Promise<SecRelease[]> {
  const { rows } = await client.query<{ release_no: string; day: string; title: string; url: string }>(
    "SELECT release_no, released_on::text AS day, title, url FROM sec_press_releases ORDER BY released_on, release_no"
  );
  return rows.map((r) => ({ number: r.release_no, day: r.day, title: r.title, url: r.url }));
}

export interface PressPlan {
  /** the company's EDGAR name, its other names and its possessive, as the Justice Department ask has them */
  edgarName: string;
  alsoKnownAs: string[];
  possessive?: string;
}

/**
 * The company's SEC releases: the walk first, then every kept release whose headline makes it the
 * party under the names it had that year, from its first price on — as the Federal Register walk
 * bounds a company's years, so that Dow Inc., listed 2019, does not take an older Dow's release.
 * A walk the SEC refused still matches what is kept, and reports the refusal so the run-wide
 * back-off sees it.
 */
export async function secPressFor(
  client: PoolClient,
  subjectId: number,
  plan: PressPlan,
  walked: PressWalk
): Promise<FetchResult> {
  const { rows } = await client.query<{ listed: string | null }>(
    "SELECT min(on_date)::text AS listed FROM prices WHERE subject_id = $1",
    [subjectId]
  );
  const listed = rows[0]?.listed;
  const failure = walked.failure;
  if (!listed) {
    return failure
      ? { events: [], outcome: failure.outcome, httpStatus: failure.httpStatus, detail: failure.detail }
      : { events: [], outcome: "empty", detail: "no prices to start from" };
  }
  const former = await storedFormerNames(client, subjectId);
  const own = plan.possessive ? [plan.possessive] : [];
  const events = secPressEvents(
    await storedSecReleases(client),
    (year) => [...companyNames(plan.edgarName, namesForYear(year, plan.alsoKnownAs, former)), ...own],
    listed
  );
  if (failure) return { events, outcome: failure.outcome, httpStatus: failure.httpStatus, detail: failure.detail };
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
}
