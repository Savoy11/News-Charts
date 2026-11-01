import type { PoolClient } from "pg";
import { withoutTag } from "../edgarName";
import { companyNames } from "../frCompany";
import { isNotesRecord, releaseNamesOn } from "../releaseNames";
import { CASE_LISTINGS, SEC_CASES_FROM, SEC_CASES_PAGE_SIZE, caseKey, fetchCasePage, secCaseEvents, type CaseListing, type CasePage, type SecCase } from "../secCases";
import type { FetchResult } from "../types";
import { namesForYear, storedFormerNames } from "./frBackfill";
import type { PressPlan } from "./secPressWalk";

/**
 * The SEC's litigation releases and administrative proceedings, read a year at a time, once for
 * every company (batch 83), in the shape of the press releases' walk (`secPressWalk.ts`).
 *
 * Each listing is per year, not per company, so it is read once and kept (db/033): each year from
 * 1995 to last year is read once, every page of it, and marked complete; the current year is read
 * again when its last read is a day old, from its newest page until a page holding a row already
 * kept — on most days the first page alone. Each company's ingest then keeps the kept rows whose
 * caption names it as a party (`captionParty`).
 *
 * Bounded as the press releases' walk is: at most `PAGES_PER_RUN` pages a process, `GAP_MS` apart,
 * newest year first, both listings of a year before the year before it, and a year is begun only
 * while a whole year's pages are left. It stops at the first refusal or failure, and a year is
 * stored only when every page it asked answered. Measured 2026-11-01: 1995–2026 is 344 pages (139 of
 * litigation releases, 205 of proceedings) and 30,654 rows, the most in one year 11 pages, so the
 * past is read in three processes.
 */
export const PAGES_PER_RUN = 120;
export const GAP_MS = 1_000;
/** more pages than any year of either listing has held — a year is begun only with this many left */
export const YEAR_PAGES = 20;

/** What a process may still ask, shared by every company it ingests. */
export const casesBudget = { left: PAGES_PER_RUN };

export interface CasesWalk {
  /** listing-years not yet read, or the current year a day after its last read */
  due: number;
  /** of them, the ones read in full this time */
  read: number;
  pages: number;
  /** rows stored from them, new or corrected */
  cases: number;
  stopped?: string;
  failure?: { outcome: "throttled" | "error"; httpStatus?: number; detail?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reads the listing-years not yet read, and each listing's current year when its last read is a
 * day old. `fetchPage` and `gapMs` are replaceable so the check can run it offline.
 */
export async function walkSecCases(
  client: PoolClient,
  {
    today = new Date().toISOString().slice(0, 10),
    budget = casesBudget,
    gapMs = GAP_MS,
    fetchPage = fetchCasePage,
  }: {
    today?: string;
    budget?: { left: number };
    gapMs?: number;
    fetchPage?: (listing: CaseListing, year: number, page: number) => Promise<CasePage>;
  } = {}
): Promise<CasesWalk> {
  const current = Number(today.slice(0, 4));
  const { rows } = await client.query<{ listing: CaseListing; year: number; complete: boolean; stale: boolean }>(
    "SELECT listing, year, complete, read_at < now() - interval '1 day' AS stale FROM sec_cases_years"
  );
  const held = new Map(rows.map((r) => [`${r.listing}:${Number(r.year)}`, r]));
  const due: [CaseListing, number][] = [];
  for (let y = current; y >= SEC_CASES_FROM; y--) {
    for (const listing of CASE_LISTINGS) {
      const h = held.get(`${listing}:${y}`);
      if (y === current ? !h || h.stale : !h?.complete) due.push([listing, y]);
    }
  }

  const walk: CasesWalk = { due: due.length, read: 0, pages: 0, cases: 0 };
  for (const [listing, year] of due) {
    if (budget.left < YEAR_PAGES) return { ...walk, stopped: "this run's pages are spent" };
    // a current year read in full once is read again only down to the rows already kept
    const known = year === current && held.has(`${listing}:${year}`) ? await keptKeys(client, listing, year) : null;
    const cases: SecCase[] = [];
    let page = 0;
    for (;;) {
      budget.left--;
      if (gapMs) await sleep(gapMs);
      let got: CasePage;
      try {
        got = await fetchPage(listing, year, page);
      } catch (err) {
        got = { cases: [], outcome: "error", detail: String(err).slice(0, 200) };
      }
      walk.pages++;
      if (got.outcome !== "ok") {
        const detail = `${listing} ${year} page ${page + 1}${got.detail ? `: ${got.detail}` : ""}`;
        return { ...walk, stopped: got.outcome, failure: { outcome: got.outcome, httpStatus: got.httpStatus, detail } };
      }
      cases.push(...got.cases);
      page++;
      if (got.cases.length < SEC_CASES_PAGE_SIZE) break;
      if (known && got.cases.some((c) => known.has(caseKey(c)))) break;
      // more pages than any year has held: the listing has changed, and a year cut short must
      // not be marked read
      if (page >= YEAR_PAGES) {
        const detail = `${listing} ${year} has more than ${YEAR_PAGES} pages`;
        return { ...walk, stopped: "error", failure: { outcome: "error", httpStatus: got.httpStatus, detail } };
      }
    }
    walk.cases += await storeYear(client, listing, year, year < current, page, cases);
    walk.read++;
  }
  return walk;
}

/** The rows already kept for a listing's year, by `caseKey`. */
async function keptKeys(client: PoolClient, listing: CaseListing, year: number): Promise<Set<string>> {
  const { rows } = await client.query<{ release_no: string; day: string }>(
    "SELECT release_no, released_on::text AS day FROM sec_cases WHERE listing = $1 AND released_on >= $2::date AND released_on < $3::date",
    [listing, `${year}-01-01`, `${year + 1}-01-01`]
  );
  return new Set(rows.map((r) => caseKey({ listing, number: r.release_no, day: r.day })));
}

/** Stores a listing's year and that it was read; returns how many rows were new or changed. */
async function storeYear(client: PoolClient, listing: CaseListing, year: number, complete: boolean, pages: number, read: SecCase[]): Promise<number> {
  // one row a case: a statement may not write a row twice
  const cases = [...new Map(read.map((c) => [caseKey(c), c])).values()];
  await client.query("BEGIN");
  try {
    const { rowCount } = await client.query(
      `INSERT INTO sec_cases (listing, release_no, released_on, caption, file_no, url)
       SELECT $1, * FROM unnest($2::text[], $3::date[], $4::text[], $5::text[], $6::text[])
       ON CONFLICT (listing, release_no, released_on) DO UPDATE
          SET caption = EXCLUDED.caption, file_no = EXCLUDED.file_no, url = EXCLUDED.url, read_at = now()
        WHERE (sec_cases.caption, sec_cases.file_no, sec_cases.url) IS DISTINCT FROM (EXCLUDED.caption, EXCLUDED.file_no, EXCLUDED.url)`,
      [listing, cases.map((c) => c.number), cases.map((c) => c.day), cases.map((c) => c.caption), cases.map((c) => c.fileNo ?? null), cases.map((c) => c.url)]
    );
    await client.query(
      `INSERT INTO sec_cases_years (listing, year, complete, pages, cases) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (listing, year) DO UPDATE
          SET complete = EXCLUDED.complete, pages = EXCLUDED.pages, cases = EXCLUDED.cases, read_at = now()`,
      [listing, year, complete, pages, cases.length]
    );
    await client.query("COMMIT");
    return rowCount ?? 0;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

/** Every row kept, oldest first. */
export async function storedSecCases(client: PoolClient): Promise<SecCase[]> {
  const { rows } = await client.query<{ listing: CaseListing; release_no: string; day: string; caption: string; file_no: string | null; url: string }>(
    "SELECT listing, release_no, released_on::text AS day, caption, file_no, url FROM sec_cases ORDER BY released_on, listing, release_no"
  );
  return rows.map((r) => ({ listing: r.listing, number: r.release_no, day: r.day, caption: r.caption, ...(r.file_no ? { fileNo: r.file_no } : {}), url: r.url }));
}

/**
 * The names a party rule reads a company by in a year — its everyday names then, its possessive,
 * and its legal name and the former legal names it had that year — and its first price, from
 * which a release can be its. Shared by the SEC's cases and the Federal Reserve Board's releases
 * (batch 84), which both name a party by its legal name.
 */
export async function partyNamesFor(
  client: PoolClient,
  subjectId: number,
  plan: PressPlan,
): Promise<{ listed: string | null; namesIn: (year: number) => string[] }> {
  const { rows } = await client.query<{ listed: string | null }>("SELECT min(on_date)::text AS listed FROM prices WHERE subject_id = $1", [subjectId]);
  const former = await storedFormerNames(client, subjectId);
  const own = plan.possessive ? [plan.possessive] : [];
  // a caption gives a party its full legal name, which the everyday name may have shortened:
  // "RenaissanceRe Holdings Ltd." is RenaissanceRe's, "Dana Holding Corporation" Dana's until 2016
  const legal = (year: number) => [plan.edgarName, ...former.filter((f) => f.until >= `${year}-01-01`).map((f) => f.name)].map(withoutTag);
  return {
    listed: rows[0]?.listed ?? null,
    namesIn: (year) => [...companyNames(plan.edgarName, namesForYear(year, plan.alsoKnownAs, former)), ...own, ...legal(year)],
  };
}

/**
 * The company's cases: the walk first, then every kept row whose caption names it as a party under
 * the names it had that year and the units it then owned, from its first price on, as the press
 * releases are kept (`secPressFor`). A bank's notes record takes none.
 */
export async function secCasesFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }, walked: CasesWalk): Promise<FetchResult> {
  const failure = walked.failure;
  const failed = failure ? { outcome: failure.outcome, httpStatus: failure.httpStatus, detail: failure.detail } : null;
  if (isNotesRecord(plan.cik)) return failed ? { events: [], ...failed } : { events: [], outcome: "empty", detail: "a bank's notes record: its cases are its group's page's" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return failed ? { events: [], ...failed } : { events: [], outcome: "empty", detail: "no prices to start from" };
  const events = secCaseEvents(await storedSecCases(client), namesIn, { cik: plan.cik, from: listed, namesOn: (day) => releaseNamesOn(plan.cik, day) });
  if (failed) return { events, ...failed };
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
}
