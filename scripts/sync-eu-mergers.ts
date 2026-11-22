import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import tickerIndex from "../data/edgar-tickers.json";
import { UA } from "../lib/contact";
import { withoutTag } from "../lib/edgarName";
import {
  EU_MERGERS_DATA,
  type EuListed,
  LIST_COLUMNS,
  TEXT_COLUMNS,
  type NoticeKind,
  caseOf,
  cellarWork,
  firstParagraph,
  isCorrigendum,
  listedNotices,
  noticeParties,
  noticeQueryUrl,
  noticeText,
  notifiedOn,
  titleKey,
  titleParties,
} from "../lib/euMergers";
import { companyNames } from "../lib/frCompany";
import { namesForYear } from "../lib/ingest/frBackfill";
import { newsNamesFor } from "../lib/sec";
import { digestPdfText, havePdfText } from "../lib/secDigest";

/**
 * Writes `data/eu-mergers.json.gz` (batch 174): every notification of a concentration and every notice of non-opposition
 * the Official Journal printed in English, 1990 on, from the Publications Office's SPARQL endpoint asked year by year
 * (`noticeQueryUrl`, two queries a year), and the text of each candidate notification the file does not hold, from CELLAR
 * (`cellarWork`), one at a time, 1.6 s apart: its XHTML since 2004, its PDF before (needs pdftotext). A candidate is a
 * notification whose title names, as one of its parties, exactly one of a company's names of the year or aliases, or whose
 * title names none: about 2,540 the first time, a few a month since, so it is run monthly and again after
 * `npm run sync:tickers`. A name only EDGAR's former names give is not a candidate here.
 *
 *   npm run sync:eu-mergers                                  # asks publications.europa.eu
 *   npm run sync:eu-mergers -- --lists <dir> --dir <dir> --read <day>
 *                                                            # reads saved year lists (<kind>-<year>.json) and texts (<work>.xhtml|.pdf)
 */
const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const lists = arg("--lists");
const dir = arg("--dir");
const readOn = arg("--read") ?? new Date().toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let asked = 0;

async function get(url: string, accept: string): Promise<Buffer | null> {
  if (asked++) await sleep(1_600);
  const res = await fetch(url, { headers: { ...UA, Accept: accept, "Accept-Language": "eng" }, signal: AbortSignal.timeout(120_000) });
  // a notice CELLAR holds in no such format answers 404, and is not asked in another
  if (res.status === 404) return null;
  // one held as a document and its metadata answers 300 with both; the document is the first item ("…/DOC_1")
  if (res.status === 300) {
    const doc = /href="(https?:\/\/publications\.europa\.eu\/resource\/cellar\/[^"]+\/DOC_1)"/.exec(await res.text())?.[1];
    if (!doc) throw new Error(`${new URL(url).pathname}: a choice of documents with no first item`);
    return get(doc, accept);
  }
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status} for ${new URL(url).pathname}`);
  const body = Buffer.from(await res.arrayBuffer());
  const length = Number(res.headers.get("content-length") ?? NaN);
  if (Number.isFinite(length) && body.length !== length) throw new Error(`${new URL(url).pathname}: ${body.length} of ${length} bytes`);
  return body;
}

async function year(kind: NoticeKind, y: number): Promise<EuListed[]> {
  if (lists) {
    const f = join(lists, `${kind}-${y}.json`);
    if (!existsSync(f)) throw new Error(`no saved list ${kind}-${y}`);
    return listedNotices(JSON.parse(readFileSync(f, "utf8")));
  }
  return listedNotices(JSON.parse(((await get(noticeQueryUrl(kind, y), "application/sparql-results+json")) ?? Buffer.from("{}")).toString("utf8")));
}

/** A notice's text: its XHTML where CELLAR holds one, else its PDF read with pdftotext. */
async function text(n: EuListed): Promise<string | null> {
  const xhtml = n.types.includes("xhtml");
  if (dir) {
    const f = join(dir, `${n.work}.${xhtml ? "xhtml" : "pdf"}`);
    if (!existsSync(f)) throw new Error(`no copy of ${n.work}`);
    return xhtml ? noticeText(readFileSync(f, "utf8"), "xhtml") : noticeText(await digestPdfText(readFileSync(f)), "pdf");
  }
  const accept = xhtml ? "application/xhtml+xml" : n.types.includes("pdfa1b") ? "application/pdf;type=pdfa1b" : "application/pdf";
  const body = await get(cellarWork(n.work), accept);
  if (!body) return null;
  return xhtml ? noticeText(body.toString("utf8"), "xhtml") : noticeText(await digestPdfText(body), "pdf");
}

const companies = (tickerIndex as unknown as { companies: [number, string, string][] }).companies;

/** Each title party's key, and the companies' keys under their names of the years, for the candidates. */
function candidates(notes: EuListed[]): Set<string> {
  const byKey = new Map<string, string[]>();
  const out = new Set<string>();
  for (const n of notes) {
    const ps = titleParties(n.title);
    if (!ps.length) out.add(n.work);
    for (const p of ps) for (const k of new Set([titleKey(p), titleKey(p.replace(/\s*\([^)]*\)/g, ""))])) if (k.length >= 2) (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(n.work);
  }
  const seen = new Set<number>();
  for (const [cik, , title] of companies) {
    if (seen.has(cik)) continue;
    seen.add(cik);
    const keys = new Set<string>([titleKey(withoutTag(title))]);
    for (const y of [1992, 1998, 2004, 2010, 2016, 2022, Number(readOn.slice(0, 4))]) for (const n of [...companyNames(title, namesForYear(y, newsNamesFor(cik), [])), ...newsNamesFor(cik)]) keys.add(titleKey(n));
    for (const k of keys) if (k.length >= 2) for (const w of byKey.get(k) ?? []) out.add(w);
  }
  return out;
}

async function main(): Promise<void> {
  if (!(await havePdfText())) throw new Error("pdftotext is not installed (poppler-utils), so no older notice can be read");
  const held = existsSync(EU_MERGERS_DATA) ? (JSON.parse(gunzipSync(readFileSync(EU_MERGERS_DATA)).toString("utf8")) as { texts: unknown[][] }) : { texts: [] };
  const notifications: EuListed[] = [];
  const nonopposition: EuListed[] = [];
  for (let y = 1990; y <= Number(readOn.slice(0, 4)); y++) {
    notifications.push(...(await year("notification", y)).filter((n) => !isCorrigendum(n.title)));
    nonopposition.push(...(await year("nonopposition", y)).filter((n) => !isCorrigendum(n.title)));
  }
  // the lists of 2026-11-22 hold 10,290 notifications and 8,523 notices of non-opposition; far fewer is a broken answer
  if (notifications.length < 10_000 || nonopposition.length < 8_000) throw new Error(`${notifications.length} notifications and ${nonopposition.length} clearances listed`);
  const read = new Map(held.texts.map((r) => [String(r[0]), r]));
  const want = candidates(notifications);
  let fresh = 0;
  for (const n of notifications) {
    if (!want.has(n.work) || read.has(n.work)) continue;
    const t = await text(n);
    if (t === null) continue;
    const para = firstParagraph(t, caseOf(n.title)) ?? "";
    read.set(n.work, [n.work, para ? notifiedOn(para) : null, para.slice(0, 2000), para ? noticeParties(para) : []]);
    fresh++;
  }
  const about =
    "The European Commission's merger notifications and notices of non-opposition in the Official Journal's English edition, 1990 on, " +
    "listed by the Publications Office's SPARQL endpoint (each notice's CELLAR work, publication day, title and formats), and for each " +
    "notification whose title names a listed company or no party, its text from CELLAR: the day the Commission received it, its first " +
    'paragraph and the parties it names in full. "© European Union, https://eur-lex.europa.eu"; reuse under Decision 2011/833/EU. ' +
    "Written by `npm run sync:eu-mergers` (batch 174) for lib/euMergers.ts.";
  const row = (n: EuListed) => [n.work, n.published, n.title, n.types.join(",")];
  const body = {
    about,
    read: readOn,
    notifications: notifications.map(row),
    nonopposition: nonopposition.map(row),
    columns: { notices: LIST_COLUMNS, texts: TEXT_COLUMNS },
    texts: [...read.values()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  };
  writeFileSync(EU_MERGERS_DATA, gzipSync(Buffer.from(`${JSON.stringify(body)}\n`), { level: 9 }));
  console.log(`${notifications.length} notifications, ${nonopposition.length} clearances, ${want.size} candidates, ${read.size} read (${fresh} now) → ${EU_MERGERS_DATA}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
