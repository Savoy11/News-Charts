/**
 * How many SEC News Digest entries name each listed company, in one year? (2026-11-02 proposal 1,
 * step 1: the count the owner asked for before the Digest is built.)
 *
 *   npm run digest-report -- 1985
 *   npm run digest-report -- 1985 --cache <dir>     # keep what it reads there; a second run reads nothing
 *   npm run digest-report -- 1985 --out <file.json> # every row, for the record
 *   npm run digest-report -- 1985 --no-floor        # skip the first prices (and their Yahoo requests)
 *
 * It reads the year's archive page and each issue's PDF once, a second apart, under the project's
 * sec.gov User-Agent; takes each PDF's text with poppler's `pdftotext`; splits the issue into its
 * entries (`lib/secDigest.ts`); and prints, per listed company and section, the rows that name it.
 * It stores nothing in the database and needs none. Two passes:
 *  1. every entry against every company under all the names EDGAR lists for it
 *     (`cik-lookup-data.txt`, one request) — the candidates;
 *  2. each candidate's EDGAR record (data.sec.gov/submissions, one request each) and EDGAR's company
 *     indexes of 1993–1996 (16 requests) date its names, and an entry counts only under a name the
 *     company had on the issue's day (`namesInUse`). The rows the first pass gave and the second did
 *     not are printed with the reason.
 * The first-price floor (open with the owner): each matched company's first trading day, from
 * Yahoo's chart (one request a company; it is the day the stored series starts — IBM 1962-01-02,
 * Pfizer 1972-06-01, measured 2026-11-03), and the rows before it, which today's rule drops.
 * sec.gov answered about half of the first run's PDF requests with a 503 that a second try did not
 * get, so a 5xx is asked again twice, 5 and 20 seconds later; every attempt is counted.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { predecessorsOf } from "../lib/predecessors";
import {
  DIGEST_FROM,
  DIGEST_LAST,
  companyIndexUrl,
  digestArchiveUrl,
  digestEntries,
  digestEntryNames,
  digestIssueRows,
  DigestNameIndex,
  digestNames,
  digestNamesOn,
  digestOnPage,
  EDGAR_PHASED_IN,
  FIRST_QUARTERS,
  firstNamesIn,
  namesInUse,
  recordStart,
  digestPdfText,
  parseCompanyIndex,
  parseDigestArchive,
  parseEdgarRecord,
  type DigestEntry,
  type EdgarRecord,
  type DigestKind,
  type DigestMatch,
  type DigestNames,
  type DigestRow,
} from "../lib/secDigest";

const UA = { "User-Agent": "News Charts Research marcusowens94@gmail.com" };
const LOOKUP_URL = "https://www.sec.gov/Archives/edgar/cik-lookup-data.txt";
const PACE_MS = 1_000;

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const option = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const year = Number(argv.find((a, i) => /^\d{4}$/.test(a) && !argv[i - 1]?.startsWith("--")));
const cache = option("cache");
const out = option("out");

const requests = new Map<string, number>();
let bytes = 0;
let last = 0;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One GET, paced a second apart per host family, counted by host. */
async function get(url: string, headers: Record<string, string> = UA): Promise<Response> {
  const wait = last + PACE_MS - Date.now();
  if (wait > 0) await pause(wait);
  last = Date.now();
  const host = new URL(url).host;
  requests.set(host, (requests.get(host) ?? 0) + 1);
  return fetch(url, { headers, signal: AbortSignal.timeout(90_000) });
}

let retried = 0;

/**
 * A file from the cache, or fetched once and kept there. sec.gov answered about half of the first
 * run's PDF requests with a 503 that the same request a moment later did not get (2026-11-03), so a
 * 5xx or 429 is asked again after 5 and then 20 seconds; every attempt is counted.
 */
async function cached(name: string, url: string): Promise<Buffer | null> {
  const path = cache ? join(cache, name) : null;
  if (path && existsSync(path)) return readFileSync(path);
  let res = await get(url).catch(() => null);
  for (const wait of [5_000, 20_000]) {
    if (res && res.ok) break;
    if (res && res.status < 500 && res.status !== 429) break;
    retried++;
    await pause(wait);
    res = await get(url).catch(() => null);
  }
  if (!res || !res.ok) {
    console.log(`  ${url}: ${res ? `HTTP ${res.status}` : "no answer"}`);
    return null;
  }
  const body = Buffer.from(await res.arrayBuffer());
  bytes += body.length;
  if (path) writeFileSync(path, body);
  return body;
}

interface IndexRow {
  cik: number;
  ticker: string;
  title: string;
}

function indexCompanies(): IndexRow[] {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "data", "edgar-tickers.json"), "utf8")) as { companies: [number, string, string][] };
  const seen = new Set<number>();
  const rows: IndexRow[] = [];
  for (const [cik, ticker, title] of raw.companies) {
    if (seen.has(cik)) continue; // a company's first ticker in the index's order is its page's
    seen.add(cik);
    rows.push({ cik, ticker, title });
  }
  return rows;
}

/** EDGAR's list of every name each filer has used: "MINNESOTA MINING & MANUFACTURING CO:0000066740:". */
function namesByCik(text: string, want: Set<number>): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const line of text.split("\n")) {
    const m = /^(.*):(\d{10}):\s*$/.exec(line);
    if (!m) continue;
    const cik = Number(m[2]);
    if (!want.has(cik)) continue;
    if (!out.has(cik)) out.set(cik, []);
    out.get(cik)!.push(m[1].trim());
  }
  return out;
}

/** A company's EDGAR record, trimmed to what dating its names needs and kept in the cache, or null. */
async function edgarRecord(cik: number): Promise<EdgarRecord | null> {
  const name = `record-${cik}.json`;
  const path = cache ? join(cache, name) : null;
  const first = { firstNames: (await edgarFirstNames()).get(cik) ?? [] };
  if (path && existsSync(path)) return { ...(JSON.parse(readFileSync(path, "utf8")) as EdgarRecord), ...first };
  const body = await cached(`submissions-${cik}.tmp`, `https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`);
  if (!body) return null;
  const record = { ...parseEdgarRecord(JSON.parse(body.toString("utf8"))), ...first };
  if (path) {
    writeFileSync(path, JSON.stringify(record));
    rmSync(join(cache!, `submissions-${cik}.tmp`), { force: true });
  }
  return record;
}

let firstNameMap: Map<number, string[]> | null = null;

/** EDGAR's company indexes of 1993–1996, one zip a quarter (16 requests, ~10 MB), read once and kept as the names they give. */
async function edgarFirstNames(): Promise<Map<number, string[]>> {
  if (firstNameMap) return firstNameMap;
  const path = cache ? join(cache, "edgar-first-names.json") : null;
  if (path && existsSync(path)) return (firstNameMap = new Map(JSON.parse(readFileSync(path, "utf8")) as [number, string[]][]));
  const quarters: { name: string; cik: number }[][] = [];
  for (const q of FIRST_QUARTERS) {
    const zip = await cached(`company-${q.year}Q${q.quarter}.zip`, companyIndexUrl(q));
    if (!zip) throw new Error(`EDGAR's company index for ${q.year} Q${q.quarter} did not come`);
    quarters.push(parseCompanyIndex(await unzipOne(zip)));
  }
  firstNameMap = firstNamesIn(quarters);
  if (path) writeFileSync(path, JSON.stringify([...firstNameMap]));
  return firstNameMap;
}

/** The one file in a zip, with the host's `unzip` (which reads a file, not a pipe). */
function unzipOne(zip: Buffer): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "digest-"));
  const file = join(dir, "index.zip");
  writeFileSync(file, zip);
  return new Promise<string>((resolve, reject) =>
    execFile("unzip", ["-p", file], { maxBuffer: 64 << 20, encoding: "latin1" }, (err, stdout) => (err ? reject(err) : resolve(stdout))),
  ).finally(() => rmSync(dir, { recursive: true, force: true }));
}

const firstPrices: Record<string, string | null> = {};

/** Yahoo's first trading day for a ticker, or null (Yahoo has no series, or did not answer); kept in the cache. */
async function firstPrice(ticker: string): Promise<string | null> {
  const path = cache ? join(cache, "first-prices.json") : null;
  if (path && !Object.keys(firstPrices).length && existsSync(path)) Object.assign(firstPrices, JSON.parse(readFileSync(path, "utf8")));
  if (ticker in firstPrices) return firstPrices[ticker];
  const day = await askYahoo(ticker);
  firstPrices[ticker] = day;
  if (path) writeFileSync(path, JSON.stringify(firstPrices));
  return day;
}

async function askYahoo(ticker: string): Promise<string | null> {
  const res = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`, {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  }).catch(() => null);
  if (!res?.ok) return null;
  const first = (await res.json().catch(() => null))?.chart?.result?.[0]?.meta?.firstTradeDate;
  return typeof first === "number" ? new Date(first * 1000).toISOString().slice(0, 10) : null;
}

interface Hit {
  cik: number;
  day: string;
  kind: DigestKind;
  how: DigestMatch;
  party: string;
  former: boolean;
  url: string;
}

const KINDS: DigestKind[] = ["8-K report", "registration", "registration effective", "stake", "order", "enforcement", "listing", "other"];
const n = (x: number) => x.toLocaleString("en-US");

async function main(): Promise<void> {
  if (!Number.isInteger(year) || year < DIGEST_FROM || year > DIGEST_LAST) {
    console.error(`usage: npm run digest-report -- <year ${DIGEST_FROM}–${DIGEST_LAST}> [--cache <dir>] [--out <file>] [--no-floor]`);
    process.exit(2);
  }
  if (cache) mkdirSync(cache, { recursive: true });

  const companies = indexCompanies();
  const lookupBody = await cached("cik-lookup-data.txt", LOOKUP_URL);
  if (!lookupBody) throw new Error("EDGAR's name list did not come");
  const lookup = namesByCik(lookupBody.toString("latin1"), new Set(companies.flatMap((c) => [c.cik, ...predecessorsOf(c.cik).map((p) => p.cik)])));
  const byCik = new Map(companies.map((c) => [c.cik, c]));
  const names = new Map<number, DigestNames>();
  // today's names alone, to tell which matches needed a former one
  const today = new Map<number, DigestNames>();
  for (const c of companies) {
    // a predecessor's names are candidates too (`lib/predecessors.ts`), dated like the company's own
    const before = predecessorsOf(c.cik).flatMap((p) => [p.name, ...(lookup.get(p.cik) ?? [])]);
    names.set(c.cik, digestNames(c.cik, c.title, [...(lookup.get(c.cik) ?? []), ...before]));
    today.set(c.cik, digestNames(c.cik, c.title));
  }
  const index = new DigestNameIndex(names);

  const archive = await cached(`digarch${year}.shtml`, digestArchiveUrl(year));
  if (!archive) throw new Error("the archive page did not come");
  const issues = parseDigestArchive(archive.toString("utf8"), year);
  console.log(`\nSEC News Digest, ${year}: ${issues.length} issues on the archive page`);

  // pass 1: every issue's entries, and the companies any of them could be under any of their names
  const entriesByKind = new Map<DigestKind, number>();
  const read: { day: string; url: string; entries: DigestEntry[] }[] = [];
  const candidates = new Set<number>();
  const undated: DigestRow[] = [];
  let undatedRows = 0;
  let failed = 0;
  for (const issue of issues) {
    const file = issue.url.split("/").pop()!;
    const pdf = await cached(file, issue.url);
    if (!pdf) {
      failed++;
      continue;
    }
    let text: string;
    try {
      text = await digestPdfText(pdf);
    } catch (err) {
      console.log(`  ${file}: no text (${String(err).slice(0, 120)})`);
      failed++;
      continue;
    }
    const entries: DigestEntry[] = digestEntries(text);
    read.push({ day: issue.day, url: issue.url, entries });
    for (const e of entries) entriesByKind.set(e.kind, (entriesByKind.get(e.kind) ?? 0) + 1);
    const rows = digestIssueRows(issue.day, entries, index);
    undatedRows += rows.length;
    undated.push(...rows);
    for (const r of rows) candidates.add(r.cik);
    if (read.length % 25 === 0) console.log(`  … ${read.length} issues read, ${n(undatedRows)} rows under every name so far`);
  }

  // what each record was called when EDGAR began (`firstNamesIn`): its company indexes of 1993–1996
  const firstNames = await edgarFirstNames();

  // the candidates' EDGAR records, to date their names (`namesInUse`)
  console.log(`  reading ${candidates.size} candidates' EDGAR records to date their names…`);
  const records = new Map<number, EdgarRecord>();
  const before = new Map<number, { name: string; until: string; record: EdgarRecord }[]>();
  for (const cik of candidates) {
    const record = await edgarRecord(cik);
    if (record) records.set(cik, record);
    const preds: { name: string; until: string; record: EdgarRecord }[] = [];
    for (const p of predecessorsOf(cik)) {
      const r = await edgarRecord(p.cik);
      if (r) preds.push({ name: p.name, until: p.until, record: r });
    }
    before.set(cik, preds);
  }

  // pass 2: the rows under each company's names on the issue's day
  const hits: Hit[] = [];
  let entriesNamed = 0;
  const unmatchedRows = new Map<string, number>();
  const shared: { day: string; party: string; tickers: string[] }[] = [];
  for (const issue of read) {
    const namesOn = (cik: number) => {
      const record = records.get(cik);
      return record ? digestNamesOn(issue.day, cik, byCik.get(cik)!.title, record, before.get(cik)) : null;
    };
    const issueRows = digestIssueRows(issue.day, issue.entries, index, namesOn, (e, ciks) =>
      shared.push({ day: issue.day, party: e.party, tickers: ciks.map((c) => byCik.get(c)!.ticker) }),
    );
    const matched = new Set(issueRows.flatMap((r) => r.entries));
    for (const e of issue.entries) {
      if (e.row && !matched.has(e)) {
        const k = e.party.toUpperCase();
        unmatchedRows.set(k, (unmatchedRows.get(k) ?? 0) + 1);
      }
    }
    for (const r of issueRows) {
      entriesNamed += r.entries.length;
      const former = digestEntryNames(r.entries[0], today.get(r.cik)!, r.cik) === null;
      hits.push({ cik: r.cik, day: r.day, kind: r.kind, how: r.how, party: r.entries[0].party, former, url: issue.url });
    }
  }

  // `hits` are rows already: an issue's entries on one company in one section are one (`digestIssueRows`)
  const rowList = hits;
  const eightKMonths = new Set(rowList.filter((r) => r.kind === "8-K report").map((r) => `${r.cik}|${r.day.slice(0, 7)}`));

  const floor = new Map<number, string | null>();
  if (!flag("no-floor")) {
    const ciks = [...new Set(rowList.map((r) => r.cik))];
    console.log(`  first trading days for ${ciks.length} companies…`);
    for (const cik of ciks) floor.set(cik, await firstPrice(byCik.get(cik)!.ticker));
  }
  const beforeFloor = (r: Hit) => floor.size > 0 && !digestOnPage(r.day, floor.get(r.cik));

  // the rows every name gave and the dated names did not, and why: a record EDGAR opened after its
  // phase-in has no names before it began; otherwise the name was not the company's that day
  const kept = new Set(rowList.map((r) => `${r.cik}|${r.day}|${r.kind}`));
  const dropped = undated.filter((r) => !kept.has(`${r.cik}|${r.day}|${r.kind}`) && records.has(r.cik));
  const younger = dropped.filter((r) => {
    const start = recordStart(records.get(r.cik)!);
    return !!start && start > EDGAR_PHASED_IN && r.day < start;
  });
  const youngerSet = new Set(younger);
  const later = dropped.filter((r) => !youngerSet.has(r));
  // where the two rules disagree: the floor would keep these (a first price on or before the day)
  const firstOf = async (cik: number) => (floor.has(cik) ? floor.get(cik) : flag("no-floor") ? undefined : await firstPrice(byCik.get(cik)!.ticker));
  const disagree: DigestRow[] = [];
  for (const r of younger) if (digestOnPage(r.day, await firstOf(r.cik))) disagree.push(r);

  const total = [...entriesByKind.values()].reduce((a, b) => a + b, 0);
  console.log(`\n  ${read.length} issues read (${failed} could not be), ${n(bytes)} bytes fetched`);
  console.log(`  entries read: ${n(total)} — ${KINDS.filter((k) => entriesByKind.get(k)).map((k) => `${k} ${n(entriesByKind.get(k)!)}`).join(" · ")}`);
  const companiesHit = new Set(hits.map((h) => h.cik));
  const how = (m: DigestMatch) => hits.filter((h) => h.how === m).length;
  console.log(`\n  entries naming a listed company: ${n(entriesNamed)}, in ${n(rowList.length)} rows on ${n(companiesHit.size)} companies`);
  console.log(`    (an issue's entries on a company in one section are one row)`);
  console.log(`    rows by how: conformed name ${n(how("conformed"))} · caption rule ${n(how("caption"))} · read back through the OCR ${n(how("folded"))}`);
  console.log(`    rows under a name other than today's: ${n(hits.filter((h) => h.former).length)}`);
  console.log(`    under every name, undated: ${n(undatedRows)} rows on ${n(candidates.size)} companies; ${n(undatedRows - rowList.length)} were names the company did not have that day, or another company's too`);
  console.log(`    ${candidates.size - records.size} candidates' EDGAR records could not be read (their rows not counted)`);
  console.log(`    entries two companies' names both claimed that day, so neither's: ${n(shared.length)}`);
  console.log(`    dropped by the names' dates: ${n(dropped.length)} rows — ${n(younger.length)} on ${new Set(younger.map((r) => r.cik)).size} records EDGAR opened after ${EDGAR_PHASED_IN} (no names before they began), ${n(later.length)} under a name the company did not have that day`);
  console.log(`      the first-price floor alone would have kept ${disagree.length} of the first: ${[...new Set(disagree.map((r) => byCik.get(r.cik)!.ticker))].join(", ") || "none"}`);
  for (const k of KINDS) {
    const r = rowList.filter((x) => x.kind === k);
    if (r.length) console.log(`    ${k.padEnd(23)} ${String(r.length).padStart(6)} rows on ${new Set(r.map((x) => x.cik)).size} companies`);
  }
  console.log(`    8-K reports grouped a row a month per company: ${n(eightKMonths.size)} rows`);

  if (floor.size) {
    const dropped = rowList.filter(beforeFloor);
    const noSeries = [...floor.values()].filter((v) => v === null).length;
    const kept = rowList.length - dropped.length;
    console.log(`\n  first-price floor: ${n(dropped.length)} of ${n(rowList.length)} rows fall before the company's first price, on ${new Set(dropped.map((r) => r.cik)).size} companies; ${n(kept)} rows stay`);
    console.log(`    ${noSeries} companies have no Yahoo series (all their rows counted as dropped)`);
    const sample = [...new Set(dropped.map((r) => r.cik))].slice(0, 15).map((c) => `${byCik.get(c)!.ticker} (first price ${floor.get(c) ?? "none"})`);
    if (sample.length) console.log(`    e.g. ${sample.join(", ")}`);
  }

  const perCompany = new Map<number, Hit[]>();
  for (const r of rowList) {
    if (!perCompany.has(r.cik)) perCompany.set(r.cik, []);
    perCompany.get(r.cik)!.push(r);
  }
  const ranked = [...perCompany.entries()].sort((a, b) => b[1].length - a[1].length || byCik.get(a[0])!.ticker.localeCompare(byCik.get(b[0])!.ticker));
  console.log(`\n  companies by rows (top 40):`);
  for (const [cik, list] of ranked.slice(0, 40)) {
    const c = byCik.get(cik)!;
    const parts = KINDS.map((k) => [k, list.filter((r) => r.kind === k).length] as const).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`);
    const first = floor.size ? ` · first price ${floor.get(cik) ?? "none"}` : "";
    console.log(`    ${c.ticker.padEnd(7)} ${String(list.length).padStart(4)}  ${parts.join(" · ")}${first}`);
  }
  const formerSample = [...new Map(hits.filter((h) => h.former).map((h) => [h.cik, h])).values()].slice(0, 20);
  if (formerSample.length) {
    console.log(`\n  under a name other than today's (a sample):`);
    for (const h of formerSample) console.log(`    ${byCik.get(h.cik)!.ticker.padEnd(7)} ${h.party.slice(0, 60)}  (${h.kind}, ${h.day})`);
  }
  const folded = [...new Map(hits.filter((h) => h.how === "folded").map((h) => [h.party, h])).values()].slice(0, 15);
  if (folded.length) {
    console.log(`\n  read back through the OCR (a sample):`);
    for (const h of folded) console.log(`    ${byCik.get(h.cik)!.ticker.padEnd(7)} ${h.party.slice(0, 60)}`);
  }
  const sample = (rows: DigestRow[]) => [...new Map(rows.map((r) => [r.cik, r])).values()].slice(0, 14);
  if (later.length) {
    console.log(`\n  dropped: a name the company did not have that day (a sample):`);
    for (const r of sample(later)) console.log(`    ${byCik.get(r.cik)!.ticker.padEnd(7)} ${r.entries[0].party.slice(0, 50).padEnd(50)} (${r.day}; its names then: ${namesInUse(r.day, byCik.get(r.cik)!.title, records.get(r.cik)!).join(", ") || "none"})`);
  }
  if (younger.length) {
    console.log(`\n  dropped: a record younger than the issue (a sample):`);
    for (const r of sample(younger)) console.log(`    ${byCik.get(r.cik)!.ticker.padEnd(7)} ${r.entries[0].party.slice(0, 50).padEnd(50)} (${r.day}; record from ${recordStart(records.get(r.cik)!)})`);
  }
  if (shared.length) {
    console.log(`\n  claimed by two companies' names (a sample):`);
    for (const x of shared.slice(0, 12)) console.log(`    ${x.tickers.join(" / ").padEnd(16)} ${x.party.slice(0, 60)}  (${x.day})`);
  }
  console.log(`\n  table rows naming no listed company, commonest (what the names miss or the OCR garbles):`);
  for (const [name, count] of [...unmatchedRows.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`    ${String(count).padStart(3)}  ${name.slice(0, 60)}`);

  console.log(`\n  requests by host: ${[...requests.entries()].map(([h, c]) => `${h} ${c}`).join(" · ") || "none (all from the cache)"}${retried ? ` (${retried} of them asked again after a 5xx or 429)` : ""}\n`);
  if (out) {
    writeFileSync(out, JSON.stringify({ year, issues: issues.length, read: read.length, shared, entriesByKind: Object.fromEntries(entriesByKind), rows: rowList.map((r) => ({ ...r, ticker: byCik.get(r.cik)!.ticker, firstPrice: floor.get(r.cik) ?? null })) }, null, 1));
    console.log(`  matches written to ${out}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
