/**
 * The FDA's own press releases and talk papers, 1962–2014 (batch 169, the 2026-11-22 proposal 3, approved by the
 * owner that day with call (a): a release on the day of an approval the page holds joins that approval's row).
 *
 *   npm run check:fda-history
 *
 * Offline: the committed file (`data/fda-history.json.gz`, written by `npm run sync:fda-history` from openFDA's
 * historical documents as served on 2026-11-22), twelve of those documents as openFDA's zip gives them
 * (scripts/fixtures/fda-history-documents.zip), and the first trading days the other checks' fixtures carry.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { GROUPED_ROW_SOURCES } from "../lib/corroboration";
import { dojPossessive } from "../lib/doj";
import { withoutTag } from "../lib/edgarName";
import { deterministicScore } from "../lib/enrich/relevance";
import { APPROVALS, approvalEvents, approvalIsCompany } from "../lib/fdaApprovals";
import {
  FDA_HISTORY_PAGE,
  MOST_COMPANIES,
  NAMED_BY_HAND,
  REFUSED,
  companyDocuments,
  documentDay,
  fdaHistory,
  fdaHistoryEvents,
  joinedReleases,
  leadOf,
  namedBy,
  proseParty,
  readHistoricalDocuments,
  releaseFor,
  releaseWords,
  releasesByDay,
  sentenceAt,
} from "../lib/fdaHistory";
import { companyNames } from "../lib/frCompany";
import { fdaApprovalsFor } from "../lib/ingest/fdaApprovalsFor";
import { fdaHistoryFor } from "../lib/ingest/fdaHistoryFor";
import { namesForYear } from "../lib/ingest/frBackfill";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
import { COMPANY_SOURCES } from "./ingest";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail: unknown = ""): void {
  if (ok) pass++;
  else fail++;
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${d ? ` — ${d.slice(0, 300)}` : ""}`);
}
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

const EXPECTED = {
  total: 8_858,
  dated: 6_374,
  kept: 536,
  refused: 65,
  // the companies' rows, the two-company limit and the refusals applied, before and from first prices
  rows: 481,
  companies: 80,
  // from first prices, for the 954 companies the fixtures read
  fromFirst: 335,
  fromFirstPages: 32,
  fromFirst1993: 90,
  joined: 38,
  top: "LLY 54, ABT 42, PFE 35, JNJ 32, TEVA 25, NVS 24, MRK 19, PG 17, SNY 11, GE 9",
};

const companies = (tickerIndex as unknown as { companies: [number, string, string][] }).companies;
const titleOf = (cik: number) => companies.find((c) => c[0] === cik)![2];
const tickerOf = (cik: number) => companies.find((c) => c[0] === cik)![1];
/** A company's names of a year as ingest builds them, less the former names only the database holds. */
const namesOf = (cik: number) => (year: number) => {
  const title = titleOf(cik);
  const own = dojPossessive(title, possessiveNameFor(cik));
  return [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)];
};
const LLY = 59478;
const GE = 40545;
const PG = 80424;
const AMGN = 318154;
const IVFH = 312257;
const KR = 56873;

async function main(): Promise<void> {
  const zip = readFileSync(join(__dirname, "fixtures", "fda-history-documents.zip"));
  const { documents, lastUpdated } = readHistoricalDocuments(zip);
  const doc = (id: string) => documents.find((d) => d.id === id)!;

  console.log("The file read");
  check("openFDA's zip read: every document with its year, its kind, its text and an id of its own, the file's day of update kept",
    documents.length === 12 && lastUpdated === "2026-11-18" && documents.every((d) => /^[0-9a-f]{16}$/.test(d.id) && Number.isInteger(d.year) && (d.type === "pr" || d.type === "talk")),
    { n: documents.length, lastUpdated });
  check("  …a day read from the head, spelled or in figures, of the document's own year: Ilosone's talk paper of 1979-08-30, the Epogen release of 1989-06-01",
    doc("59118a837a5c235c").day === "1979-08-30" && doc("59118a837a5c235c").type === "talk" && doc("686c0856318d9fdb").day === "1989-06-01" &&
      documentDay(1964, "FOR IMMEDIATE RELEASE 1/15/64 The Food and Drug Administration") === "1964-01-15" && documentDay(1964, "Wednesday, January 15, 1964 ") === "1964-01-15");
  check("  …none where the head's day is of another year or the OCR spoils it (\"N0vember\" in a release of 1977)",
    documentDay(1965, "December 11, 1964, Washington") === null && doc("23987d96fb8289c4").day === null);
  check("  …the day beside the release line or the talk paper's number first, its OCR letters read as figures (\"Sept. l8, 1989\"); a revision's day, a note's and a later paper's never (the audit's finding 4)",
    documentDay(1989, "FDA Talk Papers are prepared …\n\nT89-55 Donald C McLearn\nSept. l8, 1989 - (301) 443-3285\n\nLilly Recalls Drugs Following FDA Inspections\nAn inspection of August 25, 1989 found …") === "1989-09-18" &&
      documentDay(2007, "FDA NEWS RELEASE\n\nThis press release was revised on March 21, 2007 to include changes. It was\nrevised again on March 24, 2007.\n\nFOR IMMEDIATE RELEASE\n\nMarch 17, 2007\n\nRecall of Pet Foods") === "2007-03-17" &&
      documentDay(1976, "T76-63 Emil Corwin\n(Updates press release 76—l4 issued (202)-~245—ll44\nMay ll, 1976)\n\nOctober 4, l976\n\nCYCLAMATE\n\nThe formal notice appears in the FEDERAL REGISTER October 4, 1976.") === "1976-10-04" &&
      documentDay(1977, "177-44 Nancy Glick\nAugust 15, 1977 (301)--443-3285\n\nAs the Agency's talk paper T77-28, dated June 17, 1977, on the status of hearings …") === "1977-08-15");
  check("  …in the committed file, Lilly's recall paper of 1989-09-18, the Menu Foods recall of 2007-03-17 on WMT and KR, the cyclamate paper of 1976-10-04",
    fdaHistory().find((d) => d.id === "5b46d9daeba961a7")?.day === "1989-09-18" && fdaHistory().find((d) => d.id === "f78a459d1ea537b8")?.day === "2007-03-17" &&
      fdaHistory().find((d) => d.id === "fdb92f7ee847d297")?.day === "1976-10-04");
  check("  …the lead begins after the head's day, the talk paper's note, the letterhead and the telephone numbers left off",
    /^ILOSONE FDA's Bureau of Drugs on Wednesday asked Dista Products Company/.test(leadOf(doc("59118a837a5c235c").text, 1979)) &&
      /^G\.E\. SUNLAMP KIT RECALL The Food and Drug Administration today announced/.test(leadOf(doc("8c7b1ea16b2fb066").text, 1977)),
    leadOf(doc("59118a837a5c235c").text, 1979).slice(0, 120));

  console.log("\nThe prose rule");
  const ilosone = namedBy(doc("59118a837a5c235c"), LLY, namesOf(LLY)(1979));
  check("Ilosone's withdrawal names Eli Lilly, the sentence the document's own, the talk paper's number, writer and day left off",
    ilosone?.party === "Eli Lilly" && /^ILOSONE FDA's Bureau of Drugs on Wednesday asked Dista Products Company, a divis- ion of Eli Lilly and Company, to remove from the market voluntarily the anti- biotic Ilosone/.test(ilosone?.sentence ?? ""), ilosone);
  const lamp = namedBy(doc("8c7b1ea16b2fb066"), GE, namesOf(GE)(1977));
  check("  …GE's sunlamp kits of 1977, \"the General Electric Company is recalling 14,000 defective Model RSK6 Sunlamp Kits\"",
    /General Electric Company is recalling 14,000 defective Model RSK6 Sunlamp Kits\.$/.test(lamp?.sentence ?? ""), lamp);
  const juice = namedBy(doc("433885c75516e262"), PG, namesOf(PG)(1991));
  check("  …Procter & Gamble by its whole name printed capitalised, with no legal word: the Citrus Hill seizure of 1991",
    juice?.party === "Procter & Gamble" && /notifying Procter & Gamble that the labeling and promotion/.test(juice.sentence), juice);
  check("  …a one-word name only with a legal word after it; a name not printed capitalised is no name",
    !proseParty("the drug made by Pfizer was withdrawn", ["Pfizer Inc."]) && !!proseParty("the drug made by Pfizer Inc. was withdrawn", ["Pfizer Inc."]) &&
      !proseParty("the soap of procter & gamble", ["Procter & Gamble"]));
  check("  …a name after another capitalised word is the end of another firm's: Marion Merrell Dow Inc. is not Dow, Hoechst Celanese Corporation not Celanese",
    !namedBy(doc("b73fefc089fd488c"), 1751788, ["Dow Inc."]) && !namedBy(doc("4be226646577c57e"), 1306830, ["Celanese Corporation"]) &&
      !proseParty("requested Marion Merrell Dow Inc., the manufacturer", ["Dow Inc."]) && !!proseParty("requested Dow Inc., the manufacturer", ["Dow Inc."]));
  check("  …unless that word is one a name follows: a town's \"-based\", a headline's last word in capitals, \"The\", \"by\"",
    !!namedBy(doc("9c90dd67ab956c45"), LLY, namesOf(LLY)(2010)) && !!namedBy(doc("66202a23dd8b8bd9"), LLY, namesOf(LLY)(1978)) &&
      !!proseParty("marketed by New York-based Pfizer Inc.", ["Pfizer Inc."]) && !!proseParty("HUMAN INSULIN Eli Lilly and Company announced", ["Eli Lilly and Company"]) &&
      !proseParty("MARION MERRELL DOW INC.", ["Dow Inc."]));
  check("  …never a name the company's record took later: AT&T Corp. before SBC took its name is not T's",
    !namedBy({ text: "The FDA said AT&T Corp. would test the device.", day: "1990-05-01" }, 732717, ["AT&T Corp."]) &&
      !!namedBy({ text: "The FDA said AT&T Corp. would test the device.", day: "2006-05-01" }, 732717, ["AT&T Corp."]));
  check("  …the sentence not cut at a title, an initial or a legal word before a lower-case one, and cut at a legal word before a new sentence",
    sentenceAt("Intro. The product was developed by Dr. Fu-Keun Lin of Amgen Inc. in 1983. Next.", 40) === "The product was developed by Dr. Fu-Keun Lin of Amgen Inc. in 1983." &&
      sentenceAt("Intro. Cymbalta is made by Eli Lilly and Co. For more information call.", 30) === "Cymbalta is made by Eli Lilly and Co.");

  console.log("\nThe committed file");
  const file = JSON.parse(gunzipSync(readFileSync(join(__dirname, "..", "data", "fda-history.json.gz"))).toString()) as { read: string; total: number; dated: number; lastUpdated: string };
  const docs = fdaHistory();
  check(`openFDA's file of 2026-11-22: ${EXPECTED.total.toLocaleString("en-US")} documents, ${EXPECTED.dated.toLocaleString("en-US")} of 1962 on dated by their heads, ${EXPECTED.kept} naming a listed company`,
    file.read === "2026-11-22" && file.lastUpdated === "2026-11-18" && file.total === EXPECTED.total && file.dated === EXPECTED.dated && docs.length === EXPECTED.kept,
    { read: file.read, total: file.total, dated: file.dated, kept: docs.length });
  check("  …each with its kind, day, lead and the companies it names, each with its party and sentence, in order of day",
    docs.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.day) && d.day.startsWith(String(d.year)) && d.lead && d.named.length && d.named.every((n) => n.party && n.sentence)) &&
      docs.every((d, i) => i === 0 || docs[i - 1].day <= d.day));
  const fileDoc = (id: string) => docs.find((d) => d.id === id);
  check(`the ${EXPECTED.refused} rows refused by hand each name a document the file holds and a company it names, with the reason`,
    Object.keys(REFUSED).length === EXPECTED.refused &&
      Object.entries(REFUSED).every(([k, v]) => {
        const [id, cik] = k.split(":");
        const d = fileDoc(id);
        return !!d && d.named.some((n) => n.cik === Number(cik)) && tickerOf(Number(cik)) === v.ticker && /^\d{4}-\d{2}-\d{2}: .{25,}/.test(v.why) && v.why.startsWith(d.day);
      }),
    Object.keys(REFUSED).length);
  check("  …\"Innovative Food Defense\", a grant programme, is not Innovative Food Holdings: no row",
    !!REFUSED[`1ebe7c767109ce6c:${IVFH}`] && !companyDocuments(docs, IVFH).some((x) => x.doc.id === "1ebe7c767109ce6c"));
  check("the rows the rule refuses that the hand read keeps, each a document the file holds naming the company by its quoted sentence: Mylotarg's withdrawal of 2010 on PFE, its heading running into \"Pfizer Inc.\"",
    Object.entries(NAMED_BY_HAND).every(([k, v]) => {
      const [id, cik] = k.split(":");
      const d = fileDoc(id);
      return !!d && tickerOf(Number(cik)) === v.ticker && d.named.some((n) => n.cik === Number(cik) && n.party === v.party && n.sentence === v.quote) && v.why.startsWith(d.day);
    }) &&
      !proseParty("Cancer Treatment Mylotarg from U.S. Market Pfizer Inc. today announced", ["Pfizer Inc."]) &&
      /^FDA press release: Pfizer Inc\. today announced the voluntary withdrawal from the U\.S\. market of the drug Mylotarg/.test(fdaHistoryEvents(docs, { cik: 78003 }).find((e) => e.date === "2010-06-21")?.title ?? ""),
    Object.keys(NAMED_BY_HAND));
  const pharmacies = fileDoc("949f1b5f4ba53f34");
  check(`a document naming more than ${MOST_COMPANIES} listed companies names none: the pharmacies of 1999-09-30, Kroger and Weis Markets among them`,
    !!pharmacies && pharmacies.named.length > MOST_COMPANIES && pharmacies.named.some((n) => n.cik === KR) && !companyDocuments(docs, KR).some((x) => x.doc.id === "949f1b5f4ba53f34"));

  console.log("\nThe rows");
  const lly = fdaHistoryEvents(docs, { cik: LLY });
  const ilo = lly.find((e) => e.date === "1979-08-30");
  check("Ilosone's withdrawal of 1979-08-30 is a row on LLY: the talk paper's sentence its title, its lead the description, linked to the dataset's page",
    !!ilo && /^FDA talk paper: .*Ilosone/.test(ilo.title) && /^The FDA's own talk paper, as its OCR text reads: ILOSONE/.test(ilo.description ?? "") &&
      /A talk paper was written for FDA staff answering questions, not for release\./.test(ilo.description ?? "") && ilo.url === FDA_HISTORY_PAGE &&
      ilo.sourceKey === "fda_history" && ilo.externalId === "59118a837a5c235c" && ilo.type === "regulation",
    ilo);
  check("  …GE's sunlamp kits on GE, from 1977, before any held FDA source", fdaHistoryEvents(docs, { cik: GE, from: "1962-01-02" }).some((e) => e.date === "1977-05-03"));
  const first: Record<string, string> = {};
  for (const [f, k] of [["digest-1985-entries.json.gz", "firstPrices"], ["eeoc-listing.json.gz", "first"], ["fda-device-recalls.json.gz", "first"], ["occ-actions.json.gz", "first"]] as const) {
    Object.assign(first, JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", f))).toString())[k]);
  }
  const amgnFrom = first.AMGN;
  /** A company's approval rows with their releases, and its own rows less the releases they carry, as the two ingest steps build them. */
  const pages = (cik: number, from: string) => {
    const releases = releasesByDay(docs, cik);
    const approvals = APPROVALS.filter((a) => a.day >= from && approvalIsCompany(a, cik, namesOf(cik)));
    const joinedIds = joinedReleases(approvals, releases);
    return {
      approvalRows: approvalEvents(APPROVALS, namesOf(cik), { cik, from, release: (a) => { const r = releaseFor(a, releases); return r ? releaseWords(r) : undefined; } }),
      ownRows: fdaHistoryEvents(docs, { cik, from, joined: joinedIds }),
      joined: joinedIds,
    };
  };
  const amgnPage = pages(AMGN, amgnFrom);
  const epogen = amgnPage.approvalRows.find((e) => e.date === "1989-06-01");
  check("a release about an approval of its day joins the approval's row and makes no row of its own (the owner's call): Epogen, 1989-06-01, on AMGN",
    !!epogen && /^FDA approves Epogen/.test(epogen.title) && /The FDA's press release that day: "The product was developed in 1983 by Dr\. Fu—Keun Lin of Amgen Inc\./.test(epogen.description ?? "") &&
      !amgnPage.ownRows.some((e) => e.date === "1989-06-01") && fdaHistoryEvents(docs, { cik: AMGN, from: amgnFrom }).some((e) => e.date === "1989-06-01"),
    epogen?.description);
  check("  …an approval with no release that day reads as before", approvalEvents(APPROVALS, namesOf(AMGN), { cik: AMGN, from: amgnFrom }).every((e) => !/The FDA's press release that day/.test(e.description ?? "")));
  const llyPage = pages(LLY, first.LLY);
  const strattera = llyPage.approvalRows.find((e) => e.date === "2002-11-26" && /Strattera/.test(e.title));
  const merck = pages(310158, first.MRK);
  const primaxin = merck.approvalRows.find((e) => e.date === "1985-11-26" && /Primaxin/.test(e.title));
  check("  …only a release that names the approval's drug: Strattera's row carries the Strattera paper, the Forteo paper of that day is a row of its own; Primaxin's carries none of Merck's trientine release, which is a row (the audit's finding 5)",
    !!strattera && releaseFor({ day: "2002-11-26", name: "Strattera", ingredient: "atomoxetine hydrochloride" }, releasesByDay(docs, LLY))?.id === "e66edbcb6cfb7945" &&
      /The FDA's talk paper that day: "The drug will be marketed by Eli Lilly and Company/.test(strattera.description ?? "") && !/Forteo|Teriparatide/.test(strattera.description ?? "") &&
      llyPage.ownRows.some((e) => e.date === "2002-11-26" && /Forteo|Teriparatide|teriparatide/i.test(`${e.title} ${e.description}`)) &&
      !!primaxin && !/that day:/.test(primaxin.description ?? "") && merck.ownRows.some((e) => e.date === "1985-11-26"),
    [strattera?.description?.slice(-200), primaxin?.description?.slice(-120)]);
  const multi = companies.map(([cik]) => cik).find((cik) => {
    const days = companyDocuments(docs, cik).map((x) => x.doc.day);
    return days.length !== new Set(days).size;
  });
  const multiRow = multi ? fdaHistoryEvents(docs, { cik: multi }).find((e) => (e.externalId ?? "").includes(",")) : undefined;
  check("one row a company a day, the day's documents its id", !!multiRow && /and \d+ more that day/.test(multiRow.description ?? ""), multiRow?.title);

  console.log("\nEvery listed company");
  const ciks = [...new Set(docs.flatMap((d) => d.named.map((n) => n.cik)))];
  const rows: { ticker: string; date: string }[] = [];
  const after: { ticker: string; date: string }[] = [];
  let joined = 0;
  for (const cik of ciks) {
    const ticker = tickerOf(cik);
    for (const e of fdaHistoryEvents(docs, { cik })) rows.push({ ticker, date: e.date });
    const from = first[ticker];
    if (!from) continue;
    const page = pages(cik, from);
    for (const e of page.ownRows) after.push({ ticker, date: e.date });
    joined += page.approvalRows.filter((e) => /The FDA's (?:press release|talk paper) that day/.test(e.description ?? "")).length;
  }
  const top = Object.entries(after.reduce<Record<string, number>>((m, r) => ((m[r.ticker] = (m[r.ticker] ?? 0) + 1), m), {}))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([t, n]) => `${t} ${n}`)
    .join(", ");
  check(`before any first price: ${EXPECTED.rows} company days on ${EXPECTED.companies} companies`,
    rows.length === EXPECTED.rows && new Set(rows.map((r) => r.ticker)).size === EXPECTED.companies, `${rows.length} on ${new Set(rows.map((r) => r.ticker)).size}`);
  check(`  …from first prices: ${EXPECTED.fromFirst} on ${EXPECTED.fromFirstPages} pages, ${EXPECTED.fromFirst1993} before 1993, and ${EXPECTED.joined} approval rows carrying their day's release (${EXPECTED.top})`,
    after.length === EXPECTED.fromFirst && new Set(after.map((r) => r.ticker)).size === EXPECTED.fromFirstPages && after.filter((r) => r.date < "1993-01-01").length === EXPECTED.fromFirst1993 &&
      joined === EXPECTED.joined && top === EXPECTED.top,
    `${after.length} on ${new Set(after.map((r) => r.ticker)).size}, ${after.filter((r) => r.date < "1993-01-01").length} before 1993, ${joined} joined; ${top}`);

  console.log("\nAt ingest");
  const step = await fdaHistoryFor(fakeDb("1970-01-02"), 1, { edgarName: "ELI LILLY & Co", alsoKnownAs: newsNamesFor(LLY), cik: LLY });
  check("the company's documents from its first price, with no request, as a complete answer", step.outcome === "ok" && step.events.length > 0 && step.events.every((e) => e.date >= "1970-01-02") && !!step.complete,
    `${step.outcome} ${step.events.length}`);
  const none = await fdaHistoryFor(fakeDb(null), 1, { edgarName: "ELI LILLY & Co", alsoKnownAs: [], cik: LLY });
  const fund = await fdaHistoryFor(fakeDb("1970-01-02"), 1, { edgarName: "ELI LILLY & Co", alsoKnownAs: [], cik: LLY, fundSeries: true });
  check("  …asked again while it has no prices, and none for a fund's series", none.outcome === "error" && /no prices/.test(none.detail ?? "") && fund.events.length === 0 && fund.outcome === "empty");
  const amgn = await fdaApprovalsFor(fakeDb(amgnFrom), 1, { edgarName: "AMGEN INC", alsoKnownAs: newsNamesFor(AMGN), cik: AMGN });
  check("  …and the approvals' step joins the day's release to its row", amgn.events.some((e) => e.date === "1989-06-01" && /The FDA's press release that day/.test(e.description ?? "")));

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "fda_history");
  check("the source is id 47, CC0 like openFDA's other files, cleared for commercial use, reviewed 2026-11-22, credited to the FDA (openFDA)",
    src?.id === 47 && src.license === "public domain (CC0 1.0)" && src.commercialOk && src.reviewedOn === "2026-11-22" && src.attribution === "U.S. Food and Drug Administration (openFDA)", src);
  check("  …a company source, quota and refresh noted, scored without the model, a source whose day rows join their documents",
    (COMPANY_SOURCES as readonly string[]).includes("fda_history") && QUOTAS.fda_history.perDay === null && SOURCE_TTL_MINUTES.fda_history === 1440 &&
      deterministicScore({ eventId: 0, kind: "regulation", title: "FDA press release", sourceKey: "fda_history" }, { kind: "company", displayName: "Eli Lilly", ticker: "LLY" }, ["lilly"])?.score === 0.95 &&
      GROUPED_ROW_SOURCES.includes("fda_history"));
  check("  …the ingest asks it for every company", /await run\("fda_history", [^\n]+\n\s*fdaHistoryFor\(client, subjectId, \{[^}]*cik: company\.cik, fundSeries \}\),/.test(read("scripts/ingest.ts")));
  check("  …synced by `npm run sync:fda-history`, and credited",
    /"sync:fda-history": "tsx scripts\/sync-fda-history\.ts"/.test(read("package.json")) &&
      /press releases and talk papers of 1962–2014, and warning letters from the U\.S\. Food and Drug Administration/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /press releases and talk papers of 1962–2014, and warning letters from the U\.S\. Food and Drug Administration/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

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
