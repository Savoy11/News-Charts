import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { UA } from "../lib/contact";
import { DATA_COLUMNS, TAA_DATA, TAA_FILE, readTaaPetitions } from "../lib/taaPetitions";

/**
 * Writes `data/taa-certifications.json.gz` (batch 159): the Labor Department's trade adjustment
 * certifications, 1975–2022, from the Employment and Training Administration's petition file on the
 * Department's open-data portal (`TAA_FILE`, one keyless zip of about 48 MB, one request). No petition
 * is decided after 2022-06-30, when the program's authority lapsed, so this is run once, and again only
 * if `check:live` finds a later determination. The file keeps the certifications only (lib/taaPetitions.ts
 * `CERTIFIED`), each as an array of `DATA_COLUMNS`, compressed: 47,628 of them are about 6.4 MB as JSON.
 *
 *   npm run sync:taa                  # asks data.dol.gov once
 *   npm run sync:taa -- --file <path> --read <day> --modified "<Last-Modified>"
 *                                     # reads a saved copy of the zip, as fetched that day
 */
const at = process.argv.indexOf("--file");
const file = at >= 0 ? process.argv[at + 1] : null;
const readOn = process.argv.includes("--read") ? process.argv[process.argv.indexOf("--read") + 1] : new Date().toISOString().slice(0, 10);

async function main(): Promise<void> {
  let zip: Uint8Array;
  let modified = process.argv.includes("--modified") ? process.argv[process.argv.indexOf("--modified") + 1] : "";
  if (file) zip = readFileSync(file);
  else {
    const res = await fetch(TAA_FILE, { headers: { ...UA }, signal: AbortSignal.timeout(300_000) });
    if (!res.ok) throw new Error(`data.dol.gov answered ${res.status}`);
    modified = res.headers.get("last-modified") ?? "";
    zip = new Uint8Array(await res.arrayBuffer());
  }
  const { certifications, petitions, byCode, lastDecided } = readTaaPetitions(zip);
  // the file of 2026-11-18 holds 86,334 petitions and 47,628 certifications; one that reads as far fewer is broken
  if (petitions < 86_000 || certifications.length < 47_000) throw new Error(`only ${certifications.length} certifications of ${petitions} petitions read`);
  const about =
    `The Labor Department's trade adjustment assistance petitions (${TAA_FILE}), its Employment and Training Administration's file: ` +
    "each certification of a whole worker group (codes C, C1, C2 and CU, as the Federal Register lists them), with its firm, division, town, " +
    "product or service, determination day, code, the day separations are covered from and the Department's estimate of the workers. " +
    'The Department\'s terms: "Materials created by the federal government are generally part of the public domain", credited to the U.S. Department of Labor. ' +
    "Written by `npm run sync:taa` (batch 159) for lib/taaPetitions.ts.";
  const body = {
    about,
    read: readOn,
    file: { bytes: zip.byteLength, ...(modified ? { modified } : {}) },
    petitions,
    byCode,
    lastDecided,
    columns: DATA_COLUMNS,
    rows: certifications.map((c) => DATA_COLUMNS.map((k) => c[k])),
  };
  writeFileSync(TAA_DATA, gzipSync(Buffer.from(`${JSON.stringify(body)}\n`), { level: 9 }));
  console.log(`${certifications.length} certifications of ${petitions} petitions, the last decided ${lastDecided} → ${TAA_DATA}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
