import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { UA } from "../lib/contact";
import { havePdfText } from "../lib/secDigest";
import {
  CASE_COLUMNS,
  FIRST_SLIP_TERM,
  FIRST_VOLUME,
  LAST_VOLUME,
  type ScCase,
  SUPREME_COURT_DATA,
  caseHead,
  caseParties,
  corporateParty,
  expandAbbreviations,
  slipCases,
  slipList,
  volumeCases,
  volumeRecord,
} from "../lib/supremeCourt";

/**
 * Writes `data/supreme-court.json.gz` (batch 176): every case of the U.S. Reports volumes 368 on that govinfo holds, from
 * each volume's record, and every opinion of the Court's slip lists from the 2018 term, with each case's day and
 * disposition. A case the record gives no day (the older volumes' per curiam dispositions, volumes 585–586) and every
 * slip opinion, where a party can be a company (`corporateParty` on either side, as printed or with the Reports'
 * abbreviations read), has its PDF's first pages read once with pdftotext (`caseHead`); a case the file holds read is
 * never asked again. govinfo is asked 3 s apart (it answered 503 at 1.6 s), the Court 2 s apart (its robots.txt asks 1
 * s). About 220 records and 2,500 PDFs the first time, so it runs for hours; then a volume or two a year and the
 * current term's list, so it is run monthly. Needs `pdftotext` on the host.
 *
 *   npm run sync:supreme-court                                   # asks www.govinfo.gov and www.supremecourt.gov
 *   npm run sync:supreme-court -- --dir <dir> --read <day>       # reads saved copies: mods/<volume>.xml, slip/<term>.html,
 *                                                                #   heads/<case id>.txt (a PDF's first pages as pdftotext gives them)
 */
const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const dir = arg("--dir");
const readOn = arg("--read") ?? new Date().toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const last: Record<string, number> = {};
const GAP: Record<string, number> = { "www.govinfo.gov": 3_000, "www.supremecourt.gov": 2_000 };

async function get(url: string): Promise<Buffer | null> {
  const host = new URL(url).host;
  const wait = (last[host] ?? 0) + (GAP[host] ?? 2_000) - Date.now();
  if (wait > 0) await sleep(wait);
  // a volume govinfo does not hold answers 302 to an error page: not followed, so it reads as not held
  let res = await fetch(url, { headers: { ...UA }, redirect: "manual", signal: AbortSignal.timeout(180_000) });
  last[host] = Date.now();
  // govinfo answers 503 "Please Retry later in 15 Seconds" to a run of requests: one more ask, 30 s later
  if (res.status === 503 || res.status === 429) {
    await sleep(30_000);
    res = await fetch(url, { headers: { ...UA }, redirect: "manual", signal: AbortSignal.timeout(180_000) });
    last[host] = Date.now();
  }
  if (res.status === 404 || (res.status >= 300 && res.status < 400)) return null;
  if (!res.ok) throw new Error(`${host} answered ${res.status} for ${new URL(url).pathname}`);
  const body = Buffer.from(await res.arrayBuffer());
  // a transfer cut short keeps the file's head; a compressed answer's length is the compressed body's, which fetch decodes
  const length = Number(res.headers.get("content-length") ?? NaN);
  const encoded = !/^(?:identity)?$/i.test(res.headers.get("content-encoding") ?? "");
  if (!encoded && Number.isFinite(length) && body.length !== length) throw new Error(`${new URL(url).pathname}: ${body.length} of ${length} bytes`);
  return body;
}

/** Pages of a PDF as pdftotext gives them, without layout. */
function pdfPages(pdf: Buffer, first: number, lastPage: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile("pdftotext", ["-f", String(first), "-l", String(lastPage), "-enc", "UTF-8", "-", "-"], { maxBuffer: 32 << 20, encoding: "utf8" }, (err, stdout) =>
      err ? reject(err) : resolve(stdout),
    );
    child.stdin?.end(pdf);
  });
}

/** The term the Court sits in on a day: October to the next September. */
const termOf = (day: string) => Number(day.slice(2, 4)) - (Number(day.slice(5, 7)) >= 10 ? 0 : 1);

/** Whether a case's PDF is read for its day or disposition: a party can be a company, as printed or with the abbreviations read. */
export const wanted = (c: ScCase) => (c.from === "slip" || !c.day) && caseParties(c.title).some((p) => corporateParty(p.name) || corporateParty(expandAbbreviations(p.name)));

async function main(): Promise<void> {
  if (!(await havePdfText())) throw new Error("pdftotext is not installed (poppler-utils), so no case's PDF can be read");
  const held = existsSync(SUPREME_COURT_DATA) ? (JSON.parse(gunzipSync(readFileSync(SUPREME_COURT_DATA)).toString("utf8")) as { cases: unknown[][]; volumes: number[]; terms: number[] }) : { cases: [], volumes: [], terms: [] };
  const heldCases = new Map(held.cases.map((r) => [String(r[0]), Object.fromEntries(CASE_COLUMNS.map((k, i) => [k, r[i] ?? null])) as unknown as ScCase]));
  const cases: ScCase[] = [];
  const volumes: number[] = [];
  const missing: number[] = [];
  // the volumes to the newest govinfo holds, and any it has added since
  for (let v = FIRST_VOLUME; v <= LAST_VOLUME + 3; v++) {
    const xml = dir ? (existsSync(join(dir, "mods", `${v}.xml`)) ? readFileSync(join(dir, "mods", `${v}.xml`), "utf8") : null) : (await get(volumeRecord(v)))?.toString("utf8") ?? null;
    if (!xml) {
      if (v <= LAST_VOLUME) missing.push(v);
      continue;
    }
    const found = volumeCases(xml, v);
    if (!found.length) throw new Error(`volume ${v}'s record lists no case: a layout this reader does not know`);
    volumes.push(v);
    cases.push(...found);
  }
  // the volume records of 2026-11-22 list about 11,000 cases; far fewer is a broken answer
  if (volumes.length < 200) throw new Error(`only ${volumes.length} volumes read (${missing.length} missing)`);
  // a volume the file holds that govinfo did not serve this run is a failed answer, not a volume gone (batch 184, the
  // audit's finding 8): the file is left as it was, as ingest would take its cases off every page
  const lost = (held.volumes ?? []).filter((v) => !volumes.includes(v));
  if (lost.length) throw new Error(`volume${lost.length > 1 ? "s" : ""} ${lost.join(", ")}, which the file holds, not served: the file is left as it was`);
  const terms: number[] = [];
  for (let t = FIRST_SLIP_TERM; t <= termOf(readOn); t++) {
    const html = dir ? (existsSync(join(dir, "slip", `${t}.html`)) ? readFileSync(join(dir, "slip", `${t}.html`), "utf8") : null) : (await get(slipList(t)))?.toString("utf8") ?? null;
    if (!html) throw new Error(`no slip list of the ${t} term`);
    const found = slipCases(html, t);
    // a term just begun lists few opinions; a term past lists 50 or more
    if (!found.length && t < termOf(readOn)) throw new Error(`the ${t} term's list gives no opinion: a layout this reader does not know`);
    terms.push(t);
    cases.push(...found);
  }
  // each wanted case's PDF, once: its first pages, or the page a preliminary print's link points to
  const prints = new Map<string, Buffer | null>();
  let fresh = 0;
  for (const c of cases) {
    const before = heldCases.get(c.id);
    if (before?.read === "pdf") {
      c.day ??= before.day;
      c.disposition ??= before.disposition;
      c.read = "pdf";
      continue;
    }
    if (!wanted(c)) continue;
    let text: string | null = null;
    if (dir) {
      const f = join(dir, "heads", `${c.id}.txt`);
      text = existsSync(f) ? readFileSync(f, "utf8") : null;
    } else {
      const [url, anchor] = c.pdf.split("#page=");
      const page = anchor ? Number(anchor) : 1;
      if (!prints.has(url)) prints.set(url, await get(url));
      const pdf = prints.get(url);
      if (pdf) text = await pdfPages(pdf, page, page + (anchor ? 4 : 3));
      // a preliminary print is one file for many cases; a case's own PDF is read once
      if (!anchor) prints.delete(url);
    }
    if (text === null) continue;
    const head = caseHead(text, c.title);
    if (c.from === "reports") c.day ??= head.day;
    c.disposition ??= head.disposition;
    c.read = "pdf";
    fresh++;
  }
  const about =
    "The Supreme Court of the United States's decisions, 1962 on: every case of the U.S. Reports volumes 368 on that the Government Publishing Office's govinfo holds " +
    "(USREPORTS), from each volume's record, and every opinion of the Court's slip-opinion lists from the 2018 term (www.supremecourt.gov/opinions/slipopinion/<yy>), " +
    "each with its name, citation, day, disposition, kind, how it came to the Court, docket number and PDF; a case the record gives no day, and a slip opinion, " +
    "whose name gives a party that can be a company, with the day and disposition its PDF's first pages print. govinfo's policies: \"public documents can generally " +
    "be reprinted without legal restriction\"; the Court's site states no licence for its own pages. Written by `npm run sync:supreme-court` (batch 176) for lib/supremeCourt.ts.";
  const body = {
    about,
    read: readOn,
    volumes,
    missing,
    terms,
    columns: CASE_COLUMNS,
    cases: cases.map((c) => CASE_COLUMNS.map((k) => c[k])),
  };
  writeFileSync(SUPREME_COURT_DATA, gzipSync(Buffer.from(`${JSON.stringify(body)}\n`), { level: 9 }));
  console.log(`${volumes.length} volumes (${missing.length} missing), ${terms.length} terms, ${cases.length} cases, ${cases.filter((c) => c.day).length} dated, ${fresh} PDFs read now → ${SUPREME_COURT_DATA}`);
}

if (require.main === module)
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
