import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { UA } from "../lib/contact";
import { DRUGSFDA_ENTRY, DRUGSFDA_FILE, readSupplements } from "../lib/fdaSupplements";
import { readZip } from "../lib/zip";

/**
 * Writes `data/fda-supplements.json` (batch 115): the approved efficacy supplements of every
 * application in the FDA's new-drug compilation (`data/fda-nme-approvals.json`), with today's sponsor
 * of each, from Drugs@FDA as openFDA publishes it (`DRUGSFDA_FILE`, a zip of about 9 MB, one
 * request; openFDA refreshes it weekly). Run it monthly, and after `npm run sync:fda-approvals`, so
 * each new approval's supplements follow.
 *
 *   npm run sync:fda-supplements                  # asks download.open.fda.gov once
 *   npm run sync:fda-supplements -- --file <path> # reads a saved copy of the zip
 */
const OUT = join(__dirname, "..", "data", "fda-supplements.json");
const at = process.argv.indexOf("--file");
const file = at >= 0 ? process.argv[at + 1] : null;
const readOn = process.argv.includes("--read") ? process.argv[process.argv.indexOf("--read") + 1] : new Date().toISOString().slice(0, 10);

async function main(): Promise<void> {
  let zip: Uint8Array;
  if (file) zip = readFileSync(file);
  else {
    const res = await fetch(DRUGSFDA_FILE, { headers: { ...UA }, signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`download.open.fda.gov answered ${res.status}`);
    zip = new Uint8Array(await res.arrayBuffer());
  }
  const entry = readZip(zip, [DRUGSFDA_ENTRY]).get(DRUGSFDA_ENTRY);
  if (!entry) throw new Error(`the zip holds no ${DRUGSFDA_ENTRY}`);
  const parsed = JSON.parse(entry.toString("utf8")) as { meta?: { last_updated?: string }; results?: unknown[] };
  const results = parsed.results ?? [];
  // the file of 2026-11-06 holds 29,446 applications; one that reads as far fewer is broken, not smaller
  if (results.length < 25_000) throw new Error(`only ${results.length} applications read`);
  const applications = readSupplements(results as Parameters<typeof readSupplements>[0]);
  const supplements = applications.reduce((n, a) => n + a.supplements.length, 0);
  // …and of the compilation's applications, 3,132 efficacy supplements then
  if (supplements < 3_000) throw new Error(`only ${supplements} efficacy supplements read`);
  const about =
    `Drugs@FDA as openFDA publishes it (${DRUGSFDA_FILE}, last updated ${parsed.meta?.last_updated ?? "unknown"}): ` +
    "for each application of the FDA's new-drug compilation, today's sponsor and each approved efficacy supplement's number, day, review, orphan mark and letter. " +
    "Public domain, CC0 1.0 (open.fda.gov/license). Written by `npm run sync:fda-supplements` (batch 115) for lib/fdaSupplements.ts.";
  writeFileSync(OUT, `${JSON.stringify({ about, read: readOn, updated: parsed.meta?.last_updated ?? null, applications }, null, 0)}\n`);
  console.log(`${supplements} efficacy supplements on ${applications.length} applications → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
