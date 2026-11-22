import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { UA } from "../lib/contact";
import { DATA_COLUMNS, FED_H2_DATA, H2_INDEX, type H2Action, KEPT, h2Pdf, indexWeeks, readH2 } from "../lib/fedH2";
import { digestPdfText, havePdfText } from "../lib/secDigest";

/**
 * Writes `data/fed-h2.json.gz` (batch 173): every action of the Board's weekly H.2 release filed under a heading a
 * deal is filed under (`KEPT`), 1996 on, as `readH2` reads the week's PDF with poppler's `pdftotext -layout`. It asks
 * the archive's index once (`H2_INDEX`), then each week's release the file does not hold, one at a time, 1.6 s
 * apart: 1,567 PDFs the first time, about 540 MB, one a week since, so it is run weekly. A week the file holds,
 * one that gives no text among them (a scan, or the damaged file of 2018-05-26), is never asked again; a transfer
 * cut short is not held, nor a week whose text gives no action, a layout `readH2` does not know (batch 175). Needs
 * `pdftotext` on the host.
 *
 *   npm run sync:fed-h2                                 # asks www.federalreserve.gov
 *   npm run sync:fed-h2 -- --index <file> --dir <dir> --read <day>
 *                                                       # reads a saved index and saved releases (<YYYYMMDD>.pdf)
 */
const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const indexFile = arg("--index");
const dir = arg("--dir");
const readOn = arg("--read") ?? new Date().toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let asked = 0;

async function get(url: string): Promise<Buffer> {
  if (asked++) await sleep(1_600);
  const res = await fetch(url, { headers: { ...UA }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status} for ${new URL(url).pathname}`);
  const body = Buffer.from(await res.arrayBuffer());
  // a transfer cut short keeps the file's head and loses its end: such a week is not held, and is asked next run; a
  // compressed answer's length is the compressed body's, which fetch has decoded
  const length = Number(res.headers.get("content-length") ?? NaN);
  const encoded = !/^(?:identity)?$/i.test(res.headers.get("content-encoding") ?? "");
  if (!encoded && Number.isFinite(length) && body.length !== length) throw new Error(`${new URL(url).pathname}: ${body.length} of ${length} bytes`);
  return body;
}

interface FileBody {
  weeks: string[];
  unread: string[];
  rows: unknown[][];
}

async function main(): Promise<void> {
  if (!(await havePdfText())) throw new Error("pdftotext is not installed (poppler-utils), so no release can be read");
  const held: FileBody = existsSync(FED_H2_DATA) ? JSON.parse(gunzipSync(readFileSync(FED_H2_DATA)).toString("utf8")) : { weeks: [], unread: [], rows: [] };
  const weeks = indexWeeks(indexFile ? readFileSync(indexFile, "utf8") : (await get(H2_INDEX)).toString("utf8"));
  // the index of 2026-11-22 lists 1,567 weeks from 1996-11-02; far fewer is a page that changed
  if (weeks.length < 1_500 || weeks[0] !== "19961102") throw new Error(`the index lists ${weeks.length} weeks from ${weeks[0]}`);
  const have = new Set(held.weeks);
  const unread = new Set(held.unread);
  const rows = [...held.rows];
  let read = 0;
  let unsplit = 0;
  for (const week of weeks) {
    if (have.has(week)) continue;
    const pdf = dir ? (existsSync(join(dir, `${week}.pdf`)) ? readFileSync(join(dir, `${week}.pdf`)) : null) : await get(h2Pdf(week));
    if (!pdf) throw new Error(`no copy of the week ending ${week}`);
    if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error(`the week ending ${week}: not a PDF`);
    const { actions, scanned: scan, unsplit: lost } = readH2(await digestPdfText(pdf), week);
    // a week that gives text and no action under any heading is a layout readH2 does not know: never held, so the run fails (batch 175)
    if (!scan && !actions.length) throw new Error(`the week ending ${week} gives text but no action: a layout readH2 does not read`);
    if (scan) unread.add(week);
    unsplit += lost.length;
    for (const a of actions) if ((KEPT as readonly string[]).includes(a.category)) rows.push(DATA_COLUMNS.map((k) => (k === "board" ? (a.board ? 1 : 0) : a[k as keyof H2Action])));
    have.add(week);
    read++;
  }
  const all = [...have].sort();
  const about =
    "The Federal Reserve's actions on applications filed under the headings a deal is filed under, from the Board's weekly release " +
    `H.2, "Actions of the Board, Its Staff, and the Federal Reserve Banks" (${H2_INDEX}), each week's PDF read once with pdftotext -layout: ` +
    "each action's week, place in its release, day, whether the Board took it or its staff or a Reserve Bank under delegated authority, " +
    "who, its heading, outcome, and its text before and after the dash. The weeks listed as unread give pdftotext no text: the scans of 1996–1997, and the week of 2018-05-26, whose file the Board serves damaged. " +
    'The Board\'s website notice: "information on Board\'s website is in the public domain and may be copied and distributed without permission. ' +
    'Please cite to the Board as the source of the information." Written by `npm run sync:fed-h2` (batch 173) for lib/fedH2.ts.';
  const body = { about, read: readOn, weeks: all, unread: [...unread].sort(), columns: DATA_COLUMNS, rows };
  writeFileSync(FED_H2_DATA, gzipSync(Buffer.from(`${JSON.stringify(body)}\n`), { level: 9 }));
  console.log(`${read} weeks read (${unread.size} unread), ${rows.length} actions under the kept headings, ${unsplit} entries not split → ${FED_H2_DATA}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
