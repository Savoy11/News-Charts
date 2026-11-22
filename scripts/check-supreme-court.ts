/**
 * The Supreme Court's decisions in the company's own cases, 1962 on (batch 176, the 2026-11-22c proposal 1, approved by
 * the owner that day with call (a): the U.S. Reports to volume 586 and the Court's slip lists from the 2018 term, every
 * decision naming the company as a party, per curiam dispositions and in-chambers opinions included, each on its
 * decided day).
 *
 *   npm run check:supreme-court
 *
 * Offline: the committed file (`data/supreme-court.json.gz`, written by `npm run sync:supreme-court` from govinfo's 219
 * volume records and the Court's nine term lists of 2026-11-22, and the first pages of 1,112 cases' PDFs), a slice of
 * those records, lists and pages (scripts/fixtures/supreme-court-slice.json.gz), and the first trading days the other
 * checks' fixtures carry.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { ALSO_ON_SOURCES } from "../lib/alsoOn";
import { GROUPED_ROW_SOURCES } from "../lib/corroboration";
import { dojPossessive } from "../lib/doj";
import { andSpellings, withoutTag } from "../lib/edgarName";
import { deterministicScore } from "../lib/enrich/relevance";
import { companyNames } from "../lib/frCompany";
import { namesForYear } from "../lib/ingest/frBackfill";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import { supremeCourtFor } from "../lib/ingest/supremeCourtFor";
import { releaseNamesOn } from "../lib/releaseNames";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
import { UNITS as CPSC_UNITS } from "../lib/cpscRecalls";
import { UNITS as EPA_UNITS } from "../lib/epaCases";
import { NLRB_UNITS } from "../lib/nlrbDecisions";
import { RAIL_OWNERS } from "../lib/railAccidents";
import { TAA_UNITS } from "../lib/taaPetitions";
import {
  NAMED_BY_HAND,
  NOT_THE_COMPANY,
  SC_UNITS,
  caseHead,
  caseParties,
  corporateParty,
  distinctCases,
  expandAbbreviations,
  railroadOf,
  scPartyIsCompany,
  unitOf,
  slipCases,
  supremeCourtCases,
  supremeCourtEvents,
  volumeCases,
} from "../lib/supremeCourt";
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

/** The whole file as read on 2026-11-22, and every listed company in the index replayed against it. */
const EXPECTED = {
  volumes: 219,
  terms: 9,
  cases: 9_470,
  dated: 8_432,
  pdfs: 1_112,
  // every listed company in the index, under the rule, its names as the replay below builds them
  total: 328,
  companies: 158,
  // from first prices, for the companies the fixtures read
  fromFirst: 203,
  fromFirstPages: 95,
  fromFirst2017: 162,
  top: "XOM 12, F 9, CSX 7, T 7, GE 6, NSC 6, BAC 5, CVX 5, AMGN 4, BA 4",
};

const companies = (tickerIndex as unknown as { companies: [number, string, string][] }).companies;
const titleOf = (cik: number) => companies.find((c) => c[0] === cik)![2];
/** A company's names of a year as ingest builds them, less the former names only the database holds. */
const namesOf = (cik: number) => (year: number) => {
  const title = titleOf(cik);
  const own = dojPossessive(title, possessiveNameFor(cik));
  return [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)];
};
const cases = supremeCourtCases();
const on = (cik: number, from = "") => supremeCourtEvents(cases, namesOf(cik), { cik, from, namesOn: (d) => releaseNamesOn(cik, d) });
const caseOn = (cik: number, ref: string) => on(cik).find((e) => e.externalId?.split(",").includes(ref));

async function main(): Promise<void> {
  const slice = JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", "supreme-court-slice.json.gz"))).toString()) as {
    mods: Record<string, string>;
    slip: Record<string, string>;
    heads: Record<string, string>;
  };

  console.log("The volumes' records and the Court's lists");
  const v569 = volumeCases(slice.mods["569"], 569);
  const comcast = v569.find((c) => c.cite === "569 U.S. 27");
  check("a volume's record gives each case its name, citation, day, kind and disposition, front and back matter left out (Comcast Corp. v. Behrend, 569 U.S. 27)",
    !!comcast && comcast.title === "Comcast Corp. v. Behrend" && comcast.day === "2013-03-27" && comcast.disposition === "Reversed" && comcast.kind === "Opinion of the court (orally argued)" &&
      comcast.jurisdiction === "Cert" && comcast.pdf === "https://www.govinfo.gov/content/pkg/USREPORTS-569/pdf/USREPORTS-569-27.pdf" && v569.every((c) => c.cite) && comcast.read === "record",
    comcast);
  const v389 = volumeCases(slice.mods["389"], 389);
  const alcoa = v389.find((c) => c.id === "USREPORTS-389-49");
  check("  …a per curiam disposition the record gives no day is listed undated, its PDF to read (United States v. Aluminum Co. of America, 389 U.S. 49)",
    !!alcoa && alcoa.day === null && alcoa.disposition === null && alcoa.read === null && alcoa.title === "United States v. Aluminum Co. of America", alcoa);
  const slip20 = slipCases(slice.slip["20"], 20);
  const oracle = slip20.find((c) => c.docket === "18-956");
  check("a term's slip list gives each opinion its day, docket number, name, PDF and its U.S. Reports page once given (Google LLC v. Oracle America, Inc., 2021-04-05)",
    !!oracle && oracle.day === "2021-04-05" && oracle.title === "Google LLC v. Oracle America, Inc." && oracle.cite === "593 U.S. 1" && oracle.id === "slip-20-18-956" &&
      /^https:\/\/www\.supremecourt\.gov\/opinions\/20pdf\/593us1r26_[a-z0-9]+\.pdf$/.test(oracle.pdf) && slip20.some((c) => c.kind === "Per curiam"),
    oracle);

  console.log("\nThe PDFs' first pages");
  const h = (id: string) => caseHead(slice.heads[id]);
  check("a per curiam disposition's day and the line after it: \"Decided October 23, 1967.\" and \"Vacated and remanded.\"",
    JSON.stringify(h("USREPORTS-389-49")) === JSON.stringify({ day: "1967-10-23", disposition: "Vacated and remanded" }), h("USREPORTS-389-49"));
  check("  …a syllabus's line citing the decision below, the \"fi\" pdftotext drops read again (\"855 F. 3d 1356, affrmed.\"), a plurality's long syllabus, a stand-alone \"Appeal dismissed. Reported below: …\", a per curiam's \"Certiorari granted; 952 F. 3d 1157, vacated and remanded.\"",
    h("slip-18-17-1229").disposition === "Affirmed" && h("slip-18-16-1275").disposition === "Affirmed" && h("slip-18-18-281").disposition === "Appeal dismissed" &&
      h("slip-20-20-1212").disposition === "Vacated and remanded" && h("slip-20-18-956").disposition === "Reversed and remanded",
    ["slip-18-17-1229", "slip-18-16-1275", "slip-18-18-281", "slip-20-20-1212", "slip-20-18-956"].map((id) => h(id).disposition));

  console.log("\nThe parties");
  check("a case's two sides, \"et al.\" and \"In re\" off, a \"V.\" in capitals read (\"PPL Montana LLC. V. Montana\")",
    JSON.stringify(caseParties("Caterpillar Inc. et al. v. Williams et al.")) === JSON.stringify([{ name: "Caterpillar Inc.", side: 0 }, { name: "Williams", side: 1 }]) &&
      caseParties("PPL Montana LLC. V. Montana")[0].name === "PPL Montana LLC." && caseParties("In re Grand Jury").length === 1);
  check("  …the Reports' abbreviations read as words: \"Pacific Gas & Elec. Co.\", \"Union Pacific R. Co.\", \"Abbott Labs.\", \"Semtek Int'l Inc.\", \"Allstate Ins. Co.\"",
    expandAbbreviations("Pacific Gas & Elec. Co.") === "Pacific Gas & Electric Co." && expandAbbreviations("Union Pacific R. Co.") === "Union Pacific Railroad Co." &&
      expandAbbreviations("Abbott Labs.") === "Abbott Laboratories" && expandAbbreviations("Semtek Int'l Inc.") === "Semtek International Inc." && expandAbbreviations("Allstate Ins. Co.") === "Allstate Insurance Co.");
  check("  …a party can be a company with a legal word or a name of two words or more, never a surname alone (\"Cummins\", \"Pearson\", \"Vale\", \"Box\") or a person with an initial",
    corporateParty("Parker Seal Co.") && corporateParty("General Electric") && corporateParty("Eli Lilly") && !corporateParty("Cummins") && !corporateParty("Pearson") &&
      !corporateParty("Vale") && !corporateParty("Box") && !corporateParty("Erica P. John") && !corporateParty("FMC"));
  check("  …so the namesakes stay off: Parker Seal Co. v. Cummins (1976) off CMI, Pearson v. Dodd (1977) off PSO, United States v. Woodward (1985) off WWD, Parsons v. Buckley (1965) off PSN, Vale v. Louisiana (1970) off VALE",
    !on(26172).some((e) => e.date === "1976-11-02") && !on(938323).some((e) => e.date === "1977-01-12") && !on(108312).some((e) => e.date === "1985-01-07") &&
      !on(275880).some((e) => e.date === "1965-01-12") && !on(917851).some((e) => e.date === "1970-06-22"));
  check("  …a railroad reaches its owner's page on the owner's days (`RAIL_OWNERS`): Norfolk & Western R. Co. on NSC, Wisconsin Central Ltd. on CN from 2001-10-09, BNSF on Berkshire from 2010-02-12",
    railroadOf("Norfolk & Western R. Co.", "1991-02-27", 702165) && railroadOf("Wisconsin Central Ltd.", "2018-06-21", 16868) && !railroadOf("Wisconsin Central Ltd.", "1999-06-21", 16868) &&
      railroadOf("BNSF R. Co.", "2019-03-04", 1067983) && !railroadOf("BNSF R. Co.", "2009-03-04", 1067983) && !railroadOf("Illinois Central Gulf R. Co.", "1985-01-01", 16868));
  const wfc = (p: string, d: string) => scPartyIsCompany(p, d, 72971, () => namesOf(72971)(Number(d.slice(0, 4))));
  check("  …a name the record took is the other company's before the day, for the units' lists too: \"Wells Fargo Bank\" of 1988 is not Norwest's record's, \"Wells Fargo Bank, N. A.\" of 2005 is",
    !wfc("Wells Fargo Bank", "1988-03-23") && !wfc("Wells Fargo Asia Ltd.", "1990-05-29") && wfc("Wells Fargo Bank, N. A.", "2005-01-01"));

  console.log("\nThe committed file");
  const file = JSON.parse(gunzipSync(readFileSync(join(__dirname, "..", "data", "supreme-court.json.gz"))).toString()) as { read: string; volumes: number[]; missing: number[]; terms: number[] };
  const pdfs = cases.filter((c) => c.read === "pdf").length;
  check(`the file of 2026-11-22: ${EXPECTED.volumes} volumes, 368 to 586, none missing; ${EXPECTED.terms} terms' lists, 2018 to 2026; ${EXPECTED.cases.toLocaleString("en-US")} cases, ${EXPECTED.dated.toLocaleString("en-US")} of them dated, ${EXPECTED.pdfs.toLocaleString("en-US")} PDFs read`,
    file.read === "2026-11-22" && file.volumes.length === EXPECTED.volumes && file.volumes[0] === 368 && file.volumes.at(-1) === 586 && file.missing.length === 0 &&
      file.terms.length === EXPECTED.terms && cases.length === EXPECTED.cases && cases.filter((c) => c.day).length === EXPECTED.dated && pdfs === EXPECTED.pdfs,
    { volumes: file.volumes.length, terms: file.terms.length, cases: cases.length, dated: cases.filter((c) => c.day).length, pdfs });
  check("  …every day a calendar day, and a slip opinion the bound volumes print is the volume's case",
    cases.every((c) => !c.day || (!Number.isNaN(Date.parse(c.day)) && new Date(c.day).toISOString().slice(0, 10) === c.day)) && distinctCases(cases).length < cases.length);

  console.log("\nThe rows");
  const cmcsa = caseOn(1166691, "569 U.S. 27");
  check("Comcast Corp. v. Behrend, 569 U.S. 27, lands on CMCSA on 2013-03-27: \"Reversed\", the company the petitioner; GE v. Gilbert, 429 U.S. 125 (1976-12-07), on GE",
    cmcsa?.date === "2013-03-27" && /^The Supreme Court decided Comcast Corp\. v\. Behrend, 569 U\.S\. 27 \(2013\): Reversed$/.test(cmcsa.title) && /The company is the petitioner \(Comcast Corp\.\)/.test(cmcsa.description ?? "") &&
      cmcsa.sourceKey === "supreme_court" && cmcsa.url === "https://www.govinfo.gov/app/details/USREPORTS-569/USREPORTS-569-27" && caseOn(40545, "429 U.S. 125")?.date === "1976-12-07",
    [cmcsa?.title, cmcsa?.description]);
  check("  …a row gives the Court's disposition, never a summary of the holding",
    /never a summary of its holding/.test(cmcsa?.description ?? "") && !/\bheld\b/i.test(cmcsa?.title ?? ""));
  const oracleRows = [caseOn(1652044, "593 U.S. 1"), caseOn(1341439, "593 U.S. 1")];
  check("Google LLC v. Oracle America, Inc. (2021-04-05), from the 2020 term's list, lands on GOOGL and on ORCL, Oracle America its unit (Sun, renamed)",
    oracleRows.every((e) => e?.date === "2021-04-05" && /Reversed and remanded/.test(e.title)) && /the respondent \(Oracle America, Inc\.\)/.test(oracleRows[1]?.description ?? ""),
    oracleRows.map((e) => e?.title));
  check("Travelers Casualty & Surety Co. of America v. Pacific Gas & Elec. Co., 549 U.S. 443 (2007), lands on PCG, the Reports' \"Elec.\" read, and on TRV, its unit",
    caseOn(1004980, "549 U.S. 443")?.date === "2007-03-20" && caseOn(86312, "549 U.S. 443")?.date === "2007-03-20");
  check("  …the old General Motors' cases stay off GM, General Motors Co.'s record of 2009 (General Motors Corp. v. Tracy, 1997)", !on(1467858).some((e) => e.date < "2009-07-10"));
  check("  …the namesakes read by hand and the cases named by one word say why", [...Object.values(NOT_THE_COMPANY).flat(), ...Object.values(NAMED_BY_HAND).flat(), ...Object.values(SC_UNITS).flat()].every((n) => n.why.length > 30));
  check("  …a case a caption names by one word, read by hand: FCC v. AT&T (2011) on T, NVIDIA v. E. Ohman J:or Fonder AB (2024) on NVDA, Amgen Inc. v. Sanofi (2023) on SNY and AMGN",
    !!caseOn(732717, "562 U.S. 397") && on(1045810).some((e) => e.date === "2024-12-11") && on(1121404).some((e) => e.date === "2023-05-18") && on(318154).some((e) => e.date === "2023-05-18"));

  console.log("\nEvery listed company");
  const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const first: Record<string, string> = {};
  for (const [f, k] of [["digest-1985-entries.json.gz", "firstPrices"], ["eeoc-listing.json.gz", "first"], ["fda-device-recalls.json.gz", "first"], ["occ-actions.json.gz", "first"]] as const) {
    Object.assign(first, JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", f))).toString())[k]);
  }
  const dated = distinctCases(cases).filter((c) => c.day);
  const letters = dated.map((c) => caseParties(c.title).map((p) => `${alnum(p.name)} ${alnum(expandAbbreviations(p.name))}`).join(" "));
  const unitYears = Array.from({ length: 66 }, (_, k) => `${1961 + k}-07-01`);
  const rows: { ticker: string; date: string; first: string | null }[] = [];
  const seen = new Set<number>();
  for (const [cik, ticker] of companies) {
    if (seen.has(cik)) continue;
    seen.add(cik);
    const pre = [...new Set([...namesOf(cik)(2026), ...unitYears.flatMap((d) => releaseNamesOn(cik, d))].flatMap(andSpellings).map(alnum).filter((n) => n.length >= 3))];
    // a company's candidates: a case whose sides hold one of its names' letters, or, where it has units, one naming a unit
    const units = !!(RAIL_OWNERS[cik] || SC_UNITS[cik] || TAA_UNITS[cik] || NLRB_UNITS[cik] || EPA_UNITS[cik] || CPSC_UNITS[cik]);
    const mine = dated.filter((c, j) => pre.some((n) => letters[j].includes(n)) || (units && caseParties(c.title).some((p) => railroadOf(p.name, c.day!, cik) || unitOf(p.name, c.day!, cik) || scPartyIsCompany(p.name, c.day!, cik, () => []))));
    if (!mine.length) continue;
    for (const e of supremeCourtEvents(mine, namesOf(cik), { cik, namesOn: (d) => releaseNamesOn(cik, d) })) rows.push({ ticker, date: e.date, first: first[ticker] ?? null });
  }
  const after = rows.filter((r) => r.first && r.date >= r.first);
  const top = Object.entries(after.reduce<Record<string, number>>((m, r) => ((m[r.ticker] = (m[r.ticker] ?? 0) + 1), m), {}))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([t, n]) => `${t} ${n}`)
    .join(", ");
  check(`before any first price: ${EXPECTED.total.toLocaleString("en-US")} company days on ${EXPECTED.companies} companies`,
    rows.length === EXPECTED.total && new Set(rows.map((r) => r.ticker)).size === EXPECTED.companies, `${rows.length} on ${new Set(rows.map((r) => r.ticker)).size}`);
  check(`  …from first prices: ${EXPECTED.fromFirst.toLocaleString("en-US")} on ${EXPECTED.fromFirstPages} pages, ${EXPECTED.fromFirst2017.toLocaleString("en-US")} before 2017 (${EXPECTED.top})`,
    after.length === EXPECTED.fromFirst && new Set(after.map((r) => r.ticker)).size === EXPECTED.fromFirstPages && after.filter((r) => r.date < "2017-01-01").length === EXPECTED.fromFirst2017 && top === EXPECTED.top,
    `${after.length} on ${new Set(after.map((r) => r.ticker)).size}, ${after.filter((r) => r.date < "2017-01-01").length} before 2017; ${top}`);

  console.log("\nAt ingest");
  const step = await supremeCourtFor(fakeDb("1980-03-17"), 1, { edgarName: "COMCAST CORP", alsoKnownAs: newsNamesFor(1166691), cik: 1166691 });
  check("the company's cases from its first price, with no request, as a complete answer",
    step.outcome === "ok" && !!step.complete && step.events.some((e) => e.date === "2013-03-27") && step.events.every((e) => e.date >= "1980-03-17" && e.sourceKey === "supreme_court"),
    `${step.outcome} ${step.events.length}`);
  const none = await supremeCourtFor(fakeDb(null), 1, { edgarName: "COMCAST CORP", alsoKnownAs: [], cik: 1166691 });
  const fund = await supremeCourtFor(fakeDb("1980-03-17"), 1, { edgarName: "COMCAST CORP", alsoKnownAs: [], cik: 1166691, fundSeries: true });
  check("  …asked again while it has no prices, and none for a fund's series", none.outcome === "error" && /no prices/.test(none.detail ?? "") && fund.events.length === 0 && fund.outcome === "empty");

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "supreme_court");
  check("the source is id 51, public domain, cleared for commercial use, reviewed 2026-11-22, credited to the Supreme Court of the United States",
    src?.id === 51 && src.license === "public domain" && src.commercialOk && src.reviewedOn === "2026-11-22" && src.attribution === "Supreme Court of the United States", src);
  check("  …a company source, quota and refresh noted, scored without the model, a multi-party source whose rows join their citations",
    (COMPANY_SOURCES as readonly string[]).includes("supreme_court") && QUOTAS.supreme_court.perDay === null && SOURCE_TTL_MINUTES.supreme_court === 1440 &&
      deterministicScore({ eventId: 0, kind: "regulation", title: "The Supreme Court decided Comcast Corp. v. Behrend", sourceKey: "supreme_court" }, { kind: "company", displayName: "Comcast", ticker: "CMCSA" }, ["comcast"])?.score === 0.95 &&
      ALSO_ON_SOURCES.includes("supreme_court") && GROUPED_ROW_SOURCES.includes("supreme_court") && /WHERE source_id IN \([^)]*\b51\)/.test(read("db/060_also_on_supreme_court.sql")));
  check("  …the ingest asks it for every company", /await run\("supreme_court", [^\n]+\n\s*supremeCourtFor\(client, subjectId, \{[^}]*cik: company\.cik, fundSeries \}\),/.test(read("scripts/ingest.ts")));
  check("  …synced monthly by `npm run sync:supreme-court`, and credited on the footer and the terms page",
    /"sync:supreme-court": "tsx scripts\/sync-supreme-court\.ts"/.test(read("package.json")) &&
      /decisions of the Supreme Court of the United States from the U\.S\. Reports on govinfo and the Court&apos;s own opinion lists/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /decisions of the Supreme Court of the United States from the U\.S\. Reports on govinfo and the Court&apos;s own opinion lists/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")));

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
