import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { UA } from "../lib/contact";
import { OTS_FILE, readOtsOrders } from "../lib/otsOrders";

/**
 * Writes `data/ots-orders.json` (batch 154): the Office of Thrift Supervision's enforcement orders
 * against institutions, 1989–2011, from the archive workbook the OCC keeps (`OTS_FILE`, about 560 KB,
 * one request). The archive is closed — the OTS was merged into the OCC on 2011-07-21 — so this is
 * run once, and again only if the OCC changes the file.
 *
 *   npm run sync:ots-orders                  # asks occ.gov once
 *   npm run sync:ots-orders -- --file <path> # reads a saved copy of the workbook
 */
const OUT = join(__dirname, "..", "data", "ots-orders.json");
const at = process.argv.indexOf("--file");
const file = at >= 0 ? process.argv[at + 1] : null;
const readOn = process.argv.includes("--read") ? process.argv[process.argv.indexOf("--read") + 1] : new Date().toISOString().slice(0, 10);

async function main(): Promise<void> {
  let workbook: Uint8Array;
  if (file) workbook = readFileSync(file);
  else {
    const res = await fetch(OTS_FILE, { headers: { ...UA }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`occ.gov answered ${res.status}`);
    workbook = new Uint8Array(await res.arrayBuffer());
  }
  const { orders, records, persons } = readOtsOrders(workbook);
  // the archive of 2014 holds 3,547 records, 1,497 against institutions; one that reads as far fewer is broken
  if (records < 3_500 || orders.length < 1_450) throw new Error(`only ${orders.length} institution orders of ${records} records read`);
  const about =
    `The OTS Enforcement Order Archive the OCC keeps (${OTS_FILE}): each order against an institution, with its docket, number, day issued, kind, ` +
    `the institution's town, its file on occ.gov and the archive's note; ${persons} orders against persons left out. A federal agency's own work (17 U.S.C. § 105). ` +
    "Written by `npm run sync:ots-orders` (batch 154) for lib/otsOrders.ts.";
  writeFileSync(OUT, `${JSON.stringify({ about, read: readOn, records, persons, orders }, null, 0)}\n`);
  console.log(`${orders.length} institution orders of ${records} records → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
