import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { UA } from "../lib/contact";
import {
  type DecisionKind,
  EU_ANTITRUST_DATA,
  FIRST_YEAR,
  LIST_COLUMNS,
  TEXT_COLUMNS,
  addresseeExcerpt,
  decisionQueryUrl,
  isDecisionTitle,
  isStateAidTitle,
} from "../lib/euAntitrust";
import { type EuListed, cellarWork, listedNotices, noticeText } from "../lib/euMergers";
import { digestPdfText, havePdfText } from "../lib/secDigest";

/**
 * Writes `data/eu-antitrust.json.gz` (batch 177): every antitrust and cartel decision "relating to a proceeding" the
 * Official Journal printed in English, 1973 on (its English edition's first year), and every State aid notice and decision whose title names an aid's
 * beneficiary, from the Publications Office's SPARQL endpoint asked year by year (`decisionQueryUrl`, two queries a year),
 * and the text of each decision the file does not hold, from CELLAR (`cellarWork`), one at a time, 1.6 s apart: its
 * XHTML, else its HTML, else its PDF (needs pdftotext). Of each text the file keeps its addressee and fine passages
 * (`addresseeExcerpt`), which the module reads at load. About 880 texts the first time, a few a month since, so it is run
 * monthly. A State aid title is read by its title alone. A year's list never shorter than the file's: a list the endpoint
 * answers short, or not at all, ends the run with the file as it was.
 *
 *   npm run sync:eu-antitrust                                 # asks publications.europa.eu
 *   npm run sync:eu-antitrust -- --lists <dir> --dir <dir> --read <day>
 *                                                             # reads saved year lists (<kind>-<year>.json) and texts (<work>.xhtml|.html|.pdf)
 */
const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const lists = arg("--lists");
const dir = arg("--dir");
const readOn = arg("--read") ?? new Date().toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let asked = 0;

async function get(url: string, accept: string): Promise<Buffer | null> {
  if (asked++) await sleep(1_600);
  const res = await fetch(url, { headers: { ...UA, Accept: accept, "Accept-Language": "eng" }, signal: AbortSignal.timeout(180_000) });
  // a decision CELLAR holds in no such format answers 404, and is not asked in another
  if (res.status === 404) return null;
  // one held as a document and its metadata answers 300 with both; the document is the first item ("…/DOC_1")
  if (res.status === 300) {
    const doc = /href="(https?:\/\/publications\.europa\.eu\/resource\/cellar\/[^"]+\/DOC_1)"/.exec(await res.text())?.[1];
    if (!doc) throw new Error(`${new URL(url).pathname}: a choice of documents with no first item`);
    return get(doc, accept);
  }
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status} for ${new URL(url).pathname}`);
  const body = Buffer.from(await res.arrayBuffer());
  // a transfer cut short keeps the file's head; a compressed answer's length is the compressed body's, which fetch decodes
  const length = Number(res.headers.get("content-length") ?? NaN);
  const encoded = !/^(?:identity)?$/i.test(res.headers.get("content-encoding") ?? "");
  if (!encoded && Number.isFinite(length) && body.length !== length) throw new Error(`${new URL(url).pathname}: ${body.length} of ${length} bytes`);
  return body;
}

async function year(kind: DecisionKind, y: number): Promise<EuListed[]> {
  if (lists) {
    const f = join(lists, `${kind}-${y}.json`);
    if (!existsSync(f)) throw new Error(`no saved list ${kind}-${y}`);
    return listedNotices(JSON.parse(readFileSync(f, "utf8")));
  }
  const body = await get(decisionQueryUrl(kind, y), "application/sparql-results+json");
  if (!body) throw new Error(`the endpoint answered 404 for the ${kind} list of ${y}`);
  return listedNotices(JSON.parse(body.toString("utf8")));
}

/** A decision's text: its XHTML, else its HTML, else its PDF read with pdftotext. */
async function text(n: EuListed): Promise<string | null> {
  const kind = n.types.includes("xhtml") ? "xhtml" : n.types.includes("html") ? "html" : n.types.includes("pdfa1b") ? "pdfa1b" : n.types.includes("pdf") ? "pdf" : null;
  if (!kind) return null;
  const ext = kind === "pdfa1b" ? "pdf" : kind;
  if (dir) {
    const f = join(dir, `${n.work}.${ext}`);
    if (!existsSync(f)) return null;
    return ext === "pdf" ? noticeText(await digestPdfText(readFileSync(f)), "pdf") : noticeText(readFileSync(f, "utf8"), "xhtml");
  }
  const accept = { xhtml: "application/xhtml+xml", html: "text/html", pdfa1b: "application/pdf;type=pdfa1b", pdf: "application/pdf" }[kind];
  const body = await get(cellarWork(n.work), accept);
  if (!body) return null;
  return ext === "pdf" ? noticeText(await digestPdfText(body), "pdf") : noticeText(body.toString("utf8"), "xhtml");
}

interface Held {
  read?: string;
  antitrust: unknown[][];
  stateaid: unknown[][];
  texts: unknown[][];
}

async function main(): Promise<void> {
  if (!(await havePdfText())) throw new Error("pdftotext is not installed (poppler-utils), so no older decision can be read");
  const held: Held = existsSync(EU_ANTITRUST_DATA) ? JSON.parse(gunzipSync(readFileSync(EU_ANTITRUST_DATA)).toString("utf8")) : { antitrust: [], stateaid: [], texts: [] };
  const heldIn = (rows: unknown[][], y: number) => rows.filter((r) => String(r[1]).startsWith(`${y}-`)).length;
  const antitrust: EuListed[] = [];
  const stateaid: EuListed[] = [];
  for (let y = FIRST_YEAR; y <= Number(readOn.slice(0, 4)); y++) {
    const listed = { antitrust: (await year("antitrust", y)).filter((n) => isDecisionTitle(n.title)), stateaid: (await year("stateaid", y)).filter((n) => isStateAidTitle(n.title)) };
    for (const [kind, rows] of [["antitrust", held.antitrust], ["stateaid", held.stateaid]] as const)
      if (listed[kind].length < heldIn(rows, y)) throw new Error(`the ${kind} list of ${y} holds ${listed[kind].length}, the file ${heldIn(rows, y)}: the file is left as it was`);
    antitrust.push(...listed.antitrust);
    stateaid.push(...listed.stateaid);
  }
  // the lists of 2026-11-22 hold 869 decisions and 1,909 State aid titles; far fewer is a broken answer
  if (antitrust.length < 800 || stateaid.length < 1_800) throw new Error(`${antitrust.length} decisions and ${stateaid.length} State aid titles listed`);
  const read = new Map(held.texts.map((r) => [String(r[0]), r]));
  let fresh = 0;
  for (const n of antitrust) {
    if (read.has(n.work)) continue;
    const t = await text(n);
    if (t === null) continue;
    read.set(n.work, [n.work, addresseeExcerpt(t)]);
    fresh++;
  }
  const about =
    "The European Commission's antitrust and cartel decisions \"relating to a proceeding\" in the Official Journal's English edition, 1973 on, and its State aid " +
    "notices and decisions whose title names an aid's beneficiary, listed by the Publications Office's SPARQL endpoint (each one's CELLAR work, day, title and " +
    "formats), and of each decision's text from CELLAR its addressee and fine passages. \"© European Union, https://eur-lex.europa.eu\"; reuse under Decision " +
    "2011/833/EU. Written by `npm run sync:eu-antitrust` (batch 177) for lib/euAntitrust.ts.";
  const row = (n: EuListed) => [n.work, n.published, n.title, n.types.join(",")];
  const body = {
    about,
    read: readOn,
    antitrust: antitrust.map(row),
    stateaid: stateaid.map(row),
    columns: { notices: LIST_COLUMNS, texts: TEXT_COLUMNS },
    texts: [...read.values()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  };
  writeFileSync(EU_ANTITRUST_DATA, gzipSync(Buffer.from(`${JSON.stringify(body)}\n`), { level: 9 }));
  console.log(`${antitrust.length} decisions, ${stateaid.length} State aid titles, ${read.size} texts read (${fresh} now) → ${EU_ANTITRUST_DATA}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
