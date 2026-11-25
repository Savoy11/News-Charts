import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import index from "../data/edgar-tickers.json";
import { UA } from "../lib/contact";
import { type Filing, INSIDER_TRADES_DIR, type Trade, addDay, bigEnough, companyDays, dayOf, effectiveFilings, isInsider, newYear, ownShares, readPrices, relOf } from "../lib/insiderTrades";
import { PREDECESSORS } from "../lib/predecessors";
import { eachZipLine, zipEntryNames } from "../lib/zip";

/**
 * Writes `data/insiders/` (batch 181): every listed company's insiders' open-market purchases and sales, 2006 on, from
 * the SEC's insider transactions data sets (Forms 3, 4 and 5, a zip a quarter, 83 on 2026-11-24, 2 to 15 MB each).
 *
 * 1. Each zip not yet in the cache is read once into its filings of Form 4 or 5 by an officer, a director or a 10% owner
 *    that report a non-derivative purchase (P) or sale (S) of the company's own shares (`ownShares`, batch 184), with
 *    their owners, the issuer and each trade's shares, price, day (none where it falls after the filing's), holdings after
 *    and whether held directly, kept as `.cache/insiders/<zip>.v2.json`; the zip itself is held in memory only.
 * 2. Every filing, an amendment restating the one before it (`effectiveFilings`), each price compared with the same
 *    company's others (`readPrices`, batch 184), grouped a company a filing day (`companyDays`), for the issuers EDGAR's
 *    index lists and the predecessors' records `lib/predecessors.ts` maps; a day whose trades come to less than $1 million
 *    together is not kept (`bigEnough`, batch 182).
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
    if (!f || (code !== "P" && code !== "S") || !ownShares(r.SECURITY_TITLE ?? "")) return;
    const shares = Number(r.TRANS_SHARES);
    if (!(shares > 0)) return;
    const price = Number(r.TRANS_PRICEPERSHARE);
    const day = dayOf(r.TRANS_DATE);
    // a trade day after the filing's is a slip (Munch Mark Robert's filing of 2010-02-19 "trading" on 2020-02-19)
    const t: Trade = { code, shares, day: day > f.filedOn ? "" : day };
    if (price > 0) t.value = Math.round(shares * price);
    const after = Number((r.SHRS_OWND_FOLWNG_TRANS ?? "").trim() || NaN);
    if (Number.isFinite(after) && after >= 0) t.after = after;
    const how = (r.DIRECT_INDIRECT_OWNERSHIP ?? "").trim().toUpperCase();
    if (how === "D") t.direct = true;
    else if (how === "I") t.direct = false;
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
    // v2: batch 184's stage, the security title read and each trade's holdings after
    const held = join(cache, `${name}.v2.json`);
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
  for (const f of readdirSync(cache).filter((f) => f.endsWith(".v2.json")).sort())
    for (const x of JSON.parse(readFileSync(join(cache, f), "utf8")) as Filing[]) if (kept.has(x.issuerCik) && x.filedOn < readOn) all.push(x);
  const read = readPrices(effectiveFilings(all));
  const total = read.reduce((s, f) => s + f.trades.filter((t) => t.read === "total").length, 0);
  const aside = read.reduce((s, f) => s + f.trades.filter((t) => t.read === "aside").length, 0);
  const byIssuer = companyDays(read);
  const years = new Map<string, ReturnType<typeof newYear>>();
  let days = 0;
  let small = 0;
  for (const [cik, list] of byIssuer)
    for (const d of list) {
      // a day under $1 million is not kept (the owner's call of 2026-11-24, batch 182)
      if (!bigEnough(d)) {
        small++;
        continue;
      }
      const y = d.day.slice(0, 4);
      addDay(years.get(y) ?? years.set(y, newYear()).get(y)!, cik, d);
      days++;
    }
  mkdirSync(INSIDER_TRADES_DIR, { recursive: true });
  for (const f of readdirSync(INSIDER_TRADES_DIR)) if (/^\d{4}\.json\.gz$/.test(f) && !years.has(f.slice(0, 4))) rmSync(join(INSIDER_TRADES_DIR, f));
  for (const [y, { ownerAt: _o, titleAt: _t, ...body }] of years) {
    const about =
      `Insiders' open-market purchases and sales filed in ${y}, from the SEC's insider transactions data sets (Forms 4 and 5): for each listed company, ` +
      "one row a filing day naming each officer's, director's and 10% owner's purchases (code P) and sales (code S) of its shares, a day's together worth " +
      "$1 million or more (lib/insiderTrades.ts). The SEC's own work (17 U.S.C. § 105). Written by `npm run sync:insiders` (batches 181–182, 184).";
    writeFileSync(join(INSIDER_TRADES_DIR, `${y}.json.gz`), gzipSync(Buffer.from(`${JSON.stringify({ about, read: readOn, ...body })}\n`), { level: 9 }));
  }
  console.log(`${total} prices read as the trade's total, ${aside} set aside`);
  console.log(`${all.length} filings, ${days} company days of $1 million or more (${small} smaller left out) on ${byIssuer.size} issuers, ${years.size} years → ${INSIDER_TRADES_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
