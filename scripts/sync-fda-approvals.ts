import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { UA } from "../lib/contact";
import { NME_FILE, NME_PAGE, readApprovals } from "../lib/fdaApprovals";

/**
 * Writes `data/fda-nme-approvals.json` (batch 105): every new drug and new therapeutic biologic the
 * FDA's drug centre approved from 1985, from its compilation workbook (`NME_FILE`, about 300 KB, one
 * request). The FDA adds a year's approvals in the spring; run it then.
 *
 *   npm run sync:fda-approvals                  # asks www.fda.gov once
 *   npm run sync:fda-approvals -- --file <path> # reads a saved copy of the workbook
 */
const OUT = join(__dirname, "..", "data", "fda-nme-approvals.json");
const at = process.argv.indexOf("--file");
const file = at >= 0 ? process.argv[at + 1] : null;
const readOn = process.argv.includes("--read") ? process.argv[process.argv.indexOf("--read") + 1] : new Date().toISOString().slice(0, 10);

async function main(): Promise<void> {
  let workbook: Uint8Array;
  if (file) workbook = readFileSync(file);
  else {
    const res = await fetch(NME_FILE, { headers: { ...UA }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`www.fda.gov answered ${res.status}`);
    workbook = new Uint8Array(await res.arrayBuffer());
  }
  const approvals = readApprovals(workbook);
  // the workbook of 2026 holds 1,387; one that reads as far fewer is broken, not a smaller list
  if (approvals.length < 1_300) throw new Error(`only ${approvals.length} approvals read`);
  const about =
    `CDER's Compilation of New Molecular Entity (NME) Drug and New Biologic Approvals (${NME_PAGE}), its workbook ${NME_FILE}: ` +
    "each approval's day, names, applicant as the approval letter names it, application, indication and review. Public domain (FDA website policies). " +
    "Written by `npm run sync:fda-approvals` (batch 105) for lib/fdaApprovals.ts.";
  writeFileSync(OUT, `${JSON.stringify({ about, read: readOn, approvals }, null, 0)}\n`);
  console.log(`${approvals.length} approvals, ${approvals[0].day} to ${approvals.at(-1)!.day} → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
