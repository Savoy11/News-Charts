import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import index from "../data/edgar-tickers.json";
import { UA } from "../lib/contact";
import { type Filing, INSIDER_TRADES_DIR, type Trade, addDay, companyDays, dayOf, effectiveFilings, isInsider, newYear, relOf } from "../lib/insiderTrades";
import { PREDECESSORS } from "../lib/predecessors";
import { eachZipLine, zipEntryNames } from "../lib/zip";

/**
 * Writes `data/insiders/` (batch 181): every listed company's insiders' open-market purchases and sales, 2006 on, from
 * the SEC's insider transactions data sets (Forms 3, 4 and 5, a zip a quarter, 83 on 2026-11-24, 2 to 15 MB each).
 *
 * 1. Each zip not yet in the cache is read once into its filings of Form 4 or 5 by an officer, a director or a 10% owner
 *    that report a non-derivative purchase (P) or sale (S), with their owners, the issuer and each trade's shares, price
 *    and day, kept as `.cache/insiders/<zip>.json`; the zip itself is held in memory only.
 * 2. Every filing, an amendment restating the one before it (`effectiveFilings`), grouped a company a filing day
 *    (`companyDays`), for the issuers EDGAR's index lists and the predecessors' records `lib/predecessors.ts` maps.
 *
 * The SEC's hosts are asked with the project's contact, 1 s apart.
 *
 *   npm run sync:insiders
 *   npm run sync:insiders -- --zips <dir> --read <day>    # reads saved zips
 */
const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const cache = arg("--cache") ?? join(__dirname, "..", ".cache", "insiders");
const zipsDir = arg("--zips");
const readOn = arg("--read") ?? new Date().toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastAsk = 0;

async function get(url: string): Promise<Buffer | null> {
  const wait = lastAsk + 1_000 - Date.now();
  if (wait > 0) await sleep(wait);
  let res = await fetch(url, { headers: { ...UA }, signal: AbortSignal.timeout(600_000) });
  lastAsk = Date.now();
  // the SEC's answer to too many asks: one more, two minutes later
  if (res.status === 429 || res.status === 503) {
    await sleep(120_000);
    res = await fetch(url, { headers: { ...UA }, signal: AbortSignal.timeout(600_000) });
    lastAsk = Date.now();
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status} for ${new URL(url).pathname}`);
  const body = Buffer.from(await res.arrayBuffer());
  const length = Number(res.headers.get("content-length") ?? NaN);
  const encoded = !/^(?:identity)?$/i.test(res.headers.get("content-encoding") ?? "");
  if (!encoded && Number.isFinite(length) && body.length !== length) throw new Error(`${new URL(url).pathname}: ${body.length} of ${length} bytes`);
  return body;
}

async function table(buf: Buffer, names: string[], want: string, fn: (row: Record<string, string>) => void): Promise<void> {
  const name = names.find((n) => n.toUpperCase().split("/").pop() === want);
  if (!name) throw new Error(`no ${want} in the zip`);
  let head: string[] | null = null;
  await eachZipLine(buf, name, (line) => {
    const cols = line.toString("utf8").replace(/\r$/, "").split("\t");
    if (!head) {
      head = cols.map((c) => c.trim().toUpperCase());
      return;
    }
    const row: Record<string, string> = {};
    head.forEach((h, i) => (row[h] = cols[i] ?? ""));
    fn(row);
  });
}

/** Stage 1: a zip's insiders' filings with an open-market purchase or sale of the company's own shares. */
async function stage1(buf: Buffer): Promise<Filing[]> {
  const names = zipEntryNames(buf);
  const subs = new Map<string, Filing>();
  await table(buf, names, "SUBMISSION.TSV", (r) => {
    const form = r.DOCUMENT_TYPE.trim();
    if (!/^[45](?:\/A)?$/.test(form)) return;
    const filedOn = dayOf(r.FILING_DATE);
    const cik = Number(r.ISSUERCIK);
    if (!filedOn || !(cik > 0)) return;
    subs.set(r.ACCESSION_NUMBER.trim(), {
      accession: r.ACCESSION_NUMBER.trim(),
      filedOn,
      form,
      issuerCik: cik,
      issuerName: r.ISSUERNAME.trim(),
      period: dayOf(r.PERIOD_OF_REPORT),
      plan: /^(?:1|true)$/i.test((r.AFF10B5ONE ?? "").trim()),
      ownerCik: "",
      owner: "",
      rel: 0,
      joint: -1,
      trades: [],
    });
  });
  await table(buf, names, "REPORTINGOWNER.TSV", (r) => {
    const f = subs.get(r.ACCESSION_NUMBER.trim());
    if (!f) return;
    f.rel |= relOf(r.RPTOWNER_RELATIONSHIP ?? "");
    f.joint++;
    if (f.joint > 0) return;
    f.ownerCik = (r.RPTOWNERCIK ?? "").replace(/^0+/, "");
    f.owner = (r.RPTOWNERNAME ?? "").trim();
    const title = (r.RPTOWNER_TITLE ?? "").trim();
    if (title) f.title = title;
  });
  await table(buf, names, "NONDERIV_TRANS.TSV", (r) => {
    const f = subs.get(r.ACCESSION_NUMBER.trim());
    const code = (r.TRANS_CODE ?? "").trim();
    if (!f || (code !== "P" && code !== "S")) return;
    const shares = Number(r.TRANS_SHARES);
    if (!(shares > 0)) return;
    const price = Number(r.TRANS_PRICEPERSHARE);
    const t: Trade = { code, shares, day: dayOf(r.TRANS_DATE) };
    if (price > 0) t.value = Math.round(shares * price);
    f.trades.push(t);
  });
  return [...subs.values()].filter((f) => f.trades.length && isInsider(f.rel)).map((f) => ({ ...f, joint: Math.max(0, f.joint) }));
}

async function main(): Promise<void> {
  const links = zipsDir
    ? readdirSync(zipsDir).filter((f) => f.endsWith(".zip")).map((f) => join(zipsDir, f))
    : [...new Set([...((await get("https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets"))?.toString("utf8") ?? "").matchAll(/href="([^"]+\.zip)"/g)].map((m) => new URL(m[1], "https://www.sec.gov").href))];
  // the zips of 2026-11-24 are 83; far fewer is a broken answer
  if (!zipsDir && links.length < 83) throw new Error(`only ${links.length} insider data set zips listed`);
  mkdirSync(cache, { recursive: true });
  for (const l of links) {
    const name = l.split("/").pop()!.replace(/\.zip$/, "");
    const held = join(cache, `${name}.json`);
    if (existsSync(held)) continue;
    const buf = zipsDir ? readFileSync(l) : await get(l);
    if (!buf) throw new Error(`${l} answered 404`);
    const filings = await stage1(buf);
    writeFileSync(held, JSON.stringify(filings));
    console.log(`${name}: ${filings.length} filings`);
  }

  // the issuers kept: the index's companies and the predecessors' records
  const kept = new Set((index as unknown as { companies: [number, string, string][] }).companies.map((c) => c[0]));
  for (const ps of Object.values(PREDECESSORS)) for (const p of ps) kept.add(p.cik);
  const all: Filing[] = [];
  for (const f of readdirSync(cache).filter((f) => f.endsWith(".json")).sort())
    for (const x of JSON.parse(readFileSync(join(cache, f), "utf8")) as Filing[]) if (kept.has(x.issuerCik) && x.filedOn < readOn) all.push(x);
  const byIssuer = companyDays(effectiveFilings(all));
  const years = new Map<string, ReturnType<typeof newYear>>();
  let days = 0;
  for (const [cik, list] of byIssuer)
    for (const d of list) {
      const y = d.day.slice(0, 4);
      addDay(years.get(y) ?? years.set(y, newYear()).get(y)!, cik, d);
      days++;
    }
  mkdirSync(INSIDER_TRADES_DIR, { recursive: true });
  for (const f of readdirSync(INSIDER_TRADES_DIR)) if (/^\d{4}\.json\.gz$/.test(f) && !years.has(f.slice(0, 4))) rmSync(join(INSIDER_TRADES_DIR, f));
  for (const [y, { ownerAt: _o, titleAt: _t, ...body }] of years) {
    const about =
      `Insiders' open-market purchases and sales filed in ${y}, from the SEC's insider transactions data sets (Forms 4 and 5): for each listed company, ` +
      "one row a filing day naming each officer's, director's and 10% owner's purchases (code P) and sales (code S) of its shares (lib/insiderTrades.ts). " +
      "The SEC's own work (17 U.S.C. § 105). Written by `npm run sync:insiders` (batch 181).";
    writeFileSync(join(INSIDER_TRADES_DIR, `${y}.json.gz`), gzipSync(Buffer.from(`${JSON.stringify({ about, read: readOn, ...body })}\n`), { level: 9 }));
  }
  console.log(`${all.length} filings, ${days} company days on ${byIssuer.size} issuers, ${years.size} years → ${INSIDER_TRADES_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
