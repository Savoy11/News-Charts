import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { GROUPED_ROW_SOURCES, corroborations } from "../lib/corroboration";
import { dojPossessive } from "../lib/doj";
import { withoutTag } from "../lib/edgarName";
import { deterministicScore } from "../lib/enrich/relevance";
import { APPLICANT_NAMES, NOT_THE_APPLICANT, approvalIsCompany } from "../lib/fdaApprovals";
import { FDA_FIRMS, firmFor } from "../lib/fdaRecalls";
import {
  LETTERS_PAGE,
  LETTER_NAMES,
  PAGE_SIZE,
  fetchLetters,
  letterIsCompany,
  lettersUrl,
  parseLetters,
  warningLetterEvents,
  type WarningLetter,
} from "../lib/fdaWarningLetters";
import { companyNames } from "../lib/frCompany";
import { namesForYear } from "../lib/ingest/frBackfill";
import { walkWarningLetters, warningLettersFor, READ_EVERY_DAYS, type WarningWalk } from "../lib/ingest/fdaWarningWalk";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import { isNotesRecord } from "../lib/releaseNames";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
import { COMPANY_SOURCES } from "./ingest";

/**
 * The FDA's warning letters (batch 140, the 2026-11-11 proposal 2, approved by the owner on 2026-11-11).
 *
 *   npm run check:fda-warning-letters
 *
 * The list is real: the eight answers www.fda.gov gave on 2026-11-11, its 3,807 letters read 1,000 a
 * request oldest first (01:19 UTC) and newest first (12:40 UTC), committed as
 * scripts/fixtures/fda-warning-letters.json.gz and replayed through the repository's own reader. The
 * names are the committed index's, former names aside, so the counts are what the pages get before
 * their EDGAR former names add more at ingest. Offline.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)}`}`);
}
const root = join(__dirname, "..");
const read = (file: string) => readFileSync(join(root, file), "utf8");

interface Answer {
  recordsTotal: number;
  data: string[][];
}
const FIXTURE = JSON.parse(gunzipSync(readFileSync(join(root, "scripts/fixtures/fda-warning-letters.json.gz"))).toString("utf8")) as {
  read: string;
  asc: { start: number; answer: Answer }[];
  desc: { start: number; answer: Answer }[];
};

const companies = tickerIndex.companies as [number, string, string][];
const rowOf = (ticker: string) => {
  const r = companies.find(([, t]) => t === ticker);
  if (!r) throw new Error(`no ${ticker} in the ticker index`);
  return r;
};
function namesOf(cik: number, title: string): (year: number) => string[] {
  const own = dojPossessive(title, possessiveNameFor(cik));
  return (year) => [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)];
}
const namesOfTicker = (ticker: string) => {
  const [cik, , title] = rowOf(ticker);
  return namesOf(cik, title);
};

/** The fixture served as www.fda.gov served it, by the start and direction a request asks. */
function serve(pages: { asc: typeof FIXTURE.asc; desc: typeof FIXTURE.desc }, asked: string[], { fail: failing }: { fail?: (url: string) => number | null } = {}) {
  return (async (input: string | URL) => {
    const url = String(input);
    asked.push(url);
    const status = failing?.(url) ?? null;
    if (status) return new Response("FDA Internet Site Error", { status });
    const start = Number(/[?&]start=(\d+)/.exec(url)?.[1]);
    const dir = /order%5B0%5D%5Bdir%5D=(asc|desc)/.exec(url)?.[1] as "asc" | "desc";
    const page = pages[dir].find((p) => p.start === start);
    return new Response(JSON.stringify(page ? page.answer : { recordsTotal: pages[dir][0].answer.recordsTotal, data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

async function main(): Promise<void> {
  const realFetch = globalThis.fetch;

  console.log("\nThe list's rows");
  const row = (over: Partial<Record<number, string>> = {}) =>
    [
      '<time datetime="2025-09-16T12:00:00Z">09/16/2025</time>\n',
      '<time datetime="2025-09-09T12:00:00Z">09/09/2025</time>\n',
      '<a href="/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/eli-lilly-and-company-716485-09092025">Eli Lilly and Company</a>',
      "Center for Drug Evaluation and Research | CDER",
      "False &amp; Misleading Claims/Misbranded",
      "",
      "",
      "",
    ].map((c, i) => over[i] ?? c);
  const one = parseLetters({ recordsTotal: 1, data: [row()] });
  check("a row's link, addressee, days, office and subject are read, its markup off and its entities read",
    one.total === 1 && one.rows === 1 && one.letters.length === 1 &&
      JSON.stringify(one.letters[0]) === JSON.stringify({
        path: "/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/eli-lilly-and-company-716485-09092025",
        company: "Eli Lilly and Company",
        issued: "2025-09-09",
        posted: "2025-09-16",
        office: "Center for Drug Evaluation and Research | CDER",
        subject: "False & Misleading Claims/Misbranded",
        response: null,
        closeout: null,
      }),
    one);
  const closed = parseLetters({
    recordsTotal: 2,
    data: [
      row({
        2: '<a href="/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/x-1">Hims &amp; Hers Health, Inc. dba Hers</a>',
        6: '<a href="/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/4u-health-720527-06162026"><time datetime="2026-06-23T04:00:00Z">06/23/2026</time>\n</a>',
      }),
      row({ 6: '<a href="/x"><time>03/18/2024</time></a>' }),
    ],
  });
  // batch 142, the 2026-11-11 audit's finding 2: the cell's visible day is the day the FDA posted the close-out
  check("  …a close-out letter's day is its own, from the end of its page's name, not the day the FDA posted it; a page name with no day gives none; and \"&amp;\" is \"&\"",
    closed.letters[0]?.closeout === "2026-06-16" && closed.letters[1]?.closeout === null && closed.letters[0]?.company === "Hims & Hers Health, Inc. dba Hers", closed.letters);
  const odd = parseLetters({ recordsTotal: 3, data: [row({ 2: '<a href="https://example.org/x">Someone</a>' }), row({ 1: "" }), row()] });
  check("  …a row whose link is no warning letter's page, or which has no issue day, is left out, and counted as a row", odd.rows === 3 && odd.letters.length === 1, odd);
  let threw = "";
  try {
    parseLetters({ error: "x" });
  } catch (err) {
    threw = String(err);
  }
  check("  …and an answer that is not the list is refused", /not the FDA's warning-letter list/.test(threw), threw);

  console.log("\nThe list, read both ways (www.fda.gov, 2026-11-11)");
  const ascRows = FIXTURE.asc.flatMap((p) => p.answer.data);
  const ascLetters = FIXTURE.asc.flatMap((p) => parseLetters(p.answer).letters);
  const ascPaths = new Set(ascLetters.map((l) => l.path));
  const descLetters = FIXTURE.desc.flatMap((p) => parseLetters(p.answer).letters);
  check("each direction gives the list's 3,807 rows, 1,000 a request, every one read",
    FIXTURE.asc.every((p) => p.answer.recordsTotal === 3807) && FIXTURE.desc.every((p) => p.answer.recordsTotal === 3807) && ascRows.length === 3807 &&
      ascLetters.length === 3807 && descLetters.length === 3807 && PAGE_SIZE === 1000,
    `${ascRows.length} ${ascLetters.length} ${descLetters.length}`);
  const twice = ascLetters.filter((l, i) => ascLetters.findIndex((m) => m.path === l.path) !== i);
  const lost = descLetters.filter((l) => !ascPaths.has(l.path));
  check("  …oldest first alone gives 12 letters of 2025-09-09 twice, at the third page's edge, and never gives 12 others of that day, Royal Philips's among them",
    twice.length === 12 && twice.every((l) => l.issued === "2025-09-09") && lost.length === 12 && lost.every((l) => l.issued === "2025-09-09") && lost.some((l) => l.company.trim() === "Royal Philips"),
    { twice: twice.length, lost: lost.map((l) => l.company) });
  check("  …and newest first gives each of the 3,807 once", new Set(descLetters.map((l) => l.path)).size === 3807);

  const asked: string[] = [];
  globalThis.fetch = serve(FIXTURE, asked);
  const whole = await fetchLetters({ gapMs: 0 });
  check("the reader asks four pages each way and keeps every letter once: 3,807, from 2021-01-04 to 2026-11-03",
    whole.outcome === "ok" && whole.total === 3807 && whole.pages === 8 && whole.letters.length === 3807 && new Set(whole.letters.map((l) => l.path)).size === 3807 &&
      whole.letters[0].issued === "2021-01-04" && whole.letters.at(-1)!.issued === "2026-11-03" && asked.length === 8,
    { outcome: whole.outcome, detail: whole.detail, n: whole.letters.length, pages: whole.pages });
  check("  …each request the list's own, oldest first and then newest first, from www.fda.gov",
    asked.slice(0, 4).every((u, i) => u === lettersUrl(i * 1000, "asc")) && asked.slice(4).every((u, i) => u === lettersUrl(i * 1000, "desc")) &&
      asked.every((u) => u.startsWith("https://www.fda.gov/datatables/views/ajax?view_name=warning_letter_solr_index&") && /&length=1000&/.test(u)) &&
      LETTERS_PAGE.startsWith("https://www.fda.gov/"),
    asked.slice(0, 2));
  // the same direction twice is what one direction alone gives: refused, not kept short
  globalThis.fetch = serve({ asc: FIXTURE.asc, desc: FIXTURE.asc }, []);
  const short = await fetchLetters({ gapMs: 0 });
  check("  …a read whose two directions still miss letters is refused whole, not kept short", short.outcome === "error" && short.letters.length === 0 && /3795 letters read in both directions of the 3807/.test(short.detail ?? ""), short);
  globalThis.fetch = serve(FIXTURE, [], { fail: (u) => (/start=2000&/.test(u) && /dir%5D=desc/.test(u) ? 503 : null) });
  const busy = await fetchLetters({ gapMs: 0 });
  check("  …a page refused is a refused read, nothing kept", busy.outcome === "throttled" && busy.httpStatus === 503 && busy.letters.length === 0 && /newest-first page from 2000/.test(busy.detail ?? ""), busy);
  const moved = { asc: FIXTURE.asc, desc: FIXTURE.desc.map((p, i) => (i === 1 ? { ...p, answer: { ...p.answer, recordsTotal: 3808 } } : p)) };
  globalThis.fetch = serve(moved, []);
  const shifted = await fetchLetters({ gapMs: 0 });
  check("  …a total that moves during the read is refused", shifted.outcome === "error" && /moved from 3807 to 3808/.test(shifted.detail ?? ""), shifted);
  const cut = { asc: FIXTURE.asc.slice(0, 3), desc: FIXTURE.desc };
  globalThis.fetch = serve(cut, []);
  const truncated = await fetchLetters({ gapMs: 0 });
  check("  …and rows short of the total are refused", truncated.outcome === "error" && /3000 rows read oldest first of the 3807/.test(truncated.detail ?? ""), truncated);
  globalThis.fetch = realFetch;
  const letters = whole.letters;

  console.log("\nThe addressee on its day is the company");
  const named = (re: RegExp, day?: string) => letters.filter((l) => re.test(l.company) && (!day || l.issued === day));
  const on = (ticker: string, l: WarningLetter) => letterIsCompany(l, rowOf(ticker)[0], namesOfTicker(ticker));
  const dexcom = named(/^Dexcom, Inc\.$/, "2025-03-04");
  check("Dexcom, Inc. (2025-03-04) is Dexcom's", dexcom.length === 1 && on("DXCM", dexcom[0]));
  const abiomed = named(/^Abiomed Inc\.$/, "2023-09-19");
  check("Abiomed Inc. (2023-09-19) is Johnson & Johnson's, its unit from the FDA recall map's day", abiomed.length === 1 && on("JNJ", abiomed[0]) && !on("ABT", abiomed[0]));
  const lilly = named(/^Eli Lilly and Company$/, "2025-09-09");
  check("Lilly's three letters of 2025-09-09 are Lilly's, one row", lilly.length === 3 && lilly.every((l) => on("LLY", l)) &&
    warningLetterEvents(lilly, namesOfTicker("LLY"), { cik: rowOf("LLY")[0] }).length === 1);
  const philips = named(/^Royal Philips$/);
  check("Royal Philips's two letters (2024-02-23, 2025-09-09) are Philips's, by the recall map's firm; the second is the one oldest first lost",
    philips.length === 2 && philips.every((l) => on("PHG", l)) && philips.some((l) => l.issued === "2025-09-09"), philips.map((l) => l.issued));
  const cooper = named(/^CooperSurgical, Inc\.$/);
  check("CooperSurgical (2021-02-12) is the Cooper Companies', by the recall map; Cooper Institute and Cooperstown Cheese are no Cooper's",
    cooper.length === 1 && on("COO", cooper[0]) && !on("COO", named(/^Cooper Institute$/)[0]) && !on("COO", named(/^Cooperstown Cheese/)[0]));
  check("Kraft Drug (2023-11-30) is not Kraft Heinz's", named(/^Kraft Drug$/).length === 1 && !on("KHC", named(/^Kraft Drug$/)[0]));

  console.log("\nThe addressees the rule cannot read, each read by hand");
  const amazon = named(/^Amazon\.com, Inc\.?$/);
  check("Amazon.com, Inc.'s ten letters are Amazon's, by the hand list: the rule reads \".com\" as no legal word",
    amazon.length === 10 && amazon.every((l) => on("AMZN", l)) && amazon.every((l) => !approvalIsCompany({ applicant: l.company, day: l.issued }, rowOf("AMZN")[0], namesOfTicker("AMZN"))) &&
      amazon.some((l) => l.issued === "2022-08-04"),
    amazon.length);
  const hand: [string, RegExp, string][] = [
    ["HIMS", /^Hims & Hers Health, Inc\. dba Hims$/, "Hims & Hers, doing business as Hims"],
    ["PG", /^Procter & Gamble Manufactura\b/, "P&G's Mexican company"],
    ["CL", /^Colgate-Palmolive\/Tom's of Maine/, "Colgate-Palmolive with Tom's of Maine"],
    ["LH", /^Toxikon Corporation\/Labcorp Bedford LLC$/, "Labcorp's Bedford laboratory"],
    ["FLEX", /^Flextronics America LLC$/, "Flex's American company"],
    ["ELAN", /^Elanco Animal Health USA$/, "Elanco's American company"],
    ["SLGN", /^Silgan Dispensing Systems$/, "Silgan's dispensing business"],
    ["OWLT", /^Owlet Baby Care, Inc\.$/, "Owlet's operating company"],
    ["CHSCP", /^CHS Inc\.\/CHS River Plains$/, "CHS with one of its plants"],
    ["IFF", /^DuPont Nutrition USA Inc\.$/, "DuPont's Nutrition & Biosciences, IFF's from 2021-02-01"],
    // batch 142, the 2026-11-11 audit's finding 3
    ["RBGLY", /^Reckitt\/Mead Johnson Nutrition$/, "Reckitt with Mead Johnson Nutrition (2023-08-30)"],
    ["ADM", /^ADM Animal Nutrition$/, "ADM's animal-feed business (2023-10-23)"],
    ["OFIX", /^IsoTis OrthoBiologics, Inc\.$/, "SeaSpine's IsoTis, Orthofix's from 2023-01-05 (2026-02-24)"],
    ["NVO", /^Catalent Indiana, LLC$/, "Catalent's Bloomington plant, Novo Nordisk's from 2024-12-18 (2025-11-20)"],
  ];
  for (const [t, re, why] of hand) {
    const got = named(re);
    check(`  ${why}: ${got[0]?.company ?? re} is ${t}'s`, got.length >= 1 && got.every((l) => on(t, l)) && !approvalIsCompany({ applicant: got[0].company, day: got[0].issued }, rowOf(t)[0], namesOfTicker(t)), got.map((l) => l.company));
  }
  const isotis = named(/^IsoTis OrthoBiologics, Inc\.$/)[0];
  const catalent = named(/^Catalent Indiana, LLC$/)[0];
  check("  …IsoTis is Orthofix's only from the SeaSpine merger, Catalent Indiana Novo Nordisk's only from the day it bought the plant, and neither is Integra's or Catalent's buyer's before",
    !on("OFIX", { ...isotis, issued: "2023-01-04" }) && !on("NVO", { ...catalent, issued: "2024-12-17" }) && !on("IART", isotis));
  const dupont = named(/^DuPont Nutrition USA Inc\.$/)[0];
  check("  …DuPont Nutrition is IFF's only from the merger, and never DuPont de Nemours's, whose past is refused already",
    !on("IFF", { ...dupont, issued: "2021-01-31" }) && !on("DD", dupont) && !!NOT_THE_APPLICANT[rowOf("DD")[0]]);
  check("  …every hand-read name says why, under its own company's CIK and ticker, and every day is a day",
    Object.entries(LETTER_NAMES).every(([cik, c]) => rowOf(c.ticker)[0] === Number(cik) && c.names.every((n) => n.why.length > 15 && [n.from, n.to].every((d) => d === undefined || /^\d{4}-\d{2}-\d{2}$/.test(d)))));
  const hims = named(/^Hims & Hers Health, Inc\. dba (?:Hims|Hers)$/);
  check("  …Hims & Hers's two letters of 2025-09-09 are one row (the list gave a third only oldest first, a repeat)", hims.length === 2 && warningLetterEvents(hims, namesOfTicker("HIMS"), { cik: rowOf("HIMS")[0] }).length === 1);

  console.log("\nEvery listed company against every letter");
  // each company is asked only the letters where one of its names' first words begins a word, or where
  // a firm or a hand-read name of its matches: the rule itself decides, and asking every company every
  // letter takes ten minutes
  const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const wordStarts = letters.map((l) => {
    const out: string[] = [];
    for (let i = 0; i < l.company.length; i++) if (/[a-z0-9]/i.test(l.company[i]) && (i === 0 || !/[a-z0-9]/i.test(l.company[i - 1]))) out.push(alnum(l.company.slice(i)));
    return out;
  });
  const firstWord = (name: string) => name.split(/[^A-Za-z0-9]+/).filter((w) => w.length >= 2 && !/^the$/i.test(w))[0]?.toLowerCase();
  const pages = new Map<string, { cik: number; events: ReturnType<typeof warningLetterEvents>; byHand: number; letters: number }>();
  const seen = new Set<number>();
  for (const [cik, ticker, title] of companies) {
    // one company a CIK, under its first ticker, as ingest holds one page a record
    if (seen.has(cik) || isNotesRecord(cik)) continue;
    seen.add(cik);
    const namesIn = namesOf(cik, title);
    const keys = [...new Set([2021, 2026].flatMap((y) => namesIn(y)).map(firstWord).filter((k): k is string => !!k))];
    const firms = [...(FDA_FIRMS[cik]?.firms ?? []), ...(APPLICANT_NAMES[cik]?.names ?? [])];
    const handNames = LETTER_NAMES[cik]?.names ?? [];
    const mine = letters.filter(
      (l, i) => wordStarts[i].some((w) => keys.some((k) => w.startsWith(k))) || (firms.length && firmFor(l.company, l.issued, firms)) || handNames.some((n) => n.addressee.test(l.company)),
    );
    const theirs = mine.filter((l) => letterIsCompany(l, cik, namesIn));
    if (!theirs.length) continue;
    const byHand = theirs.filter((l) => !approvalIsCompany({ applicant: l.company, day: l.issued }, cik, namesIn)).length;
    pages.set(ticker, { cik, events: warningLetterEvents(theirs, namesIn, { cik }), byHand, letters: theirs.length });
  }
  const all = [...pages.values()];
  const lettersOn = all.reduce((n, p) => n + p.letters, 0);
  const handOn = all.reduce((n, p) => n + p.byHand, 0);
  const rows = all.reduce((n, p) => n + p.events.length, 0);
  check("before any first price, former names aside: 104 letters on 69 companies, 100 rows a day each; 79 by the approvals' rule (the 78 the 2026-11-11 scout read, and Royal Philips's that oldest first lost) and 25 by the hand list (101 on 67 and 22 before the 2026-11-11 audit's four, and iRhythm's moved to the former name EDGAR lists)",
    lettersOn === 104 && pages.size === 69 && rows === 100 && handOn === 25, { lettersOn, handOn, pages: pages.size, rows });
  const top = [...pages].map(([t, p]) => [t, p.letters] as const).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6).map(([t, n]) => `${t} ${n}`).join(", ");
  check("  …most on Amazon 10, Walmart 5, then Abbott, Fresenius, Lilly and Medline 3 each", top === "AMZN 10, WMT 5, ABT 3, FSNUY 3, LLY 3, MDLN 3", top);
  const onTwo = [...pages].flatMap(([t, p]) => p.events.flatMap((e) => (e.externalId ?? "").split(",").map((slug) => [slug, t] as const)));
  const twoPages = [...new Set(onTwo.map(([slug]) => slug))].filter((slug) => onTwo.filter(([x]) => x === slug).length > 1);
  check("  …103 letters in all: one, Bausch & Lomb's of 2026-09-04, is on Bausch + Lomb's page and on Bausch Health's, its owner's, as the recall map gives the firm to both",
    twoPages.length === 1 && /^bausch-lomb-inc-732398-09042026$/.test(twoPages[0]) && onTwo.filter(([x]) => x === twoPages[0]).map(([, t]) => t).sort().join() === "BHC,BLCO" &&
      new Set(onTwo.map(([slug]) => slug)).size === 103,
    twoPages);
  check("  …and every hand-read name finds its letter",
    Object.entries(LETTER_NAMES).every(([cik, c]) => c.names.every((n) => letters.some((l) => n.addressee.test(l.company) && letterIsCompany(l, Number(cik), namesOfTicker(c.ticker))))));

  console.log("\nThe events a page gets");
  const llyEvents = pages.get("LLY")?.events ?? [];
  const three = llyEvents.find((e) => e.date === "2025-09-09");
  check("a day's letters are one row on that day, the FDA acting, titled by the count and the subject, linked to the first letter's page",
    three?.type === "regulation" && three.title === "3 FDA warning letters: False & Misleading Claims/Misbranded" && three.source === "FDA" &&
      three.url === "https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/eli-lilly-and-company-716462-09092025" &&
      three.id === `fda-wl-59478-2025-09-09` && three.dedupBasis === "fdawl:59478@2025-09-09" && three.sourceKey === "fda_warning_letters" &&
      three.externalId === "eli-lilly-and-company-716462-09092025,eli-lilly-and-company-716475-09092025,eli-lilly-and-company-716485-09092025",
    three);
  check("  …and its description names each addressee as written, the office, the posting and any close-out, then whose account it is",
    /^The FDA's warning letters of September 9, 2025: To Eli Lilly and Company, from Center for Drug Evaluation and Research \(CDER\); posted September 16, 2025 · To Eli Lilly and Company/.test(three?.description ?? "") &&
      /The letter is the FDA's own account of what it found/.test(three?.description ?? ""),
    three?.description);
  const dexcomRow = pages.get("DXCM")?.events.find((e) => e.date === "2025-03-04");
  check("  …one letter is \"FDA warning letter: <subject>\"", dexcomRow?.title === "FDA warning letter: CGMP/QSR/Medical Devices/Adulterated", dexcomRow?.title);
  const closedRow = all.flatMap((p) => p.events).find((e) => /close-out letter/.test(e.description ?? ""));
  const cooperRow = pages.get("COO")?.events.find((e) => e.date === "2021-02-12");
  check("  …a letter the FDA closed out says the close-out letter's own day: CooperSurgical's of 2021-02-12, closed out January 19, 2022, which the FDA posted on June 22, 2022",
    !!closedRow && /; close-out letter [A-Z][a-z]+ \d{1,2}, 20\d\d/.test(closedRow.description ?? "") && /; close-out letter January 19, 2022\./.test(cooperRow?.description ?? ""),
    cooperRow?.description);
  check("  …every description fits 600 characters, every title 200, and every key is unique",
    all.every((p) => p.events.every((e) => (e.description ?? "").length <= 600 && e.title.length <= 200) && new Set(p.events.map((e) => e.dedupBasis)).size === p.events.length));
  check("  …from the company's first price: a letter before it is not on the page",
    warningLetterEvents(lilly, namesOfTicker("LLY"), { cik: rowOf("LLY")[0], from: "2025-09-10" }).length === 0 &&
      warningLetterEvents(lilly, namesOfTicker("LLY"), { cik: rowOf("LLY")[0], from: "2025-09-09" }).length === 1);
  check("  …a row's versions count once in \"· N sources\": the source joins its letters' numbers, so it is a grouped row's",
    GROUPED_ROW_SOURCES.includes("fda_warning_letters") && corroborations([39, 39]) === 1 && corroborations([39, 39, 1]) === 2);

  console.log("\nThe walk: once a week, for every company");
  const db: FakeDb = { reads: null, letters: new Map(), listed: "1972-06-01" };
  const give = (a: Awaited<ReturnType<typeof fetchLetters>>) => async () => a;
  const stored = await walkWarningLetters(fakeDb(db), { budget: { left: 1 }, fetchList: give(whole) });
  check("a first read keeps every letter and the read", stored.read === "stored" && stored.letters === 3807 && db.letters.size === 3807 && db.reads?.letters === 3807 && db.reads.pages === 8, stored);
  const fresh = await walkWarningLetters(fakeDb(db), { budget: { left: 1 }, fetchList: async () => { throw new Error("asked within the week"); } });
  check(`  …is not asked again within ${READ_EVERY_DAYS} days`, fresh.due === false, fresh);
  db.reads!.ageDays = 8;
  const spent = await walkWarningLetters(fakeDb(db), { budget: { left: 0 } });
  check("  …a week on it is due, but asked once a process", spent.due === true && spent.stopped === "this run's read is spent", spent);
  const before = db.letters.size;
  const refused = await walkWarningLetters(fakeDb(db), { budget: { left: 1 }, fetchList: give(busy) });
  check("  …a refused read keeps the letters already kept, and says so", refused.failure?.outcome === "throttled" && db.letters.size === before && db.reads!.ageDays === 8, refused);
  const fewer = { ...whole, letters: whole.letters.slice(1000) };
  await walkWarningLetters(fakeDb(db), { budget: { left: 1 }, fetchList: give(fewer) });
  check("  …and a read never removes a letter kept, as a posted letter stays the FDA's record", db.letters.size === 3807 && db.reads!.ageDays === 0);

  const noWalk: WarningWalk = { due: false, pages: 0, letters: 0 };
  const plan = { edgarName: "ELI LILLY & Co", alsoKnownAs: newsNamesFor(59478), cik: 59478 };
  const step = await warningLettersFor(fakeDb(db), 1, plan, noWalk);
  check("the company's letters from the kept list, from its first price, a complete answer",
    step.outcome === "ok" && step.events.length === llyEvents.length && step.events.some((e) => e.date === "2025-09-09") && !!step.complete, { outcome: step.outcome, n: step.events.length, want: llyEvents.length });
  const throttled = await warningLettersFor(fakeDb(db), 1, plan, { due: true, pages: 0, letters: 0, failure: { outcome: "throttled", httpStatus: 503 } });
  check("  …a refused read leaves the kept letters on the page, logged as refused", throttled.outcome === "throttled" && throttled.events.length === step.events.length && !!throttled.complete);
  const neverRead = await warningLettersFor(fakeDb({ reads: null, letters: new Map(), listed: "1972-06-01" }), 1, plan, { due: true, pages: 0, letters: 0, failure: { outcome: "error", detail: "x" } });
  check("  …a list never read is no complete answer: nothing is taken off", neverRead.outcome === "error" && !neverRead.complete);
  // batch 142, the 2026-11-11 audit's finding 6: EDGAR lists iRhythm Technologies as IRTC's former name to
  // 2026-01-12, and ingest reads it (`partyNamesFor`), so its letter of 2023 needs no hand-read name
  const irtcPlan = { edgarName: "iRhythm Holdings, Inc.", alsoKnownAs: newsNamesFor(1388658), cik: 1388658 };
  const irtcWith = await warningLettersFor(fakeDb({ ...db, former: [["2026-01-12", "iRhythm Technologies, Inc."]] }), 1, irtcPlan, noWalk);
  const irtcWithout = await warningLettersFor(fakeDb(db), 1, irtcPlan, noWalk);
  check("  …iRhythm's letter of 2023-05-25 is on its page by the former name EDGAR lists, and on none without it: no hand-read name stands in for a former name",
    irtcWith.events.some((e) => e.date === "2023-05-25") && !irtcWithout.events.some((e) => e.date === "2023-05-25") && !LETTER_NAMES[1388658],
    irtcWith.events.map((e) => e.date).join());
  const unpriced = await warningLettersFor(fakeDb({ ...db, listed: null }), 1, plan, noWalk);
  const fund = await warningLettersFor(fakeDb(db), 1, { ...plan, fundSeries: true }, noWalk);
  check("  …asked again while it has no prices, and none for a fund's series", unpriced.outcome === "error" && /no prices/.test(unpriced.detail ?? "") && fund.events.length === 0 && fund.outcome === "empty");

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "fda_warning_letters");
  check("the source is id 39, public domain, cleared for commercial use, reviewed 2026-11-11",
    src?.id === 39 && src.license === "public domain" && src.commercialOk && src.reviewedOn === "2026-11-11" && src.attribution === "U.S. Food and Drug Administration", src);
  check("  …the build quotes the FDA's website policy", /are not copyrighted\. They are in the public domain and may be republished/.test(read("lib/fdaWarningLetters.ts").replace(/\s*\*\s*/g, " ")));
  check("  …a company source, quota and refresh noted, scored without the model",
    (COMPANY_SOURCES as readonly string[]).includes("fda_warning_letters") && QUOTAS.fda_warning_letters.perDay === null && SOURCE_TTL_MINUTES.fda_warning_letters === 1440 &&
      deterministicScore({ eventId: 0, kind: "regulation", title: "FDA warning letter: CGMP", sourceKey: "fda_warning_letters" }, { kind: "company", displayName: "Eli Lilly", ticker: "LLY" }, ["lilly"])?.score === 0.95);
  check("  …the ingest walks the list and asks it for every company",
    /await run\("fda_warning_letters", [^\n]+\n\s*const walked = await walkWarningLetters\(client\);[\s\S]{0,400}return warningLettersFor\(client, subjectId, \{[^}]*cik: company\.cik, fundSeries \}, walked\);/.test(read("scripts/ingest.ts")));
  check("  …kept in db/049's two tables, and credited",
    /CREATE TABLE IF NOT EXISTS fda_warning_letters \(\s*path\s+text PRIMARY KEY/.test(read("db/049_fda_warning_letters.sql")) && /CREATE TABLE IF NOT EXISTS fda_warning_reads/.test(read("db/049_fda_warning_letters.sql")) &&
      /and warning letters from the U\.S\. Food and Drug Administration/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /and warning letters from the U\.S\. Food and Drug Administration/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

interface FakeDb {
  reads: { pages: number; letters: number; ageDays: number } | null;
  letters: Map<string, WarningLetter>;
  listed: string | null;
  /** the company's stored EDGAR former names, as rename events give them: [until, name] */
  former?: [string, string][];
}

/** The queries the walk and the company step make. */
function fakeDb(db: FakeDb): PoolClient {
  return {
    query: async (sql: string, params: unknown[] = []) => {
      const s = sql.trim();
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
      if (/^SELECT read_at < now\(\) - make_interval\(days => 7\) AS stale FROM fda_warning_reads WHERE id = 1$/.test(s)) return { rows: db.reads ? [{ stale: db.reads.ageDays > 7 }] : [] };
      if (/^INSERT INTO fda_warning_letters \(path, company, issued, posted, office, subject, response, closeout\)/.test(s)) {
        const [paths, cos, issued, posted, offices, subjects, responses, closeouts] = params as (string | null)[][];
        paths.forEach((path, i) =>
          db.letters.set(path!, { path: path!, company: cos[i]!, issued: issued[i]!, posted: posted[i] ?? "", office: offices[i]!, subject: subjects[i]!, response: responses[i], closeout: closeouts[i] }),
        );
        return { rows: [], rowCount: paths.length };
      }
      if (/^INSERT INTO fda_warning_reads/.test(s)) {
        db.reads = { pages: params[0] as number, letters: params[1] as number, ageDays: 0 };
        return { rows: [] };
      }
      if (/^SELECT count\(\*\)::int AS n FROM fda_warning_reads$/.test(s)) return { rows: [{ n: db.reads ? 1 : 0 }] };
      if (/FROM fda_warning_letters ORDER BY issued, path$/.test(s)) {
        return { rows: [...db.letters.values()].sort((a, b) => a.issued.localeCompare(b.issued) || a.path.localeCompare(b.path)) };
      }
      if (/FROM prices/.test(s)) return { rows: [{ listed: db.listed }] };
      if (/sec:%:rename:%/.test(s)) {
        return { rows: (db.former ?? []).map(([until, name]) => ({ until, body: `EDGAR's company record lists ${name} as a former name of this filer, in use until this day.` })) };
      }
      throw new Error(`unexpected query: ${s.slice(0, 80)}`);
    },
  } as unknown as PoolClient;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
