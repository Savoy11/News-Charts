import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import tickerIndex from "../data/edgar-tickers.json";
import { UA } from "../lib/contact";
import { dojPossessive } from "../lib/doj";
import { withoutTag } from "../lib/edgarName";
import { approvalIsCompany } from "../lib/fdaApprovals";
import { CLEARANCE_COLUMNS, FDA_510K_ENTRY, FDA_510K_FILE, FDA_CLEARANCES_DATA, type FdaClearance, candidatesFor, clearanceReader } from "../lib/fdaClearances";
import { companyNames } from "../lib/frCompany";
import { namesForYear } from "../lib/ingest/frBackfill";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
import { eachZipLine } from "../lib/zip";

/**
 * Writes `data/fda-clearances.json.gz` (batch 172): the FDA's 510(k) clearances and De Novo grants that a company
 * in the index holds by the approvals' rule on their day (`approvalIsCompany`), from openFDA's `device/510k` file
 * (`FDA_510K_FILE`, one keyless zip of about 250 MB, one request), streamed a line at a time and never parsed whole.
 * A company's candidates are the decisions whose applicant holds the first word of one of its names or firms, or
 * that a firm's own pattern matches; the rule decides. The namesakes read by hand (`NOT_THE_COMPANY`) are applied at
 * ingest, so the file keeps them. Run monthly, and again after `npm run sync:tickers`.
 *
 *   npm run sync:fda-clearances                     # asks download.open.fda.gov once
 *   npm run sync:fda-clearances -- --file <path> --read <day>
 *                                                   # reads a saved copy of the zip, as fetched that day
 */
const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const file = arg("--file");
const readOn = arg("--read") ?? new Date().toISOString().slice(0, 10);

const companies = (tickerIndex as unknown as { companies: [number, string, string][] }).companies;

async function main(): Promise<void> {
  const zip = file
    ? readFileSync(file)
    : await (async () => {
        const res = await fetch(FDA_510K_FILE, { headers: { ...UA }, signal: AbortSignal.timeout(900_000) });
        if (!res.ok) throw new Error(`download.open.fda.gov answered ${res.status}`);
        return new Uint8Array(await res.arrayBuffer());
      })();
  const all: FdaClearance[] = [];
  const reader = clearanceReader((c) => all.push(c));
  await eachZipLine(zip, FDA_510K_ENTRY, reader.line);
  const { lastUpdated, total } = reader.meta();
  // the file of 2026-11-22 holds 176,683 decisions; far fewer is a broken read
  if (all.length < 170_000 || (total !== null && all.length !== total)) throw new Error(`${all.length} decisions read of ${total}`);

  const kept = new Set<FdaClearance>();
  const seen = new Set<number>();
  for (const [cik, , title] of companies) {
    if (seen.has(cik)) continue;
    seen.add(cik);
    const own = dojPossessive(title, possessiveNameFor(cik));
    const namesIn = (year: number) => [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)];
    for (const c of candidatesFor(all, cik, namesIn)) if (!kept.has(c) && approvalIsCompany(c, cik, namesIn)) kept.add(c);
  }
  const rows = [...kept].sort((a, b) => a.day.localeCompare(b.day) || a.k.localeCompare(b.k));
  const about =
    `The FDA's 510(k) clearances and De Novo grants (${FDA_510K_FILE}, openFDA's device/510k file, last updated ${lastUpdated}): ` +
    "the decisions whose applicant a company in the index holds by the approvals' rule on the decision's day, each with its number, day, " +
    "applicant as filed, device name, product code and decision code. openFDA's content is public domain under CC0 1.0. " +
    "Written by `npm run sync:fda-clearances` (batch 172) for lib/fdaClearances.ts.";
  const body = { about, read: readOn, lastUpdated, total: all.length, columns: CLEARANCE_COLUMNS, rows: rows.map((c) => CLEARANCE_COLUMNS.map((k) => c[k])) };
  writeFileSync(FDA_CLEARANCES_DATA, gzipSync(Buffer.from(`${JSON.stringify(body)}\n`), { level: 9 }));
  console.log(`${all.length} decisions, ${rows.length} a listed company holds → ${FDA_CLEARANCES_DATA}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
