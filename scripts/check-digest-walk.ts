import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import digestRecords from "../data/digest-records.json";
import tickerIndex from "../data/edgar-tickers.json";
import { PREDECESSORS } from "../lib/predecessors";
import { NOTES_RECORDS } from "../lib/releaseNames";
import { DigestBook, digestEntries, digestEvents, digestRecordOf, entryKeys, type DigestEntry, type DigestIssue, type DigestPageRow } from "../lib/secDigest";
import { digestFor, storedDigestIssues, walkDigest } from "../lib/ingest/secDigestWalk";

/**
 * The SEC News Digest, step 2 (batch 102, the 2026-11-02 proposal 1, approved by the owner on
 * 2026-11-06): the archive walk that keeps every issue's entries, the dated names book every
 * company's entries are found by, and the company step that puts them on its page.
 *
 *   npm run check:digest-walk
 *
 * The entries are real: all 250 issues of 1985 as `digestEntries` read `pdftotext -layout`'s text
 * of the PDFs batch 87 saved (23,922 entries), with the first Yahoo trading day of every company
 * they give a row. The names are the committed ones the ingest uses: `data/edgar-tickers.json` and
 * `data/digest-records.json`. The walk runs against fake fetchers and a fake database. Offline.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      ${JSON.stringify(detail).slice(0, 600)}`}`);
}
const read = (file: string) => readFileSync(join(__dirname, "..", file), "utf8");

interface Issue {
  day: string;
  url: string;
  entries: DigestEntry[];
}
const fx = JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", "digest-1985-entries.json.gz"))).toString("utf8")) as {
  issues: Issue[];
  firstPrices: Record<string, string | null>;
};
const ticker = new Map<number, string>();
for (const [cik, t] of tickerIndex.companies as [number, string, string][]) if (!ticker.has(cik)) ticker.set(cik, t);
const cikOf = (t: string) => [...ticker].find(([, x]) => x === t)![0];
// the fixture's first prices are batch 87's, read for the companies the book held then; MRK's is
// Yahoo's of old Merck, 1962-01-02 (batch 87's cache), since batch 108 makes old Merck's record its history
const firstPrices: Record<string, string | null> = { ...fx.firstPrices, "310158": "1962-01-02" };

/**
 * The 1985 replay's counts, measured 2026-11-06; batch 108 adds old Merck's record (1,455 records,
 * 509 rows on 259, 184 8-K reports, 362 on 188 pages as 358 events before). Batch 87's undated first
 * pass gave 508 rows on 258.
 */
const EXPECTED = {
  records: 1456,
  issues: 250,
  entries: 23922,
  rows: 512,
  companies: 260,
  kinds: { "8-K report": 187, registration: 129, "registration effective": 110, order: 53, stake: 30, enforcement: 2, other: 1 } as Record<string, number>,
  onPage: 365,
  onPageCompanies: 189,
  events: 361,
};

// ─── a fake database ───────────────────────────────────────────────────────────────────────────

interface Row {
  url: string;
  seq: number;
  issued_on: string;
  kind: string;
  party: string;
  is_row: boolean;
  line: string;
  party_key: string;
  party_folded: string;
  party_loose: string;
}
interface FakeDb {
  years: Map<number, DigestIssue[]>;
  issues: Map<string, { day: string; entries: number; missing?: boolean }>;
  entries: Row[];
  listed: string | null;
  sql: string[];
}
const emptyDb = (listed: string | null = "1962-01-02"): FakeDb => ({ years: new Map(), issues: new Map(), entries: [], listed, sql: [] });
const like = (text: string, pattern: string) => text.includes(pattern.replace(/^%|%$/g, ""));

function fakeDb(db: FakeDb): PoolClient {
  let tx: { issues: Map<string, { day: string; entries: number; missing?: boolean }>; entries: Row[] } | null = null;
  return {
    query: async (sql: string, params: unknown[] = []) => {
      const s = sql.trim().replace(/\s+/g, " ");
      db.sql.push(s);
      if (s === "BEGIN") {
        tx = { issues: new Map(db.issues), entries: [...db.entries] };
        return { rows: [] };
      }
      if (s === "COMMIT") {
        tx = null;
        return { rows: [] };
      }
      if (s === "ROLLBACK") {
        if (tx) {
          db.issues = tx.issues;
          db.entries = tx.entries;
        }
        tx = null;
        return { rows: [] };
      }
      if (s === "SELECT year, issues FROM sec_digest_years") return { rows: [...db.years].map(([year, issues]) => ({ year, issues })) };
      if (s.startsWith("INSERT INTO sec_digest_years (year, issues) VALUES ($1, $2::jsonb) ON CONFLICT (year) DO UPDATE")) {
        db.years.set(params[0] as number, JSON.parse(params[1] as string));
        return { rows: [] };
      }
      if (s === "SELECT url FROM sec_digest_issues") return { rows: [...db.issues.keys()].map((url) => ({ url })) };
      if (s === "DELETE FROM sec_digest_issues WHERE url = $1") {
        db.issues.delete(params[0] as string);
        db.entries = db.entries.filter((e) => e.url !== params[0]);
        return { rows: [] };
      }
      if (s === "INSERT INTO sec_digest_issues (url, issued_on, entries, missing) VALUES ($1, $2::date, $3, $4)") {
        db.issues.set(params[0] as string, { day: params[1] as string, entries: params[2] as number, missing: params[3] as boolean });
        return { rows: [] };
      }
      if (s.startsWith("INSERT INTO sec_digest_entries (url, seq, issued_on, kind, party, is_row, line, party_key, party_folded, party_loose) SELECT $1, s, $2::date")) {
        const [url, day, seqs, kinds, parties, isRows, lines, keys, foldeds, looses] = params as [string, string, number[], string[], string[], boolean[], string[], string[], string[], string[]];
        if (!db.issues.has(url)) throw new Error("foreign key: no issue");
        seqs.forEach((seq, i) =>
          db.entries.push({ url, seq, issued_on: day, kind: kinds[i], party: parties[i], is_row: isRows[i], line: lines[i], party_key: keys[i], party_folded: foldeds[i], party_loose: looses[i] }),
        );
        return { rows: [] };
      }
      if (s.startsWith("SELECT url, issued_on::text AS day, kind, party, is_row, line FROM sec_digest_entries WHERE issued_on >= $1::date AND (party_key = ANY ($2::text[]) OR (is_row AND party_folded = ANY ($3::text[])) OR (NOT is_row AND party_loose LIKE ANY ($4::text[]))) ORDER BY issued_on, url, seq")) {
        const [from, keys, folded, patterns] = params as [string, string[], string[], string[]];
        const hit = db.entries.filter(
          (e) => e.issued_on >= from && (keys.includes(e.party_key) || (e.is_row && folded.includes(e.party_folded)) || (!e.is_row && patterns.some((p) => like(e.party_loose, p)))),
        );
        hit.sort((a, b) => a.issued_on.localeCompare(b.issued_on) || a.url.localeCompare(b.url) || a.seq - b.seq);
        return { rows: hit.map((e) => ({ url: e.url, day: e.issued_on, kind: e.kind, party: e.party, is_row: e.is_row, line: e.line })) };
      }
      if (/FROM prices/.test(s)) return { rows: [{ listed: db.listed }] };
      throw new Error(`unexpected query: ${s.slice(0, 120)}`);
    },
  } as unknown as PoolClient;
}

/** The 1985 issues, as stored: every entry with the keys the walk gives it. */
function stored(listed: string | null = "1962-01-02"): FakeDb {
  const db = emptyDb(listed);
  for (const i of fx.issues) {
    db.issues.set(i.url, { day: i.day, entries: i.entries.length });
    i.entries.forEach((e, seq) =>
      db.entries.push({ url: i.url, seq, issued_on: i.day, kind: e.kind, party: e.party, is_row: e.row, line: e.line, ...(({ key, folded, loose }) => ({ party_key: key, party_folded: folded, party_loose: loose }))(entryKeys(e.party)) }),
    );
  }
  return db;
}

async function main(): Promise<void> {
  // ─── the committed names file ──────────────────────────────────────────────────────────────────
  console.log("— data/digest-records.json: what EDGAR's 1993–1996 indexes called each record");
  const records = (digestRecords as unknown as { about: string; records: Record<string, { firstFiled: string; firstNames: string[]; names: [string, string, string][] }> }).records;
  const wanted = new Set<number>([...(tickerIndex.companies as [number, string, string][]).map(([cik]) => cik), ...Object.values(PREDECESSORS).flatMap((l) => l.map((p) => p.cik))]);
  check(`${EXPECTED.records} records, each a listed company or a mapped predecessor`, Object.keys(records).length === EXPECTED.records && Object.keys(records).every((c) => wanted.has(Number(c))), Object.keys(records).length);
  check(
    "  …each first filed in 1993–1996, with every name's days inside those years and in order",
    Object.values(records).every(
      (r) =>
        r.firstFiled >= "1993-01-01" &&
        r.firstFiled <= "1996-12-31" &&
        r.names.length > 0 &&
        r.names[0][1] === r.firstFiled &&
        r.names.every(([n, from, to]) => !!n && from <= to && to <= "1996-12-31") &&
        r.names.every((x, i) => i === 0 || r.names[i - 1][1] <= x[1]),
    ),
  );
  check("  …3M as Minnesota Mining & Manufacturing, from its first filing on 1993-08-13", records[66740]?.firstFiled === "1993-08-13" && records[66740].names[0][0] === "MINNESOTA MINING & MANUFACTURING CO", records[66740]);
  const jpm = records[19617]?.names.map(([n, from]) => `${n}@${from}`) ?? [];
  check("  …JPMorgan's record as Chemical Banking, then Chase Manhattan from 1996-04-02", jpm[0]?.startsWith("CHEMICAL BANKING CORP@") && jpm.includes("CHASE MANHATTAN CORP /DE/@1996-04-02"), jpm);
  check("  …a record EDGAR opened after 1996 is absent: today's Crane Co (1944013, 2023)", !records[1944013] && digestRecordOf(1944013) === null && digestRecordOf(25445) !== null);
  check("  …read by `npm run sync:digest-records`", /"sync:digest-records": "tsx scripts\/sync-digest-records\.ts"/.test(read("package.json")) && /sync:digest-records/.test((digestRecords as { about: string }).about));

  // ─── the names book, replayed on all of 1985 ─────────────────────────────────────────────────
  console.log("— the names book on every entry of 1985's 250 issues");
  const book = new DigestBook();
  const entries = fx.issues.reduce((n, i) => n + i.entries.length, 0);
  check(`the fixture holds ${EXPECTED.issues} issues and ${EXPECTED.entries} entries`, fx.issues.length === EXPECTED.issues && entries === EXPECTED.entries, { issues: fx.issues.length, entries });
  const rows: DigestPageRow[] = fx.issues.flatMap((i) => book.rows(i.day, i.entries).map((r) => ({ ...r, url: i.url })));
  const ciks = [...new Set(rows.map((r) => r.cik))];
  check(`${EXPECTED.rows} rows on ${EXPECTED.companies} companies`, rows.length === EXPECTED.rows && ciks.length === EXPECTED.companies, { rows: rows.length, companies: ciks.length });
  const kinds: Record<string, number> = {};
  for (const r of rows) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
  check("  …by section: 187 8-K reports, 129 registrations, 110 declared effective, 53 orders, 30 stakes, 2 actions, 1 other", JSON.stringify(Object.entries(kinds).sort()) === JSON.stringify(Object.entries(EXPECTED.kinds).sort()), kinds);
  const crane = rows.filter((r) => r.cik === 25445);
  check(
    "  …the one row batch 87 lost: Crane Co. (25445, now CXT), declared effective 1985-10-11 — today's Crane Co (1944013) is no claimant, its record opened in 2023",
    crane.length === 1 && crane[0].day === "1985-10-11" && crane[0].kind === "registration effective" && !book.has(1944013) && book.has(25445),
    crane,
  );
  // batch 108, the 2026-11-07 audit's question 1: MRK's record was Schering-Plough's until 2009
  const mrkRows = rows.filter((r) => r.cik === 310158);
  check("  …MRK is read by old Merck's names, its predecessor's, never by Schering-Plough's, its record's own of the 1990s: old Merck's three 8-K reports of 1985",
    mrkRows.length === 3 && mrkRows.every((r) => r.kind === "8-K report" && /^MERCK\b/.test(r.entries[0].party)) &&
      JSON.stringify(book.namesOn("1985-06-01", 310158)?.conformed) === JSON.stringify(["MERCK & CO INC"]) && !book.lookupKeys(310158).keys.some((k) => /SCHERING/.test(k)),
    mrkRows.map((r) => `${r.day} ${r.entries[0].party}`));
  check("  …the book holds only companies with a record by 1996, their own or a predecessor's", book.has(66740) && book.has(19617) && !book.has(cikOf("PLTR")));
  const shared: string[] = [];
  for (const i of fx.issues) book.rows(i.day, i.entries, (e, c) => shared.push(`${i.day} ${e.party} ${c.join("/")}`));
  check("  …an entry two companies' names claim on its day goes to neither", shared.length > 0 && !rows.some((r) => shared.some((s) => s.startsWith(`${r.day} ${r.entries[0].party} `) && s.includes(String(r.cik)))), shared.slice(0, 3));

  console.log("— the floor: rows from each company's first price");
  let onPage = 0;
  let events = 0;
  const onPageCos = new Set<number>();
  for (const cik of ciks) {
    const from = firstPrices[cik];
    if (!from) continue;
    const mine = rows.filter((r) => r.cik === cik);
    const kept = mine.filter((r) => r.day >= from);
    onPage += kept.length;
    if (kept.length) onPageCos.add(cik);
    events += digestEvents(mine, { cik, from }).length;
  }
  check(`${EXPECTED.onPage} rows on ${EXPECTED.onPageCompanies} pages from their first prices, as ${EXPECTED.events} events`, onPage === EXPECTED.onPage && onPageCos.size === EXPECTED.onPageCompanies && events === EXPECTED.events, { onPage, companies: onPageCos.size, events });
  const gpja = cikOf("GPJA");
  check("  …Georgia Power's 14 rows of 1985 stay off its page: its notes trade from 2018", rows.filter((r) => r.cik === gpja).length === 14 && digestEvents(rows.filter((r) => r.cik === gpja), { cik: gpja, from: firstPrices[gpja]! }).length === 0);

  // ─── the events ──────────────────────────────────────────────────────────────────────────────
  console.log("— the events a page gets");
  const axp = cikOf("AXP");
  const axpEvents = digestEvents(rows.filter((r) => r.cik === axp), { cik: axp, from: "1962-01-02" });
  const july = axpEvents.find((e) => e.dedupBasis === "digest:4962@1985-07:8-k");
  check(
    "a month's 8-K reports are one row: American Express's two of July 1985, dated the month, keyed by it",
    july?.title === "SEC News Digest: 2 8-K reports listed, July 1985" && july.date === "1985-07-01" && july.precision === "month" && july.type === "filing",
    july,
  );
  const singles = axpEvents.filter((e) => e.dedupBasis?.endsWith(":8-k") && !e.precision);
  check("  …a month's one report keeps its day, under the same month key", singles.length > 0 && singles.every((e) => e.title === "SEC News Digest: 8-K report filed" && e.dedupBasis === `digest:4962@${e.date.slice(0, 7)}:8-k`), singles.map((e) => e.date));
  const aep = cikOf("AEP");
  const order = digestEvents(rows.filter((r) => r.cik === aep), { cik: aep, from: "1962-01-02" }).find((e) => e.date === "1985-01-03");
  check(
    "an order is the SEC acting, titled by its heading as printed, keyed by issue and section",
    order?.type === "regulation" && /^SEC News Digest: AMERICAN ELECTRIC POWER COMPANY/.test(order.title) && order.dedupBasis === "digest:4904@1985-01-03:order" && order.sourceKey === "sec_digest",
    order,
  );
  const all = ciks.flatMap((cik) => digestEvents(rows.filter((r) => r.cik === cik), { cik, from: "1956-01-01" }));
  check("every event links to its issue's PDF on www.sec.gov, says it is the SEC's daily summary, and fits 600 characters", all.every((e) => /^https:\/\/www\.sec\.gov\/news\/digest\/1985\/dig\d{6}\.pdf$/.test(e.url!) && /^The SEC's daily summary/.test(e.description!) && e.description!.length <= 600 && e.source === "SEC News Digest"));
  check("  …and each key is unique", new Set(all.map((e) => e.dedupBasis)).size === all.length);
  const reg = all.find((e) => e.dedupBasis?.endsWith(":registration"));
  check("  …a registration is a filing, titled by what it is", reg?.type === "filing" && reg.title === "SEC News Digest: registration statement filed", reg);
  check("  …another company's rows never reach a page", digestEvents(rows, { cik: axp }).length === axpEvents.length);

  // ─── the walk ────────────────────────────────────────────────────────────────────────────────
  console.log("— the walk: each year's page and each issue once, a run's share at a time");
  const pdf = Buffer.from("%PDF-1.4 fake");
  const yearIssues = (year: number): DigestIssue[] => [1, 2, 3].map((d) => ({ day: `${year}-01-0${d}`, url: `https://www.sec.gov/news/digest/${year}/dig010${d}${String(year).slice(2)}.pdf` }));
  let asked: string[] = [];
  const fakes = (over: Partial<Parameters<typeof walkDigest>[1]> = {}) => ({
    gapMs: 0,
    from: 1984,
    to: 1985,
    pdfReady: async () => true,
    fetchArchive: async (year: number) => {
      asked.push(`year ${year}`);
      return { ok: true as const, issues: yearIssues(year) };
    },
    fetchIssue: async (url: string) => {
      asked.push(url.slice(-13));
      return { ok: true as const, pdf };
    },
    pdfText: async () => "",
    ...over,
  });
  let db = emptyDb();
  let walked = await walkDigest(fakeDb(db), { ...fakes({ pdfReady: async () => false }), budget: { left: 10 } });
  check("a host without pdftotext stops the walk before anything is asked", asked.length === 0 && walked.failure?.outcome === "error" && /pdftotext is not installed/.test(walked.failure.detail ?? ""), walked);

  asked = [];
  const urlsOf = (i: string[]) => i.filter((x) => !x.startsWith("year"));
  walked = await walkDigest(fakeDb(db), { ...fakes(), budget: { left: 5 } });
  check(
    "years newest first, then issues newest first, within the run's requests",
    JSON.stringify(asked) === JSON.stringify(["year 1985", "year 1984", "dig010385.pdf", "dig010285.pdf", "dig010185.pdf"]) && walked.years === 2 && walked.issues === 3 && walked.left === 3 && walked.stopped === "this run's requests are spent",
    { asked, walked },
  );
  check("  …each year's list and each issue stored once it answered", db.years.size === 2 && db.issues.size === 3 && db.issues.get("https://www.sec.gov/news/digest/1985/dig010385.pdf")?.day === "1985-01-03");
  asked = [];
  walked = await walkDigest(fakeDb(db), { ...fakes(), budget: { left: 60 } });
  check("  …a later run asks only what is left: no year twice, no issue twice", JSON.stringify(urlsOf(asked)) === JSON.stringify(["dig010384.pdf", "dig010284.pdf", "dig010184.pdf"]) && !asked.some((a) => a.startsWith("year")) && walked.left === 0 && db.issues.size === 6, asked);

  db = emptyDb();
  asked = [];
  // the text of a real issue, 1975-06-16, as `pdftotext -layout` read it (check:digest's fixture)
  const issue1975 = (JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", "digest-issues.json.gz"))).toString("utf8")) as { issues: { day: string; text: string }[] }).issues.find((i) => i.day === "1975-06-16")!.text;
  await walkDigest(fakeDb(db), { ...fakes({ pdfText: async () => issue1975 }), budget: { left: 3 } });
  const kept = db.entries.filter((e) => e.url.endsWith("dig010385.pdf"));
  const want = digestEntries(issue1975);
  const abbott = kept.find((e) => e.party === "ABBOTT LABORATORIES");
  check(
    "an issue's entries are all kept, in order, with the keys the company step asks by (Abbott's 8-K of May 1975 among them)",
    kept.length === want.length &&
      kept.every((e, i) => e.seq === i && e.party === want[i].party && e.kind === want[i].kind && e.is_row === want[i].row && e.line === want[i].line && e.party_key === entryKeys(e.party).key && e.party_folded === entryKeys(e.party).folded && e.party_loose === entryKeys(e.party).loose) &&
      abbott?.kind === "8-K report" && abbott.is_row &&
      db.issues.get("https://www.sec.gov/news/digest/1985/dig010385.pdf")?.entries === want.length,
    { kept: kept.length, want: want.length, abbott },
  );

  db = emptyDb();
  asked = [];
  let n = 0;
  walked = await walkDigest(fakeDb(db), {
    ...fakes({ fetchIssue: async (url: string) => (asked.push(url), n++ ? { ok: false as const, httpStatus: 403, detail: "HTTP 403" } : { ok: true as const, pdf }) }),
    budget: { left: 10 },
  });
  check("a refusal stops the run as throttled; the issue before it is kept, the refused one is not", walked.stopped === "throttled" && walked.failure?.outcome === "throttled" && walked.failure.httpStatus === 403 && db.issues.size === 1 && walked.left === 5, walked);
  const spent = { left: 10 };
  asked = [];
  await walkDigest(fakeDb(emptyDb()), { ...fakes({ fetchArchive: async (y: number) => (asked.push(`year ${y}`), { ok: false as const, httpStatus: 429, detail: "HTTP 429" }) }), budget: spent });
  const again = await walkDigest(fakeDb(emptyDb()), { ...fakes(), budget: spent });
  check("  …and ends the process's asking: the next company's ingest asks nothing", spent.left === 0 && asked.length === 1 && again.years === 0 && !again.failure, { spent, asked });
  db = emptyDb();
  const blocked = { left: 10 };
  walked = await walkDigest(fakeDb(db), { ...fakes({ fetchIssue: async () => ({ ok: true as const, pdf: Buffer.from("<html>Request Rate Threshold Exceeded</html>") }) }), budget: blocked });
  check("  …a page that is no PDF (a block page) is an error, nothing is kept for it, and the process asks no more", walked.failure?.outcome === "error" && /not a PDF/.test(walked.failure.detail ?? "") && db.issues.size === 0 && blocked.left === 0, walked);
  db = emptyDb();
  const bad = "https://www.sec.gov/news/digest/1985/dig010385.pdf";
  let readerAsked = 0;
  const badScan = fakes({ fetchIssue: async (url: string) => (asked.push(url), { ok: true as const, pdf: url === bad ? Buffer.from("%PDF-1.4 broken") : pdf }), pdfText: async (p: Buffer) => (readerAsked++, p.includes("broken") ? Promise.reject(new Error("Syntax Error: Couldn't read xref table")) : "") });
  asked = [];
  walked = await walkDigest(fakeDb(db), { ...badScan, budget: { left: 10 } });
  check(
    "  …a PDF its text cannot be read from is passed over, not kept, and the issues behind it are read; the run reports it as an error",
    walked.failure?.outcome === "error" && /1 issue not read, the first .*dig010385\.pdf: .*xref/.test(walked.failure.detail ?? "") && !db.issues.has(bad) && db.issues.size === 5 && walked.issues === 5 && walked.left === 1 && readerAsked === 6,
    walked,
  );
  asked = [];
  walked = await walkDigest(fakeDb(db), { ...badScan, budget: { left: 10 } });
  check("  …and is asked again on the next run, alone", JSON.stringify(urlsOf(asked)) === JSON.stringify([bad]) && walked.left === 1 && walked.failure?.outcome === "error", { asked, walked });
  db = emptyDb();
  const gone = "https://www.sec.gov/news/digest/1984/dig010284.pdf";
  const goneFakes = fakes({ fetchIssue: async (url: string) => (asked.push(url), url === gone ? { ok: false as const, httpStatus: 404, detail: "HTTP 404" } : { ok: true as const, pdf }) });
  asked = [];
  walked = await walkDigest(fakeDb(db), { ...goneFakes, budget: { left: 10 } });
  check(
    "  …an issue the archive lists and www.sec.gov answers 404 for is kept as missing, and the walk goes on",
    walked.missing === 1 && walked.issues === 5 && walked.left === 0 && !walked.failure && db.issues.get(gone)?.missing === true && db.issues.get(gone)?.entries === 0 && db.issues.get(bad)?.missing === false,
    walked,
  );
  asked = [];
  walked = await walkDigest(fakeDb(db), { ...goneFakes, budget: { left: 10 } });
  check("  …and is not asked again", asked.length === 0 && walked.left === 0, asked);
  db = emptyDb();
  walked = await walkDigest(fakeDb(db), { ...fakes({ pdfText: async () => Promise.reject(new Error("pdftotext is not installed (poppler-utils)")) }), budget: { left: 10 } });
  check("  …a reader gone mid-run stops it: no issue after could be read either", walked.stopped === "error" && /pdftotext is not installed/.test(walked.failure?.detail ?? "") && db.issues.size === 0 && walked.left === 6, walked);
  db = emptyDb();
  walked = await walkDigest(fakeDb(db), { ...fakes({ fetchArchive: async () => ({ ok: true as const, issues: [] }) }), budget: { left: 10 } });
  check("  …a year's page that lists no issue is an error, not an empty year", walked.failure?.outcome === "error" && /no issue on the page/.test(walked.failure.detail ?? "") && db.years.size === 0, walked);
  // batch 107, the 2026-11-07 audit's finding 3: one bad year page held back every other year's issues
  type YearAnswer = Awaited<ReturnType<NonNullable<NonNullable<Parameters<typeof walkDigest>[1]>["fetchArchive"]>>>;
  const badYears: [string, YearAnswer][] = [
    ["lists no issue", { ok: true, issues: [] }],
    ["fails", { ok: false, httpStatus: 500, detail: "HTTP 500" }],
  ];
  for (const [how, answer] of badYears) {
    db = emptyDb();
    asked = [];
    const oneBad = fakes({
      fetchArchive: async (year: number) => {
        asked.push(`year ${year}`);
        return year === 1985 ? answer : { ok: true as const, issues: yearIssues(year) };
      },
    });
    walked = await walkDigest(fakeDb(db), { ...oneBad, budget: { left: 10 } });
    const first = { asked: [...asked], walked };
    asked = [];
    const again = await walkDigest(fakeDb(db), { ...oneBad, budget: { left: 10 } });
    check(
      `  …a year page that ${how} is passed over: the other years' issues are read, the year is reported, and the next run asks it again`,
      first.walked.issues === yearIssues(1984).length && first.walked.issues > 0 && db.years.size === 1 && db.years.has(1984) && first.walked.failure?.outcome === "error" &&
        /archive page of 1985/.test(first.walked.failure?.detail ?? "") && JSON.stringify(asked) === JSON.stringify(["year 1985"]) && again.issues === 0,
      { first, again, asked },
    );
  }
  db = emptyDb();
  asked = [];
  const budget403 = { left: 10 };
  walked = await walkDigest(fakeDb(db), {
    ...fakes({
      fetchArchive: async (year: number) => {
        asked.push(`year ${year}`);
        return { ok: false as const, httpStatus: 403, detail: "HTTP 403" };
      },
    }),
    budget: budget403,
  });
  check("  …but a refusal of a year page still stops the run and the process's asking", walked.stopped === "throttled" && budget403.left === 0 && asked.length === 1, { walked, asked });
  db = emptyDb();
  asked = [];
  walked = await walkDigest(fakeDb(db), { ...fakes(), budget: { left: 0 } });
  check("  …a run whose requests are spent asks nothing", asked.length === 0 && walked.years === 0 && !walked.failure);
  check("  …the run's share is 60 issues, a second apart, newest first", /export const ISSUES_PER_RUN = 60;/.test(read("lib/ingest/secDigestWalk.ts")) && /export const GAP_MS = 1_000;/.test(read("lib/ingest/secDigestWalk.ts")));

  // ─── the company step ────────────────────────────────────────────────────────────────────────
  console.log("— the company step: every kept entry that is its own, by the book");
  const all1985 = stored();
  const client = fakeDb(all1985);
  const plan = (cik: number) => ({ edgarName: "", alsoKnownAs: [], cik });
  let same = 0;
  const differ: string[] = [];
  let total = 0;
  for (const cik of ciks) {
    all1985.listed = firstPrices[cik];
    const got = await digestFor(client, 1, plan(cik), { years: 0, issues: 0, entries: 0 }, book);
    const want = digestEvents(rows.filter((r) => r.cik === cik), { cik, from: firstPrices[cik]! });
    total += got.events.length;
    if (JSON.stringify(got.events) === JSON.stringify(want)) same++;
    else differ.push(`${ticker.get(cik)} ${got.events.length}/${want.length}`);
  }
  check(`the stored entries, asked by each company's keys, give the replay's events on all ${EXPECTED.companies} companies (${EXPECTED.events})`, same === ciks.length && total === EXPECTED.events, { same, differ: differ.slice(0, 5) });
  const keys = book.lookupKeys(cikOf("AXP"));
  const hits = await storedDigestIssues(client, cikOf("AXP"), "1962-01-02", book);
  const hitEntries = hits.reduce((s, i) => s + i.entries.length, 0);
  check("  …the ask is narrow: American Express's keys find a handful of entries, not the year's", keys.keys.length > 0 && hitEntries > 0 && hitEntries < 200, { keys, hitEntries });
  all1985.listed = "1962-01-02";
  const fund = await digestFor(client, 1, { ...plan(cikOf("AXP")), fundSeries: true }, { years: 0, issues: 0, entries: 0 }, book);
  check("a fund's series takes none", fund.events.length === 0 && fund.outcome === "empty" && /fund's series/.test(fund.detail ?? ""));
  const notes = Number(Object.keys(NOTES_RECORDS)[0]);
  const noted = await digestFor(client, 1, plan(notes), { years: 0, issues: 0, entries: 0 }, book);
  check("  …nor a bank's notes record", noted.events.length === 0 && noted.outcome === "empty" && /notes record/.test(noted.detail ?? ""));
  const young = await digestFor(client, 1, plan(1944013), { years: 0, issues: 0, entries: 0 }, book);
  check("  …nor a company whose record EDGAR opened after 1996", young.events.length === 0 && young.outcome === "empty" && /no EDGAR record by 1996/.test(young.detail ?? ""), young);
  all1985.listed = null;
  const noPrices = await digestFor(client, 1, plan(cikOf("AXP")), { years: 0, issues: 0, entries: 0 }, book);
  check("  …a company without prices yet is asked again on the next run", noPrices.outcome === "error" && /no prices/.test(noPrices.detail ?? ""));
  all1985.listed = "2001-06-01";
  const late = await digestFor(client, 1, plan(cikOf("AXP")), { years: 0, issues: 0, entries: 0 }, book);
  check("  …a company first priced after 1993 has none, and the kept entries are not asked", late.outcome === "empty" && late.events.length === 0 && /after the Digest's years/.test(late.detail ?? ""));
  all1985.listed = "1962-01-02";
  const refused = await digestFor(client, 1, plan(cikOf("AXP")), { years: 0, issues: 3, entries: 9, stopped: "throttled", failure: { outcome: "throttled", httpStatus: 403, detail: "HTTP 403" } }, book);
  check("  …a walk the SEC refused still gives what is kept, and reports the refusal", refused.outcome === "throttled" && refused.httpStatus === 403 && refused.events.length === axpEvents.length, refused.outcome);
  const ok = await digestFor(client, 1, plan(cikOf("AXP")), { years: 0, issues: 0, entries: 0, left: 0 }, book);
  check("  …otherwise its events, ok", ok.outcome === "ok" && ok.httpStatus === 200 && ok.events.length === axpEvents.length);

  // ─── the wiring ──────────────────────────────────────────────────────────────────────────────
  console.log("— the wiring");
  const ingest = read("scripts/ingest.ts");
  check(
    "the ingest walks the archive and then asks the company's own entries, under its CIK",
    /\n\s*"sec_digest",\n/.test(ingest) &&
      /await run\("sec_digest", [^\n]+\n\s*const walked = await walkDigest\(client\);[\s\S]{0,400}return digestFor\(client, subjectId, \{[^}]*cik: company\.cik, fundSeries \}, walked\);/.test(ingest),
  );
  const store = read("lib/ingest/store.ts");
  check("the source is id 34, public information on sec.gov, commercially usable, reviewed 2026-11-06", /id: 34,\n\s*key: "sec_digest",[\s\S]{0,900}commercialOk: true,\n\s*reviewedOn: "2026-11-06"/.test(store) && /considered public information/.test(store.slice(store.indexOf('key: "sec_digest"'))));
  const sql = read("db/040_sec_digest.sql");
  check("db/040 creates the three tables the walk writes, the entries removed with their issue", ["sec_digest_years", "sec_digest_issues", "sec_digest_entries"].every((t) => sql.includes(`CREATE TABLE IF NOT EXISTS ${t}`)) && /REFERENCES sec_digest_issues \(url\) ON DELETE CASCADE/.test(sql) && ["party_key", "party_folded", "party_loose", "is_row", "missing    boolean NOT NULL DEFAULT false"].every((c) => sql.includes(c)));
  check("its credit is on every page and in the terms", /its News Digest of 1956–1993/.test(read("app/layout.tsx")) && /its News Digest of 1956–1993/.test(read("app/legal/terms/page.tsx")));
  check("relevance trusts the rule for a company subject", /row\.sourceKey === "sec_digest"\) \{\n\s*return \{ score: 0\.95/.test(read("lib/enrich/relevance.ts")));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
