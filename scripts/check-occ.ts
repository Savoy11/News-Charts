import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { dojPossessive } from "../lib/doj";
import { withoutTag } from "../lib/edgarName";
import { deterministicScore } from "../lib/enrich/relevance";
import { companyNames } from "../lib/frCompany";
import { namesForYear } from "../lib/ingest/frBackfill";
import { occFor } from "../lib/ingest/occFor";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import {
  NOT_THE_COMPANY,
  OCC_ACTIONS_URL,
  OCC_BANKS,
  OCC_COUNT_URL,
  OCC_PAGE_SIZE,
  amountText,
  cachedOccList,
  forgetOccList,
  occEvents,
  parseOccActions,
  parseOccList,
  readOccList,
  type OccList,
} from "../lib/occActions";
import { OTS_ORDERS, endedInNotes, isOccTwin, orderNumber, otsActions, readOtsOrders } from "../lib/otsOrders";
import { isNotesRecord, releaseNamesBefore, releaseNamesOn } from "../lib/releaseNames";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
import type { TimelineEvent } from "../lib/types";
import { COMPANY_SOURCES } from "./ingest";

/**
 * The OCC's enforcement actions on the pages of the companies whose banks they are against (batch
 * 153, the 2026-11-15 proposal 2, approved by the owner that day with an order's termination as a
 * line on its row).
 *
 *   npm run check:occ
 *
 * Replays the OCC's whole list as its API served it on 2026-11-16 (scripts/fixtures/occ-actions.json.gz:
 * the answer, its count, and the first prices of the pages concerned) against every company in the
 * index. Offline: the API and the database are stood in for. On main none of it runs:
 * lib/occActions.ts does not exist.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const FX: { provenance: string; count: number; body: string; first: Record<string, string> } = JSON.parse(
  gunzipSync(readFileSync(join(root, "scripts/fixtures/occ-actions.json.gz"))).toString("utf8"),
);
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
const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The replay's counts, measured 2026-11-16 on the saved list (batch 153). */
const EXPECTED = {
  records: 2655,
  firstDay: "1987-02-11",
  lastDay: "2026-10-13",
  withAmount: 378,
  // with the OTS archive (batch 154) and the banks of the 2026-11-16 audit (batch 155); the OCC's list alone gave
  // 185 on 50, and 180 on 49 pages, 126 before 2017, in batch 153; batch 154 199 on 58, and 194 on 57, 139 before 2017
  total: 207,
  companies: 63,
  fromFirst: 202,
  fromFirstPages: 62,
  fromFirst2017: 147,
  top: "WFC 17, JPM 15, C 14, BAC 13, USB 12, COF 8",
};

async function main() {
  console.log("Reading the OCC's answer");
  const { actions, records } = parseOccList(FX.body);
  const days = actions.map((a) => a.day).sort();
  check(`every record of the answer is read once: ${EXPECTED.records}, the count the API gave, ${EXPECTED.firstDay} to ${EXPECTED.lastDay}`,
    records === EXPECTED.records && actions.length === EXPECTED.records && FX.count === EXPECTED.records && days[0] === EXPECTED.firstDay && days.at(-1) === EXPECTED.lastDay,
    `${records} records, ${actions.length} actions, ${days[0]}..${days.at(-1)}`);
  check("  …a byte-order mark before the answer, which the Board's files carry and the OCC's may, is passed over",
    FX.body.charCodeAt(0) === 0x5b && parseOccList(`\uFEFF${FX.body}`).records === EXPECTED.records);
  const withAmount = actions.filter((a) => a.amount);
  check(`  …${EXPECTED.withAmount} carry an amount, each as numeric text, never a float's: the largest 1127453261, cents kept (143517.21)`,
    withAmount.length === EXPECTED.withAmount && withAmount.every((a) => /^\d+(?:\.\d+)?$/.test(a.amount!)) && withAmount.some((a) => a.amount === "1127453261" && a.bank === "Bank of America, National Association") &&
      withAmount.some((a) => a.amount === "143517.21"),
    `${withAmount.length}`);
  check("  …the answer's own digits: \"300000000.0\" is 300000000, \"0.0\" no amount, an exponent or a sign none",
    amountText("300000000.0") === "300000000" && amountText("143517.21") === "143517.21" && amountText("0.0") === null && amountText("1e21") === null && amountText("-5") === null && amountText(null) === null);
  const synthetic = JSON.stringify([
    { EnforcementInstIAPType: "Individual", FirstName: "Jane", LastName: "Roe", BankName: "Wells Fargo Bank, National Association", CompleteDate: "2020-01-15T00:00:00-05:00", EnforcementTypeCode: "CMP", DocumentNumber: "2020-001", CharterNumber: 1, Amount: 50000.0 },
    { EnforcementInstIAPType: "Institution", FirstName: "John", LastName: "Doe", BankName: "Wells Fargo Bank, National Association", CompleteDate: "2020-01-15T00:00:00-05:00", EnforcementTypeCode: "CMP", DocumentNumber: "2020-002", CharterNumber: 1, Amount: 50000.0 },
    { EnforcementInstIAPType: "Institution", FirstName: "", LastName: "", BankName: "Wells Fargo Bank, National Association", CompleteDate: "2020-01-15T00:00:00-05:00", EnforcementTypeCode: "CMP", DocumentNumber: "2020-003", CharterNumber: 1, Amount: 50000.0 },
  ]);
  const parsedSynthetic = parseOccActions(synthetic);
  check("  …an action against a person is never read, nor one that names a person", parsedSynthetic.length === 1 && parsedSynthetic[0].document === "2020-003", JSON.stringify(parsedSynthetic.map((a) => a.document)));
  check("  …the most particular subject matter of each branch, not its parent too: \"Internal Audit\", not \"Audit\"",
    actions.some((a) => a.document === "2013-138" && a.subjects.includes("Internal Audit") && !a.subjects.includes("Audit")));

  console.log("\nThe OTS archive of 1989–2011 (batch 154)");
  const archive = JSON.parse(read("data/ots-orders.json")) as { records: number; persons: number; orders: typeof OTS_ORDERS };
  const otsDays = OTS_ORDERS.map((o) => o.day).filter(Boolean).sort();
  check("the committed archive holds its 1,497 orders against institutions of 3,547 records, 1989-01-13 to 2011-07-18, the 2,050 against persons left out",
    archive.records === 3547 && archive.persons === 2050 && OTS_ORDERS.length === 1497 && otsDays[0] === "1989-01-13" && otsDays.at(-1) === "2011-07-18",
    `${archive.records} ${archive.persons} ${OTS_ORDERS.length} ${otsDays[0]}..${otsDays.at(-1)}`);
  check("  …each linked to its order's file on occ.gov, by https, but the 27 with no file named",
    OTS_ORDERS.every((o) => !o.link || /^https:\/\/occ\.gov\/static\/ots\/enforcement\/\d+a?\.pdf$/.test(o.link)) && OTS_ORDERS.filter((o) => !o.link).length === 27,
    `${OTS_ORDERS.filter((o) => !o.link).length}`);
  check("  …and the workbook's reader refuses a sheet that is not the archive", (() => {
    try {
      readOtsOrders(new Uint8Array([80, 75, 5, 6, ...new Array(18).fill(0)]));
      return false;
    } catch {
      return true;
    }
  })());
  check("one order number however it is written: \"WN-09-0007\" is \"WN 09-007\", \"S.A.\" is \"SA\", \"NE-11-17\" is \"NE 11-17\"",
    orderNumber("WN-09-0007") === orderNumber("WN 09-007") && orderNumber("S.A.") === orderNumber("SA") && orderNumber("NE-11-17") === orderNumber("NE 11-17") && orderNumber("CN 09-15") !== orderNumber("MW 08-14"));
  check("  …and the day an order's note says it ended: \"Terminated November 12, 2002\", \"terminated by NE 01-04 dtd 02/07/01\"",
    endedInNotes("Terminated November 12, 2002")?.day === "2002-11-12" && endedInNotes("terminated by NE 01-04 dtd 02/07/01")?.day === "2001-02-07" && endedInNotes("terminated by NE 01-04 dtd 02/07/01")?.by === "NE 01-04" && endedInNotes("SF 99-001 dtd 01/07/99") === null);
  const ots = otsActions(OTS_ORDERS, actions);
  check("the archive's 1,497 give 1,263 orders: its 119 terminations are lines on their orders (Cargill Bank's of a penalty, filed under the penalty's kind, among them), 10 orders have no day, and 105 the OCC's list carries on",
    ots.length === 1263 && OTS_ORDERS.filter((o) => /^Termination/i.test(o.type)).length === 119 && OTS_ORDERS.filter((o) => !o.day).length === 10 && otsActions(OTS_ORDERS, []).length === 1368,
    `${ots.length} ${OTS_ORDERS.filter((o) => /^Termination/i.test(o.type)).length} ${otsActions(OTS_ORDERS, []).length}`);
  const sovereign = otsActions(OTS_ORDERS, []).find((a) => a.document === "NE 11-17")!;
  check("  …a copy is the OCC's by its number within a month (Sovereign Bank's NE-11-17, 2011-04-11 there, 2011-04-13 here) or by its day and kind (AIG Federal Savings Bank's agreement of 2007-06-07)",
    isOccTwin(sovereign, actions) && sovereign.day === "2011-04-13" && isOccTwin(otsActions(OTS_ORDERS, []).find((a) => a.bank === "AIG Federal Savings Bank")!, actions) &&
      !isOccTwin(otsActions(OTS_ORDERS, []).find((a) => a.document === "CN 09-01")!, actions));
  const all = [...actions, ...ots];

  console.log("\nThe rule, company by company");
  const at = new Map<string, TimelineEvent[]>();
  const fromFirst = new Map<string, TimelineEvent[]>();
  const keys = all.map((a) => letters(a.bank)).join("#");
  const seen = new Set<number>();
  for (const [cik, ticker, title] of companies) {
    // a record once, under its first ticker: a bank's preferred shares are its common's page's records too
    if (seen.has(cik) || isNotesRecord(cik)) continue;
    seen.add(cik);
    const namesIn = namesOf(cik, title);
    const units = [...new Set(["1990-01-01", "2000-01-01", "2010-01-01", "2020-01-01", "2026-01-01"].flatMap((d) => [...releaseNamesOn(cik, d), ...releaseNamesBefore(cik, d)]))];
    const names = [...new Set([...namesIn(2020), ...namesIn(2010), ...namesIn(2000), ...namesIn(1990), ...units])].flatMap((n) => [n, n.replace(/&/g, " and ")]).map(letters).filter((k) => k.length >= 2);
    const charters = new Set((OCC_BANKS[cik]?.banks ?? []).map((b) => b.charter));
    if (!names.some((k) => keys.includes(k)) && !charters.size) continue;
    const cand = all.filter((a) => charters.has(a.charter ?? -1) || names.some((k) => letters(a.bank).includes(k)));
    const opts = { cik, namesOn: (day: string) => releaseNamesOn(cik, day), namesBefore: (day: string) => releaseNamesBefore(cik, day) };
    const ev = occEvents(cand, namesIn, opts);
    if (!ev.length) continue;
    at.set(ticker, ev);
    if (FX.first[ticker]) fromFirst.set(ticker, occEvents(cand, namesIn, { ...opts, from: FX.first[ticker] }));
  }
  const on = (ticker: string) => at.get(ticker) ?? [];
  const day = (ticker: string, d: string) => on(ticker).find((e) => e.date === d);

  const jpm = day("JPM", "2013-09-18");
  check("JPMorgan's four orders of 2013-09-18 against three of its banks are one row: $300,000,000 (order 2013-140) and $60,000,000 (order 2013-141)",
    on("JPM").filter((e) => e.date === "2013-09-18").length === 1 && !!jpm && /\$300,000,000 civil money penalty/.test(jpm.title) && /\$60,000,000 civil money penalty/.test(jpm.title) &&
      /order 2013-140\b/.test(jpm.description ?? "") && /order 2013-141\b/.test(jpm.description ?? "") && /JPMorgan Bank and Trust Company, National Association/.test(jpm.description ?? "") &&
      /Chase Bank USA, National Association/.test(jpm.description ?? ""),
    jpm?.title);
  check("  …each order ends where it has, the approved call: a line on its row (\"It ended 2017-09-07 (order 2017-085)\")",
    /It ended 2017-09-07 \(order 2017-085\)\./.test(jpm?.description ?? "") && /It ended 2015-11-02 \(order 2015-130\)\./.test(jpm?.description ?? ""));
  check("  …and links the document of the largest: the OCC's PDF", jpm?.url === "https://occ.gov/static/enforcement-actions/ea2013-140.pdf", jpm?.url);
  check("HSBC Bank USA's $500,000,000 of 2012-12-11 lands on HSBC", /\$500,000,000 civil money penalty/.test(day("HSBC", "2012-12-11")?.title ?? ""), day("HSBC", "2012-12-11")?.title);
  check("\"Citibank, National Association\"'s $350,000,000 of 2014-11-11 and $400,000,000 of 2020-10-07 land on Citigroup, which the release map's \"Citibank, N.A.\" missed",
    /\$350,000,000/.test(day("C", "2014-11-11")?.title ?? "") && /\$400,000,000/.test(day("C", "2020-10-07")?.title ?? "") && /Against Citibank, National Association/.test(day("C", "2014-11-11")?.description ?? ""));
  check("  …and Citibank's agreement of 1992-06-24, Citicorp's before the merger of 1998, stays off", !day("C", "1992-06-24"));
  check("\"Bank Of America, Nt & Sa\" of 1992, old BankAmerica's before BAC's record took the name, stays off BAC; Bank of America, N.A.'s restitution of $1,127,453,261 lands",
    !day("BAC", "1992-01-14") && !day("BAC", "1992-01-15") && /restitution of \$1,127,453,261/.test(day("BAC", "2013-02-28")?.title ?? ""));
  check("namesakes stay off: \"National Bank\" of 2004-04-22 and \"THE National Bank\" of 2011 off National Bank Holdings, \"Metropolitan Bank and Trust Company\" off MCB, \"F&M Bank and Trust Company\" off FMBM",
    !day("NBHC", "2004-04-22") && !day("NBHC", "2011-01-26") && !day("NBHC", "2000-03-06") && !on("MCB").length && !on("FMBM").length,
    `${on("NBHC").length} ${on("MCB").length} ${on("FMBM").length}`);
  check("  …each one of them read by charter in the list, its bank another town's",
    Object.values(NOT_THE_COMPANY).every((n) => n.charters.every((c) => all.some((a) => a.charter === c)) && (n.dockets ?? []).every((d) => ots.some((a) => a.docket === d))));
  check("  …and without the list the rule would give them: the namesakes are the caption rule's, not the data's",
    (() => {
      const [cik, , title] = rowOf("MCB");
      const mcb = actions.filter((a) => a.charter === 80066).map((a) => ({ ...a, charter: null }));
      return occEvents(mcb, namesOf(cik, title), { cik }).length === 2;
    })());
  check("Wachovia Bank's $50,000,000 of 2010-03-12 lands on Wells Fargo; its agreement of 2008-04-24, before the merger of 2008-12-31, does not",
    /\$50,000,000/.test(day("WFC", "2010-03-12")?.title ?? "") && /Against Wachovia Bank, National Association/.test(day("WFC", "2010-03-12")?.description ?? "") && !day("WFC", "2008-04-24"));
  check("MUFG Union Bank's order of 2021-09-20 is MUFG's, its $15,000,000 of 2023-05-10 U.S. Bancorp's, who bought it on 2022-12-01",
    !!day("MUFG", "2021-09-20") && !day("USB", "2021-09-20") && /\$15,000,000/.test(day("USB", "2023-05-10")?.title ?? "") && !day("MUFG", "2023-05-10") && !day("MUFG", "2007-09-14"));
  check("City National Bank's $65,000,000 of 2024-01-31 is Royal Bank of Canada's, who bought it on 2015-11-02; its order of 2005-02-23 is not",
    /\$65,000,000/.test(day("RY", "2024-01-31")?.title ?? "") && !day("RY", "2005-02-23"));
  check("charter 1316 is PNC Bank's on PNC from 2002, and Midlantic National Bank's orders of 1990–1991 under it are not",
    !!day("PNC", "2002-07-17") && !day("PNC", "1990-12-20") && !day("PNC", "1991-07-22"));
  check("no \"Valley National Bank\" of the list is Valley National Bancorp's: they are banks of Espanola, Tulsa, Phoenix, Cortez and Hamburg, Iowa", !on("VLY").length);
  check("a bank's federal branches are its group's: UBS AG's three branch orders of 2018-05-31 are one row on UBS Group, Credit Suisse's of 2024-05-29 too",
    /UBS AG NY 787 7th Ave WMA Branch; UBS AG Miami Branch; UBS AG Stamford Branch/.test(day("UBS", "2018-05-31")?.description ?? "") && !!day("UBS", "2024-05-29"));
  check("every bank the hand list gives by charter is in the list under a name its pattern reads, on a day it holds",
    Object.entries(OCC_BANKS).every(([, { banks }]) => banks.every((b) => all.some((a) => a.charter === b.charter && b.bank.test(a.bank) && (!b.from || a.day >= b.from) && (!b.to || a.day <= b.to))))
  );
  check("  …51 companies' banks, as the README counts them, and six companies' namesakes refused by charter or OTS docket",
    Object.keys(OCC_BANKS).length === 51 && /\(`OCC_BANKS`, 51\s+companies/.test(read("README.md")) && Object.keys(NOT_THE_COMPANY).length === 6, `${Object.keys(OCC_BANKS).length}`);
  check("  …and every company it names is in the ticker index under that CIK and ticker",
    Object.entries(OCC_BANKS).every(([cik, { ticker }]) => companies.some(([c, t]) => c === Number(cik) && t === ticker)) &&
      Object.entries(NOT_THE_COMPANY).every(([cik, { ticker }]) => companies.some(([c, t]) => c === Number(cik) && t === ticker)));
  check("an old order with no document links the OCC's search for its bank, not its bare number",
    day("TRMK", "1991-08-20")?.url === "https://apps.occ.gov/EASearch/Search/Table?q=Trustmark%20National%20Bank", day("TRMK", "1991-08-20")?.url);
  check("a docket that is the order's number is not said twice",
    /\(order AA-EC-2023-49\):/.test(day("JPM", "2024-03-14")?.description ?? "") && !/docket AA-EC-2023-49/.test(day("JPM", "2024-03-14")?.description ?? ""), day("JPM", "2024-03-14")?.description?.slice(0, 160));

  const axp = day("AXP", "2009-06-29");
  check("the OTS's orders land as the OCC's do: American Express Bank, FSB's two of 2009-06-29 are one row, its cease-and-desist order \"ended 2010-08-06 (order WN 10-023)\", the termination a line, not a row",
    /^OTS: Cease-and-desist order and civil money penalty$/.test(axp?.title ?? "") && /It ended 2010-08-06 \(order WN 10-023\)\./.test(axp?.description ?? "") && axp?.url === "https://occ.gov/static/ots/enforcement/97146.pdf" &&
      axp?.source === "Office of Thrift Supervision, in the OCC's archive" && /OTS docket 15648/.test(axp?.description ?? ""),
    axp?.description);
  check("  …its supervisory agreement of 2010-08-06 is the OCC's row, which the OCC carried on, not a second copy",
    on("AXP").filter((e) => e.date === "2010-08-06").length === 1 && /^OCC: Formal agreement$/.test(day("AXP", "2010-08-06")?.title ?? ""));
  check("  …Sovereign Bank's NE-11-17 is one row on Santander, the OCC's of 2011-04-11, and not the archive's of 2011-04-13 again", !!day("SAN", "2011-04-11") && !day("SAN", "2011-04-13"));
  check("  …a holding company's order is its own: Carver Bancorp's and Carver Federal Savings Bank's of 2011-02-07 are one row, \"OCC and OTS\"; AmBase's of 1991, Waterstone's of 2009",
    /^OCC and OTS: Two cease-and-desist orders$/.test(day("CARV", "2011-02-07")?.title ?? "") && /Carver Bancorp, Inc\./.test(day("CARV", "2011-02-07")?.description ?? "") && /Carver Federal Savings Bank/.test(day("CARV", "2011-02-07")?.description ?? "") &&
      !!day("ABCP", "1991-02-15") && !!day("WSBF", "2009-12-01") && on("CARV").length === 3);
  check("  …the hand list's thrifts by charter: AIG Federal Savings Bank's agreement of 2007, GE Money Bank's penalty of 2010, Third Federal's of 2011, Ocwen Federal Bank's agreements of 2004 and 2005, Washington Federal's order of 2007 and its end, First Home Savings Bank's of 2009 on First Bancshares",
    !!day("AIG", "2007-06-07") && !!day("GE", "2010-10-19") && !!day("TFSL", "2011-02-07") && !!day("ONIT", "2004-04-19") && !!day("ONIT", "2005-06-28") &&
      /It ended 2008-10-21 \(order WE 08-016\)/.test(day("WAFD", "2007-12-21")?.description ?? "") && /First Home Savings Bank/.test(day("FBSI", "2009-08-17")?.description ?? ""));
  check("  …and the archive's namesakes stay off: United Bancorp of Bridgeview off UBCP, Liberty Capital of Ohio off GLIBA, Metropolitan Bank and Trust of Ohio off MCB",
    !day("UBCP", "2008-09-30") && !on("GLIBA").length && !day("MCB", "2001-07-26"));

  check("the banks the 2026-11-16 audit found (batch 155): MetLife Bank's $30,206,329 restitution of 2013-02-28 on MetLife, First Niagara's $2,000,000 of 2016-09-06 on KeyCorp but not its orders of 2011 and 2016-07-25, before the purchase",
    /restitution of \$30,206,329/.test(day("MET", "2013-02-28")?.title ?? "") && !!day("MET", "2011-04-13") && /\$2,000,000 civil money penalty/.test(day("KEY", "2016-09-06")?.title ?? "") &&
      !day("KEY", "2016-07-25") && !day("KEY", "2011-10-26"));
  check("  …Dillard National Bank's agreements of 2003, Riverview Community Bank's of 2012, Citizens Community Federal's of 2014, and MetaBank's two orders of 2011-07-15, the OCC's and the OTS's, one bank however each spells it",
    !!day("DDS", "2003-11-13") && !!day("DDS", "2003-12-15") && !!day("RVSB", "2012-01-25") && !!day("CZWI", "2014-07-09") &&
      /^Against Metabank, as the OCC and the OTS name it\./i.test(day("CASH", "2011-07-15")?.description ?? "") && /order CN 11-24/.test(day("CASH", "2011-07-15")?.description ?? "") &&
      /order CN 11-27/.test(day("CASH", "2011-07-15")?.description ?? ""),
    day("CASH", "2011-07-15")?.description);
  check("  …and FIA Card Services, Bank of America's card bank, in its row of 2014-04-07, the one $25,000,000 penalty counted once",
    /Fia Card Services/i.test(day("BAC", "2014-04-07")?.description ?? "") && /^OCC: \$25,000,000 civil money penalty/.test(day("BAC", "2014-04-07")?.title ?? ""), day("BAC", "2014-04-07")?.title);

  const total = [...at.values()].flat();
  const first = [...fromFirst.values()].flat();
  const top = [...fromFirst].map(([t, e]) => [t, e.length] as const).filter(([, n]) => n).sort((x, y) => y[1] - x[1] || 0).slice(0, 6).map(([t, n]) => `${t} ${n}`).join(", ");
  check(`before any first price: ${EXPECTED.total} company days on ${EXPECTED.companies} companies`, total.length === EXPECTED.total && at.size === EXPECTED.companies, `${total.length} on ${at.size}`);
  check(`  …from first prices: ${EXPECTED.fromFirst} on ${EXPECTED.fromFirstPages} pages, ${EXPECTED.fromFirst2017} before 2017 (${EXPECTED.top})`,
    first.length === EXPECTED.fromFirst && [...fromFirst.values()].filter((e) => e.length).length === EXPECTED.fromFirstPages && first.filter((e) => e.date < "2017").length === EXPECTED.fromFirst2017 && top === EXPECTED.top,
    `${first.length} on ${[...fromFirst.values()].filter((e) => e.length).length}, ${first.filter((e) => e.date < "2017").length} before 2017; ${top}`);
  check("  …each row the OCC's kind and amount, its banks as the OCC names them, its own id, one a company a day",
    total.every((e) => /^(?:OCC|OTS|OCC and OTS): [A-Z$]/.test(e.title) && /^Against .+, as (?:the OCC|the OTS|the OCC and the OTS) names? (?:it|them)\./.test(e.description ?? "") && e.sourceKey === "occ_actions" && e.type === "regulation" && e.dedupBasis === e.externalId && /^https:\/\/(?:occ\.gov\/static\/enforcement-actions\/ea[\w-]+\.pdf|occ\.gov\/static\/ots\/enforcement\/\d+\.pdf|apps\.occ\.gov\/EASearch\/Search\/Table\?q=)/.test(e.url ?? "")) &&
      [...at.values()].every((e) => new Set(e.map((x) => x.date)).size === e.length));

  console.log("\nThe read and the company's ingest");
  const served: string[] = [];
  const realFetch = globalThis.fetch;
  const serve = (answers: Record<string, () => Response>) => {
    globalThis.fetch = (async (url: string | URL) => {
      const u = String(url);
      served.push(u);
      const kind = u.startsWith(OCC_COUNT_URL.split("?")[0]) ? "count" : u.startsWith(OCC_ACTIONS_URL.split("?")[0]) ? "actions" : "other";
      return answers[kind]?.() ?? new Response("", { status: 404 });
    }) as typeof fetch;
  };
  try {
    serve({ count: () => new Response(String(FX.count)), actions: () => new Response(FX.body) });
    const list = await readOccList();
    check("the read asks the count, then every institution action in one answer, and holds them all",
      served.length === 2 && served[0] === OCC_COUNT_URL && served[1] === OCC_ACTIONS_URL && /instOnly=true/.test(OCC_ACTIONS_URL) && /pgsz=3000/.test(OCC_ACTIONS_URL) && list.records === FX.count && list.total === FX.count,
      served.join(" "));
    serve({ count: () => new Response(String(OCC_PAGE_SIZE + 1)), actions: () => new Response(FX.body) });
    const more = await readOccList().catch((e: Error & { outcome?: string }) => e);
    check("  …a count more than one answer holds is refused, not cut short", more instanceof Error && /more than one answer/.test(more.message) && (more as { outcome?: string }).outcome === "error");
    serve({ count: () => new Response("", { status: 429 }) });
    const busy = await readOccList().catch((e: Error & { outcome?: string; httpStatus?: number }) => e);
    check("  …a refusal is throttled, with its status", busy instanceof Error && (busy as { outcome?: string }).outcome === "throttled" && (busy as { httpStatus?: number }).httpStatus === 429);

    forgetOccList();
    let reads = 0;
    const good = async (): Promise<OccList> => {
      reads++;
      return { ...parseOccList(FX.body), total: FX.count };
    };
    await cachedOccList(good);
    await cachedOccList(good);
    forgetOccList();
    const bad = async (): Promise<OccList> => {
      reads++;
      throw Object.assign(new Error("the OCC's list: HTTP 503"), { outcome: "throttled", httpStatus: 503 });
    };
    const first = await cachedOccList(bad).catch((e: Error & { outcome?: string }) => e);
    const next = await cachedOccList(good).catch((e: Error & { outcome?: string }) => e);
    check("  …read once a process for every company, a failure too: the next company is told the same without asking (batch 155, the 2026-11-16 audit's finding 2)",
      reads === 2 && first instanceof Error && next === first && (next as { outcome?: string }).outcome === "throttled", `${reads} reads`);
    serve({ count: () => Object.defineProperties(new Response("<html>Security Redirect</html>"), { redirected: { value: true }, url: { value: "https://www.occ.treas.gov/" } }) });
    const redirected = await readOccList().catch((e: Error & { outcome?: string }) => e);
    check("  …and an answer that sent us to the OCC's home page is a refusal, so the source-wide back-off holds every company back",
      redirected instanceof Error && (redirected as { outcome?: string }).outcome === "throttled" && /redirected to https:\/\/www\.occ\.treas\.gov/.test(redirected.message), String(redirected));
    forgetOccList();

    const plan = (t: string) => {
      const [cik, , name] = rowOf(t);
      return { edgarName: name, alsoKnownAs: newsNamesFor(cik), possessive: dojPossessive(name, possessiveNameFor(cik)), cik };
    };
    const whole = async (): Promise<OccList> => ({ ...parseOccList(FX.body), total: FX.count });
    const jpmFor = await occFor(fakeDb("1980-03-17"), 1, plan("JPM"), whole);
    check("a company's ingest keeps its actions from its first price, as a complete answer: JPMorgan's 15",
      jpmFor.outcome === "ok" && jpmFor.events.length === 15 && !!jpmFor.complete && jpmFor.events.every((e) => e.date >= "1980-03-17"), `${jpmFor.events.length}, complete ${!!jpmFor.complete}`);
    const short = await occFor(fakeDb("1980-03-17"), 1, plan("JPM"), async () => ({ ...parseOccList(FX.body), total: FX.count + 5 }));
    check("  …an answer short of the count is not complete, so no kept row comes off", short.outcome === "ok" && !short.complete && /held 2655 of the 2660/.test(short.detail ?? ""), short.detail);
    const misread = await occFor(fakeDb("1980-03-17"), 1, plan("JPM"), async () => {
      const list = parseOccList(FX.body);
      return { ...list, actions: list.actions.slice(0, Math.floor(list.records * 0.9)), total: FX.count };
    });
    check("  …nor one whose records the reader mostly skipped, as a renamed field would make it (batch 155, the audit's set-aside 5)",
      !misread.complete && /2655 of the 2655 actions the OCC counts, 2389 of them read/.test(misread.detail ?? ""), misread.detail);
    const cfg = await occFor(fakeDb("2014-09-24"), 1, plan("CFG"), whole);
    check("  …Citizens' orders of 2010 and 2013, before its first price of 2014, stay off; its own of 2015 land",
      cfg.events.every((e) => e.date >= "2014-09-24") && cfg.events.some((e) => e.date === "2015-11-10") && cfg.events.some((e) => e.date === "2015-08-10"), cfg.events.map((e) => e.date).join(", "));
    const none = await occFor(fakeDb(null), 1, plan("JPM"), whole);
    check("  …a company with no prices yet is asked again next run, not answered empty", none.outcome === "error" && !none.events.length, none.detail);
    const failed = await occFor(fakeDb("1980-03-17"), 1, plan("JPM"), async () => {
      throw Object.assign(new Error("the OCC's list: HTTP 503"), { outcome: "throttled", httpStatus: 503 });
    });
    check("  …a failed read is the read's outcome, with nothing taken off", failed.outcome === "throttled" && failed.httpStatus === 503 && !failed.complete && !failed.events.length);
    const notes = await occFor(fakeDb("2000-05-16"), 1, plan("AMUB"), whole);
    check("  …a bank's notes record takes none: UBS AG's are UBS Group's", notes.outcome === "empty" && !notes.events.length);
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "occ_actions");
  check("the source is registered as the OCC's own work, credited to it, with the day its pages were read and the owner's approval",
    src?.id === 42 && /17 U\.S\.C\. § 105/.test(src.license) && src.commercialOk && src.reviewedOn === "2026-11-15" && src.attribution === "Office of the Comptroller of the Currency" &&
      /2026-11-15-proposals\.md #2/.test(read("lib/ingest/store.ts")), JSON.stringify(src));
  check("  …asked a week after the last ask, quota noted, a company source, scored without the model",
    SOURCE_TTL_MINUTES.occ_actions === 10080 && QUOTAS.occ_actions.perDay === null && (COMPANY_SOURCES as readonly string[]).includes("occ_actions") &&
      deterministicScore({ eventId: 0, kind: "regulation", title: "OCC: Civil money penalty", sourceKey: "occ_actions" }, { kind: "company", displayName: "JPMorgan Chase", ticker: "JPM" }, ["jpmorgan"])?.score === 0.95);
  check("  …company ingest keeps the company's actions, and credits the OCC",
    /await run\("occ_actions", [^\n]+\n\s*occFor\(client, subjectId, \{[^}]*cik: company\.cik, fundSeries \}\)\);/.test(read("scripts/ingest.ts")) &&
      /enforcement actions from the Office of the Comptroller of the Currency/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /enforcement actions from the Office of the Comptroller of the Currency/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")) &&
      /\| Office of the Comptroller of the Currency \|/.test(read("README.md")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

/** The database as `partyNamesFor` asks it: the first price, and no former names. */
function fakeDb(listed: string | null): PoolClient {
  return {
    query: async (sql: string) => {
      const s = sql.trim();
      if (/FROM prices/.test(s)) return { rows: [{ listed }] };
      if (/FROM events e/.test(s)) return { rows: [] };
      throw new Error(`unexpected query: ${s.slice(0, 80)}`);
    },
  } as unknown as PoolClient;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
