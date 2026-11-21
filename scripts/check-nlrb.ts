/**
 * The NLRB's Board decisions (batch 161, the 2026-11-18 proposal 2, approved by the owner that day with call
 * (a): a row from the listing alone).
 *
 *   npm run check:nlrb
 *
 * Offline: the listing's pages the opportunity scout read on 2026-11-18 (scripts/fixtures/nlrb-listing.json.gz:
 * page 0's and the last page's table and pager as served, and the table of 24 pages of the 667), and the first
 * trading days the other checks' fixtures carry.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { GROUPED_ROW_SOURCES } from "../lib/corroboration";
import { ALSO_ON_SOURCES } from "../lib/alsoOn";
import { UNITS as CPSC_UNITS } from "../lib/cpscRecalls";
import { dojPossessive } from "../lib/doj";
import { EEOC_UNITS } from "../lib/eeoc";
import { andSpellings, withoutTag } from "../lib/edgarName";
import { deterministicScore } from "../lib/enrich/relevance";
import { UNITS as EPA_UNITS, epaParty } from "../lib/epaCases";
import { companyNames } from "../lib/frCompany";
import { namesForYear } from "../lib/ingest/frBackfill";
import { nlrbFor, walkNlrb, type NlrbWalk } from "../lib/ingest/nlrbWalk";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import { respondents } from "../lib/cfpb";
import {
  ACT_DAY,
  NLRB_PAGE_SIZE,
  NLRB_UNITS,
  NOT_THE_COMPANY,
  REJECTED,
  fetchNlrbPage,
  inNightWindow,
  nlrbDocumentUrl,
  nlrbEvents,
  nlrbKind,
  nlrbPageUrl,
  parseNlrbListing,
  type NlrbAnswer,
  type NlrbDecision,
} from "../lib/nlrbDecisions";
import { releaseNamesOn } from "../lib/releaseNames";
import { newsNamesFor, possessiveNameFor, renamesFrom, type FormerName } from "../lib/sec";
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

/** The sample's own counts, as batch 161 read them from the 24 pages of 2026-11-18. */
const EXPECTED = {
  decisions: 2_345,
  kinds: { ulp: 1_332, representation: 811, none: 202 },
  // every listed company in the index, under the rule, its names as the replay below builds them
  // batch 161 gave 87 on 54, and 39 on 23 from first prices, before batch 162's units
  total: 96,
  companies: 60,
  // from first prices, for the companies the fixtures read
  fromFirst: 41,
  fromFirstPages: 25,
  top: "KR 7, GE 4, ETR 3, BUD 2, CAT 2, GT 2, LMT 2, XOM 2",
  // the night read of 2026-11-21, pages 0 to 339 (batch 162)
  night: {
    pages: 340,
    rows: 34_000,
    decisions: 33_989,
    first: "1969-09-16",
    last: "2026-11-19",
    // the two misspelt numbers read as cases against the employer ("0 5-CA-31828", "090CA-010829")
    kinds: { ulp: 24_602, representation: 4_563, none: 4_824 },
    total: 1_159,
    companies: 283,
    fromFirst: 568,
    fromFirstPages: 123,
    fromFirst2017: 496,
    top: "KR 33, GE 28, RTX 25, WMT 22, XOM 19, BA 17, AEP 14, CAT 14, GT 13, PPG 13, VZ 13, PEP 12",
  },
};

const companies = (tickerIndex as unknown as { companies: [number, string, string][] }).companies;
const titleOf = (cik: number) => companies.find((c) => c[0] === cik)![2];
/** A company's names of a year as ingest builds them, less the former names only the database holds. */
const namesOf = (cik: number) => (year: number) => {
  const title = titleOf(cik);
  const own = dojPossessive(title, possessiveNameFor(cik));
  return [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)];
};

const fixture = JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", "nlrb-listing.json.gz"))).toString()) as {
  provenance: string;
  pages: Record<string, string>;
  samplePages: string[];
  html: Record<string, string>;
  rejected: string;
};
const sample = [...new Map(Object.values(fixture.html).flatMap((h) => parseNlrbListing(h).decisions).map((d) => [d.document, d])).values()];
const on = (cik: number, from = "") => nlrbEvents(sample, namesOf(cik), { cik, from, namesOn: (d) => releaseNamesOn(cik, d) });
const find = (document: string) => sample.find((d) => d.document === document)!;

async function main(): Promise<void> {
  console.log("The Board's listing");
  const p0 = parseNlrbListing(fixture.pages["0"]);
  const last = parseNlrbListing(fixture.pages["666"]);
  check("page 0 holds 100 decisions, newest first, the pager naming page 666 as the last",
    p0.table && p0.decisions.length === NLRB_PAGE_SIZE && p0.lastPage === 666 &&
      JSON.stringify(p0.decisions[0]) === JSON.stringify({ document: "09031d45843ede05", day: "2026-11-12", citation: "375 NLRB No. 68", name: "Blick Art Materials, LLC", caseNumber: "13-CA-393585" }),
    p0.decisions[0]);
  const glove = last.decisions.find((d) => d.document === "09031d458009d191");
  check("  …the last page 45, with no last page of its own, a bound volume's citation without its leading zeros (\"001 NLRB 519\")",
    last.table && last.decisions.length === 45 && last.lastPage === null &&
      JSON.stringify(glove) === JSON.stringify({ document: "09031d458009d191", day: "1936-04-10", citation: "1 NLRB 519", name: "Canvas Glove Manufacturing Works, Inc.", caseNumber: "00-C-000024" }),
    glove);
  const blank = parseNlrbListing("<html><body>Access Denied</body></html>");
  check("  …and a page without the listing is no listing at all, not an empty page", !blank.table && blank.decisions.length === 0 && blank.lastPage === null);
  const pages = Object.entries(fixture.html).map(([p, h]) => [p, parseNlrbListing(h).decisions.length] as const);
  check(`the scout's 24 pages: every page but the last full, ${EXPECTED.decisions.toLocaleString("en-US")} decisions, each once`,
    fixture.samplePages.length === 24 && pages.every(([p, n]) => n === (p === "666" ? 45 : 100)) && sample.length === EXPECTED.decisions,
    `${sample.length}; ${pages.filter(([p, n]) => n !== (p === "666" ? 45 : 100)).join(" ")}`);
  check("  …each with its document, its day, its citation, its caption with the page's codes read (\"Goodyear Tire & Rubber Co.\", and \"Santa Fe Hotel &amp;amp; Casino\" written twice over) and its case number",
    sample.every((d) => /^[0-9a-f]{16}$/.test(d.document) && /^\d{4}-\d{2}-\d{2}$/.test(d.day) && /^\d+ NLRB (?:No\. )?\d+$/.test(d.citation) && d.name && !/&amp;|&#|<|>/.test(d.name) && /^(?:\d{1,2}[A-Z]?-[A-Z]{1,2}-\d{5,6}|AO-\d+)$/.test(d.caseNumber)) &&
      sample.some((d) => d.name === "Goodyear Tire & Rubber Co.") && sample.some((d) => d.name === "Santa Fe Hotel & Casino"),
    sample.find((d) => /&amp;|&#|<|>/.test(d.name) || !/^\d+ NLRB (?:No\. )?\d+$/.test(d.citation) || !/^(?:\d{1,2}[A-Z]?-[A-Z]{1,2}-\d{5,6}|AO-\d+)$/.test(d.caseNumber)));
  check("  …and a page's address every volume's, 100 a page", nlrbPageUrl(3) === "https://www.nlrb.gov/cases-decisions/decisions/board-decisions?volume=-1&items_per_page=100&page=3" &&
    nlrbDocumentUrl("09031d45843ede05") === "https://apps.nlrb.gov/link/document.aspx/09031d45843ede05");

  console.log("\nThe case's kind");
  const kinds = sample.reduce<Record<string, number>>((m, d) => ((m[nlrbKind(d.caseNumber) ?? "none"] = (m[nlrbKind(d.caseNumber) ?? "none"] ?? 0) + 1), m), {});
  check(`the sample's ${EXPECTED.kinds.ulp.toLocaleString("en-US")} cases against employers, ${EXPECTED.kinds.representation} representation cases and ${EXPECTED.kinds.none} that are no employer's case`,
    JSON.stringify(kinds) === JSON.stringify({ ulp: EXPECTED.kinds.ulp, representation: EXPECTED.kinds.representation, none: EXPECTED.kinds.none }) ||
      (kinds.ulp === EXPECTED.kinds.ulp && kinds.representation === EXPECTED.kinds.representation && kinds.none === EXPECTED.kinds.none),
    kinds);
  check("  …CA, and C before 1948, a case against the employer; RC, RD, RM, R and RE before 1948, UA, UC, UD and AC one at it (\"15M-R-00077\" too); the listing's two misspelt numbers read (\"0 5-CA-31828\", CNN America's)",
    nlrbKind("13-CA-393585") === "ulp" && nlrbKind("00-C-000024") === "ulp" &&
      nlrbKind("0 5-CA-31828") === "ulp" && nlrbKind("090CA-010829") === "ulp" &&
      ["19-RC-295849", "36-RD-001724", "28-RM-000394", "13-R-004309", "15M-R-00077", "5W-R-00055", "19-RE-000020", "09-UA-001496", "12-UC-203052", "04-UD-000002", "03-AC-000042"].every((n) => nlrbKind(n) === "representation"));
  check("  …and a case against a union (CB, CC, CD, CE, CG, CP), an advisory opinion or a fee application none",
    ["25-CB-008896", "19-CC-092816", "18-CD-352973", "20-CE-000068", "29-CG-000027", "20-CP-000565", "00-AO-000268", "AO-312", "19-ED-002087", "00-AA-000000", ""].every((n) => nlrbKind(n) === null));

  console.log("\nThe night window for bulk reads, 11 pm to 6 am Eastern");
  check("23:30 Eastern in November and in July is in it; 7 am Eastern is not",
    inNightWindow(new Date("2026-11-21T04:30:00Z")) && inNightWindow(new Date("2026-07-01T03:30:00Z")) && !inNightWindow(new Date("2026-11-21T12:00:00Z")));
  check("  …from 23:00 exactly, 22:59 not; a whole read begun with 45 minutes left (05:00 yes, 05:30 no)",
    inNightWindow(new Date("2026-11-21T04:00:00Z")) && !inNightWindow(new Date("2026-11-21T03:59:00Z")) && inNightWindow(new Date("2026-11-21T10:00:00Z")) && !inNightWindow(new Date("2026-11-21T10:30:00Z")));

  console.log("\nThe rule");
  const tesla = on(1318605, "2010-06-29");
  check("Tesla's decision of 2026-10-28 is one row on TSLA, its citation, caption, case number and kind, linked to the decision",
    tesla.length === 1 && tesla[0].date === "2026-10-28" &&
      tesla[0].title === "NLRB decision: Tesla, Inc., 375 NLRB No. 63 (case 03-CA-312352), an unfair labor practice case against the employer" &&
      tesla[0].url === "https://apps.nlrb.gov/link/document.aspx/09031d45843cb301" && tesla[0].source === "NLRB" && tesla[0].sourceKey === "nlrb_decisions" && tesla[0].type === "regulation" &&
      tesla[0].externalId === "09031d45843cb301" && tesla[0].dedupBasis === "nlrb:1318605@2026-10-28",
    tesla[0]);
  check("  …saying the listing does not give the ruling (the owner's call (a))",
    tesla[0]?.description === "375 NLRB No. 63, Tesla, Inc., case 03-CA-312352: an unfair labor practice case against the employer. How the Board ruled is in the decision; the Board's listing does not say.",
    tesla[0]?.description);
  const kr = on(56873);
  check("Kroger's own companies are Kroger's: Fred Meyer, \"a subsidiary of The Kroger Company\" (2026-09-30), Ralphs (2026-08-10), its partnerships",
    ["2026-09-30", "2026-08-10", "2026-07-23", "2026-05-20", "2019-06-18", "2010-08-18", "2010-05-07", "1959-03-13"].every((d) => kr.some((e) => e.date === d)) && kr.length === 8,
    kr.map((e) => e.date));
  check("  …and a case against Kroger's union (\"UFCW, LOCAL 700 (KROGER)\", 25-CB-008896, 2014-09-10) is no row, though its caption names Kroger",
    !kr.some((e) => e.date === "2014-09-10") && nlrbEvents([find("09031d458188496a")], namesOf(56873), { cik: 56873 }).length === 0 &&
      nlrbEvents([{ ...find("09031d458188496a"), caseNumber: "25-CA-008896", name: "Kroger Co." }], namesOf(56873), { cik: 56873 }).length === 1);
  const wpl = find("09031d4580086d30");
  check("Wisconsin Power and Light Co. (1938) is Alliant's (LNT, its operating company), never Light S.A.'s: \"Power and Light Co.\" is one name",
    on(352541).some((e) => e.date === "1938-03-31") && nlrbEvents([wpl], namesOf(1447221), { cik: 1447221 }).length === 0 && epaParty(respondents(wpl.name), ["Light"]) === null);
  const shell = find("09031d45800b9ced");
  check("\"Shell Co.\" of 1994-03-01, the Puerto Rico company, is not Shell plc's (`NOT_THE_COMPANY`), though the rule reads Shell in it",
    !on(1306965).some((e) => e.date === "1994-03-01") && nlrbEvents([shell], namesOf(1306965), { cik: 999999999 }).length === 1 && NOT_THE_COMPANY[1306965][0].name.test(shell.name));
  const steel = find("09031d45800a98df");
  check("  …nor National Steel Corp. (1973) Companhia Siderúrgica Nacional's",
    nlrbEvents([steel], namesOf(1049659), { cik: 1049659 }).length === 0 && nlrbEvents([steel], namesOf(1049659), { cik: 999999999 }).length === 1);
  const cyh = on(1108109);
  check("the units the listing names the company by are its (`NLRB_UNITS`): CHS Community Health Systems on CYH (2014-08-25), which the rule alone refuses",
    cyh.some((e) => e.date === "2014-08-25") && epaParty(respondents(find(cyh.find((e) => e.date === "2014-08-25")!.externalId!).name), namesOf(1108109)(2014)) === null);
  check("  …Amazon.com Services on AMZN (2026-07-02), Walt Disney Parks and Resorts on DIS (2019-01-25), Lockheed Martin's companies on LMT",
    on(1018724).some((e) => e.date === "2026-07-02") && on(1744489).some((e) => e.date === "2019-01-25") && ["2000-08-25", "2000-07-24"].every((d) => on(936468).some((e) => e.date === d)));
  check("  …and the units EPA's rule reads, on their days: Appalachian Power on AEP (1973), Exxon Pipeline on XOM (1978), Occidental Chemical on OXY (1989)",
    on(4904).some((e) => e.date === "1973-06-14") && on(2115436).some((e) => e.date === "1978-09-29") && on(797468).some((e) => e.date === "1989-05-31"));
  const misdated = find("09031d4580072d1f");
  check(`a decision the listing dates before the Act (${ACT_DAY}), "Earl McMillian Co." of "02/14/1919" (81 NLRB 639), makes no row`,
    nlrbEvents([misdated], () => ["Earl McMillian"], { cik: 999999999 }).length === 0 && nlrbEvents([{ ...misdated, day: "1949-02-14" }], () => ["Earl McMillian"], { cik: 999999999 }).length === 1);
  const jci: NlrbDecision = { document: "0000000000000001", day: "2010-03-01", citation: "355 NLRB 1", name: "Johnson Controls, Inc.", caseNumber: "07-CA-000001" };
  check("a name Tyco's record took from Johnson Controls (2016-09-02) is that company's before the day (lib/takenNames.ts)",
    nlrbEvents([jci], namesOf(833444), { cik: 833444 }).length === 0 && nlrbEvents([{ ...jci, day: "2017-03-01" }], namesOf(833444), { cik: 833444 }).length === 1);
  const sbux = on(829224);
  const two = sbux.find((e) => e.date === "2026-09-30");
  check("a company's decisions of a day are one row: Starbucks' two of 2026-09-30, each in the description, its id their documents",
    /^2 NLRB decisions: Starbucks Corporation$/.test(two?.title ?? "") && (two?.description?.match(/Starbucks Corporation, case /g) ?? []).length === 2 && two?.externalId?.split(",").length === 2,
    two);
  const joint: NlrbDecision = { document: "0000000000000002", day: "2014-09-15", citation: "361 NLRB 439", name: "Ford Motor Co. and General Motors Corp., Joint Employers", caseNumber: "05-CA-031828" };
  const f = nlrbEvents([joint], namesOf(37996), { cik: 37996 });
  const gm = nlrbEvents([joint], namesOf(1467858), { cik: 1467858 });
  check("  …and joint employers' one decision is on each page, with the same id, so each says it is \"Also on\" the other",
    f.length === 1 && gm.length === 1 && f[0].externalId === gm[0].externalId && f[0].externalId === "0000000000000002" &&
      ALSO_ON_SOURCES.includes("nlrb_decisions") && GROUPED_ROW_SOURCES.includes("nlrb_decisions"));
  check("  …from the company's first price on", on(1467858, "2010-11-18").every((e) => e.date >= "2010-11-18") && on(1467858).some((e) => e.date === "1994-03-02"));

  console.log("\nEvery listed company");
  const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const first: Record<string, string> = {};
  for (const [file, k] of [["digest-1985-entries.json.gz", "firstPrices"], ["eeoc-listing.json.gz", "first"], ["fda-device-recalls.json.gz", "first"], ["occ-actions.json.gz", "first"]] as const) {
    Object.assign(first, JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", file))).toString())[k]);
  }
  const letters = sample.map((d) => alnum(d.name));
  const years = Array.from({ length: 92 }, (_, k) => `${1935 + k}-07-01`);
  const rows: { ticker: string; date: string; first: string | null }[] = [];
  const seen = new Set<number>();
  for (const [cik, ticker] of companies) {
    if (seen.has(cik)) continue;
    seen.add(cik);
    // a cheap first pass over the company's names in any year and its units on any day; the rule itself decides
    const pre = [...new Set([...namesOf(cik)(2026), ...years.flatMap((d) => releaseNamesOn(cik, d)), ...(EEOC_UNITS[cik] ?? []).flatMap((u) => u.names)].flatMap(andSpellings).map(alnum).filter((n) => n.length >= 3))];
    const units = [...(NLRB_UNITS[cik] ?? []).map((u) => u.name), ...(EPA_UNITS[cik] ?? []).map((u) => u.defendant), ...(CPSC_UNITS[cik] ?? []).map((u) => u.firm)];
    const mine = sample.filter((d, j) => pre.some((p) => letters[j].includes(p)) || units.some((u) => u.test(d.name.trim())));
    if (!mine.length) continue;
    for (const e of nlrbEvents(mine, namesOf(cik), { cik, namesOn: (d) => releaseNamesOn(cik, d) })) rows.push({ ticker, date: e.date, first: first[ticker] ?? null });
  }
  const after = rows.filter((r) => r.first && r.date >= r.first);
  const top = Object.entries(after.reduce<Record<string, number>>((m, r) => ((m[r.ticker] = (m[r.ticker] ?? 0) + 1), m), {}))
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t, n]) => `${t} ${n}`)
    .join(", ");
  check(`before any first price: ${EXPECTED.total} company days on ${EXPECTED.companies} companies in the 24 pages`,
    rows.length === EXPECTED.total && new Set(rows.map((r) => r.ticker)).size === EXPECTED.companies, `${rows.length} on ${new Set(rows.map((r) => r.ticker)).size}`);
  check(`  …from first prices: ${EXPECTED.fromFirst} on ${EXPECTED.fromFirstPages} pages (${EXPECTED.top})`,
    after.length === EXPECTED.fromFirst && new Set(after.map((r) => r.ticker)).size === EXPECTED.fromFirstPages && top === EXPECTED.top,
    `${after.length} on ${new Set(after.map((r) => r.ticker)).size}; ${top}`);

  console.log("\nThe night read of 2026-11-21: pages 0 to 339, refused at 340 (batch 162)");
  const nightRead = JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", "nlrb-decisions-2026-11-21.json.gz"))).toString()) as {
    read: string;
    pages: number;
    rowsByPage: number[];
    decisions: [string, string, string, string, string][];
    former: Record<string, { name: string; formerNames: FormerName[] }>;
  };
  const held: NlrbDecision[] = nightRead.decisions.map(([document, day, citation, name, caseNumber]) => ({ document, day, citation, name, caseNumber }));
  const heldKinds = held.reduce<Record<string, number>>((m, d) => ((m[nlrbKind(d.caseNumber) ?? "none"] = (m[nlrbKind(d.caseNumber) ?? "none"] ?? 0) + 1), m), {});
  check(`${EXPECTED.night.pages} pages, every one full: ${EXPECTED.night.rows.toLocaleString("en-US")} rows, ${EXPECTED.night.decisions.toLocaleString("en-US")} dated decisions, ${EXPECTED.night.first} to ${EXPECTED.night.last}`,
    nightRead.pages === EXPECTED.night.pages && nightRead.rowsByPage.every((n) => n === NLRB_PAGE_SIZE) && nightRead.rowsByPage.reduce((a, b) => a + b, 0) === EXPECTED.night.rows &&
      held.length === EXPECTED.night.decisions && new Set(held.map((d) => d.document)).size === held.length && held[0].day === EXPECTED.night.first && held.at(-1)!.day === EXPECTED.night.last,
    { pages: nightRead.pages, rows: nightRead.rowsByPage.reduce((a, b) => a + b, 0), decisions: held.length, first: held[0]?.day, last: held.at(-1)?.day });
  check(`  …${EXPECTED.night.kinds.ulp.toLocaleString("en-US")} cases against employers, ${EXPECTED.night.kinds.representation.toLocaleString("en-US")} representation cases, ${EXPECTED.night.kinds.none.toLocaleString("en-US")} that are no employer's case`,
    heldKinds.ulp === EXPECTED.night.kinds.ulp && heldKinds.representation === EXPECTED.night.kinds.representation && heldKinds.none === EXPECTED.night.kinds.none, heldKinds);
  const formerOf = (cik: number) => {
    const r = nightRead.former[String(cik)];
    return r ? renamesFrom(r.name, r.formerNames).map((x) => ({ name: x.from, until: x.on })) : [];
  };
  /** A company's names of a year as ingest builds them (partyNamesFor), with EDGAR's former names. */
  const namesThen = (cik: number) => {
    const title = titleOf(cik);
    const own = dojPossessive(title, possessiveNameFor(cik));
    const former = formerOf(cik);
    return (year: number) => [...companyNames(title, namesForYear(year, newsNamesFor(cik), former)), ...(own ? [own] : []), ...[title, ...former.filter((f) => f.until >= `${year}-01-01`).map((f) => f.name)].map(withoutTag)];
  };
  const onHeld = (cik: number, from = "") => nlrbEvents(held, namesThen(cik), { cik, from, namesOn: (d) => releaseNamesOn(cik, d) });
  const wmt = onHeld(104169, "1972-08-25");
  check("Walmart's decisions as Wal-Mart Stores, Inc., its EDGAR name to 2018-02-01, reach WMT under that former name, as ingest reads it: 22 days, 1973 to 2016",
    wmt.length === 22 && wmt.some((e) => e.date === "1973-01-12") && wmt.some((e) => e.date === "2016-08-27") && nlrbEvents(held, namesOf(104169), { cik: 104169, from: "1972-08-25" }).length < 22,
    wmt.length);
  const tmus = onHeld(1283699);
  check("T-Mobile USA's are T-Mobile US's from the MetroPCS combination of 2013-04-30 (8-K 0001193125-13-193449): eight, 2016–2022",
    tmus.length === 8 && tmus.every((e) => e.date >= "2016-04-29") && NLRB_UNITS[1283699][0].from === "2013-04-30" &&
      nlrbEvents([{ ...held.find((d) => /^T-Mobile USA/.test(d.name))!, day: "2012-06-01" }], namesThen(1283699), { cik: 1283699 }).length === 0,
    tmus.map((e) => e.date));
  const armk = onHeld(1584509);
  const uniform = held.find((d) => /^Aramark Uniform & Career/.test(d.name))!;
  check("  …Aramark Uniform's are Aramark's to the Vestis spin-off of 2023-09-30 (2016-09-09 lands; a day after it would not); Manitowoc Ice's Manitowoc's to the Welbilt spin-off of 2016-03-04",
    armk.some((e) => e.date === "2016-09-09") && nlrbEvents([{ ...uniform, day: "2024-01-02" }], namesThen(1584509), { cik: 1584509 }).length === 0 &&
      onHeld(61986).some((e) => e.date === "2005-07-29") && nlrbEvents([{ ...held.find((d) => /^Manitowoc Ice/.test(d.name))!, day: "2016-06-01" }], namesThen(61986), { cik: 61986 }).length === 0);
  const freight = held.find((d) => /^FedEx Freight, Inc\./.test(d.name))!;
  check("  …FedEx Freight's FedEx's to its spin-off of 2026-06-01 (8-K 0001104659-26-068519) and FedEx Freight Holding's from that day, its first price",
    onHeld(1048911).some((e) => e.date === freight.day) && !onHeld(2082247, "2026-06-01").some((e) => e.date === freight.day) &&
      nlrbEvents([{ ...freight, day: "2026-07-01" }], namesThen(2082247), { cik: 2082247 }).length === 1 && nlrbEvents([{ ...freight, day: "2026-07-01" }], namesThen(1048911), { cik: 1048911 }).length === 0);
  check("  …McDonald's USA, LLC, the joint employer of 2015–2019, is McDonald's; \"McDonald's of Palolo\", a franchisee, is not; Nexstar's \"for their Station\" cases are Nexstar's",
    onHeld(63908).filter((e) => /McDonald's USA/.test(e.title)).length === 7 && !onHeld(63908).some((e) => e.date === "1973-08-09") && onHeld(1142417).some((e) => e.date === "2026-04-02"));
  const namesakes: [number, RegExp][] = [
    [753308, /^Florida Power & Light Credit Union$/],
    [318833, /TEAM COMPANY d\/b\/a STAFFQUICK/],
    [717720, /^Value Line Co\.$/],
    [2070570, /^The Reece Corp\.$/],
    [901491, /^Papa.s Penn Inc\. d\/b\/a Papa John.s$/],
    [72741, /^Commonwealth Electric Company of the Midwest$/],
  ];
  const refusedHeld = namesakes.map(([cik, re]) => {
    const d = held.find((x) => re.test(x.name))!;
    return { cik, name: d?.name, refused: !!d && nlrbEvents([d], namesThen(cik), { cik, namesOn: (x) => releaseNamesOn(cik, x) }).length === 0, rule: !!d && nlrbEvents([d], namesThen(cik), { cik: 999999999, namesOn: (x) => releaseNamesOn(cik, x) }).length === 1 };
  });
  check("the namesakes read by hand stay off (`NOT_THE_COMPANY`): an employees' credit union, a staffing firm, a Memphis Value Line, The Reece Corp., a Papa John's franchisee, a Nebraska electrical contractor",
    refusedHeld.every((r) => r.refused) && refusedHeld.filter((r) => r.rule).length >= 4, refusedHeld);
  const nightRows: { ticker: string; date: string; first: string | null }[] = [];
  const nightSeen = new Set<number>();
  const heldLetters = held.map((d) => alnum(d.name));
  for (const [cik, ticker] of companies) {
    if (nightSeen.has(cik)) continue;
    nightSeen.add(cik);
    const former = formerOf(cik);
    const pre = [...new Set([...namesOf(cik)(2026), ...former.map((f) => f.name), ...years.flatMap((d) => releaseNamesOn(cik, d)), ...(EEOC_UNITS[cik] ?? []).flatMap((u) => u.names)].flatMap(andSpellings).map(alnum).filter((n) => n.length >= 3))];
    const units = [...(NLRB_UNITS[cik] ?? []).map((u) => u.name), ...(EPA_UNITS[cik] ?? []).map((u) => u.defendant), ...(CPSC_UNITS[cik] ?? []).map((u) => u.firm)];
    const mine = held.filter((d, j) => pre.some((p) => heldLetters[j].includes(p)) || units.some((u) => u.test(d.name.trim())));
    if (!mine.length) continue;
    for (const e of nlrbEvents(mine, namesThen(cik), { cik, namesOn: (d) => releaseNamesOn(cik, d) })) nightRows.push({ ticker, date: e.date, first: first[ticker] ?? null });
  }
  const nightAfter = nightRows.filter((r) => r.first && r.date >= r.first);
  const nightTop = Object.entries(nightAfter.reduce<Record<string, number>>((m, r) => ((m[r.ticker] = (m[r.ticker] ?? 0) + 1), m), {}))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([t, n]) => `${t} ${n}`)
    .join(", ");
  check(`every listed company, with EDGAR's former names: ${EXPECTED.night.total.toLocaleString("en-US")} company days on ${EXPECTED.night.companies} companies before first prices`,
    nightRows.length === EXPECTED.night.total && new Set(nightRows.map((r) => r.ticker)).size === EXPECTED.night.companies, `${nightRows.length} on ${new Set(nightRows.map((r) => r.ticker)).size}`);
  check(`  …from the first prices the fixtures carry: ${EXPECTED.night.fromFirst} on ${EXPECTED.night.fromFirstPages} pages, ${EXPECTED.night.fromFirst2017} before 2017 (${EXPECTED.night.top})`,
    nightAfter.length === EXPECTED.night.fromFirst && new Set(nightAfter.map((r) => r.ticker)).size === EXPECTED.night.fromFirstPages && nightAfter.filter((r) => r.date < "2017-01-01").length === EXPECTED.night.fromFirst2017 &&
      nightTop === EXPECTED.night.top,
    `${nightAfter.length} on ${new Set(nightAfter.map((r) => r.ticker)).size}, ${nightAfter.filter((r) => r.date < "2017-01-01").length} before 2017; ${nightTop}`);

  console.log("\nRead whole once a year at night, its newest page once a day");
  const listing = sample.slice().sort((a, b) => b.day.localeCompare(a.day) || b.document.localeCompare(a.document));
  const lastPage = Math.ceil(listing.length / NLRB_PAGE_SIZE) - 1;
  const served: number[] = [];
  const serve = async (page: number): Promise<NlrbAnswer> => {
    served.push(page);
    const decisions = listing.slice(page * NLRB_PAGE_SIZE, page * NLRB_PAGE_SIZE + NLRB_PAGE_SIZE);
    return { decisions, rows: decisions.length, lastPage: page === lastPage ? null : lastPage, outcome: "ok", httpStatus: 200 };
  };
  const pagesFrom = (from: number, to = lastPage) => Array.from({ length: to - from + 1 }, (_, k) => from + k).join(",");
  const night = new Date("2026-11-22T05:00:00Z");
  const day = new Date("2026-11-22T17:00:00Z");
  const walk = (db: FakeDb, now: Date, left = 720, fetchPage: (p: number) => Promise<NlrbAnswer> = serve) => walkNlrb(fakeDb(db), { budget: { left }, gapMs: 0, fetchPage, now });
  const db: FakeDb = { decisions: new Map(), reads: new Map(), listed: "1962-01-02" };
  const early = await walk(db, day);
  check("a first run by day asks nothing: the whole listing waits for the night window",
    early.due === null && early.pages === 0 && !early.whole && served.length === 0 && /night window, 11 pm to 6 am Eastern/.test(early.stopped ?? ""), JSON.stringify(early));
  const whole = await walk(db, night);
  check("  …at night it reads every page and keeps every decision once; the read's progress row gives way to the listing's",
    whole.due === "list" && whole.whole && whole.pages === lastPage + 1 && db.decisions.size === EXPECTED.decisions && served.join(",") === pagesFrom(0) &&
      db.reads.has("list") && !db.reads.has("partial") && db.reads.get("list")?.pages === lastPage + 1 && db.reads.get("list")?.decisions === EXPECTED.decisions,
    JSON.stringify(whole));
  const same = await walk(db, night);
  check("  …a run the same day asks nothing", same.due === null && same.whole && served.length === lastPage + 1);
  for (const r of db.reads.values()) r.ageDays = 2;
  const newest = await walk(db, day);
  check("  …a day on, by day, the newest page alone, which holds a decision already kept", newest.due === "newest" && newest.pages === 1 && newest.whole && served.at(-1) === 0, JSON.stringify(newest));
  for (const r of db.reads.values()) r.ageDays = 366;
  const yearDay = await walk(db, day);
  served.length = 0;
  const yearNight = await walk(db, night);
  check("  …a year on, the newest page by day and the whole listing again at night, from its first page",
    yearDay.due === "newest" && yearDay.pages === 1 && yearNight.due === "list" && yearNight.pages === lastPage + 1 && served.join(",") === pagesFrom(0));

  console.log("\nAcross runs and nights (batch 162: the firewall refused the first night read at page 340)");
  const fresh = (): FakeDb => ({ decisions: new Map(), reads: new Map(), listed: null });
  const runs = fresh();
  served.length = 0;
  const first10 = await walk(runs, night, 10);
  check("a run reads as many pages as it has and keeps them, its progress held: pages 0 to 9, the next page 10",
    first10.due === "list" && first10.stopped === "this run's pages are spent" && first10.nextPage === 10 && !first10.whole && runs.decisions.size === 1_000 &&
      runs.reads.get("partial")?.nextPage === 10 && !runs.reads.has("list"),
    JSON.stringify(first10));
  served.length = 0;
  const rest = await walk(runs, night);
  check("  …the next run resumes a page before, as the listing only grows at its head, and finishes it",
    rest.whole && served.join(",") === pagesFrom(9) && runs.decisions.size === EXPECTED.decisions && runs.reads.has("list") && !runs.reads.has("partial"), served.join(","));
  const walled = fresh();
  served.length = 0;
  const firewall = await walk(walled, night, 720, async (p) => (p === 5 ? { decisions: [], rows: 0, lastPage: null, outcome: "throttled", httpStatus: 200, detail: "the site's firewall rejected the request" } : serve(p)));
  check("a refused page ends the night's reading and keeps the pages read before it",
    firewall.failure?.outcome === "throttled" && /^page 5: the site's firewall rejected the request$/.test(firewall.failure.detail ?? "") && walled.decisions.size === 500 &&
      walled.reads.get("partial")?.nextPage === 5 && walled.reads.get("partial")?.refusedHoursAgo === 0 && !firewall.whole,
    JSON.stringify(firewall));
  served.length = 0;
  const again = await walk(walled, night);
  check("  …the same night no whole reading is asked again", again.due === null && served.length === 0 && /rests until the next night/.test(again.stopped ?? ""), JSON.stringify(again));
  walled.reads.get("partial")!.refusedHoursAgo = 23;
  const nextNight = await walk(walled, night);
  check("  …the next night it resumes a page before the refusal and finishes",
    nextNight.whole && served.join(",") === pagesFrom(4) && walled.decisions.size === EXPECTED.decisions && !walled.reads.has("partial"), served.join(","));
  const stale = fresh();
  await walk(stale, night, 10);
  stale.reads.get("partial")!.ageDays = 15;
  served.length = 0;
  await walk(stale, night);
  check("a whole read begun over 14 days ago begins again at its first page", served.join(",") === pagesFrom(0) && stale.reads.has("list"), served.slice(0, 3).join(","));
  const cutDb = fresh();
  const cut = await walk(cutDb, night, 720, async (p) => (p === 7 ? { ...(await serve(p)), decisions: listing.slice(700, 760), rows: 60 } : serve(p)));
  check("a short page before the last is a cut listing, not its end, and the read stops there",
    cut.failure?.outcome === "error" && /page 7: 60 rows, not 100/.test(cut.failure.detail ?? "") && cutDb.decisions.size === 700 && !cutDb.reads.has("list"), JSON.stringify(cut));
  const undatedDb = fresh();
  const undated = await walk(undatedDb, night, 720, async (p) => (p === 7 ? { ...(await serve(p)), decisions: listing.slice(700, 789), rows: 100 } : serve(p)));
  check("  …but a page of 100 rows, 11 of them undated (page 336 of 2026-11-21), is full", undated.whole && undatedDb.decisions.size === EXPECTED.decisions - 11, JSON.stringify(undated));
  const p336 = parseNlrbListing(fixture.pages["336"]);
  check("  …as the parser counts it: 100 rows, 89 decisions, \"Capital Bakery\" (321 NLRB 10) among the undated",
    p336.table && p336.rows === 100 && p336.decisions.length === 89 && !p336.decisions.some((d) => d.name === "Capital Bakery") && /Capital Bakery/.test(fixture.pages["336"]), { rows: p336.rows, decisions: p336.decisions.length });
  const real = globalThis.fetch;
  const asked: { url: string; ua: string }[] = [];
  let denied: NlrbAnswer;
  let walledOff: NlrbAnswer;
  let busy: NlrbAnswer;
  try {
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      asked.push({ url: String(url), ua: String((init?.headers as Record<string, string>)?.["User-Agent"] ?? "") });
      return new Response("<html><body>Access Denied</body></html>", { status: 200 });
    }) as typeof fetch;
    denied = await fetchNlrbPage(4);
    globalThis.fetch = (async () => new Response(fixture.rejected, { status: 200 })) as typeof fetch;
    walledOff = await fetchNlrbPage(340);
    globalThis.fetch = (async () => new Response("", { status: 429 })) as typeof fetch;
    busy = await fetchNlrbPage(4);
  } finally {
    globalThis.fetch = real;
  }
  check("the firewall's \"Request Rejected\" page, served as HTTP 200, is a refusal; another page without the listing an error, a 429 a throttle",
    walledOff.outcome === "throttled" && walledOff.detail === "the site's firewall rejected the request" && REJECTED.test(fixture.rejected) &&
      denied.outcome === "error" && denied.detail === "no listing on the page" && busy.outcome === "throttled" && busy.httpStatus === 429,
    { walledOff, denied, busy });
  check("  …each page asked by its address, with the project's User-Agent",
    asked[0]?.url === nlrbPageUrl(4) && /^News Charts Research\b/.test(asked[0]?.ua ?? ""),
    // the User-Agent carries the contact address when one is set: never printed
    asked.map((a) => a.url));

  console.log("\nAt ingest");
  const plan = (cik: number) => ({ edgarName: titleOf(cik), alsoKnownAs: newsNamesFor(cik), possessive: dojPossessive(titleOf(cik), possessiveNameFor(cik)), cik });
  const read1: NlrbWalk = { due: null, pages: 0, decisions: 0, whole: true };
  const krIngest = await nlrbFor(fakeDb({ ...db, listed: "1962-01-02" }), 1, plan(56873), read1);
  check("a company's kept decisions from its first price, as a complete answer once the whole listing is held",
    krIngest.outcome === "ok" && krIngest.events.length === 7 && krIngest.events.every((e) => e.date >= "1962-01-02") && !!krIngest.complete, `${krIngest.outcome} ${krIngest.events.length}`);
  const partial = await nlrbFor(fakeDb({ ...db, listed: "1962-01-02" }), 1, plan(56873), { due: "newest", pages: 1, decisions: 3, whole: false });
  const waiting = await nlrbFor(fakeDb({ decisions: new Map(), reads: new Map(), listed: "1962-01-02" }), 1, plan(56873), early);
  check("  …and before the whole listing is held, the newest pages' alone, never complete, saying why",
    !partial.complete && partial.outcome === "ok" && partial.detail === "the whole listing is not yet read" && !waiting.complete && waiting.outcome === "empty" && /night window/.test(waiting.detail ?? ""),
    { partial: partial.detail, waiting: waiting.detail });
  const none = await nlrbFor(fakeDb({ ...db, listed: null }), 1, plan(56873), read1);
  const fund = await nlrbFor(fakeDb(db), 1, { ...plan(56873), fundSeries: true }, read1);
  check("  …asked again while it has no prices, and none for a fund's series", none.outcome === "error" && /no prices/.test(none.detail ?? "") && fund.events.length === 0 && fund.outcome === "empty");

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "nlrb_decisions");
  check("the source is id 44, the Board's own work, cleared for commercial use, reviewed 2026-11-18, credited to the National Labor Relations Board",
    src?.id === 44 && /17 U\.S\.C\. § 105/.test(src.license) && src.commercialOk && src.reviewedOn === "2026-11-18" && src.attribution === "National Labor Relations Board", src);
  check("  …the Board's disclaimer and bulk-data policy quoted where they are kept",
    /may not reflect official positions of the NLRB/.test(read("lib/nlrbDecisions.ts").replace(/\s*\*\s*/g, " ")) && /between 11pm EST – 6am EST/.test(read("lib/nlrbDecisions.ts").replace(/\s*\*\s*/g, " ")) &&
      /between 11pm EST – 6am EST/.test(read("lib/ingest/store.ts")));
  check("  …a company source, quota and refresh noted, scored without the model",
    (COMPANY_SOURCES as readonly string[]).includes("nlrb_decisions") && QUOTAS.nlrb_decisions.perDay === null && SOURCE_TTL_MINUTES.nlrb_decisions === 1440 &&
      deterministicScore({ eventId: 0, kind: "regulation", title: "NLRB decision: Tesla, Inc.", sourceKey: "nlrb_decisions" }, { kind: "company", displayName: "Tesla", ticker: "TSLA" }, ["tesla"])?.score === 0.95);
  check("  …company ingest walks the listing, then keeps the company's decisions",
    /await run\("nlrb_decisions", [^\n]+\n\s*const walked = await walkNlrb\(client\);[\s\S]{0,400}return nlrbFor\(client, subjectId, \{[^}]*cik: company\.cik, fundSeries \}, walked\);/.test(read("scripts/ingest.ts")));
  check("  …into tables of its own (db/054), and credited",
    /CREATE TABLE IF NOT EXISTS nlrb_decisions \(\s*document\s+text PRIMARY KEY/.test(read("db/054_nlrb_decisions.sql")) && /CREATE TABLE IF NOT EXISTS nlrb_reads/.test(read("db/054_nlrb_decisions.sql")) &&
      /decisions from the National Labor Relations Board/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /the National Labor Relations Board/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")) &&
      /\| National Labor Relations Board \|/.test(read("README.md")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

interface Read {
  ageDays: number;
  pages?: number;
  decisions?: number;
  nextPage?: number;
  refusedHoursAgo?: number | null;
}
interface FakeDb {
  decisions: Map<string, NlrbDecision>;
  reads: Map<"list" | "newest" | "partial", Read>;
  listed: string | null;
}
function fakeDb(db: FakeDb): PoolClient {
  return {
    query: async (sql: string, params: unknown[] = []) => {
      const s = sql.trim().replace(/\s+/g, " ");
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
      if (s === "SELECT kind, next_page, read_at < now() - make_interval(days => 365) AS old, read_at < now() - interval '1 day' AS stale, read_at < now() - make_interval(days => 14) AS lapsed, coalesce(refused_at > now() - make_interval(hours => 12), false) AS resting FROM nlrb_reads") {
        return {
          rows: [...db.reads].map(([kind, r]) => ({ kind, next_page: r.nextPage ?? null, old: r.ageDays > 365, stale: r.ageDays > 1, lapsed: r.ageDays > 14, resting: r.refusedHoursAgo != null && r.refusedHoursAgo < 12 })),
        };
      }
      if (s === "SELECT document FROM nlrb_decisions") return { rows: [...db.decisions.keys()].map((document) => ({ document })) };
      if (/^INSERT INTO nlrb_decisions \(document, day, citation, case_name, case_number\) SELECT \* FROM unnest/.test(s)) {
        const [documents, days, citations, names, numbers] = params as string[][];
        documents.forEach((document, i) => db.decisions.set(document, { document, day: days[i], citation: citations[i], name: names[i], caseNumber: numbers[i] }));
        return { rows: [], rowCount: documents.length };
      }
      if (s.startsWith("INSERT INTO nlrb_reads (kind, pages, decisions, next_page, refused_at) VALUES ('partial', 0, 0, 0, NULL) ON CONFLICT (kind) DO UPDATE SET pages = 0, decisions = 0, next_page = 0, refused_at = NULL, read_at = now()")) {
        db.reads.set("partial", { ageDays: 0, pages: 0, decisions: 0, nextPage: 0, refusedHoursAgo: null });
        return { rows: [] };
      }
      if (s === "UPDATE nlrb_reads SET refused_at = now() WHERE kind = 'partial'") {
        db.reads.get("partial")!.refusedHoursAgo = 0;
        return { rows: [] };
      }
      if (s === "UPDATE nlrb_reads SET next_page = $1, decisions = decisions + $2, pages = pages + 1 WHERE kind = 'partial'") {
        const r = db.reads.get("partial")!;
        r.nextPage = params[0] as number;
        r.decisions = (r.decisions ?? 0) + (params[1] as number);
        r.pages = (r.pages ?? 0) + 1;
        return { rows: [] };
      }
      if (s.startsWith("INSERT INTO nlrb_reads (kind, pages, decisions) SELECT 'list', $1, count(*) FROM nlrb_decisions ON CONFLICT (kind) DO UPDATE")) {
        db.reads.set("list", { ageDays: 0, pages: params[0] as number, decisions: db.decisions.size });
        return { rows: [] };
      }
      if (s === "DELETE FROM nlrb_reads WHERE kind = 'partial'") {
        db.reads.delete("partial");
        return { rows: [] };
      }
      if (s.startsWith("INSERT INTO nlrb_reads (kind, pages, decisions) VALUES ('newest', $1, $2) ON CONFLICT (kind) DO UPDATE")) {
        db.reads.set("newest", { ageDays: 0, pages: params[0] as number, decisions: params[1] as number });
        return { rows: [] };
      }
      if (s === 'SELECT document, day::text AS day, citation, case_name AS name, case_number AS "caseNumber" FROM nlrb_decisions ORDER BY day, document') {
        return { rows: [...db.decisions.values()].sort((a, b) => a.day.localeCompare(b.day) || a.document.localeCompare(b.document)) };
      }
      if (/FROM prices/.test(s)) return { rows: [{ listed: db.listed }] };
      if (/FROM events e/.test(s)) return { rows: [] };
      throw new Error(`unexpected query: ${s.slice(0, 120)}`);
    },
  } as unknown as PoolClient;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
