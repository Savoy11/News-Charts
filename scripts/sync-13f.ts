import { appendFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { gzipSync } from "node:zlib";
import index from "../data/edgar-tickers.json";
import aliases from "../data/company-aliases.json";
import { UA } from "../lib/contact";
import { CUSIP_MAP_FILE, type Seen, buildCusipMap, readFailsFile, tickerKey } from "../lib/cusipMap";
import {
  INST_HOLDINGS_DIR,
  MIN_MANAGERS,
  type Holding,
  type Submission,
  comparable,
  dollars,
  effectiveFilings,
  markSuspect,
  pageQuarter,
  previousPeriod,
  quarterRow,
  submissionOf,
} from "../lib/instHoldings";
import { PREDECESSORS } from "../lib/predecessors";
import { eachZipLine, readZip, zipEntryNames } from "../lib/zip";

/**
 * Writes `data/13f/` (batch 179): each listed page's quarters of big investors' 13F holdings changes, 2013 on
 * (`<year>.json.gz`), and the CUSIP map they are read through (`cusips.json.gz`).
 *
 * 1. The SEC's Form 13F data sets, a zip a quarter to 2023 and a zip of three months' filings since (54 on 2026-11-24,
 *    2 to 100 MB): each zip not yet in the cache is read once into its filings (with each summary page's entry count and
 *    confidential flag) and each filing's shares by CUSIP, options and principal amounts left out.
 * 2. The CUSIP map (`lib/cusipMap.ts`): the fails-to-deliver files of each month from June 2012, the second half's, and
 *    for a CUSIP the names refuse, its company's EDGAR former names from data.sec.gov.
 * 3. Each quarter's share counts, from data.sec.gov's XBRL frame of `dei:EntityCommonStockSharesOutstanding`.
 * 4. Every quarter's positions by page and manager, then each pair of quarters (`pageQuarter`).
 *
 * The SEC's hosts are asked with the project's contact, each 1 s apart, a 429 asked once more two minutes later; the cache
 * (`.cache/13f`, about 5 GB, git-ignored) keeps what was read, so a monthly run reads the new zip and the new month. Needs
 * about 8 GB of memory.
 *
 *   npm run sync:13f
 *   npm run sync:13f -- --zips <dir> --ftd <dir> --frames <dir> --read <day>   # reads saved zips, files and frames
 */
const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const cache = arg("--cache") ?? join(__dirname, "..", ".cache", "13f");
const zipsDir = arg("--zips");
const ftdDir = arg("--ftd");
const framesDir = arg("--frames");
const readOn = arg("--read") ?? new Date().toISOString().slice(0, 10);
const FIRST_FAILS = "201206";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const last: Record<string, number> = {};
// data.sec.gov answered 429 to 278 of 840 asks made 0.25 s apart on 2026-11-24: one a second, as www.sec.gov
const GAP: Record<string, number> = { "www.sec.gov": 1_000, "data.sec.gov": 1_000 };

async function get(url: string): Promise<Buffer | null> {
  const host = new URL(url).host;
  const wait = (last[host] ?? 0) + (GAP[host] ?? 1_000) - Date.now();
  if (wait > 0) await sleep(wait);
  let res = await fetch(url, { headers: { ...UA }, signal: AbortSignal.timeout(3_600_000) });
  last[host] = Date.now();
  // the SEC's answer to too many asks: one more, two minutes later
  if (res.status === 429 || res.status === 503) {
    await sleep(120_000);
    res = await fetch(url, { headers: { ...UA }, signal: AbortSignal.timeout(3_600_000) });
    last[host] = Date.now();
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${host} answered ${res.status} for ${new URL(url).pathname}`);
  const body = Buffer.from(await res.arrayBuffer());
  // a transfer cut short keeps the file's head; a compressed answer's length is the compressed body's, which fetch decodes
  const length = Number(res.headers.get("content-length") ?? NaN);
  const encoded = !/^(?:identity)?$/i.test(res.headers.get("content-encoding") ?? "");
  if (!encoded && Number.isFinite(length) && body.length !== length) throw new Error(`${new URL(url).pathname}: ${body.length} of ${length} bytes`);
  return body;
}

async function zipLinks(page: string): Promise<string[]> {
  const html = (await get(page))?.toString("utf8") ?? "";
  return [...new Set([...html.matchAll(/href="([^"]+\.zip)"/g)].map((m) => new URL(m[1], "https://www.sec.gov").href))];
}

const MONTHS: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };
/** "31-JUL-2026" → "2026-07-31". */
const dayOf = (s: string) => {
  const m = /^(\d{2})-([A-Z]{3})-(\d{4})$/.exec(s.trim().toUpperCase());
  return m ? `${m[3]}-${MONTHS[m[2]]}-${m[1]}` : s.trim();
};

/** A zip's table by its own name, at the root or in its one folder ("01JUN2025-31AUG2025_form13f/SUBMISSION.tsv"). */
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

/** Stage 1: a data set zip's filings and each filing's shares by CUSIP, into the cache. */
async function stage1(name: string, buf: Buffer): Promise<void> {
  const out = join(cache, "zips", name);
  mkdirSync(out, { recursive: true });
  const names = zipEntryNames(buf);
  const subs: Record<string, unknown[]> = {};
  await table(buf, names, "SUBMISSION.TSV", (r) => (subs[r.ACCESSION_NUMBER] = [r.CIK.replace(/^0+/, ""), dayOf(r.PERIODOFREPORT), dayOf(r.FILING_DATE), r.SUBMISSIONTYPE]));
  await table(buf, names, "COVERPAGE.TSV", (r) => subs[r.ACCESSION_NUMBER]?.push(r.ISAMENDMENT, r.AMENDMENTTYPE, r.REPORTTYPE, r.FILINGMANAGER_NAME));
  await table(buf, names, "SUMMARYPAGE.TSV", (r) => {
    const s = subs[r.ACCESSION_NUMBER];
    if (s) s.splice(8, 3, Number(r.TABLEENTRYTOTAL) || 0, Number(r.TABLEVALUETOTAL) || 0, (r.ISCONFIDENTIALOMITTED ?? "").trim().toUpperCase());
  });
  // each filing's shares and value by CUSIP, as the filer states them
  const pos = new Map<string, [number, number]>();
  await table(buf, names, "INFOTABLE.TSV", (r) => {
    if ((r.SSHPRNAMTTYPE ?? "").trim().toUpperCase() !== "SH" || (r.PUTCALL ?? "").trim()) return;
    const cusip = (r.CUSIP ?? "").trim().toUpperCase();
    const shares = Number((r.SSHPRNAMT ?? "").replace(/[^\d]/g, ""));
    const value = Number((r.VALUE ?? "").replace(/[^\d]/g, "")) || 0;
    if (!/^[0-9A-Z]{9}$/.test(cusip) || !Number.isFinite(shares)) return;
    const k = `${r.ACCESSION_NUMBER}\t${cusip}`;
    const v = pos.get(k) ?? pos.set(k, [0, 0]).get(k)!;
    v[0] += shares;
    v[1] += value;
  });
  const w = createWriteStream(join(out, "positions.tsv"));
  for (const [k, v] of pos) w.write(`${k}\t${v[0]}\t${v[1]}\n`);
  await new Promise((r) => w.end(r));
  writeFileSync(join(out, "submissions.json"), JSON.stringify(subs));
  writeFileSync(join(out, "done"), `${Object.keys(subs).length} ${pos.size}\n`);
  console.log(`${name}: ${Object.keys(subs).length} filings, ${pos.size} positions`);
}

const companies = (index as unknown as { companies: [number, string, string][] }).companies;

/** Stage 2: the CUSIP map, from the fails-to-deliver files and the companies' names. */
async function cusipMapStage(): Promise<Record<string, string>> {
  const seen = new Map<string, Map<string, Seen>>();
  const files = ftdDir
    ? readdirSync(ftdDir).filter((f) => f.endsWith(".zip")).map((f) => ({ name: f, read: async () => readFileSync(join(ftdDir, f)) }))
    : (await zipLinks("https://www.sec.gov/data-research/sec-markets-data/fails-deliver-data"))
        .filter((u) => (/cnsfails(\d{6})b\.zip$/.exec(u)?.[1] ?? "") >= FIRST_FAILS)
        .map((u) => ({ name: u.split("/").pop()!, read: async () => {
          const held = join(cache, "fails", u.split("/").pop()!);
          if (existsSync(held)) return readFileSync(held);
          const body = await get(u);
          if (!body) throw new Error(`${u} answered 404`);
          mkdirSync(join(cache, "fails"), { recursive: true });
          writeFileSync(held, body);
          return body;
        } }));
  for (const f of files) {
    if (!/cnsfails\d{6}b\.zip$/.test(f.name)) continue;
    const buf = await f.read();
    const [entry] = zipEntryNames(buf);
    readFailsFile(readZip(buf, [entry]).get(entry)!.toString("latin1"), seen);
  }
  const tickers = new Map(companies.map((c) => [tickerKey(c[1]), { ticker: c[1], cik: c[0] }]));
  const names = new Map<number, Set<string>>();
  const add = (cik: number, n: string) => (names.get(cik) ?? names.set(cik, new Set()).get(cik)!).add(n);
  for (const c of companies) add(c[0], c[2]);
  for (const [n, v] of Object.entries((aliases as unknown as { aliases: Record<string, [number, ...unknown[]]> }).aliases)) add(v[0], n);
  for (const [cik, ps] of Object.entries(PREDECESSORS)) for (const p of ps) {
    add(Number(cik), p.name);
    for (const x of (p as { news?: string[] }).news ?? []) add(Number(cik), x);
  }
  // the refused CUSIPs' companies' EDGAR former names, read once each and kept
  const first = buildCusipMap(seen, tickers, (cik) => names.get(cik) ?? []);
  const formerFile = join(cache, "former-names.json");
  const former: Record<string, string[]> = existsSync(formerFile) ? JSON.parse(readFileSync(formerFile, "utf8")) : {};
  for (const cik of new Set(first.refused.map((r) => r.cik))) {
    if (former[cik]) continue;
    const body = await get(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`);
    const j = body ? (JSON.parse(body.toString("utf8")) as { name?: string; formerNames?: { name: string }[] }) : {};
    former[cik] = [j.name ?? "", ...(j.formerNames ?? []).map((f) => f.name)].filter(Boolean);
    writeFileSync(formerFile, JSON.stringify(former));
  }
  for (const [cik, ns] of Object.entries(former)) for (const n of ns) add(Number(cik), n);
  const { map, refused } = buildCusipMap(seen, tickers, (cik) => names.get(cik) ?? []);
  mkdirSync(INST_HOLDINGS_DIR, { recursive: true });
  const about =
    "Each CUSIP the SEC's fails-to-deliver files give (one a month from June 2012, the second half's) to the EDGAR index ticker it last had, where its " +
    "description agrees with that company's names, its EDGAR former names among them (lib/cusipMap.ts). Written by `npm run sync:13f` (batch 179).";
  writeFileSync(CUSIP_MAP_FILE, gzipSync(Buffer.from(`${JSON.stringify({ about, read: readOn, seen: seen.size, refused: refused.length, map })}\n`), { level: 9 }));
  console.log(`${seen.size} CUSIPs seen, ${Object.keys(map).length} mapped, ${refused.length} refused by their names`);
  return map;
}

/** Stage 3: each quarter's share counts, by CIK. */
async function sharesStage(periods: string[]): Promise<Map<string, Map<number, number>>> {
  const out = new Map<string, Map<number, number>>();
  for (const p of periods) {
    const frame = `CY${p.slice(0, 4)}Q${Math.ceil(Number(p.slice(5, 7)) / 3)}I`;
    const held = join(framesDir ?? join(cache, "frames"), `${frame}.json`);
    let text: string | null = existsSync(held) ? readFileSync(held, "utf8") : null;
    if (!text && !framesDir) {
      const body = await get(`https://data.sec.gov/api/xbrl/frames/dei/EntityCommonStockSharesOutstanding/shares/${frame}.json`);
      text = body?.toString("utf8") ?? null;
      if (text) {
        mkdirSync(join(cache, "frames"), { recursive: true });
        writeFileSync(held, text);
      }
    }
    const m = new Map<number, number>();
    for (const r of text ? ((JSON.parse(text) as { data: { cik: number; val: number }[] }).data ?? []) : []) m.set(r.cik, r.val);
    out.set(p, m);
  }
  return out;
}

async function main(): Promise<void> {
  // stage 1: every data set zip, once
  const links = zipsDir ? readdirSync(zipsDir).filter((f) => f.endsWith(".zip")).map((f) => join(zipsDir, f)) : await zipLinks("https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets");
  // the zips of 2026-11-24 are 54; far fewer is a broken answer
  if (links.length < 50) throw new Error(`only ${links.length} 13F data set zips listed`);
  for (const l of links) {
    const name = l.split("/").pop()!.replace(/\.zip$/, "");
    if (existsSync(join(cache, "zips", name, "done"))) continue;
    const buf = zipsDir ? readFileSync(l) : await get(l);
    if (!buf) throw new Error(`${l} answered 404`);
    await stage1(name, buf);
  }
  const map = await cusipMapStage();

  // every filing, and each manager's quarter
  const subs: Submission[] = [];
  const windows = readdirSync(join(cache, "zips")).filter((w) => existsSync(join(cache, "zips", w, "done")));
  for (const w of windows) for (const [a, row] of Object.entries(JSON.parse(readFileSync(join(cache, "zips", w, "submissions.json"), "utf8")) as Record<string, unknown[]>)) subs.push(submissionOf(a, row));
  const eff = effectiveFilings(subs);
  const accessionPeriod = new Map<string, Submission>();
  for (const list of eff.values()) for (const s of list) accessionPeriod.set(s.accession, s);
  const periods = [...new Set([...eff.keys()].map((k) => k.split("|")[1]))].filter((p) => /^\d{4}-(?:03-31|06-30|09-30|12-31)$/.test(p) && p >= "2013-03-31" && p < readOn).sort();

  // every quarter's positions by page and manager, one file a quarter
  const byPeriod = join(cache, "periods");
  rmSync(byPeriod, { recursive: true, force: true });
  mkdirSync(byPeriod, { recursive: true });
  const writers = new Map<string, ReturnType<typeof createWriteStream>>();
  for (const w of windows) {
    const rl = createInterface({ input: createReadStream(join(cache, "zips", w, "positions.tsv")) });
    for await (const line of rl) {
      const [a, cusip, shares, value] = line.split("\t");
      const s = accessionPeriod.get(a);
      const ticker = s && map[cusip];
      if (!ticker) continue;
      const out = writers.get(s.period) ?? writers.set(s.period, createWriteStream(join(byPeriod, `${s.period}.tsv`))).get(s.period)!;
      out.write(`${s.cik}\t${ticker}\t${shares}\t${s.filedOn}\t${a}\t${dollars(Number(value ?? 0), s.filedOn)}\n`);
    }
  }
  await Promise.all([...writers.values()].map((w) => new Promise((r) => w.end(r))));
  const shares = await sharesStage([...new Set([...periods.map(previousPeriod), ...periods])].sort());
  const tickersOf = new Map<number, number>();
  for (const c of companies) tickersOf.set(c[0], (tickersOf.get(c[0]) ?? 0) + 1);
  const cikOf = new Map(companies.map((c) => [c[1], c[0]]));

  async function positions(p: string): Promise<Map<string, Map<string, Holding>>> {
    const out = new Map<string, Map<string, Holding>>();
    const f = join(byPeriod, `${p}.tsv`);
    if (!existsSync(f)) return out;
    const rl = createInterface({ input: createReadStream(f) });
    for await (const line of rl) {
      const [cik, ticker, sh, filedOn, accession, value] = line.split("\t");
      const t = out.get(ticker) ?? out.set(ticker, new Map()).get(ticker)!;
      const h = t.get(cik);
      const amended = !!accessionPeriod.get(accession)?.amendment;
      if (!h) t.set(cik, { shares: Number(sh), value: Number(value) || 0, filedOn, accession, amended });
      else {
        h.shares += Number(sh);
        h.value = (h.value ?? 0) + (Number(value) || 0);
        if (filedOn > h.filedOn) Object.assign(h, { filedOn, accession, amended });
      }
    }
    for (const t of out.values()) markSuspect(t);
    return out;
  }
  const entriesOf = (cik: string, p: string) => (eff.get(`${cik}|${p}`) ?? []).reduce((s, x) => s + x.entries, 0);
  const years = new Map<string, { filers: Set<string>; pages: Record<string, unknown[][]>; periods: string[] }>();
  const filerName = new Map<string, string>();
  for (const s of [...subs].sort((a, b) => a.filedOn.localeCompare(b.filedOn))) if (s.manager) filerName.set(s.cik, s.manager);
  let prev = await positions(previousPeriod(periods[0]));
  for (const p of periods) {
    const cur = await positions(p);
    const q0 = previousPeriod(p);
    const managers = new Map<string, { filedOn: string; accession: string; amended: boolean }>();
    const confidentialNow = new Set<string>();
    const confidentialBefore = new Set<string>();
    for (const [k, list] of eff) {
      const [cik, period] = k.split("|");
      if (period !== p) continue;
      if (!comparable(entriesOf(cik, q0), entriesOf(cik, p))) continue;
      managers.set(cik, { filedOn: list[0].filedOn, accession: list[0].accession, amended: list[0].amendment });
      if (list[0].confidential) confidentialNow.add(cik);
      if ((eff.get(`${cik}|${q0}`) ?? [])[0]?.confidential) confidentialBefore.add(cik);
    }
    // a quarter too few managers can be compared in reads nothing (2013's first two)
    if (managers.size < MIN_MANAGERS) {
      console.log(`${p}: ${managers.size} managers compared, fewer than ${MIN_MANAGERS}: left out`);
      prev = cur;
      continue;
    }
    const year = years.get(p.slice(0, 4)) ?? years.set(p.slice(0, 4), { filers: new Set(), pages: {}, periods: [] }).get(p.slice(0, 4))!;
    year.periods.push(p);
    for (const [ticker, now] of cur) {
      const before = prev.get(ticker);
      if (!before) continue;
      const cik = cikOf.get(ticker);
      const single = cik !== undefined && tickersOf.get(cik) === 1;
      const stated = single ? shares.get(p)?.get(cik) : undefined;
      const statedBefore = single ? shares.get(q0)?.get(cik) : undefined;
      const q = pageQuarter(p, before, now, managers, { sharesOutstanding: stated, sharesBefore: statedBefore, confidentialNow, confidentialBefore });
      if (!q) continue;
      for (const m of [...q.buyers, ...q.sellers, ...q.moves]) year.filers.add(m.filer);
      (year.pages[ticker] ??= []).push(quarterRow(q));
    }
    prev = cur;
    console.log(`${p}: ${cur.size} pages, ${managers.size} managers compared`);
  }
  mkdirSync(INST_HOLDINGS_DIR, { recursive: true });
  for (const f of readdirSync(INST_HOLDINGS_DIR)) if (/^\d{4}\.json\.gz$/.test(f) && !years.has(f.slice(0, 4))) rmSync(join(INST_HOLDINGS_DIR, f));
  for (const [y, body] of years) {
    const about =
      `Big investors' 13F holdings changes for the quarters of ${y}, from the SEC's Form 13F data sets: for each listed page, each quarter's managers, ` +
      "their net change, the three biggest buyers and sellers and every change of 1% or more of the company's shares (lib/instHoldings.ts). The SEC's own " +
      "work (17 U.S.C. § 105). Written by `npm run sync:13f` (batch 179).";
    const filers = Object.fromEntries([...body.filers].sort().map((c) => [c, filerName.get(c) ?? ""]));
    writeFileSync(join(INST_HOLDINGS_DIR, `${y}.json.gz`), gzipSync(Buffer.from(`${JSON.stringify({ about, read: readOn, periods: body.periods, filers, pages: body.pages })}\n`), { level: 9 }));
  }
  appendFileSync(join(cache, "runs.log"), `${new Date().toISOString()} ${periods.length} quarters, ${years.size} years\n`);
  console.log(`${periods.length} quarters, ${periods[0]} to ${periods.at(-1)} → ${INST_HOLDINGS_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
