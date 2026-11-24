import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { gzipSync } from "node:zlib";
import index from "../data/edgar-tickers.json";
import { UA } from "../lib/contact";
import { cusipMap } from "../lib/cusipMap";
import {
  FUND_HOLDINGS_DIR,
  type FundReport,
  type Position,
  addMonth,
  compareMonth,
  effectiveReports,
  markSuspect,
  monthsBetween,
  newYear,
  pairable,
  quarterSplitsIn,
  reportOf,
} from "../lib/fundHoldings";
import { comparable, instHoldings } from "../lib/instHoldings";
import { eachZipLine, zipEntryNames } from "../lib/zip";

const companies = (index as unknown as { companies: [number, string, string][] }).companies;

/**
 * Writes `data/nport/` (batch 180): each fund's reported changes in its stock holdings, from the SEC's Form N-PORT data
 * sets, 2019 Q4 on, and each fund's change of 1% or more of a company's shares.
 *
 * 1. The SEC's N-PORT data sets, a zip a quarter (28 on 2026-11-24, 240 to 480 MB each): each zip not yet in the cache is
 *    read once into its public reports (the fund's series, the report's month end, its filing day, net assets) and their
 *    long share positions in stocks, preferreds and funds, by CUSIP (else a US ISIN's), with the dollar value and name the
 *    fund gives; a zip is held in memory only, never saved, as only the cache is read again.
 * 2. Every fund's positions by report month (`months/`, written again each run), each pair of a fund's reports two to
 *    four months apart compared (`compareMonth`), the securities by the 13F sync's CUSIP map (`data/13f/cusips.json.gz`),
 *    the companies' share counts from the frames `npm run sync:13f` keeps in its cache, the 13F holders' splits from its
 *    committed files.
 *
 * The SEC's hosts are asked with the project's contact, 1 s apart; the cache (`.cache/nport`, about 5 GB, git-ignored)
 * keeps what was read, so a quarterly run reads the new zip. Needs about 8 GB of memory and `npm run sync:13f`'s cache.
 *
 *   npm run sync:nport
 *   npm run sync:nport -- --zips <dir> --frames <dir> --read <day>    # reads saved zips and frames
 *   npm run sync:nport -- --stage1                                     # reads the zips into the cache, and stops
 */
const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const cache = arg("--cache") ?? join(__dirname, "..", ".cache", "nport");
const zipsDir = arg("--zips");
const framesDir = arg("--frames") ?? join(__dirname, "..", ".cache", "13f", "frames");
const readOn = arg("--read") ?? new Date().toISOString().slice(0, 10);
const stage1Only = process.argv.includes("--stage1");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastAsk = 0;

async function get(url: string): Promise<Buffer | null> {
  const wait = lastAsk + 1_000 - Date.now();
  if (wait > 0) await sleep(wait);
  let res = await fetch(url, { headers: { ...UA }, signal: AbortSignal.timeout(3_600_000) });
  lastAsk = Date.now();
  // the SEC's answer to too many asks: one more, two minutes later
  if (res.status === 429 || res.status === 503) {
    await sleep(120_000);
    res = await fetch(url, { headers: { ...UA }, signal: AbortSignal.timeout(3_600_000) });
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

const MONTHS: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };
const dayOf = (s: string) => {
  const m = /^(\d{2})-([A-Z]{3})-(\d{4})$/.exec(s.trim().toUpperCase());
  return m ? `${m[3]}-${MONTHS[m[2]]}-${m[1]}` : s.trim();
};

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

/** Stage 1: a data set zip's reports and their long share positions in stocks, preferreds and funds, into the cache. */
async function stage1(name: string, buf: Buffer): Promise<void> {
  const out = join(cache, "zips", name);
  mkdirSync(out, { recursive: true });
  const names = zipEntryNames(buf);
  const subs: Record<string, unknown[]> = {};
  await table(buf, names, "SUBMISSION.TSV", (r) => (subs[r.ACCESSION_NUMBER] = [dayOf(r.REPORT_DATE), dayOf(r.FILING_DATE), r.SUB_TYPE.trim()]));
  await table(buf, names, "REGISTRANT.TSV", (r) => subs[r.ACCESSION_NUMBER]?.splice(3, 0, r.CIK.replace(/^0+/, "")));
  await table(buf, names, "FUND_REPORTED_INFO.TSV", (r) => subs[r.ACCESSION_NUMBER]?.splice(4, 0, r.SERIES_ID.trim(), r.SERIES_NAME.trim(), Number(r.NET_ASSETS) || 0));
  // a holding with no CUSIP of its own takes its US ISIN's ("US0378331005" is 037833100)
  const isin = new Map<string, string>();
  await table(buf, names, "IDENTIFIERS.TSV", (r) => {
    const i = (r.IDENTIFIER_ISIN ?? "").trim().toUpperCase();
    if (/^US[0-9A-Z]{9}\d$/.test(i)) isin.set(r.HOLDING_ID, i.slice(2, 11));
  });
  const w = createWriteStream(join(out, "positions.tsv"));
  let kept = 0;
  await table(buf, names, "FUND_REPORTED_HOLDING.TSV", (r) => {
    if ((r.UNIT ?? "").trim() !== "NS" || !/^Long$/i.test((r.PAYOFF_PROFILE ?? "").trim()) || (r.DERIVATIVE_CAT ?? "").trim()) return;
    if (!/^(?:EC|EP|RF)$/.test((r.ASSET_CAT ?? "").trim())) return;
    let cusip = (r.ISSUER_CUSIP ?? "").trim().toUpperCase();
    if (!/^[0-9A-Z]{9}$/.test(cusip) || /^0+$/.test(cusip)) cusip = isin.get(r.HOLDING_ID) ?? "";
    const shares = Math.round(Number(r.BALANCE));
    if (!(shares > 0)) return;
    // the value in dollars: a holding in another currency by its exchange rate (units of it to the dollar)
    const currency = (r.CURRENCY_CODE ?? "").trim();
    const value = Number(r.CURRENCY_VALUE);
    const rate = Number(r.EXCHANGE_RATE);
    const usd = !currency || currency === "USD" ? value : rate > 0 ? value / rate : NaN;
    w.write(`${r.ACCESSION_NUMBER}\t${cusip}\t${shares}\t${Number.isFinite(usd) ? Math.round(usd) : ""}\t${(r.ISSUER_NAME ?? "").trim().replace(/[\t\r\n]/g, " ").slice(0, 60)}\n`);
    kept++;
  });
  await new Promise((r) => w.end(r));
  writeFileSync(join(out, "submissions.json"), JSON.stringify(subs));
  writeFileSync(join(out, "done"), `${Object.keys(subs).length} ${kept}\n`);
  console.log(`${name}: ${Object.keys(subs).length} reports, ${kept} positions`);
}

/** A frame's share counts by CIK: data.sec.gov's `dei:EntityCommonStockSharesOutstanding` for a calendar quarter, read once into the frames directory. */
const frames = new Map<string, Map<number, number>>();
const frameOf = (day: string) => `CY${day.slice(0, 4)}Q${Math.ceil(Number(day.slice(5, 7)) / 3)}I`;
async function sharesAt(day: string): Promise<Map<number, number>> {
  const frame = frameOf(day);
  const had = frames.get(frame);
  if (had) return had;
  const held = join(framesDir, `${frame}.json`);
  let text: string | null = existsSync(held) ? readFileSync(held, "utf8") : null;
  if (!text && day < readOn) {
    text = (await get(`https://data.sec.gov/api/xbrl/frames/dei/EntityCommonStockSharesOutstanding/shares/${frame}.json`))?.toString("utf8") ?? null;
    if (text) {
      mkdirSync(framesDir, { recursive: true });
      writeFileSync(held, text);
    }
  }
  const m = new Map<number, number>();
  for (const r of text ? ((JSON.parse(text) as { data: { cik: number; val: number }[] }).data ?? []) : []) m.set(r.cik, r.val);
  frames.set(frame, m);
  return m;
}

async function main(): Promise<void> {
  const links = zipsDir
    ? readdirSync(zipsDir).filter((f) => f.endsWith(".zip")).map((f) => join(zipsDir, f))
    : [...new Set([...((await get("https://www.sec.gov/data-research/sec-markets-data/form-n-port-data-sets"))?.toString("utf8") ?? "").matchAll(/href="([^"]+\.zip)"/g)].map((m) => new URL(m[1], "https://www.sec.gov").href))];
  // the zips of 2026-11-24 are 28; far fewer is a broken answer
  if (!zipsDir && links.length < 28) throw new Error(`only ${links.length} N-PORT data set zips listed`);
  for (const l of links) {
    const name = l.split("/").pop()!.replace(/\.zip$/, "");
    if (existsSync(join(cache, "zips", name, "done"))) continue;
    const buf = zipsDir ? readFileSync(l) : await get(l);
    if (!buf) throw new Error(`${l} answered 404`);
    await stage1(name, buf);
  }
  if (stage1Only) return;

  // every report, and each fund's in order
  const reports: FundReport[] = [];
  const windows = readdirSync(join(cache, "zips")).filter((w) => existsSync(join(cache, "zips", w, "done"))).sort();
  for (const w of windows)
    for (const [a, row] of Object.entries(JSON.parse(readFileSync(join(cache, "zips", w, "submissions.json"), "utf8")) as Record<string, unknown[]>)) {
      const r = reportOf(a, row, w);
      if (r) reports.push(r);
    }
  const eff = effectiveReports(reports);
  const effective = new Map<string, FundReport>();
  const priorOf = new Map<string, FundReport>();
  const fundNames = new Map<string, string>();
  for (const [series, list] of eff) {
    list.forEach((r, i) => {
      effective.set(r.accession, r);
      if (i > 0 && pairable(list[i - 1].reportDate, r.reportDate)) priorOf.set(r.accession, list[i - 1]);
    });
    const named = [...list].sort((a, b) => a.filedOn.localeCompare(b.filedOn)).filter((r) => r.seriesName);
    fundNames.set(series, named.at(-1)?.seriesName ?? `Series ${series}`);
  }
  // a fund page's name as EDGAR's index gives it ("Vanguard 500 Index Fund", not the report's "VANGUARD 500 INDEX FUND")
  const fundIndex = index as unknown as { seriesIds?: string[]; seriesNames?: string[] };
  (fundIndex.seriesIds ?? []).forEach((id, i) => {
    const name = fundIndex.seriesNames?.[i];
    if (name && fundNames.has(id)) fundNames.set(id, name);
  });

  // every report's positions by its month, one file a month (a month's last day and its last trading day one month), keyed
  // by page ticker, else CUSIP, else name; each security's name as the latest data set's first report gives it (Meta
  // Platforms, not 2019's Facebook)
  const map = cusipMap();
  const byMonth = join(cache, "months");
  rmSync(byMonth, { recursive: true, force: true });
  mkdirSync(byMonth, { recursive: true });
  const writers = new Map<string, ReturnType<typeof createWriteStream>>();
  const entries = new Map<string, number>();
  const names = new Map<string, string>();
  for (const w of windows) {
    const named = new Set<string>();
    const rl = createInterface({ input: createReadStream(join(cache, "zips", w, "positions.tsv")) });
    for await (const line of rl) {
      const [a, cusip, shares, usd, name] = line.split("\t");
      const r = effective.get(a);
      if (!r) continue;
      const ticker = map.get(cusip);
      const key = ticker ? `T:${ticker}` : cusip || (name ? `N:${name.toUpperCase()}` : "");
      if (!key) continue;
      // a copy, so the map keeps no line it was cut from
      if (name && !named.has(key)) {
        const k = Buffer.from(key).toString();
        named.add(k);
        names.set(k, Buffer.from(name).toString());
      }
      entries.set(a, (entries.get(a) ?? 0) + 1);
      const m = r.reportDate.slice(0, 7);
      const out = writers.get(m) ?? writers.set(m, createWriteStream(join(byMonth, `${m}.tsv`))).get(m)!;
      if (!out.write(`${a}\t${key}\t${shares}\t${usd}\n`)) await once(out, "drain");
    }
  }
  await Promise.all([...writers.values()].map((w) => new Promise((r) => w.end(r))));

  async function month(m: string): Promise<Map<string, Map<string, Position>>> {
    const out = new Map<string, Map<string, Position>>();
    const f = join(byMonth, `${m}.tsv`);
    if (!existsSync(f)) return out;
    const rl = createInterface({ input: createReadStream(f) });
    for await (const line of rl) {
      const [a, key, sh, usd] = line.split("\t");
      const report = out.get(a) ?? out.set(Buffer.from(a).toString(), new Map()).get(a)!;
      const p = report.get(key);
      const value = usd === "" ? undefined : Number(usd);
      if (!p) report.set(key.length > 12 ? Buffer.from(key).toString() : key, { shares: Number(sh), value });
      else {
        p.shares += Number(sh);
        p.value = p.value === undefined || value === undefined ? undefined : p.value + value;
      }
    }
    const bySecurity = new Map<string, Position[]>();
    for (const report of out.values()) for (const [k, p] of report) (bySecurity.get(k) ?? bySecurity.set(k, []).get(k)!).push(p);
    for (const ps of bySecurity.values()) markSuspect(ps);
    return out;
  }

  // the 13F holders' splits by ticker, and the companies' share counts where a CIK lists one ticker
  const splits = new Map<string, { period: string; split: number }[]>();
  for (const [ticker, qs] of instHoldings().pages) {
    const s = qs.filter((q) => q.split !== 1).map((q) => ({ period: q.period, split: q.split }));
    if (s.length) splits.set(ticker, s);
  }
  const tickersOf = new Map<number, number>();
  for (const c of companies) tickersOf.set(c[0], (tickersOf.get(c[0]) ?? 0) + 1);
  const cikOf = new Map(companies.map((c) => [c[1], c[0]]));
  const pages = new Set((index as unknown as { seriesIds?: string[] }).seriesIds ?? []);

  const months = [...writers.keys()].filter((m) => m < readOn.slice(0, 7)).sort();
  for (const m of months) await sharesAt(`${m}-01`);
  const countOf = (t: string, day: string) => {
    const cik = cikOf.get(t);
    return cik !== undefined && tickersOf.get(cik) === 1 ? frames.get(frameOf(day))?.get(cik) : undefined;
  };
  // the quarter after a report's, where its frame was read for another month: a count missing from it is null
  const nextOf = (t: string, day: string) => {
    const [y, m] = day.split("-").map(Number);
    const q = Math.ceil(m / 3);
    const frame = frames.get(q === 4 ? `CY${y + 1}Q1I` : `CY${y}Q${q + 1}I`);
    const cik = cikOf.get(t);
    if (!frame || cik === undefined || tickersOf.get(cik) !== 1) return undefined;
    return frame.get(cik) ?? null;
  };
  const loaded = new Map<string, Map<string, Map<string, Position>>>();
  const years = new Map<string, ReturnType<typeof newYear>>();
  let pairsRead = 0;
  for (const m of months) {
    for (const k of [...loaded.keys()]) if (monthsBetween(`${k}-01`, `${m}-01`) > 4) loaded.delete(k);
    loaded.set(m, await month(m));
    const pairs: Parameters<typeof compareMonth>[0][number][] = [];
    for (const [a, now] of loaded.get(m)!) {
      const r = effective.get(a)!;
      const p = priorOf.get(a);
      if (!p || !(r.netAssets > 0 && p.netAssets > 0) || !comparable(entries.get(p.accession) ?? 0, entries.get(a) ?? 0)) continue;
      const before = loaded.get(p.reportDate.slice(0, 7))?.get(p.accession);
      if (!before) continue;
      pairs.push({
        pair: { series: r.series, cik: r.cik, reportDate: r.reportDate, priorDate: p.reportDate, filedOn: r.filedOn, accession: a, amended: r.amended, netAssets: r.netAssets },
        before,
        now,
      });
    }
    pairsRead += pairs.length;
    const compared = compareMonth(pairs, {
      tickerOf: (k) => (k.startsWith("T:") ? k.slice(2) : undefined),
      splitsOf: (t, b, a) => quarterSplitsIn(splits.get(t) ?? [], b, a),
      sharesOf: (t, b, a) => ({ now: countOf(t, a), before: countOf(t, b), next: nextOf(t, a) }),
      nameOf: (k) => names.get(k),
    });
    const y = m.slice(0, 4);
    addMonth(years.get(y) ?? years.set(y, newYear()).get(y)!, compared, (s) => fundNames.get(s) ?? `Series ${s}`, (s) => pages.has(s));
    console.log(`${m}: ${loaded.get(m)!.size} reports, ${pairs.length} compared`);
  }
  mkdirSync(FUND_HOLDINGS_DIR, { recursive: true });
  for (const f of readdirSync(FUND_HOLDINGS_DIR)) if (/^\d{4}\.json\.gz$/.test(f) && !years.has(f.slice(0, 4))) rmSync(join(FUND_HOLDINGS_DIR, f));
  for (const [y, { nameAt: _, ...body }] of years) {
    const about =
      `Mutual funds' and ETFs' N-PORT holdings changes for the reports of ${y}, from the SEC's Form N-PORT data sets: each fund page's reports with a ` +
      "purchase or sale of half a percent of its net assets or more, its three biggest each way, and each fund's change of 1% or more of a company's " +
      "shares (lib/fundHoldings.ts). The SEC's own work (17 U.S.C. § 105). Written by `npm run sync:nport` (batch 180).";
    writeFileSync(join(FUND_HOLDINGS_DIR, `${y}.json.gz`), gzipSync(Buffer.from(`${JSON.stringify({ about, read: readOn, ...body })}\n`), { level: 9 }));
  }
  console.log(`${reports.length} reports in ${windows.length} zips, ${eff.size} funds, ${pairsRead} pairs compared, ${years.size} years → ${FUND_HOLDINGS_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
