import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import tickerIndex from "../data/edgar-tickers.json";
import { UA } from "../lib/contact";
import { PREDECESSORS } from "../lib/predecessors";
import { FIRST_QUARTERS, companyIndexUrl, firstNamesIn, parseCompanyIndex } from "../lib/secDigest";
import { readZip } from "../lib/zip";

/**
 * Writes `data/digest-records.json` (batch 102): what each listed company's EDGAR record was called
 * in EDGAR's first years, the dates the SEC News Digest's names are matched under. From EDGAR's
 * sixteen company indexes of 1993–1996 (one zip a quarter, ~10 MB in all), for every company in
 * `data/edgar-tickers.json` and every predecessor `lib/predecessors.ts` maps:
 *
 *  - `firstFiled`: its first filing in them;
 *  - `firstNames`: the names it filed under in its first quarter (`firstNamesIn`), its names before EDGAR;
 *  - `names`: each name it filed under, with the first and last day it did.
 *
 * A record missing from all sixteen is one EDGAR opened after its phase-in, which has no name before
 * 1997 (`namesInUse`), so it is left out. Run after `npm run sync:tickers`.
 *
 *   npm run sync:digest-records                 # asks www.sec.gov, 16 requests a second apart (needs NEWS_CHARTS_CONTACT)
 *   npm run sync:digest-records -- --dir <path> # reads saved zips, <path>/company-1993Q1.zip …
 */
const OUT = join(__dirname, "..", "data", "digest-records.json");
const dir = process.argv.includes("--dir") ? process.argv[process.argv.indexOf("--dir") + 1] : null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function quarter(q: { year: number; quarter: number }): Promise<string> {
  let zip: Uint8Array;
  if (dir) zip = readFileSync(join(dir, `company-${q.year}Q${q.quarter}.zip`));
  else {
    await sleep(1_000);
    const res = await fetch(companyIndexUrl(q), { headers: { ...UA }, signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`${q.year} Q${q.quarter}: EDGAR answered ${res.status}`);
    zip = new Uint8Array(await res.arrayBuffer());
  }
  const file = readZip(zip, ["company.idx"]).get("company.idx");
  if (!file) throw new Error(`${q.year} Q${q.quarter}: no company.idx in the zip`);
  return Buffer.from(file).toString("latin1");
}

async function main(): Promise<void> {
  const wanted = new Set<number>([
    ...(tickerIndex.companies as [number, string, string][]).map(([cik]) => cik),
    ...Object.values(PREDECESSORS).flatMap((list) => list.map((p) => p.cik)),
  ]);
  const quarters: { name: string; cik: number; filed: string }[][] = [];
  for (const q of FIRST_QUARTERS) {
    const all = parseCompanyIndex(await quarter(q));
    // 1993's first quarter holds EDGAR's test filers alone; an index that parses to nothing at all is broken
    if (!all.length) throw new Error(`${q.year} Q${q.quarter}: the index has no rows`);
    const rows = all.filter((r) => wanted.has(r.cik));
    quarters.push(rows);
    console.log(`${q.year} Q${q.quarter}: ${rows.length} filings by listed companies and their predecessors`);
  }
  if (quarters.flat().length < 10_000) throw new Error(`only ${quarters.flat().length} filings by listed companies in sixteen quarters`);
  const first = firstNamesIn(quarters);
  const spans = new Map<number, Map<string, { from: string; to: string }>>();
  for (const r of quarters.flat()) {
    const names = spans.get(r.cik) ?? spans.set(r.cik, new Map()).get(r.cik)!;
    const s = names.get(r.name);
    if (!s) names.set(r.name, { from: r.filed, to: r.filed });
    else {
      if (r.filed < s.from) s.from = r.filed;
      if (r.filed > s.to) s.to = r.filed;
    }
  }
  const records: Record<string, { firstFiled: string; firstNames: string[]; names: [string, string, string][] }> = {};
  for (const cik of [...spans.keys()].sort((a, b) => a - b)) {
    const names = [...spans.get(cik)!].sort((a, b) => a[1].from.localeCompare(b[1].from) || a[0].localeCompare(b[0]));
    records[cik] = { firstFiled: names[0][1].from, firstNames: first.get(cik) ?? [], names: names.map(([n, s]) => [n, s.from, s.to]) };
  }
  const about =
    "What each listed company's EDGAR record (and each predecessor lib/predecessors.ts maps) was called in EDGAR's company indexes of 1993–1996, " +
    "www.sec.gov/Archives/edgar/full-index/YYYY/QTRn/company.zip: its first filing, its first quarter's names and each name's first and last day. " +
    "Written by `npm run sync:digest-records` (batch 102) for the SEC News Digest's dated names (lib/secDigest.ts).";
  writeFileSync(OUT, `${JSON.stringify({ about, read: new Date().toISOString().slice(0, 10), records })}\n`);
  console.log(`${Object.keys(records).length} records of ${wanted.size} companies and predecessors → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
