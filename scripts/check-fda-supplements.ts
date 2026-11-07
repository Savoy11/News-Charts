import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import supplementsFile from "../data/fda-supplements.json";
import tickerIndex from "../data/edgar-tickers.json";
import { deterministicScore } from "../lib/enrich/relevance";
import { dojPossessive } from "../lib/doj";
import { withoutTag } from "../lib/edgarName";
import { APPROVALS, APPLICANT_NAMES, drugsAtFdaUrl } from "../lib/fdaApprovals";
import { FDA_FIRMS } from "../lib/fdaRecalls";
import {
  DRUGSFDA_ENTRY,
  DRUGSFDA_FILE,
  LETTERS,
  SPONSOR_SPELLINGS,
  SUPPLEMENTED,
  holderKept,
  letterUrl,
  nameWords,
  readSupplements,
  sameName,
  supplementEvents,
  supplementTitle,
  type SupplementedApplication,
} from "../lib/fdaSupplements";
import { companyNames } from "../lib/frCompany";
import { namesForYear } from "../lib/ingest/frBackfill";
import { fdaSupplementsFor } from "../lib/ingest/fdaSupplementsFor";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import { OWN_RECORD_FROM, ownPastLabelled } from "../lib/predecessors";
import { isNotesRecord } from "../lib/releaseNames";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
import type { TimelineEvent } from "../lib/types";
import { COMPANY_SOURCES } from "./ingest";

/**
 * The FDA's efficacy supplements (batch 115, the 2026-11-07 proposal 2, approved by the owner on
 * 2026-11-07 with titles from the FDA's data alone).
 *
 *   npm run check:fda-supplements
 *
 * The slice is real: 17 applications of the compilation and one ANDA, kept whole from openFDA's
 * Drugs@FDA file of 2026-11-06 (scripts/fixtures/drugsfda-slice.json.gz), and the committed file must
 * hold exactly what the reader makes of them. The names are the committed index's, former names
 * aside, so the counts below are what a page gets before its EDGAR former names add more at ingest.
 * Offline.
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
const companies = tickerIndex.companies as [number, string, string][];
const rowOf = (ticker: string) => {
  const r = companies.find(([, t]) => t === ticker);
  if (!r) throw new Error(`no ${ticker} in the ticker index`);
  return r;
};
function namesOf(ticker: string): (year: number) => string[] {
  const [cik, , title] = rowOf(ticker);
  const own = dojPossessive(title, possessiveNameFor(cik));
  const cache = new Map<number, string[]>();
  return (year) => {
    let n = cache.get(year);
    if (!n) cache.set(year, (n = [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)]));
    return n;
  };
}

/**
 * First trading days as Yahoo gave them (`firstTradeDate`): batch 105's 26 drugmakers and Akzo Nobel
 * (batch 108), and the 28 more this batch read on 2026-11-07, which a company's stored prices begin with.
 */
const FIRST_PRICES: Record<string, string> = {
  LLY: "1972-06-01", JNJ: "1962-01-02", ABBV: "2013-01-02", PG: "1962-01-02", MRK: "1962-01-02", GE: "1962-01-02", NVS: "1996-11-07",
  AZN: "1993-05-12", AMGN: "1983-06-17", GILD: "1992-01-22", ABT: "1980-03-17", NVO: "1981-04-30", PFE: "1972-06-01", VRTX: "1991-07-24",
  BMY: "1972-06-01", GSK: "1980-03-28", SNY: "2002-07-01", MMM: "1962-01-02", REGN: "1991-04-02", TAK: "2010-01-05", TEVA: "1982-02-16",
  BIIB: "1991-09-17", ALC: "2019-04-09", BMRN: "1999-07-26", BLCO: "2022-05-06", BHC: "1994-03-29", AKZOY: "1989-05-09",
  ACAD: "2004-05-27", AGIO: "2013-07-24", ALKS: "1991-07-16", ALNY: "2004-06-01", AUPH: "2014-09-03", BCRX: "1994-03-04", EXEL: "2000-04-17",
  GEHC: "2022-12-15", INCY: "1993-11-04", IONS: "1991-05-17", JAZZ: "2007-06-01", KPTI: "2013-11-06", MDWD: "2014-03-20", MIRM: "2019-07-18",
  NBIX: "1996-05-23", NUVB: "2020-08-26", OGN: "2021-05-14", PBYI: "2012-04-24", RARE: "2014-01-31", RYTM: "2017-10-09", SIGA: "1997-09-10",
  SNDX: "2016-03-02", SUPN: "2014-12-29", SVYSF: "2012-08-03", TVTX: "2012-11-08", UTHR: "1999-06-17", VNDA: "2006-04-12", ZLDPF: "2013-02-25",
};

// each company is asked only the applications whose applicant holds one of its names' letters or one of
// its firms: the rule itself decides, and asking every company every application takes minutes
const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
const approvalOf = new Map(APPROVALS.map((a) => [`${a.kind}${a.application}`, a]));
const applicantLetters = new Map(SUPPLEMENTED.map((s) => [s.application, alnum(approvalOf.get(s.application)?.applicant ?? "")]));
function pagesFor(applications: readonly SupplementedApplication[], floor: boolean): Map<string, TimelineEvent[]> {
  const out = new Map<string, TimelineEvent[]>();
  const asked = new Set<number>();
  for (const [cik, ticker] of companies) {
    // one company a CIK, under its first ticker, as ingest holds one page a record
    if (asked.has(cik) || isNotesRecord(cik)) continue;
    asked.add(cik);
    const namesIn = namesOf(ticker);
    const keys = [...new Set(namesIn(2020).map(alnum).filter((k) => k.length >= 3))];
    const mapped = cik in FDA_FIRMS || cik in APPLICANT_NAMES;
    const mine = applications.filter((s) => mapped || keys.some((k) => applicantLetters.get(s.application)!.includes(k)));
    if (!mine.length) continue;
    if (floor && !FIRST_PRICES[ticker]) continue;
    const ev = supplementEvents(mine, namesIn, { cik, from: floor ? FIRST_PRICES[ticker] : "" });
    if (ev.length) out.set(ticker, ev);
  }
  return out;
}

async function main(): Promise<void> {
  console.log("\nThe reader, on a slice of Drugs@FDA's file of 2026-11-06");
  const slice = JSON.parse(gunzipSync(readFileSync(join(root, "scripts/fixtures/drugsfda-slice.json.gz"))).toString("utf8")) as {
    meta: { last_updated: string };
    results: Parameters<typeof readSupplements>[0];
  };
  const fromSlice = readSupplements(slice.results);
  const committed = new Map(SUPPLEMENTED.map((s) => [s.application, s]));
  check("the slice's 17 compilation applications read as the committed file holds them, and its ANDA is no compilation application",
    fromSlice.length === 17 && fromSlice.every((s) => JSON.stringify(s) === JSON.stringify(committed.get(s.application))) && !fromSlice.some((s) => s.application.startsWith("ANDA")),
    fromSlice.map((s) => s.application));
  const raw = (app: string) => slice.results.find((r) => r.application_number === app)!;
  const rawKeytruda = raw("BLA125514").submissions ?? [];
  const keytruda = fromSlice.find((s) => s.application === "BLA125514")!;
  check("  …only approved efficacy supplements: Keytruda's 109 of its 128 submissions, its labelling and manufacturing supplements left out",
    rawKeytruda.length === 128 && keytruda.supplements.length === 109 && rawKeytruda.filter((s) => s.submission_class_code === "EFFICACY" && s.submission_status === "AP").length === 109,
    `${rawKeytruda.length} ${keytruda.supplements.length}`);
  const s016 = keytruda.supplements.find((s) => s.number === "16");
  check("  …each with its number, its approval day, its review, its orphan mark and its letter's path: Keytruda's S-016 of 2017-05-10, a priority review",
    JSON.stringify(s016) === JSON.stringify({ number: "16", day: "2017-05-10", review: "priority", orphan: false, letter: "appletter/2017/125514Orig1s016ltr.pdf" }) && keytruda.sponsor === "MERCK SHARP DOHME",
    s016);
  const viread = raw("NDA021356").submissions!.find((s) => s.submission_number === "25")!.application_docs!.find((d) => d.type === "Letter")!;
  const vireadKept = fromSlice.find((s) => s.application === "NDA21356")!.supplements.find((s) => s.number === "25")!;
  check("  …a letter the file links at http:// is asked at https://: Viread's S-025 of 2008-08-11",
    viread.url!.startsWith("http://") && letterUrl(vireadKept.letter!) === "https://www.accessdata.fda.gov/drugsatfda_docs/appletter/2008/021356s025ltr.pdf");
  const pegNoLetter = fromSlice.find((s) => s.application === "BLA103949")!.supplements.find((s) => s.number === "5123");
  check("  …and one for which Drugs@FDA lists no letter keeps none: Peg-Intron's S-5123 of 2008-03-26", pegNoLetter?.letter === null && pegNoLetter.day === "2008-03-26");
  const synthetic = readSupplements([
    {
      application_number: "NDA020702",
      sponsor_name: "  PARKE   DAVIS ",
      submissions: [
        { submission_type: "SUPPL", submission_number: "007", submission_status: "AP", submission_status_date: "20010102", submission_class_code: "EFFICACY", review_priority: "UNKNOWN",
          application_docs: [{ type: "Letter", url: "https://example.com/appletter/x.pdf" }, { type: "Letter", url: "https://www.accessdata.fda.gov/drugsatfda_docs/../secret.pdf" }] },
        { submission_type: "SUPPL", submission_number: "8", submission_status: "TA", submission_status_date: "20010103", submission_class_code: "EFFICACY" },
        { submission_type: "SUPPL", submission_number: "9", submission_status: "AP", submission_status_date: "2001", submission_class_code: "EFFICACY" },
        { submission_type: "SUPPL", submission_number: "10", submission_status: "AP", submission_status_date: "20010104", submission_class_code: "LABELING" },
        { submission_type: "SUPPL", submission_number: "11", submission_status: "AP", submission_status_date: "20010105", submission_class_code: "EFFICACY", review_priority: "PRIORITY",
          submission_property_type: [{ code: "Orphan" }],
          application_docs: [
            { type: "Letter", date: "20010109", url: "http://www.accessdata.fda.gov/drugsatfda_docs/appletter/2001/20702s010ltr.pdf" },
            { type: "Letter", date: "20010110", url: "https://www.accessdata.fda.gov/drugsatfda_docs/appletter/2001/20702s011; 20703s004ltr.pdf" },
            { type: "Label", date: "20010101", url: "https://www.accessdata.fda.gov/drugsatfda_docs/label/2001/20702s011lbl.pdf" },
          ] },
      ],
    },
    { application_number: "NDA999999", sponsor_name: "NOT IN THE COMPILATION", submissions: [{ submission_type: "SUPPL", submission_number: "1", submission_status: "AP", submission_status_date: "20010101", submission_class_code: "EFFICACY" }] },
  ]);
  const syn = synthetic[0];
  check("  …a letter off the FDA's own host, or one stepping out of its folder, is no letter; a supplement not approved, with no whole day, or of another class is none",
    synthetic.length === 1 && syn.sponsor === "PARKE DAVIS" && syn.supplements.length === 2 && syn.supplements[0].number === "7" && syn.supplements[0].letter === null && syn.supplements[0].review === null,
    synthetic);
  check("  …and of two letters the supplement's own is kept, its file name's spaces and semicolons encoded in its address",
    syn.supplements[1].letter === "appletter/2001/20702s011; 20703s004ltr.pdf" && syn.supplements[1].orphan && syn.supplements[1].review === "priority" &&
      letterUrl(syn.supplements[1].letter!) === "https://www.accessdata.fda.gov/drugsatfda_docs/appletter/2001/20702s011%3B%2020703s004ltr.pdf",
    syn.supplements[1]);

  console.log("\nThe committed file");
  const all = SUPPLEMENTED.flatMap((a) => a.supplements);
  const meta = supplementsFile as unknown as { read: string; updated: string };
  check("data/fda-supplements.json: 3,132 approved efficacy supplements on 861 of the compilation's applications, read 2026-11-07 from openFDA's file of 2026-11-06",
    all.length === 3132 && SUPPLEMENTED.length === 861 && meta.read === "2026-11-07" && meta.updated === "2026-11-06" && SUPPLEMENTED.every((s) => approvalOf.has(s.application)),
    `${all.length} on ${SUPPLEMENTED.length}`);
  check("  …2,743 with a letter (22 of them pages of the 1990s, the rest PDFs), 1,039 priority reviews and 1,779 standard, 756 marked orphan",
    all.filter((s) => s.letter).length === 2743 && all.filter((s) => s.letter && /\.html?$/i.test(s.letter)).length === 22 &&
      all.filter((s) => s.review === "priority").length === 1039 && all.filter((s) => s.review === "standard").length === 1779 && all.filter((s) => s.orphan).length === 756,
    `${all.filter((s) => s.letter).length} letters; ${all.filter((s) => s.review === "priority").length} priority; ${all.filter((s) => s.orphan).length} orphan`);
  check("  …every letter is a path below the FDA's document folder, with no step out of it", all.every((s) => s.letter === null || (!/^\/|(?:^|\/)\.\.?(?:\/|$)|[?#\\]/.test(s.letter) && letterUrl(s.letter).startsWith(LETTERS))));

  console.log("\nThe holder never left: today's sponsor is the applicant by name");
  const same: [string, string][] = [
    ["Novartis Pharmaceuticals Corporation", "NOVARTIS PHARMS CORP"],
    ["Merck Sharp & Dohme", "MERCK SHARP DOHME"],
    ["Takeda Pharmaceuticals U.S.A., Inc.", "TAKEDA PHARMS USA"],
    ["Zealand Pharma A/S", "ZEALAND PHARMA"],
    ["Bayer HealthCare Pharmaceuticals", "BAYER HLTHCARE"],
    ["Dompé farmaceutici S.p.A.", "DOMPE FARMACEUTICI"],
    ["Centocor", "CENTOCOR INC"],
  ];
  for (const [a, b] of same) check(`  "${a}" is "${b}"`, sameName(a, b), [...nameWords(a)].join(" ") + " / " + [...nameWords(b)].join(" "));
  const differ: [string, string, string][] = [
    ["Abbott Laboratories", "ABBVIE INC", "Humira's"],
    ["Onyx Pharmaceuticals", "ONYX PHARMS AMGEN", "Amgen's since 2013"],
    ["Lilly Icos", "LILLY", "a joint venture's, Lilly's since 2007"],
    ["Merck", "MSD SUB MERCK", "a move inside Merck no name shows"],
    ["Aventis Pharmaceuticals", "SANOFI AVENTIS US", "Sanofi's since 2004"],
    ["Upjohn", "PHARMACIA AND UPJOHN", "a merger's"],
    ["LG Life Sciences", "LG CHEM LTD", "merged into LG Chem in 2017"],
    ["Sage Therapeutics", "SAGE THERAP SUPERNUS", "Supernus's since 2025"],
    ["Pharmaceuticals Inc.", "PHARMS INC", "no name at all"],
  ];
  for (const [a, b, why] of differ) check(`  "${a}" is not "${b}" (${why})`, !sameName(a, b));
  const lly = rowOf("LLY")[0];
  const bmy = rowOf("BMY")[0];
  check("…or a name the company holds, or Drugs@FDA's short form of one: Loxo's Retevmo, \"ELI LILLY AND CO\" today, Lilly's Alimta, \"LILLY\", and Novo Nordisk's Ozempic, \"NOVO\"",
    holderKept("Loxo Oncology, Inc.", "ELI LILLY AND CO", lly, ["ELI LILLY", "ELI LILLY & Co"]) && holderKept("Eli Lilly", "LILLY", lly, []) &&
      holderKept("Bristol-Myers Squibb", "BRISTOL", bmy, []) && holderKept("Novo Nordisk", "NOVO", rowOf("NVO")[0], []) && !holderKept("Eli Lilly", "LILLY", bmy, []) &&
      !holderKept("Abbott Laboratories", "ABBVIE INC", rowOf("ABT")[0], ["ABBOTT LABORATORIES"]));
  check("  …each short form read by hand, said why, under the company's own ticker",
    Object.entries(SPONSOR_SPELLINGS).every(([cik, list]) => list.every((s) => s.why.length > 30 && companies.some(([c, t]) => c === Number(cik) && t === s.ticker))));

  console.log("\nOn the page of the company that held the drug that day (the proposal's cases)");
  const slicePages = pagesFor(fromSlice, true);
  const where = (app: string, number: string) => [...slicePages].filter(([, ev]) => ev.some((e) => e.externalId === `${app}-S${number}`)).map(([t]) => t);
  const keyEvent = slicePages.get("MRK")?.find((e) => e.externalId === "BLA125514-S16");
  check("Keytruda's S-016 of 2017-05-10 lands on MRK, and only there", where("BLA125514", "16").join() === "MRK" && keyEvent?.date === "2017-05-10");
  check("Remicade's psoriasis supplement of 2006-09-26 (S-5129) lands on JNJ, through Centocor", where("BLA103772", "5129").join() === "JNJ");
  check("no Humira supplement lands on any page: Abbott's then, AbbVie's now, and no field gives the day", ![...slicePages.values()].flat().some((e) => e.externalId?.startsWith("BLA125057-")));
  const peg = slicePages.get("MRK")?.find((e) => e.externalId === "BLA103949-S5171");
  const pegLabelled = peg && ownPastLabelled(peg, rowOf("MRK")[0]);
  check("a Schering supplement before 2009-11-03 is on MRK with batch 110's label: Peg-Intron's S-5171 of 2008-12-11",
    !!pegLabelled && pegLabelled.source === `FDA · ${OWN_RECORD_FROM[rowOf("MRK")[0]].label}` && /Schering's BLA 103949/.test(peg?.description ?? ""), pegLabelled);
  check("an Organon supplement before 2007-11-19 lands on AKZOY: Remeron's of 2002-04-09 and NuvaRing's of 2005-07-29; NuvaRing's of 2013 on MRK, Organon then Merck's",
    where("NDA20415", "9").join() === "AKZOY" && where("NDA21187", "12").join() === "AKZOY" && where("NDA21187", "21").join() === "MRK");
  check("a Celgene supplement before 2019-11-20 lands on no page (Revlimid's of 2019-05-28); one after on BMY (Pomalyst's of 2020-05-14)",
    where("NDA21880", "57").length === 0 && where("NDA204026", "23").join() === "BMY" && where("NDA204026", "6").length === 0);
  check("Lipitor (Parke-Davis's, UPJOHN today), Isentress (\"MSD SUB MERCK\") and Cialis (Lilly ICOS's) land on no page",
    ["NDA20702", "NDA22145", "NDA21368"].every((app) => ![...slicePages.values()].flat().some((e) => e.externalId?.startsWith(`${app}-`))));
  check("old Biogen's Avonex supplements of 2002 and early 2003 are no page's; its supplement of 2012 is BIIB's",
    where("BLA103628", "5008").length === 0 && where("BLA103628", "5001").length === 0 && where("BLA103628", "5189").join() === "BIIB");
  check("Sandoz's Lescol on NVS from the merger, not before NVS listed (1996-03-20); Lilly's Alimta under \"LILLY\"; BMS's Zerit under \"BRISTOL\"; Loxo's Retevmo on LLY",
    where("NDA20261", "12").join() === "NVS" && where("NDA20261", "6").length === 0 && where("NDA21462", "15").join() === "LLY" && where("NDA20412", "16").join() === "BMY" && where("NDA213246", "7").join() === "LLY");
  const vireadEvent = slicePages.get("GILD")?.find((e) => e.externalId === "NDA21356-S25");
  check("an http:// letter is asked at https://: Viread's row links its letter there", vireadEvent?.url === "https://www.accessdata.fda.gov/drugsatfda_docs/appletter/2008/021356s025ltr.pdf");

  console.log("\nThe row a page gets");
  check("an efficacy supplement is the FDA acting, on its day, titled from the data alone, keyed by application and number",
    keyEvent?.type === "regulation" && keyEvent.title === "FDA approves an efficacy supplement to Keytruda (pembrolizumab)" && keyEvent.sourceKey === "fda_supplements" &&
      keyEvent.dedupBasis === `fda-supplement:${rowOf("MRK")[0]}@BLA125514-S16` && keyEvent.url === "https://www.accessdata.fda.gov/drugsatfda_docs/appletter/2017/125514Orig1s016ltr.pdf" &&
      keyEvent.description === "Supplement 16 to Merck Sharp & Dohme's BLA 125514, approved May 10, 2017 (priority review). Drugs@FDA classes it as an efficacy supplement; the letter it lists, linked, says what it provides.",
    keyEvent);
  const pegNone = slicePages.get("MRK")?.find((e) => e.externalId === "BLA103949-S5123");
  check("  …one with no letter links Drugs@FDA's page of the application and says so", pegNone?.url === drugsAtFdaUrl("103949") && /lists no letter for it\.$/.test(pegNone?.description ?? ""));
  check("  …a drug with no proprietary name is titled by its ingredient", supplementTitle({ ...APPROVALS[0], name: "" }) === `FDA approves an efficacy supplement to ${APPROVALS[0].ingredient}`);

  console.log("\nEvery listed company against every supplement");
  const unfloored = pagesFor(SUPPLEMENTED, false);
  const floored = pagesFor(SUPPLEMENTED, true);
  const rows = [...floored.values()].flat();
  const nUnfloored = [...unfloored.values()].reduce((n, v) => n + v.length, 0);
  check("before any first price: 1,212 supplements on 51 companies, 441 before 2017", nUnfloored === 1212 && unfloored.size === 51 && [...unfloored.values()].flat().filter((e) => e.date < "2017").length === 441,
    `${nUnfloored} on ${unfloored.size}; ${[...unfloored.values()].flat().filter((e) => e.date < "2017").length} before 2017`);
  check("from first prices: 1,191 on 48 companies, 420 before 2017, 131 before 2005 (1990s 56, 2000s 162, 2010s 408, 2020s 565)",
    rows.length === 1191 && floored.size === 48 && rows.filter((e) => e.date < "2017").length === 420 && rows.filter((e) => e.date < "2005").length === 131 &&
      ["199", "200", "201", "202"].map((d) => rows.filter((e) => e.date.startsWith(d)).length).join() === "56,162,408,565",
    `${rows.length} on ${floored.size}; ${rows.filter((e) => e.date < "2017").length} before 2017; ${rows.filter((e) => e.date < "2005").length} before 2005`);
  const top = [...floored].map(([t, v]) => [t, v.length] as const).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([t, n]) => `${t} ${n}`).join(", ");
  check("  …most on Bristol-Myers Squibb 172, Merck 171, Novartis 116, Lilly 97, Johnson & Johnson 96, AstraZeneca 71, Gilead 71, Amgen 58", top === "BMY 172, MRK 171, NVS 116, LLY 97, JNJ 96, AZN 71, GILD 71, AMGN 58", top);
  check("  …Ozempic's supplements are Novo Nordisk's, under \"NOVO\"", (floored.get("NVO") ?? []).filter((e) => e.externalId?.startsWith("NDA209637-")).length === 3);
  const mrkPast = (floored.get("MRK") ?? []).filter((e) => ownPastLabelled(e, rowOf("MRK")[0]).source !== e.source);
  check("  …14 of Merck's are Schering-Plough's, labelled on its page: Intron A's, Peg-Intron's, Eulexin's and Organon's Zemuron of 2008", mrkPast.length === 14 && mrkPast.every((e) => e.date < "2009-11-04"), mrkPast.length);
  check("  …no title or description says \"new indication\", which only a letter can", !rows.some((e) => /new indication/i.test(`${e.title} ${e.description}`)));
  check("  …every description fits 600 characters and every key is unique on its page",
    rows.every((e) => (e.description ?? "").length <= 600) && [...floored.values()].every((v) => new Set(v.map((e) => e.dedupBasis)).size === v.length));
  check("  …and no supplement is on two pages", rows.length === new Set(rows.map((e) => e.externalId)).size, rows.length - new Set(rows.map((e) => e.externalId)).size);

  console.log("\nThe company step");
  const step = await fdaSupplementsFor(fakeDb("1972-06-01"), 1, { edgarName: "ELI LILLY & Co", alsoKnownAs: newsNamesFor(59478), cik: 59478 });
  check("the company's supplements from its first price, with no request, as a complete answer",
    step.outcome === "ok" && step.events.length === 97 && step.events.some((e) => e.externalId === "NDA21462-S15") && !!step.complete, `${step.outcome} ${step.events.length}`);
  const none = await fdaSupplementsFor(fakeDb(null), 1, { edgarName: "ELI LILLY & Co", alsoKnownAs: [], cik: 59478 });
  const fund = await fdaSupplementsFor(fakeDb("1972-06-01"), 1, { edgarName: "ELI LILLY & Co", alsoKnownAs: [], cik: 59478, fundSeries: true });
  check("  …asked again while it has no prices, and none for a fund's series", none.outcome === "error" && /no prices/.test(none.detail ?? "") && fund.events.length === 0 && fund.outcome === "empty");

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "fda_supplements");
  check("the source is id 36, public domain under CC0, cleared for commercial use, reviewed 2026-11-07",
    src?.id === 36 && src.license === "public domain (CC0 1.0)" && src.commercialOk && src.reviewedOn === "2026-11-07" && /Food and Drug Administration/.test(src.attribution) && new Set(SOURCES.map((s) => s.id)).size === SOURCES.length,
    src);
  check("  …the build quotes openFDA's licence", /made available with a Creative Commons CC0 1\.0 Universal dedication\. Under CC0, FDA has dedicated the work to the public domain/.test(read("lib/fdaSupplements.ts").replace(/\s*\*\s*/g, " ")));
  check("  …a company source, quota and refresh noted, scored without the model",
    (COMPANY_SOURCES as readonly string[]).includes("fda_supplements") && QUOTAS.fda_supplements.perDay === null && SOURCE_TTL_MINUTES.fda_supplements === 1440 &&
      deterministicScore({ eventId: 0, kind: "regulation", title: "FDA approves an efficacy supplement to Alimta", sourceKey: "fda_supplements" }, { kind: "company", displayName: "Eli Lilly", ticker: "LLY" }, ["lilly"])?.score === 0.95);
  check("  …the ingest asks it for every company", /await run\("fda_supplements", [^\n]+\n\s*fdaSupplementsFor\(client, subjectId, \{[^}]*cik: company\.cik, fundSeries \}\),/.test(read("scripts/ingest.ts")));
  check("  …synced by `npm run sync:fda-supplements` from openFDA's file, and credited",
    /"sync:fda-supplements": "tsx scripts\/sync-fda-supplements\.ts"/.test(read("package.json")) && DRUGSFDA_FILE === "https://download.open.fda.gov/drug/drugsfda/drug-drugsfda-0001-of-0001.json.zip" &&
      DRUGSFDA_ENTRY === "drug-drugsfda-0001-of-0001.json" &&
      /new-drug approvals and their efficacy supplements from the U\.S\. Food and Drug Administration/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /new-drug approvals and their efficacy supplements from the U\.S\. Food and Drug Administration/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")));
  check("  …and the owner's approval is on the proposal", /## 2\. New indications and other efficacy supplements[^#]*\*\*Status:\*\* APPROVED[^\n]*\n?[^#]*Built in batch 115/.test(read("docs/proposals/2026-11-07-proposals.md")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

/** The queries the company step makes: its first price, and its stored former names (none here). */
function fakeDb(listed: string | null): PoolClient {
  return {
    query: async (sql: string) => {
      if (/FROM prices/.test(sql)) return { rows: [{ listed }] };
      if (/sec:%:rename:%/.test(sql)) return { rows: [] };
      throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
    },
  } as unknown as PoolClient;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
