import type { PoolClient } from "pg";
import {
  DIGEST_FROM,
  DIGEST_TO,
  DigestBook,
  digestEntries,
  digestEvents,
  digestPdfText,
  entryKeys,
  fetchDigestArchive,
  fetchDigestIssue,
  havePdfText,
  type DigestEntry,
  type DigestFetch,
  type DigestIssue,
  type DigestKind,
  type DigestPageRow,
} from "../secDigest";
import { isNotesRecord } from "../releaseNames";
import type { FetchResult } from "../types";
import { FUND_SERIES, NO_PRICES, firstPriceDay, type PressPlan } from "./secPressWalk";

/**
 * The SEC News Digest's archive, read for every company at once (batch 102, step 2 of the 2026-11-02
 * proposal 1, approved by the owner on 2026-11-06): each year's page of 1956–1993 once for its list
 * of issues, newest year first, then each issue's PDF once for its entries (db/040), newest issue
 * first. The archive is closed, so nothing is read twice. At most `ISSUES_PER_RUN` requests a
 * process, `GAP_MS` apart: the ~9,500 issues (~5.4 GB, the PDFs not kept) take a week or so of
 * hourly runs. An issue is stored when its PDF answered and its text was read, or as missing when
 * www.sec.gov answers 404 for it. A refusal, or a page that is no PDF, stops the run; a PDF whose
 * text cannot be read is passed over until the next run; a host without `pdftotext` asks nothing.
 */
export const ISSUES_PER_RUN = 60;
export const GAP_MS = 1_000;

export const digestBudget = { left: ISSUES_PER_RUN };

export interface DigestWalk {
  years: number;
  issues: number;
  entries: number;
  /** issues the archive lists that www.sec.gov answers 404 for, kept as missing */
  missing?: number;
  /** issues listed and not yet read, after this run */
  left?: number;
  stopped?: string;
  failure?: { outcome: "throttled" | "error"; httpStatus?: number; detail?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const refused = (status?: number) => status === 403 || status === 429 || status === 503;

export async function walkDigest(
  client: PoolClient,
  {
    budget = digestBudget,
    gapMs = GAP_MS,
    fetchArchive = fetchDigestArchive,
    fetchIssue = fetchDigestIssue,
    pdfText = digestPdfText,
    pdfReady = havePdfText,
    from = DIGEST_FROM,
    to = DIGEST_TO,
  }: {
    budget?: { left: number };
    gapMs?: number;
    fetchArchive?: (year: number) => Promise<DigestFetch<{ issues: DigestIssue[] }>>;
    fetchIssue?: (url: string) => Promise<DigestFetch<{ pdf: Buffer }>>;
    pdfText?: (pdf: Buffer) => Promise<string>;
    pdfReady?: () => Promise<boolean>;
    from?: number;
    to?: number;
  } = {},
): Promise<DigestWalk> {
  const walk: DigestWalk = { years: 0, issues: 0, entries: 0 };
  if (budget.left <= 0) return walk;
  if (!(await pdfReady())) {
    return { ...walk, stopped: "error", failure: { outcome: "error", detail: "pdftotext is not installed (poppler-utils), so no issue can be read" } };
  }
  let asked = 0;
  const pace = async () => {
    budget.left--;
    if (gapMs && asked++) await sleep(gapMs);
  };
  const fail = (got: { httpStatus?: number; detail?: string }, where: string): DigestWalk => {
    // a refusal ends the process's asking: the next company's ingest would only be refused again
    if (refused(got.httpStatus)) budget.left = 0;
    return {
      ...walk,
      stopped: refused(got.httpStatus) ? "throttled" : "error",
      failure: { outcome: refused(got.httpStatus) ? "throttled" : "error", httpStatus: got.httpStatus, detail: `${where}${got.detail ? `: ${got.detail}` : ""}` },
    };
  };

  const { rows: yearRows } = await client.query<{ year: number; issues: DigestIssue[] }>("SELECT year, issues FROM sec_digest_years");
  const listed = new Map(yearRows.map((r) => [r.year, r.issues]));
  for (let year = to; year >= from; year--) {
    if (listed.has(year)) continue;
    if (budget.left <= 0) return { ...walk, stopped: "this run's requests are spent" };
    await pace();
    const got = await fetchArchive(year);
    if (!got.ok) return fail(got, `the archive page of ${year}`);
    if (!got.issues.length) return fail({ detail: "no issue on the page" }, `the archive page of ${year}`);
    await client.query("INSERT INTO sec_digest_years (year, issues) VALUES ($1, $2::jsonb) ON CONFLICT (year) DO UPDATE SET issues = EXCLUDED.issues, read_at = now()", [
      year,
      JSON.stringify(got.issues),
    ]);
    listed.set(year, got.issues);
    walk.years++;
  }

  const { rows: readRows } = await client.query<{ url: string }>("SELECT url FROM sec_digest_issues");
  const read = new Set(readRows.map((r) => r.url));
  // newest issue first: the years with the most companies already listed are filled first
  const pending = [...listed.values()]
    .flat()
    .filter((i) => !read.has(i.url))
    .sort((a, b) => b.day.localeCompare(a.day) || a.url.localeCompare(b.url));
  const skipped: { url: string; detail: string }[] = [];
  const left = () => pending.length - walk.issues - (walk.missing ?? 0);
  // an issue its text cannot be read from is passed over for this run, not fatal: one bad scan must
  // not hold back the ~9,500 behind it. It is asked again on the next run, and reported as an error
  const end = (stopped?: string): DigestWalk => {
    if (!skipped.length) return { ...walk, left: left(), ...(stopped ? { stopped } : {}) };
    const detail = `${skipped.length} issue${skipped.length > 1 ? "s" : ""} not read, the first ${skipped[0].url}: ${skipped[0].detail}`;
    return { ...walk, left: left(), stopped: stopped ?? "error", failure: { outcome: "error", detail } };
  };
  for (const issue of pending) {
    if (budget.left <= 0) return end("this run's requests are spent");
    await pace();
    const got = await fetchIssue(issue.url);
    if (!got.ok && (got.httpStatus === 404 || got.httpStatus === 410)) {
      // the archive is closed: an issue it lists that www.sec.gov does not have stays missing, and is
      // kept as such, so it is not asked again
      await store(client, issue, [], true);
      walk.missing = (walk.missing ?? 0) + 1;
      continue;
    }
    if (!got.ok) return { ...fail(got, issue.url), left: left() };
    // a page that is no PDF (a block page served with 200) stops the run, as a refusal does
    if (got.pdf.subarray(0, 5).toString("latin1") !== "%PDF-") {
      budget.left = 0;
      return { ...fail({ detail: "not a PDF" }, issue.url), left: left() };
    }
    let entries: DigestEntry[];
    try {
      entries = digestEntries(await pdfText(got.pdf));
    } catch (err) {
      const detail = String(err).slice(0, 200);
      // …but a host without the reader stops it: no issue after this one could be read either
      if (/pdftotext is not installed/.test(detail)) return { ...fail({ detail }, issue.url), left: left() };
      skipped.push({ url: issue.url, detail });
      continue;
    }
    await store(client, issue, entries);
    walk.issues++;
    walk.entries += entries.length;
  }
  return end();
}

async function store(client: PoolClient, issue: DigestIssue, entries: readonly DigestEntry[], missing = false): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query("DELETE FROM sec_digest_issues WHERE url = $1", [issue.url]);
    await client.query("INSERT INTO sec_digest_issues (url, issued_on, entries, missing) VALUES ($1, $2::date, $3, $4)", [issue.url, issue.day, entries.length, missing]);
    if (entries.length) {
      const keys = entries.map((e) => entryKeys(e.party));
      await client.query(
        `INSERT INTO sec_digest_entries (url, seq, issued_on, kind, party, is_row, line, party_key, party_folded, party_loose)
         SELECT $1, s, $2::date, k, p, r, l, pk, pf, pl
           FROM unnest($3::int[], $4::text[], $5::text[], $6::boolean[], $7::text[], $8::text[], $9::text[], $10::text[]) AS t(s, k, p, r, l, pk, pf, pl)`,
        [
          issue.url,
          issue.day,
          entries.map((_, i) => i),
          entries.map((e) => e.kind),
          entries.map((e) => e.party),
          entries.map((e) => e.row),
          entries.map((e) => e.line),
          keys.map((k) => k.key),
          keys.map((k) => k.folded),
          keys.map((k) => k.loose),
        ],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

let book: DigestBook | null = null;
/** The names book, built once a process (`DigestBook`). */
export const digestBook = (): DigestBook => (book ??= new DigestBook());

/**
 * The kept issues' entries that could be the company's: those whose party has one of its names'
 * keys, or, for a heading, holds one of their lead words — a superset, which the book decides.
 */
export async function storedDigestIssues(client: PoolClient, cik: number | string, from: string, theBook = digestBook()): Promise<{ day: string; url: string; entries: DigestEntry[] }[]> {
  const { keys, folded, leads } = theBook.lookupKeys(cik);
  if (!keys.length && !leads.length) return [];
  const { rows } = await client.query<{ url: string; day: string; kind: DigestKind; party: string; is_row: boolean; line: string }>(
    `SELECT url, issued_on::text AS day, kind, party, is_row, line FROM sec_digest_entries
      WHERE issued_on >= $1::date AND (party_key = ANY ($2::text[]) OR (is_row AND party_folded = ANY ($3::text[])) OR (NOT is_row AND party_loose LIKE ANY ($4::text[])))
      ORDER BY issued_on, url, seq`,
    [from, keys, folded, leads.map((l) => `%${l}%`)],
  );
  const issues = new Map<string, { day: string; url: string; entries: DigestEntry[] }>();
  for (const r of rows) {
    const issue = issues.get(r.url) ?? issues.set(r.url, { day: r.day, url: r.url, entries: [] }).get(r.url)!;
    issue.entries.push({ kind: r.kind, party: r.party, row: r.is_row, line: r.line });
  }
  return [...issues.values()];
}

/**
 * The company's Digest rows: the walk first, then every kept entry that is its own by the book's
 * rule — under the names its record had on the issue's day, and no other company's name that day —
 * from its first price. A company whose record EDGAR opened after its phase-in has none, nor a fund's
 * series or a bank's notes record.
 */
export async function digestFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }, walked: DigestWalk, theBook = digestBook()): Promise<FetchResult> {
  const failure = walked.failure;
  const failed = failure ? { outcome: failure.outcome, httpStatus: failure.httpStatus, detail: failure.detail } : null;
  if (plan.fundSeries) return failed ? { events: [], ...failed } : FUND_SERIES();
  if (isNotesRecord(plan.cik)) return failed ? { events: [], ...failed } : { events: [], outcome: "empty", detail: "a bank's notes record: its entries are its group's page's" };
  if (!theBook.has(plan.cik)) {
    return failed ? { events: [], ...failed } : { events: [], outcome: "empty", detail: "no EDGAR record by 1996, so no name in the Digest's years" };
  }
  const listed = await firstPriceDay(client, subjectId);
  if (!listed) return failed ? { events: [], ...failed } : NO_PRICES();
  if (listed > `${DIGEST_TO}-12-31`) return failed ? { events: [], ...failed } : { events: [], outcome: "empty", detail: `first price ${listed}, after the Digest's years` };
  const cik = Number(plan.cik);
  const rows: DigestPageRow[] = [];
  for (const issue of await storedDigestIssues(client, cik, listed, theBook)) {
    for (const r of theBook.rows(issue.day, issue.entries)) if (r.cik === cik) rows.push({ ...r, url: issue.url });
  }
  const events = digestEvents(rows, { cik, from: listed });
  if (failed) return { events, ...failed };
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
}
