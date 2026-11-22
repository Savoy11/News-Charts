import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { UA } from "../lib/contact";
import { noticeText } from "../lib/hsrEarly";
import {
  ITC_DATA,
  type ItcCase,
  type ItcListed,
  investigationNumbers,
  isInstitution,
  issuedOn,
  itcList,
  noticeOutcome,
  productsOf,
  readInstitution,
} from "../lib/itc337";

/**
 * Writes `data/itc-337.json.gz` (batch 167): every Section 337 investigation the Commission's Federal
 * Register notices open, 1995 on, with its complainants, respondents and outcome. It asks the Federal
 * Register API for the Commission's notices year by year (`itcList`, about 35 requests), then govinfo for
 * the text of each notice of institution the file does not hold and of each investigation's outcome notice
 * it does not hold, one at a time, 1.5 s apart: about 1,540 notices the first time, a few a month since, so
 * it is run monthly.
 *
 *   npm run sync:itc                                   # asks the API and govinfo
 *   npm run sync:itc -- --lists <dir> --dir <dir> --read <day>
 *                                                      # reads saved year lists (<year>.json) and notices (<doc>.htm)
 */
const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const lists = arg("--lists");
const dir = arg("--dir");
const readOn = arg("--read") ?? new Date().toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let asked = 0;

async function get(url: string, json: boolean): Promise<unknown> {
  if (asked++) await sleep(1_500);
  const res = await fetch(url, { headers: { ...UA, ...(json ? { Accept: "application/json" } : {}) }, signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return json ? res.json() : res.text();
}

async function listed(): Promise<ItcListed[]> {
  if (lists) return readdirSync(lists).filter((f) => /^\d{4}\.json$/.test(f)).sort().flatMap((f) => JSON.parse(readFileSync(join(lists, f), "utf8")).results);
  const out: ItcListed[] = [];
  for (let year = 1994; year <= Number(readOn.slice(0, 4)); year++) {
    for (let page = 1; ; page++) {
      const j = (await get(itcList(year, page), true)) as { results?: ItcListed[]; total_pages?: number };
      out.push(...(j.results ?? []));
      if (page >= (j.total_pages ?? 1)) break;
    }
  }
  return out;
}

async function text(r: ItcListed): Promise<string> {
  if (dir) {
    const f = join(dir, `${r.document_number}.htm`);
    if (!existsSync(f)) throw new Error(`no copy of ${r.document_number}`);
    return readFileSync(f, "utf8");
  }
  return (await get(noticeText(r.publication_date, r.document_number), false)) as string;
}

async function main(): Promise<void> {
  const rows = await listed();
  const institutions = rows.filter(isInstitution);
  // the lists of 2026-11-22 hold 11,592 notices, 1,140 of them institutions; far fewer is a broken read
  if (institutions.length < 1_100) throw new Error(`only ${institutions.length} notices of institution listed`);

  const kept = new Map<string, ItcCase>();
  if (!dir && existsSync(ITC_DATA)) for (const c of (JSON.parse(gunzipSync(readFileSync(ITC_DATA)).toString("utf8")) as { cases: ItcCase[] }).cases) kept.set(c.notice, c);

  const byNumber = new Map<string, ItcListed[]>();
  for (const r of rows) for (const n of investigationNumbers(r)) (byNumber.get(n) ?? byNumber.set(n, []).get(n)!).push(r);

  const cases: ItcCase[] = [];
  for (const r of institutions) {
    const number = investigationNumbers(r)[0];
    if (!number) continue;
    const had = kept.get(r.document_number);
    const parties = had ?? readInstitution(await text(r), r.abstract);
    const later = (byNumber.get(number) ?? [])
      .filter((x) => x.publication_date >= r.publication_date && x.document_number !== r.document_number)
      .sort((a, b) => a.publication_date.localeCompare(b.publication_date) || a.document_number.localeCompare(b.document_number));
    // the last decision on the merits, or else the last termination on a settlement, a consent order or a withdrawal
    const merits = later.filter((x) => { const o = noticeOutcome(x); return !!o && o.kind !== "terminated"; }).at(-1);
    const ended = later.filter((x) => noticeOutcome(x)?.kind === "terminated").at(-1);
    const last = merits ?? ended;
    let outcome: ItcCase["outcome"];
    if (last) {
      const o = noticeOutcome(last)!;
      // the day the Commission issued its notice, read from the notice's text for a decision on the merits
      const day = had?.outcome?.notice === last.document_number ? had.outcome.day : o.kind === "terminated" ? last.publication_date : (issuedOn(await text(last)) ?? last.publication_date);
      outcome = { ...o, notice: last.document_number, published: last.publication_date, day };
    }
    cases.push({
      number,
      products: productsOf(r.title),
      notice: r.document_number,
      published: r.publication_date,
      complainants: parties.complainants,
      respondents: parties.respondents,
      ...(outcome ? { outcome } : {}),
    });
  }
  cases.sort((a, b) => a.published.localeCompare(b.published) || a.number.localeCompare(b.number, "en", { numeric: true }));
  // an investigation whose notice of institution was reissued or corrected (seven of them) keeps the first notice's
  // day and the parties of both, the first's first
  const byCase = new Map<string, ItcCase>();
  for (const c of cases) {
    const had = byCase.get(c.number);
    if (!had) byCase.set(c.number, c);
    else byCase.set(c.number, { ...had, complainants: [...new Set([...had.complainants, ...c.complainants])], respondents: [...new Set([...had.respondents, ...c.respondents])] });
  }
  const merged = [...byCase.values()];
  const about =
    "The U.S. International Trade Commission's Section 337 investigations, as its Federal Register notices open and decide them " +
    "(the Federal Register API's list of the Commission's notices; each notice of institution's and each outcome notice's text from govinfo.gov): " +
    "each investigation's number, products, notice of institution and its day, complainants and respondents as the notice names them, and the last " +
    "notice deciding it on the merits (a violation, with the exclusion order, or none) or ending it on a settlement, a consent order or a withdrawal, " +
    "with the day the Commission issued a decision on the merits. The notices are the Commission's own work in the Federal Register, public domain; " +
    "credit the U.S. International Trade Commission. Written by `npm run sync:itc` (batch 167) for lib/itc337.ts.";
  writeFileSync(ITC_DATA, gzipSync(Buffer.from(`${JSON.stringify({ about, read: readOn, listed: rows.length, cases: merged })}\n`), { level: 9 }));
  console.log(`${merged.length} investigations from ${rows.length} notices (${asked} requests now) → ${ITC_DATA}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
