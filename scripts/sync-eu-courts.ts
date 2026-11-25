import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import tickerIndex from "../data/edgar-tickers.json";
import { UA } from "../lib/contact";
import { dojPossessive } from "../lib/doj";
import { andSpellings, withoutTag } from "../lib/edgarName";
import {
  EU_COURTS_DATA,
  EU_COURT_UNITS,
  FIRST_YEAR,
  JUDGMENT_COLUMNS,
  type Judgment,
  courtsQueryUrl,
  euCourtsEvents,
  judgmentOf,
  judgmentRow,
  mergeJudgments,
  operativePart,
  readJudgmentTitle,
} from "../lib/euCourts";
import { type EuListed, cellarWork, listedNotices, noticeText } from "../lib/euMergers";
import { companyNames } from "../lib/frCompany";
import { namesForYear } from "../lib/ingest/frBackfill";
import { isNotesRecord, releaseNamesOn } from "../lib/releaseNames";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
import { digestPdfText, havePdfText } from "../lib/secDigest";

/**
 * Writes `data/eu-courts.json.gz` (batch 183): the EU courts' judgments, 1954 on, from the Publications Office's SPARQL
 * endpoint asked year by year for the English titles holding "judgment of the" (`courtsQueryUrl`), each judgment's own
 * title and its Official Journal notice joined (`mergeJudgments`), trade mark and design cases against the EU's IP
 * office and staff cases left out. The operative part is read once from CELLAR for each judgment a replay of every listed company under its
 * present names, units and release-map names finds: the notice's XHTML, else its HTML, else its PDF (needs pdftotext),
 * else the judgment's own text; one at a time, 1.6 s apart. A text the file holds is never asked again. Run monthly,
 * and after sync:tickers. A year's list never shorter than the file's: a short or failed answer ends the run with the
 * file as it was.
 *
 *   npm run sync:eu-courts                                   # asks publications.europa.eu
 *   npm run sync:eu-courts -- --lists <dir> --read <day>     # reads saved year lists (judgment-<year>.json)
 */
const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const lists = arg("--lists");
const readOn = arg("--read") ?? new Date().toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let asked = 0;

async function get(url: string, accept: string): Promise<Buffer | null> {
  if (asked++) await sleep(1_600);
  const res = await fetch(url, { headers: { ...UA, Accept: accept, "Accept-Language": "eng" }, signal: AbortSignal.timeout(180_000) });
  if (res.status === 404) return null;
  if (res.status === 300) {
    const doc = /href="(https?:\/\/publications\.europa\.eu\/resource\/cellar\/[^"]+\/DOC_1)"/.exec(await res.text())?.[1];
    if (!doc) throw new Error(`${new URL(url).pathname}: a choice of documents with no first item`);
    return get(doc, accept);
  }
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status} for ${new URL(url).pathname}`);
  const body = Buffer.from(await res.arrayBuffer());
  const length = Number(res.headers.get("content-length") ?? NaN);
  const encoded = !/^(?:identity)?$/i.test(res.headers.get("content-encoding") ?? "");
  if (!encoded && Number.isFinite(length) && body.length !== length) throw new Error(`${new URL(url).pathname}: ${body.length} of ${length} bytes`);
  return body;
}

async function year(y: number): Promise<EuListed[]> {
  if (lists) {
    const f = join(lists, `judgment-${y}.json`);
    if (!existsSync(f)) throw new Error(`no saved list judgment-${y}`);
    return listedNotices(JSON.parse(readFileSync(f, "utf8")));
  }
  const body = await get(courtsQueryUrl(y), "application/sparql-results+json");
  if (!body) throw new Error(`the endpoint answered 404 for the judgments of ${y}`);
  return listedNotices(JSON.parse(body.toString("utf8")));
}

/** A work's text: its XHTML, else its HTML, else its PDF read with pdftotext. */
async function text(work: string, types: readonly string[]): Promise<string | null> {
  const kind = types.includes("xhtml") ? "xhtml" : types.includes("html") ? "html" : types.includes("pdfa1b") ? "pdfa1b" : types.includes("pdf") ? "pdf" : null;
  if (!kind) return null;
  const accept = { xhtml: "application/xhtml+xml", html: "text/html", pdfa1b: "application/pdf;type=pdfa1b", pdf: "application/pdf" }[kind];
  const body = await get(cellarWork(work), accept);
  if (!body) return null;
  return kind === "pdf" || kind === "pdfa1b" ? noticeText(await digestPdfText(body), "pdf") : noticeText(body.toString("utf8"), "xhtml");
}

async function main(): Promise<void> {
  if (!(await havePdfText())) throw new Error("pdftotext is not installed (poppler-utils), so no older notice can be read");
  const held = existsSync(EU_COURTS_DATA) ? (JSON.parse(gunzipSync(readFileSync(EU_COURTS_DATA)).toString("utf8")) as { judgments: unknown[][]; listed?: Record<string, number> }) : { judgments: [], listed: {} };
  const read: (ReturnType<typeof readJudgmentTitle> & { work: string })[] = [];
  const types = new Map<string, string[]>();
  const listed: Record<string, number> = {};
  for (let y = FIRST_YEAR; y <= Number(readOn.slice(0, 4)); y++) {
    const ns = await year(y);
    if (ns.length < (held.listed?.[y] ?? 0)) throw new Error(`the judgments' list of ${y} holds ${ns.length}, the file's ${held.listed?.[y]}: the file is left as it was`);
    listed[y] = ns.length;
    for (const n of ns) {
      types.set(n.work, n.types);
      const r = readJudgmentTitle(n.title);
      if (r) read.push({ ...r, work: n.work });
    }
  }
  const total = Object.values(listed).reduce((s, n) => s + n, 0);
  // the lists of 2026-11-24 hold 77,858 titles; far fewer is a broken answer
  if (total < 70_000) throw new Error(`${total} judgment titles listed`);
  // every judgment is kept: a party the rule reads as a company can be its name alone ("Alstom", "Sasol and Others")
  const judgments = mergeJudgments(read as never);

  // which judgments a listed company is a party to, under its present names (ingest adds the database's former names)
  const companies = (tickerIndex as unknown as { companies: [number, string, string][] }).companies;
  const titleOf = new Map(companies.map((c) => [c[0], c[2]]));
  const namesOf = (cik: number) => (y: number) => {
    const title = titleOf.get(cik)!;
    const own = dojPossessive(title, possessiveNameFor(cik));
    return [...companyNames(title, namesForYear(y, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)];
  };
  const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const text0 = judgments.map((j) => alnum(j.sides.join(" ")));
  const unitYears = Array.from({ length: Number(readOn.slice(0, 4)) - FIRST_YEAR + 1 }, (_, k) => `${FIRST_YEAR + k}-07-01`);
  const matched = new Set<string>();
  const key = (j: Pick<Judgment, "cases" | "day">) => `${j.cases[0]}|${j.day}`;
  const byKey = new Map(judgments.map((j) => [key(j), j]));
  const seen = new Set<number>();
  for (const [cik] of companies) {
    if (seen.has(cik) || isNotesRecord(cik)) continue;
    seen.add(cik);
    const pre = [...new Set([...namesOf(cik)(2026), ...namesOf(cik)(2005), ...namesOf(cik)(1985), ...unitYears.flatMap((d) => releaseNamesOn(cik, d))].flatMap(andSpellings).map(alnum).filter((n) => n.length >= 3))];
    const mj = judgments.filter((_, k) => !!EU_COURT_UNITS[cik] || pre.some((n) => text0[k].includes(n)));
    for (const e of euCourtsEvents(mj, namesOf(cik), { cik, namesOn: (d) => releaseNamesOn(cik, d) }))
      for (const c of (e.externalId ?? "").split(",")) {
        const j = mj.find((x) => x.cases[0] === c && x.day === e.date);
        if (j) matched.add(key(j));
      }
  }

  // each matched judgment's operative part, once
  const had = new Map(held.judgments.map((r) => judgmentOf(r)).filter((j) => j.operative).map((j) => [key(j), j.operative!]));
  let fresh = 0;
  for (const k of matched) {
    const j = byKey.get(k)!;
    if (had.has(k)) {
      j.operative = had.get(k);
      continue;
    }
    for (const work of [j.notice, j.judgment].filter(Boolean) as string[]) {
      const t = await text(work, types.get(work) ?? []);
      const op = t && operativePart(t);
      if (op) {
        j.operative = op;
        fresh++;
        break;
      }
    }
  }
  const about =
    "The EU courts' judgments, 1954 on, as the Publications Office's SPARQL endpoint lists their English titles holding \"judgment of the\" (each judgment's own " +
    "work and its Official Journal notice joined; trade mark and design cases against the EU's IP office and staff cases left out), " +
    "and the operative part of each judgment a listed company is a party to, read from CELLAR. Source: Court of Justice of the European Union; " +
    "the notices \"© European Union, https://eur-lex.europa.eu\". Written by `npm run sync:eu-courts` (batch 183) for lib/euCourts.ts.";
  const body = { about, read: readOn, listed, columns: JUDGMENT_COLUMNS, judgments: judgments.sort((a, b) => a.day.localeCompare(b.day) || a.cases[0].localeCompare(b.cases[0])).map(judgmentRow) };
  writeFileSync(EU_COURTS_DATA, gzipSync(Buffer.from(`${JSON.stringify(body)}\n`), { level: 9 }));
  console.log(`${total} titles, ${judgments.length} judgments kept, ${matched.size} a listed company's, ${[...matched].filter((k) => byKey.get(k)?.operative).length} with an operative part (${fresh} read now) → ${EU_COURTS_DATA}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
