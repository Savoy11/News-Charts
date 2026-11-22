/**
 * The ITC's Section 337 investigations, 1995–2026 (batch 167, the 2026-11-22 proposal 2, approved by the
 * owner that day with call (a): a second row on the day of the Commission's final determination).
 *
 *   npm run check:itc
 *
 * Offline: the committed file (`data/itc-337.json.gz`, written by `npm run sync:itc` from the notices
 * govinfo served on 2026-11-22), a slice of those notices and of the API's list (scripts/fixtures/itc-notices.json.gz),
 * and the first trading days the other checks' fixtures carry.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { ALSO_ON_SOURCES } from "../lib/alsoOn";
import { GROUPED_ROW_SOURCES } from "../lib/corroboration";
import { UNITS as CPSC_UNITS } from "../lib/cpscRecalls";
import { dojPossessive } from "../lib/doj";
import { andSpellings, withoutTag } from "../lib/edgarName";
import { deterministicScore } from "../lib/enrich/relevance";
import { UNITS as EPA_UNITS } from "../lib/epaCases";
import { companyNames } from "../lib/frCompany";
import { namesForYear } from "../lib/ingest/frBackfill";
import { itcFor } from "../lib/ingest/itcFor";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import {
  NOT_THE_COMPANY,
  type ItcListed,
  entries,
  investigationNumbers,
  isInstitution,
  issuedOn,
  itcCases,
  itcEvents,
  itcPartyIsCompany,
  noticeOutcome,
  partyName,
  productsOf,
  readInstitution,
} from "../lib/itc337";
import { releaseNamesOn } from "../lib/releaseNames";
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

/** The whole file as read on 2026-11-22, and every listed company in the index replayed against it. */
/** An outcome notice in the slice, and the day the Commission issued it. */
const OUTCOME_DOC = "2017-11487";
const OUTCOME_ISSUED = "2017-05-30";

const EXPECTED = {
  listed: 11_592,
  cases: 1_122,
  violation: 256,
  noViolation: 137,
  terminated: 503,
  // every listed company in the index, under the rule, its names as the replay below builds them
  total: 996,
  companies: 269,
  // from first prices, for the 954 companies the fixtures read
  fromFirst: 363,
  fromFirstPages: 81,
  fromFirst2017: 183,
  top: "AAPL 68, QCOM 19, MSFT 18, HON 14, AMD 11, INTC 10, HPQ 9, TM 9, GE 8, PHG 8",
};

const companies = (tickerIndex as unknown as { companies: [number, string, string][] }).companies;
const titleOf = (cik: number) => companies.find((c) => c[0] === cik)![2];
/** A company's names of a year as ingest builds them, less the former names only the database holds. */
const namesOf = (cik: number, extra: (year: number) => string[] = () => []) => (year: number) => {
  const title = titleOf(cik);
  const own = dojPossessive(title, possessiveNameFor(cik));
  return [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title), ...extra(year)];
};
const cases = itcCases();
const on = (cik: number, from = "", extra?: (year: number) => string[]) => itcEvents(cases, namesOf(cik, extra), { cik, from, namesOn: (d) => releaseNamesOn(cik, d) });
const isCompany = (party: string, d: string, cik: number) => itcPartyIsCompany(party, d, cik, () => [...namesOf(cik)(Number(d.slice(0, 4))), ...releaseNamesOn(cik, d)]);

async function main(): Promise<void> {
  const slice = JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", "itc-notices.json.gz"))).toString()) as {
    listed: ItcListed[];
    notices: Record<string, { published: string; html: string }>;
  };
  const parties = (doc: string) => readInstitution(slice.notices[doc].html);
  const listedOf = (doc: string) => slice.listed.find((r) => r.document_number === doc)!;

  console.log("The list");
  check("a notice of institution by its abstract, a complaint filed under section 337 on behalf of its complainant; a later notice not one",
    isInstitution(listedOf("2018-00105")) && !isInstitution(listedOf(OUTCOME_DOC)) && JSON.stringify(investigationNumbers(listedOf("2018-00105"))) === JSON.stringify(["337-TA-1093"]),
    investigationNumbers(listedOf("2018-00105")));
  check("  …its products the title's part before the first semicolon", productsOf("Certain Mobile Electronic Devices and Radio Frequency and Processing Components Thereof (II); Institution of Investigation") === "Certain Mobile Electronic Devices and Radio Frequency and Processing Components Thereof (II)" &&
    productsOf("In the Matter of Certain Digital Satellite System (DSS) Receivers; Notice of Final Commission Determination") === "Certain Digital Satellite System (DSS) Receivers");

  console.log("\nThe parties, a line each");
  const qcom = parties("2018-00105");
  check("337-TA-1093 of 2018-01-08: Qualcomm the complainant, Apple a respondent", qcom.complainants.some((c) => /^Qualcomm Incorporated/.test(c)) && qcom.respondents.some((r) => /^Apple Inc/.test(r)), qcom);
  const roche = parties("96-19109");
  check("1996, \"The complainant is--\" and a respondent a line: Hoffmann-La Roche against Organon Teknika's two companies",
    JSON.stringify(roche) === JSON.stringify({ complainants: ["Hoffmann-La Roche, Inc."], respondents: ["Organon Teknika B.V.", "Organon Teknika Corporation"] }), roche);
  const gem = parties("01-7016");
  check("2001, a party set as a block, its name on a line of its own above its address: Gemstar's complaint against Pioneer, Scientific-Atlanta and EchoStar",
    gem.complainants[0] === "Gemstar-TV Guide International, Inc." && gem.respondents.includes("Pioneer Corporation") && gem.respondents.includes("EchoStar Communications Corporation"), gem);
  const ms = parties("2011-9890");
  check("2011, \"(a) The complainant:\" with no verb: Microsoft against Barnes & Noble and Foxconn's companies",
    ms.complainants[0] === "Microsoft Corporation" && ms.respondents[0] === "Barnes & Noble, Inc." && ms.respondents.some((r) => /^Hon Hai Precision Industry Co\., Ltd/.test(r)), ms);
  const rich = parties("E9-31252");
  check("2009, a \"(b)\" glued to the line before: Richtek's two companies against AMD among others",
    rich.complainants.length === 2 && rich.respondents.includes("Advanced Micro Devices, Inc."), rich);
  check("an entry's name before its address: a legal word after a comma kept, a number with no comma before it cut (\"Sony Corporation 1-7-1 Konan\")",
    partyName("Samsung Electronics Co., Ltd., 416 Maetan-3dong, Suwon") === "Samsung Electronics Co., Ltd." && partyName("Sony Corporation 1-7-1 Konan, Minato-ku, Tokyo") === "Sony Corporation" &&
      partyName("Macronix, Inc., (a.k.a. Macronix America, Inc.), 1338 Ridder Park Drive") === "Macronix, Inc., (a.k.a. Macronix America, Inc.)");
  check("  …a line ending in a state's ZIP code, a country or a full stop ends an entry; a number an address wraps at does not",
    JSON.stringify(entries("Level One Communications, Inc., 9750\nGoethe Road, Sacramento, California 95827.")) === JSON.stringify(["Level One Communications, Inc., 9750 Goethe Road, Sacramento, California 95827."]) &&
      entries("Winbond Electronics Corporation, Number 2, R&D Road VI, Science-Based\nIndustrial Park, Hsinchu, Taiwan\nMacronix, Inc., 1338 Ridder Park Drive, San Jose, California 95131").length === 2);

  console.log("\nThe outcomes");
  check("a final determination finding a violation, its exclusion order and cease and desist orders read from the title",
    JSON.stringify(noticeOutcome({ title: "Certain X; Notice of a Commission Final Determination Finding a Violation of Section 337; Issuance of a Limited Exclusion Order and Cease and Desist Orders; Termination of the Investigation", publication_date: "", document_number: "" })) === JSON.stringify({ kind: "violation", order: "limited", cdo: true }));
  check("  …none found, and the Commission's decision not to review an initial determination finding none, which makes it the Commission's",
    noticeOutcome({ title: "Certain X; Notice of the Commission's Final Determination Finding No Violation of Section 337; Termination of the Investigation", publication_date: "", document_number: "" })?.kind === "no violation" &&
      noticeOutcome({ title: "Certain X; Notice of Commission Determinations Not To Review an Initial Determination Finding No Violation of Section 337", publication_date: "", document_number: "" })?.kind === "no violation");
  check("  …a termination on a settlement, a consent order or a withdrawal; a review, a schedule or an extension decides nothing",
    noticeOutcome({ title: "Certain X; Notice of Commission Decision Not To Review an Initial Determination Terminating the Investigation on the Basis of a Settlement Agreement", publication_date: "", document_number: "" })?.how === "a settlement" &&
      noticeOutcome({ title: "Certain X; Notice of a Commission Determination To Review in Part a Final Initial Determination Finding a Violation of Section 337; Schedule for Filing Written Submissions", publication_date: "", document_number: "" }) === null &&
      noticeOutcome({ title: "Certain X; Notice of Decision To Extend the Deadline for Determining Whether To Review an Initial Determination Finding No Violation", publication_date: "", document_number: "" }) === null);
  check("  …a decision on the merits dated by the day the Commission issued it", issuedOn(slice.notices[OUTCOME_DOC].html) === OUTCOME_ISSUED, issuedOn(slice.notices[OUTCOME_DOC].html));

  console.log("\nThe committed file");
  const file = JSON.parse(gunzipSync(readFileSync(join(__dirname, "..", "data", "itc-337.json.gz"))).toString()) as { read: string; listed: number };
  const kinds = (k: string) => cases.filter((c) => c.outcome?.kind === k).length;
  check(`the lists of 2026-11-22: ${EXPECTED.listed.toLocaleString("en-US")} notices of the Commission, ${EXPECTED.cases.toLocaleString("en-US")} investigations instituted, ${EXPECTED.violation} decided with a violation, ${EXPECTED.noViolation} with none, ${EXPECTED.terminated} terminated otherwise`,
    file.read === "2026-11-22" && file.listed === EXPECTED.listed && cases.length === EXPECTED.cases && kinds("violation") === EXPECTED.violation && kinds("no violation") === EXPECTED.noViolation && kinds("terminated") === EXPECTED.terminated,
    { read: file.read, listed: file.listed, cases: cases.length, violation: kinds("violation"), none: kinds("no violation"), terminated: kinds("terminated") });
  check("  …every investigation with its number, products, notice and parties; none instituted twice",
    cases.every((c) => /^337-TA-\d+$/.test(c.number) && c.products && c.notice && /^\d{4}-\d{2}-\d{2}$/.test(c.published)) && new Set(cases.map((c) => c.number)).size === cases.length);

  console.log("\nThe rule and the rows");
  const appleRow = on(320193).find((e) => e.externalId?.split(",").includes("337-TA-1093"));
  const qcomRow = on(804328).find((e) => e.externalId?.split(",").includes("337-TA-1093"));
  check("337-TA-1093 is on AAPL as respondent and on QCOM as complainant, under the same number, so each says \"Also on\" the other",
    !!appleRow && !!qcomRow && appleRow.date === "2018-01-08" && /the company as respondent/.test(appleRow.description ?? "") && /the company as complainant/.test(qcomRow.description ?? "") &&
      /^ITC instituted an investigation \(337-TA-1093\) on Qualcomm Incorporated's complaint against Apple Inc\./.test(qcomRow.title) && appleRow.sourceKey === "itc_337",
    [appleRow?.title, qcomRow?.title]);
  check("  …a complaint is an allegation: the row says the notice decides nothing", /a complaint is an allegation, and the notice decides nothing/.test(appleRow?.description ?? ""));
  const has = (cik: number, n: string, from = "", former?: string) => on(cik, from, former ? () => [former] : undefined).find((e) => e.externalId?.split(",").includes(n));
  // a company's EDGAR former names, which ingest reads from the database and this replay does not hold: BlackBerry's
  // "RESEARCH IN MOTION LTD" to 2013, Sony's "SONY CORP" to 2021
  check("Kodak's 337-TA-703 of 2010-02-23 is on AAPL, and on BB as Research In Motion under its former name; it stays off KODK, whose first price is of 2013",
    !!has(320193, "337-TA-703") && !!has(1070235, "337-TA-703", "", "RESEARCH IN MOTION LTD") && !has(1070235, "337-TA-703") && !has(31235, "337-TA-703", "2013-09-23") && !!has(31235, "337-TA-703"),
    [has(1070235, "337-TA-703", "", "RESEARCH IN MOTION LTD")?.title]);
  check("  …Paice's 337-TA-1042 of 2017-03-10 on F, Novartis's 337-TA-1207 of 2020-07-27 on NVS and REGN, Sony Corporation's 337-TA-994 of 2016 on SONY under \"SONY CORP\"",
    !!has(37996, "337-TA-1042") && !!has(1114448, "337-TA-1207") && !!has(872589, "337-TA-1207") && !!has(313838, "337-TA-994", "", "SONY CORP"));
  check("  …a settlement is a line on the institution's row and no row of its own: 337-TA-1093 ended on a settlement, in the Commission's notice of 2019-08-23",
    /It was terminated on a settlement, the Commission's notice of 2019-08-23\./.test(appleRow?.description ?? "") && !on(320193).some((e) => e.externalId?.split(",").includes("337-TA-1093:final")));
  const cisco = on(858877).find((e) => e.externalId?.split(",").includes("337-TA-945:final"));
  const arista = on(1596532).find((e) => e.externalId?.split(",").includes("337-TA-945:final"));
  check("a decision on the merits is a second row on the day the Commission issued it: Cisco's 337-TA-945, a violation and a limited exclusion order, 2017-05-30, on CSCO and ANET",
    cisco?.date === "2017-05-30" && arista?.date === "2017-05-30" && /^ITC found a violation of section 337 and issued a limited exclusion order and cease and desist orders in 337-TA-945/.test(cisco.title) &&
      /one that settled or was dismissed before it is not among them/.test(cisco.description ?? "") && cisco.url === "https://www.federalregister.gov/d/2017-11487",
    [cisco?.date, cisco?.title]);
  check("the namesakes read by hand stay off: Amtech Systems LLC off ASYS, Australia's Globaltech off GLTK; a piece of an address (\"P.O. Box\") is no party",
    !isCompany("Amtech Systems LLC", "2020-12-29", 720500) && isCompany("Amtech Systems, Inc.", "2020-12-29", 720500) && !isCompany("Globaltech Pty Ltd.", "2022-04-05", 1938338) &&
      partyName("P.O. Box 3453") === "" && Object.values(NOT_THE_COMPANY).flat().every((n) => n.why.length > 40));

  console.log("\nEvery listed company");
  const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const first: Record<string, string> = {};
  for (const [f, k] of [["digest-1985-entries.json.gz", "firstPrices"], ["eeoc-listing.json.gz", "first"], ["fda-device-recalls.json.gz", "first"], ["occ-actions.json.gz", "first"]] as const) {
    Object.assign(first, JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", f))).toString())[k]);
  }
  const letters = cases.map((c) => alnum([...c.complainants, ...c.respondents].join(" ")));
  const unitYears = Array.from({ length: 33 }, (_, k) => `${1994 + k}-07-01`);
  const rows: { ticker: string; date: string; first: string | null }[] = [];
  const seen = new Set<number>();
  for (const [cik, ticker] of companies) {
    if (seen.has(cik)) continue;
    seen.add(cik);
    const pre = [...new Set([...namesOf(cik)(2026), ...unitYears.flatMap((d) => releaseNamesOn(cik, d))].flatMap(andSpellings).map(alnum).filter((n) => n.length >= 3))];
    const units = [...(EPA_UNITS[cik] ?? []).map((u) => u.defendant), ...(CPSC_UNITS[cik] ?? []).map((u) => u.firm)];
    const mine = cases.filter((c, j) => pre.some((p) => letters[j].includes(p)) || units.some((u) => [...c.complainants, ...c.respondents].some((x) => u.test(x))));
    if (!mine.length) continue;
    for (const e of itcEvents(mine, namesOf(cik), { cik, namesOn: (d) => releaseNamesOn(cik, d) })) rows.push({ ticker, date: e.date, first: first[ticker] ?? null });
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
  const step = await itcFor(fakeDb("1980-12-12"), 1, { edgarName: "Apple Inc.", alsoKnownAs: newsNamesFor(320193), cik: 320193 });
  check("the company's investigations from its first price, with no request, as a complete answer", step.outcome === "ok" && step.events.length === on(320193, "1980-12-12").length && !!step.complete,
    `${step.outcome} ${step.events.length}`);
  const none = await itcFor(fakeDb(null), 1, { edgarName: "Apple Inc.", alsoKnownAs: [], cik: 320193 });
  const fund = await itcFor(fakeDb("1980-12-12"), 1, { edgarName: "Apple Inc.", alsoKnownAs: [], cik: 320193, fundSeries: true });
  check("  …asked again while it has no prices, and none for a fund's series", none.outcome === "error" && /no prices/.test(none.detail ?? "") && fund.events.length === 0 && fund.outcome === "empty");

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "itc_337");
  check("the source is id 46, public domain, cleared for commercial use, reviewed 2026-11-22, credited to the U.S. International Trade Commission",
    src?.id === 46 && src.license === "public domain" && src.commercialOk && src.reviewedOn === "2026-11-22" && src.attribution === "U.S. International Trade Commission", src);
  check("  …a company source, quota and refresh noted, scored without the model, a multi-party source whose rows join their numbers",
    (COMPANY_SOURCES as readonly string[]).includes("itc_337") && QUOTAS.itc_337.perDay === null && SOURCE_TTL_MINUTES.itc_337 === 1440 &&
      deterministicScore({ eventId: 0, kind: "regulation", title: "ITC instituted an investigation", sourceKey: "itc_337" }, { kind: "company", displayName: "Apple", ticker: "AAPL" }, ["apple"])?.score === 0.95 &&
      ALSO_ON_SOURCES.includes("itc_337") && GROUPED_ROW_SOURCES.includes("itc_337") && /WHERE source_id IN \([^)]*\b46\)/.test(read("db/057_also_on_itc.sql")));
  check("  …the ingest asks it for every company", /await run\("itc_337", [^\n]+\n\s*itcFor\(client, subjectId, \{[^}]*cik: company\.cik, fundSeries \}\),/.test(read("scripts/ingest.ts")));
  check("  …synced monthly by `npm run sync:itc`, and credited",
    /"sync:itc": "tsx scripts\/sync-itc\.ts"/.test(read("package.json")) &&
      /Section 337 investigations from the U\.S\. International Trade Commission/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /Section 337 investigations from the U\.S\. International Trade Commission/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")));

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
