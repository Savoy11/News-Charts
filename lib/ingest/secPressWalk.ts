import { monthsToReread } from "../listingGaps";
import type { PoolClient } from "pg";
import { companyNames } from "../frCompany";
import { isNotesRecord, releaseNamesOn } from "../releaseNames";
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
 * Measured 2026-10-29: 1997–2026 is 293 pages and 6,898 releases by the listing's count, the most
 * in one year 14 pages (2020's 344 releases), so the past is read in three processes. The pages
 * showed 6,894 distinct; their months gave 3 more, and one of 2024 stays unshown (batch 85).
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
  /** releases a year's own count holds that neither its pages nor its months showed */
  short?: number;
  /** why it stopped short, if it did */
  stopped?: string;
  /** the refusal or failure that stopped it, for the ingest's fetch log */
  failure?: { outcome: "throttled" | "error"; httpStatus?: number; detail?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reads the years not yet read, and the current year when its last read is a day old. A past year
 * whose pages showed fewer distinct releases than the listing's own count is filled from the
 * months its repeated rows fall in (`monthsToReread`, batch 85), and a year read before batch 85,
 * which kept no count, is asked its first page once to compare. `fetchPage` and `gapMs` are
 * replaceable so the check can run it offline.
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
    fetchPage?: (year: number, page: number, month?: number) => Promise<ListingPage>;
  } = {}
): Promise<PressWalk> {
  const current = Number(today.slice(0, 4));
  const { rows } = await client.query<{ year: number; complete: boolean; stale: boolean; listed: number | null; releases: number }>(
    "SELECT year, complete, read_at < now() - interval '1 day' AS stale, listed, releases FROM sec_press_years"
  );
  const held = new Map(rows.map((r) => [Number(r.year), r]));
  const due: number[] = [];
  const now = held.get(current);
  if (!now || now.stale) due.push(current);
  for (let y = current - 1; y >= SEC_PRESS_FROM; y--) {
    const h = held.get(y);
    if (!h?.complete || h.listed === null) due.push(y);
  }

  const walk: PressWalk = { due: due.length, read: 0, pages: 0, releases: 0 };
  const ask = async (year: number, page: number, month?: number): Promise<ListingPage> => {
    budget.left--;
    if (gapMs) await sleep(gapMs);
    walk.pages++;
    try {
      return await fetchPage(year, page, month);
    } catch (err) {
      return { releases: [], outcome: "error", detail: String(err).slice(0, 200) };
    }
  };
  const failed = (got: ListingPage, where: string): PressWalk => {
    const detail = `${where}${got.detail ? `: ${got.detail}` : ""}`;
    return { ...walk, stopped: got.outcome, failure: { outcome: got.outcome as "throttled" | "error", httpStatus: got.httpStatus, detail } };
  };
  for (const year of due) {
    if (budget.left < YEAR_PAGES) return { ...walk, stopped: "this run's pages are spent" };
    const h = held.get(year);
    // a current year read in full once is read again only down to the releases already kept
    const known = year === current && now ? await keptNumbers(client, year) : null;
    // a past year read in full before batch 85 kept no count: its first page says whether the
    // releases kept are all the listing holds
    const recount = year < current && h?.complete === true && h.listed === null;
    const releases: SecRelease[] = [];
    let listed: number | undefined;
    let page = 0;
    for (;;) {
      const got = await ask(year, page);
      if (got.outcome !== "ok") return failed(got, `${year} page ${page + 1}`);
      if (page === 0) listed = got.total;
      releases.push(...got.releases);
      page++;
      if (recount && listed !== undefined && h!.releases >= listed) break;
      if (got.releases.length < SEC_PRESS_PAGE_SIZE) break;
      if (known && got.releases.some((r) => known.has(releaseKey(r)))) break;
      // more pages than any year has held: the listing has changed, and a year cut short must
      // not be marked read
      if (page >= YEAR_PAGES) {
        const detail = `${year} has more than ${YEAR_PAGES} pages`;
        return { ...walk, stopped: "error", failure: { outcome: "error", httpStatus: got.httpStatus, detail } };
      }
    }
    if (recount && listed !== undefined && h!.releases >= listed) {
      await client.query("UPDATE sec_press_years SET listed = $2 WHERE year = $1", [year, listed]);
      walk.read++;
      continue;
    }
    // releases shown twice where a page ends hide others of their day: read those months alone
    if (!known && listed !== undefined && new Set(releases.map(releaseKey)).size < listed) {
      for (const month of monthsToReread(releases.map((r) => ({ key: releaseKey(r), day: r.day })))) {
        for (let p = 0; ; p++) {
          if (budget.left <= 0) return { ...walk, stopped: "this run's pages are spent" };
          const got = await ask(year, p, month);
          if (got.outcome !== "ok") return failed(got, `${year}-${String(month).padStart(2, "0")} page ${p + 1}`);
          releases.push(...got.releases);
          page++;
          if (got.releases.length < SEC_PRESS_PAGE_SIZE) break;
          if (p + 1 >= YEAR_PAGES) return { ...walk, stopped: "error", failure: { outcome: "error", detail: `${year}-${month} has more than ${YEAR_PAGES} pages` } };
        }
      }
      const still = listed - new Set(releases.map(releaseKey)).size;
      if (still > 0) walk.short = (walk.short ?? 0) + still;
    }
    walk.releases += await storeYear(client, year, year < current, page, releases, listed);
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
async function storeYear(client: PoolClient, year: number, complete: boolean, pages: number, read: SecRelease[], listed?: number): Promise<number> {
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
      `INSERT INTO sec_press_years (year, complete, pages, releases, listed) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (year) DO UPDATE
          SET complete = EXCLUDED.complete, pages = EXCLUDED.pages, releases = EXCLUDED.releases, listed = EXCLUDED.listed, read_at = now()`,
      [year, complete, pages, releases.length, listed ?? releases.length]
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
  /** its CIK, for the units the release rules give it and the notes records they give none (lib/releaseNames.ts) */
  cik?: number | string;
  /** a fund's series (`fundSeriesId`), which no release rule reads as a party (`FUND_SERIES`) */
  fundSeries?: boolean;
}

/**
 * A fund's series takes no release a rule finds by name (batch 85, the 2026-11-01 audit's finding
 * 1). A fund's page knows only its series name, "GROWTH FUND" for American Century's TWCGX, and a
 * series is not a firm the SEC, the Board or the Justice Department charges or approves: a caption
 * naming "Growth Fund, Ltd." (LR-18525, 2003, a Ponzi scheme's fund) is some other firm's. Read
 * against all 19,558 series in the index, the case captions gave 10 events on 9 fund pages, every
 * one another firm's; the press releases and the Board's releases gave none.
 */
export const FUND_SERIES = (): FetchResult => ({ events: [], outcome: "empty", detail: "a fund's series: the release rules name firms, not a series" });

/**
 * A step that begins at the first price, run before the company has one (Yahoo in back-off, or its
 * read failed): a failure, not "empty", which counts as asked for a day, so the next run asks
 * again (batch 85, the 2026-11-01 audit's finding 5).
 */
export const NO_PRICES = (): FetchResult => ({ events: [], outcome: "error", detail: "no prices to start from: asked again on the next run" });

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
  if (plan.fundSeries) return failure ? { events: [], outcome: failure.outcome, httpStatus: failure.httpStatus, detail: failure.detail } : FUND_SERIES();
  if (plan.cik !== undefined && isNotesRecord(plan.cik)) {
    const detail = "a bank's notes record: its releases are its group's page's";
    return failure ? { events: [], outcome: failure.outcome, httpStatus: failure.httpStatus, detail: failure.detail } : { events: [], outcome: "empty", detail };
  }
  if (!listed) {
    return failure
      ? { events: [], outcome: failure.outcome, httpStatus: failure.httpStatus, detail: failure.detail }
      : NO_PRICES();
  }
  const former = await storedFormerNames(client, subjectId);
  const own = plan.possessive ? [plan.possessive] : [];
  const events = secPressEvents(
    await storedSecReleases(client),
    (year) => [...companyNames(plan.edgarName, namesForYear(year, plan.alsoKnownAs, former)), ...own],
    listed,
    plan.cik === undefined ? undefined : (day) => releaseNamesOn(plan.cik!, day),
  );
  if (failure) return { events, outcome: failure.outcome, httpStatus: failure.httpStatus, detail: failure.detail };
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
}
