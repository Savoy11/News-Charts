/**
 * The antitrust agencies' early terminations of the merger waiting period, 1994–2026 (batch 166, the
 * 2026-11-22 proposal 1, approved by the owner that day with call (a): every grant naming the company).
 *
 *   npm run check:hsr
 *
 * Offline: the committed file (`data/hsr-early-terminations.json.gz`, written by `npm run sync:hsr` from the
 * notices govinfo served on 2026-11-22), a slice of 22 of those notices (scripts/fixtures/hsr-notices.json.gz:
 * each table layout, the first notice, one printed as images, one with numbers and no parties), and the first
 * trading days the other checks' fixtures carry.
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
import {
  HSR_LIST,
  NOT_THE_COMPANY,
  hsrEvents,
  hsrGrants,
  hsrPartyIsCompany,
  isGrantTitle,
  isPerson,
  named,
  noticeLines,
  noticePage,
  noticeText,
  numbersIn,
  grantDayValid,
  readGrantNotice,
  sameDeal,
  sharedNumbers,
  splitParties,
  type HsrGrant,
} from "../lib/hsrEarly";
import { namesForYear } from "../lib/ingest/frBackfill";
import { hsrFor } from "../lib/ingest/hsrFor";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
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
const EXPECTED = {
  notices: 441,
  grants: 36_892,
  dayless: 47,
  // transaction numbers the agencies gave two deals
  shared: 24,
  // every listed company in the index, under the rule, its names as the replay below builds them
  total: 9_185,
  companies: 1_523,
  // from first prices, for the 954 companies the fixtures read
  fromFirst: 4_670,
  fromFirstPages: 400,
  fromFirst2017: 4_012,
  top: "GE 303, IBM 86, WFC 77, JNJ 75, C 74, JPM 73, BRK-B 72, F 68, VZ 63, WMB 57",
};

const companies = (tickerIndex as unknown as { companies: [number, string, string][] }).companies;
const titleOf = (cik: number) => companies.find((c) => c[0] === cik)![2];
/** A company's names of a year as ingest builds them, less the former names only the database holds. */
const namesOf = (cik: number) => (year: number) => {
  const title = titleOf(cik);
  const own = dojPossessive(title, possessiveNameFor(cik));
  return [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)];
};
const grants = hsrGrants();
const on = (cik: number, from = "") => hsrEvents(grants, namesOf(cik), { cik, from, namesOn: (d) => releaseNamesOn(cik, d) });
const day = (cik: number, d: string) => on(cik).find((e) => e.date === d);
const isCompany = (party: string, d: string, cik: number) => hsrPartyIsCompany(party, d, cik, () => [...namesOf(cik)(Number(d.slice(0, 4))), ...releaseNamesOn(cik, d)]);

async function main(): Promise<void> {
  const slice = JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", "hsr-notices.json.gz"))).toString()) as {
    list: { count: number; titles: string[] };
    notices: Record<string, { published: string; html: string }>;
  };
  const notice = (doc: string) => readGrantNotice(slice.notices[doc].html, { doc, published: slice.notices[doc].published });
  const numbers = (doc: string) => numbersIn(noticeLines(slice.notices[doc].html));
  const find = (doc: string, n: string) => notice(doc).find((g) => g.number === n);

  console.log("The list");
  check("a grant notice's title in each spelling the list holds: \"Granting of Request(s)\", once \"Grant of Request\", once \"Terminiation\"; the consent agreements the search finds are not grants",
    slice.list.titles.filter(isGrantTitle).length === 17 && isGrantTitle("Grant of Request for Early Termination of the Waiting Period Under the Premerger Notification Rules") &&
      isGrantTitle("Granting of Request For Early Terminiation of the Waiting Period Under the Premerger Notification Rules") && !isGrantTitle("Nestle Food Company; Proposed Consent Agreement With Analysis To Aid Public Comment"),
    slice.list.titles.filter(isGrantTitle));
  check("  …asked of the Federal Register API in one request, each notice's text of govinfo, a reader sent to the Federal Register's page",
    /^https:\/\/www\.federalregister\.gov\/api\/v1\/documents\.json\?per_page=1000&order=oldest&conditions%5Bagencies%5D%5B%5D=federal-trade-commission&conditions%5Btype%5D%5B%5D=NOTICE&/.test(HSR_LIST) &&
      noticeText("2005-05-19", "05-10027") === "https://www.govinfo.gov/content/pkg/FR-2005-05-19/html/05-10027.htm" && noticePage("05-10027") === "https://www.federalregister.gov/d/05-10027");

  console.log("\nEvery layout read whole");
  const layouts = ["94-26930", "95-10885", "96-32024", "97-26388", "98-8765", "99-9166", "99-22673", "00-7971", "01-12679", "03-22412", "05-10027", "E8-17416", "2010-20814", "2011-8331", "2014-18958", "2014-28940", "2017-15093", "2019-08081", "2026-13661"];
  const unread = layouts.map((d) => ({ d, want: numbers(d), got: new Set(notice(d).map((g) => g.number)) })).filter((x) => !x.want.length || x.want.some((n) => !x.got.has(n)));
  check(`every transaction number in the text of ${layouts.length} notices, 1994–2026, one or more of each layout, is a grant read`, unread.length === 0, unread.map((x) => `${x.d}: ${x.want.filter((n) => !x.got.has(n)).slice(0, 3)}`));
  const ge = find("95-10885", "95-1448");
  check("1995, a run of lines ending in the PMN number and the day: GE's railcar wheel business to ABC Rail Products (95-1448, 1995-04-21), its parties split at commas",
    ge?.day === "1995-04-21" && ge.acquiring === "ABC Rail Products Corporation" && ge.acquired === "General Electric Corp." && JSON.stringify(ge.entities) === JSON.stringify(["GE Railcar Wheel."]), ge);
  check("  …a comma before a legal word keeps a name whole (\"Kreher Steel Co., Inc.\"), and so does a firm named with commas: \"Warburg, Pincus Capital Company, L.P.\" is one party (batch 170, the audit's finding 1)",
    JSON.stringify(splitParties("A. M. Castle & Co., Thomas W. Kreher, Kreher Steel Co., Inc...")) === JSON.stringify(["A. M. Castle & Co.", "Thomas W. Kreher", "Kreher Steel Co., Inc."]) &&
      JSON.stringify(splitParties("Mr. Keith Rupert Murdoch, Warburg, Pincus Capital Company, L.P., Renaissance Communications Corp.")) === JSON.stringify(["Mr. Keith Rupert Murdoch", "Warburg, Pincus Capital Company, L.P.", "Renaissance Communications Corp."]));
  check("  …Clayton, Dubilier & Rice, Golder, Thoma, Cressey, Rauner and Becton, Dickinson whole; a one-word party alone (\"Newco\", \"Finaxa\" before \"The\"); a tail on its name (\"L.C.\", \"Trustee\", a day's year)",
    JSON.stringify(splitParties("Clayton, Dubilier & Rice Fund V Limited Partnership, Norfolk Southern Corporation, North American Van Lines, Inc.")) === JSON.stringify(["Clayton, Dubilier & Rice Fund V Limited Partnership", "Norfolk Southern Corporation", "North American Van Lines, Inc."]) &&
      splitParties("Golder, Thoma, Cressey, Rauner Fund V, L.P., The Modern Group, Inc.")[0] === "Golder, Thoma, Cressey, Rauner Fund V, L.P." &&
      JSON.stringify(splitParties("Maxxim Medical, Inc., Becton, Dickinson and Company, Becton, Dickinson and Company")) === JSON.stringify(["Maxxim Medical, Inc.", "Becton, Dickinson and Company", "Becton, Dickinson and Company"]) &&
      splitParties("Newco, Cable TV Fund 11-B, Ltd, Cable TV Fund 11-B, Ltd.")[0] === "Newco" && splitParties("Finaxa, The Long-Term Credit Bank of Japan, Ltd., Aventine Partners.")[0] === "Finaxa" &&
      splitParties("Columbia/HCA Healthcare Corporation, University Healthcare System, L.C., University Hospital")[1] === "University Healthcare System, L.C." &&
      splitParties("K-III Communications Corporation, Cristina C. Yee, Trustee, Some Company, Inc.")[1] === "Cristina C. Yee, Trustee" &&
      splitParties("John T. Kim Trust of December 31, 1987, Amkor Technology, Inc., Amkor Technology, Inc.")[0] === "John T. Kim Trust of December 31, 1987");
  const accuri = find("2011-8331", "20110575");
  check("  …2011's line after a \";\" joined: Becton, Dickinson and Company's purchase of Accuri Cytometers (20110575), not \"Becton\"'s of \"Dickinson and Company\"",
    accuri?.acquiring === "Becton, Dickinson and Company" && accuri.acquired === "Accuri Cytometers, Inc." && accuri.acquiringEntities.length === 0, accuri);
  const cigna = find("97-26388", "97-3195");
  check("  …from late 1996 at semicolons, and a run with commas before its first semicolon split at both (Lincoln National's purchase from CIGNA, 1997)",
    find("96-32024", "96-2621")?.acquired === "WMX Technologies, Inc." && cigna?.acquiring === "Lincoln National Corporation" && cigna.acquired === "CIGNA Corporation" &&
      JSON.stringify(cigna.entities) === JSON.stringify(["CIGNA Associates, Inc.", "CIGNA Financial Advisors, Inc."]), cigna);
  const aviron = find("99-9166", "19991617");
  check("1999, a party a line under \"Party name\" by the day granted: American Home Products' stake in Aviron (1999-03-15)",
    aviron?.day === "1999-03-15" && aviron.acquiring === "American Home Products Corporation." && aviron.acquired === "Aviron." && JSON.stringify(aviron.entities) === JSON.stringify(["Aviron."]), aviron);
  check("  …a number misprinted with seven digits (\"1998156\") still a transaction, its status letter any capital (\"Y\")",
    !!find("98-8765", "1998156") && !!find("98-8765", "19981723"));
  const ensemble = find("01-12679", "20011708");
  check("2001, three columns wrapped under each day's header: Ford's three Beanstalk Group entities a name each, a wrapped line one name",
    ensemble?.day === "2001-04-17" && ensemble.acquiring === "Ford Motor Company." && ensemble.entities.length === 3 && ensemble.entities[0] === "The Beanstalk Group (Europe).", ensemble);
  const pan = find("E8-17416", "20081461");
  check("  …a line begun at the cell's start after one that has not ended continues it: \"Clinical Laboratories / of Hawaii, LLP, Pan / Pacific Pathologists, Inc.\" (2008) is two entities",
    JSON.stringify(pan?.entities) === JSON.stringify(["Clinical Laboratories of Hawaii, LLP", "Pan Pacific Pathologists, Inc."]), pan?.entities);
  check("  …1999's five-digit numbers and days alone on their line, early 2000's \"number--name\" and spelled days (\"JAN. 18, 2000\")",
    find("99-22673", "93938")?.acquiring === "Snap-on Inc." && find("99-22673", "93938")?.day === "1999-08-11" &&
      find("00-7971", "20000877")?.acquiring === "Brian L. Roberts." && find("00-7971", "20000877")?.day === "2000-01-18",
    [find("99-22673", "93938"), find("00-7971", "20000877")]);
  const invitrogen = find("03-22412", "20030795");
  check("2003 in part, the party first and its status, number and day after: Invitrogen's purchase of Molecular Probes from the Hauglands (2003-08-11)",
    invitrogen?.day === "2003-08-11" && invitrogen.acquiring === "Invitrogen Corporation" && invitrogen.acquired === "Dr. Richard P. Haugland and Dr. Rosaria Haugland" && invitrogen.entities[0] === "Molecular Probes, Inc", invitrogen);
  const jnj = find("05-10027", "20050796");
  check("2005, three columns: Johnson & Johnson's of Closure Medical (20050796, 2005-05-02)", jnj?.day === "2005-05-02" && jnj.acquiring === "Johnson & Johnson." && jnj.acquired === "Closure Medical Corporation.", jnj);
  check("2009–2010, a party a line after a column of dots: Occidental's of Dow's business (2009-06-08), its number misprinted \"0090490\"",
    find("2010-20814", "0090490")?.acquiring === "Occidental Petroleum Corporation." && find("2010-20814", "20090493")?.acquiring === "Novant Health, Inc.");
  const jll = find("2011-8331", "20110597");
  check("2011's compact notices, a status letter and one space, a wrapped line begun at the margin: JLL Partners' (2011), its name whole",
    jll?.acquiring === "JLL Partners Fund V, L.P." && /JLL Partners Fund V, L\.P\.$/.test(jll.acquired), jll);
  const amazon = find("2019-08081", "20190813");
  check("2014–2026, the parties joined by semicolons under a day's line (\"11/03/2014:\" too): Amazon's investment in Aurora (2019-03-01)",
    amazon?.day === "2019-03-01" && amazon.acquiring === "Amazon.com, Inc." && amazon.acquired === "Aurora Innovation, Inc." && find("2014-28940", "20150053")?.day === "2014-11-03", amazon);
  check("  …from 2011 the third name is the acquiring person again, in 99% of transactions, so no acquired entity is read from it (`thirdIsAcquiring`)",
    amazon?.entities.length === 0 && amazon.acquiringEntities.length === 0 && notice("2019-08081").every((g) => g.entities.length === 0) &&
      notice("05-10027").some((g) => g.entities.length > 0) && notice("2026-13661").length > 0 && notice("2026-13661").every((g) => g.entities.length === 0));
  check("a notice printed as images (05-594, 2005) holds no transaction; one printing its numbers with no parties (02-2114) none read",
    notice("05-594").length === 0 && numbers("05-594").length === 0 && notice("02-2114").length === 0 && numbers("02-2114").length === 29);
  const dayless = notice("00-19351").filter((g) => !g.day);
  check("  …and a group whose day's header the notice lost is kept with no day (00-19351's first 16, Pfizer's of Warner-Lambert among them), never given a day guessed",
    dayless.length === 16 && dayless.some((g) => /^Pfizer Inc/.test(g.acquiring)) && notice("00-19351").filter((g) => g.day).every((g) => g.day >= "2000-06-20"), dayless.length);

  console.log("\nThe committed file");
  const file = JSON.parse(gunzipSync(readFileSync(join(__dirname, "..", "data", "hsr-early-terminations.json.gz"))).toString()) as {
    read: string; about: string; notices: { doc: string; published: string; transactions: number; unread: number }[];
  };
  check(`the notices of 2026-11-22: ${EXPECTED.notices}, the first of 1994-11-02, the last of 2026-11-20`,
    file.read === "2026-11-22" && file.notices.length === EXPECTED.notices && file.notices[0].published === "1994-11-02" && file.notices.at(-1)?.published === "2026-11-20",
    { read: file.read, notices: file.notices.length, first: file.notices[0], last: file.notices.at(-1) });
  const empty = file.notices.filter((n) => n.transactions === 0).map((n) => n.doc).sort();
  check("  …five printed as images (four of 2005, one of 2026) and 02-2114 hold none; no other notice leaves a number unread",
    JSON.stringify(empty) === JSON.stringify(["02-2114", "05-11027", "05-11747", "05-4595", "05-594", "2026-09704"]) &&
      file.notices.filter((n) => n.unread > 0).map((n) => n.doc).join() === "02-2114", { empty, unread: file.notices.filter((n) => n.unread > 0) });
  const twice = [...sharedNumbers(grants)].map((n) => grants.filter((g) => g.number === n));
  check(`  …${EXPECTED.grants.toLocaleString("en-US")} grants, a transaction two notices print once, ${EXPECTED.dayless} with no day; a number held twice is two deals, ${EXPECTED.shared} of them (batch 170)`,
    grants.length === EXPECTED.grants && grants.filter((g) => !g.day).length === EXPECTED.dayless && twice.length === EXPECTED.shared &&
      twice.every((gs) => gs.length === 2 && !sameDeal(gs[0], gs[1])) && grants.filter((g) => g.number === "95-1065").length === 1,
    { grants: grants.length, dayless: grants.filter((g) => !g.day).length, shared: twice.length });
  check("  …every day a calendar day on or before its notice's: 1998-01-00 and 2007's misprinted years of 1997 and 1998 kept dayless (the audit's finding 2)",
    grants.every((g) => !g.day || grantDayValid(g.day, g.published)) && !grantDayValid("1998-01-00", "1998-02-03") && !grantDayValid("2007-12-11", "1998-01-21") && grantDayValid("1998-01-30", "1998-02-03") &&
      ["98-0918", "98-0612", "97-2402"].every((n) => grants.some((g) => g.number === n && !g.day)));

  console.log("\nThe rows the audit of 2026-11-22 read (batch 170)");
  const nsc = day(702165, "1998-01-30");
  check("NSC's row of 1998-01-30 says what happened: Clayton, Dubilier & Rice bought North American Van Lines from Norfolk Southern",
    /Clayton, Dubilier & Rice Fund V Limited Partnership's acquisition of North American Van Lines, Inc\. from Norfolk Southern Corporation/.test(nsc?.title ?? "") && /the company as the acquired person/.test(nsc?.description ?? ""),
    nsc?.title);
  const bdx = new Set(on(10795).map((e) => e.date));
  check("  …Becton, Dickinson's own four deals are on BDX: Difco (1997-04-18), PharMingen, MedPlus and Accuri (2011-03-16)",
    ["97-1602", "97-1817", "98-1015", "20110575"].every((n) => { const g = grants.find((x) => x.number === n); return !!g && bdx.has(g.day); }) && bdx.has("1997-04-18") && bdx.has("2011-03-16"));
  check("  …MRK's rows are every one on a calendar day, so Postgres stores the answer; CENT's 1997 deal is not on 2007-12-11",
    on(310158).length > 30 && on(310158).every((e) => grantDayValid(e.date, "2026-12-31")) && !day(887733, "2007-12-11"));
  const itron = on(780571).find((e) => (e.externalId ?? "").split(",").some((x) => x.startsWith("20040837")));
  check("  …a number two deals were given is the row's with its day, so \"Also on\" never joins Itron's purchase from Schlumberger to MacDonald Dettwiler's of Marshall & Swift",
    itron?.externalId?.split(",").includes("20040837@2004-06-04") === true && on(1770450).filter((e) => (e.externalId ?? "").split(",").includes("95-1065")).length === 1, itron?.externalId);

  console.log("\nThe rule");
  const jnjRow = day(200406, "2005-05-02");
  check("Johnson & Johnson's grant of 2005-05-02 is a row on JNJ: its acquisition of Closure Medical, the transaction's number and parties, the notice linked",
    !!jnjRow && /^FTC and Justice Department ended the merger waiting period early on Johnson & Johnson's acquisition involving Closure Medical Corporation$/.test(jnjRow.title) &&
      /Transaction 20050796: acquiring person Johnson & Johnson; acquired person Closure Medical Corporation; acquired entities Closure Medical Corporation \(the company as the acquiring person\)\./.test(jnjRow.description ?? "") &&
      /does not say the deal closed, its terms or its value/.test(jnjRow.description ?? "") && jnjRow.url === "https://www.federalregister.gov/d/05-10027" &&
      jnjRow.sourceKey === "hsr_early" && jnjRow.type === "regulation" && jnjRow.externalId === "20050796" && jnjRow.dedupBasis === "hsr:200406@2005-05-02",
    jnjRow);
  check("  …and Microsoft's of 2001-04-20 (Ensemble Studios) on MSFT, Cisco's of 2005-04-29 (Topspin) on CSCO, Kroger's of 2014-07-25 (Vitacost.com) on KR",
    /Microsoft Corporation's acquisition involving Ensemble Studios Corporation/.test(day(789019, "2001-04-20")?.title ?? "") &&
      /Topspin Communications/.test(day(858877, "2005-04-29")?.title ?? "") && /The Kroger Co\.'s acquisition involving Vitacost\.com, Inc\./.test(day(56873, "2014-07-25")?.title ?? ""),
    [day(789019, "2001-04-20")?.title, day(56873, "2014-07-25")?.title]);
  const geRow = day(40545, "1995-04-21");
  check("General Electric's railcar wheel business to ABC Rail Products, 1995-04-21, is a row on GE, as the acquired person, from the 1995 layout",
    /ABC Rail Products Corporation's acquisition of GE Railcar Wheel from General Electric Corp\./.test(geRow?.title ?? "") && /the company as the acquired person and an acquired entity|the company as the acquired person/.test(geRow?.description ?? ""), geRow);
  const hca = day(860730, "2017-06-29");
  const thc = day(70318, "2017-06-29");
  check("HCA Healthcare's purchase from Tenet of 2017-06-29 is on HCA and on THC under the same transaction number, so each says \"Also on\" the other",
    !!hca && !!thc && hca.externalId!.split(",").includes("20171206") && thc.externalId === "20171206" && /2 transactions/.test(hca.title), [hca?.title, thc?.title, hca?.externalId]);
  const cook = day(320193, "2014-07-25");
  check("an individual's filing is labelled: Timothy D. Cook's of 2014-07-25 on AAPL, \"usually a purchase of the company's own voting securities\"",
    /Timothy D\. Cook's acquisition involving Apple Inc\., an individual's filing$/.test(cook?.title ?? "") && /The acquiring person is an individual, whose filing is usually a purchase of the company's own voting securities/.test(cook?.description ?? "") &&
      isPerson("Timothy D. Cook") && isPerson("Mr. Keith Rupert Murdoch") && !isPerson("Tom Gores Family Trust") && !isPerson("Ford Motor Company"),
    cook);
  check("  …a legal name with \".com\" in it read as EDGAR writes it: Amazon's investment in Aurora, 2019-03-01, on AMZN; \"Pets.com, Inc.\" on no company named Pets",
    /Amazon\.com, Inc\.'s acquisition involving Aurora Innovation, Inc\./.test(day(1018724, "2019-03-01")?.title ?? "") && isCompany("Amazon.com, Inc.", "2019-03-01", 1018724) &&
      !companies.some(([c, t]) => /^PETS?\b/i.test(titleOf(c)) && t && isCompany("Pets.com, Inc.", "2000-06-01", c)),
    day(1018724, "2019-03-01")?.title);
  check("  …a grant before the company's first price makes no row: AGI Incorporated's of 1998 stays off AGBK", on(2081206, "2017-01-01").every((e) => e.date >= "2017-01-01"));
  check("  …nor one whose name the record took after: Broadcom Corporation's grants before 2016-02-01 are not AVGO's, Avago's are (lib/takenNames.ts)",
    !isCompany("Broadcom Corporation", "2015-06-01", 1730168) && isCompany("Avago Technologies Limited", "2015-06-01", 1730168) && isCompany("Broadcom Limited", "2016-03-01", 1730168));
  const nots = Object.values(NOT_THE_COMPANY).flat();
  check("the namesakes read by hand stay off: Britain's General Electric Company, p.l.c. (eight grants of 1996–1999) off GE, Pacific and Southern Company off SO, JCI Limited off JCI",
    !isCompany("The General Electric Company, p.l.c.", "1998-04-22", 40545) && isCompany("General Electric Company", "1998-04-22", 40545) &&
      !isCompany("Pacific and Southern Company, Inc.", "1996-11-04", 92122) && isCompany("The Southern Company", "2018-01-29", 92122) && !isCompany("JCI Limited.", "1998-06-19", 833444),
    nots.length);
  check("  …\"… Power and Light Company\" off Light S.A., EQT AB off EQT, Fortis AG off Fortis Inc., Progressive Incorporated off Progressive, and a credit union off every company named in it",
    !isCompany("Wisconsin Power and Light Company", "2003-12-30", 1447221) && isCompany("Wisconsin Power and Light Company", "2003-12-30", 352541) &&
      !isCompany("EQT AB", "2026-03-17", 33213) && !isCompany("Fortis AG S.A.", "1997-04-24", 1666175) && !isCompany("Progressive Incorporated", "2004-03-26", 80661) &&
      !isCompany("Boeing Employees' Credit Union", "2026-02-13", 12927) && isCompany("The Boeing Company", "2026-02-13", 12927) && !isCompany("Detroit Edison Credit Union", "2010-03-12", 936340),
    nots.map((n) => n.ticker).join(", "));
  check("  …each with its reasons", nots.length === 9 && nots.every((n) => n.why.length > 40));
  check("a row's parties as a reader reads them: a name's closing period off, an abbreviation's kept",
    named("Pharmacia Corporation.") === "Pharmacia Corporation" && named("Pfizer Inc.") === "Pfizer Inc." && named("Kreher Steel Co.") === "Kreher Steel Co." && named("Moon S. Park, M.D.") === "Moon S. Park, M.D.");

  console.log("\nEvery listed company");
  const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const first: Record<string, string> = {};
  for (const [f, k] of [["digest-1985-entries.json.gz", "firstPrices"], ["eeoc-listing.json.gz", "first"], ["fda-device-recalls.json.gz", "first"], ["occ-actions.json.gz", "first"]] as const) {
    Object.assign(first, JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", f))).toString())[k]);
  }
  const dated = grants.filter((g) => g.day);
  const parties = (g: HsrGrant) => [g.acquiring, ...g.acquiringEntities, g.acquired, ...g.entities];
  const letters = dated.map((g) => alnum(parties(g).join(" ")));
  const unitYears = Array.from({ length: 33 }, (_, k) => `${1994 + k}-07-01`);
  const rows: { ticker: string; date: string; first: string | null }[] = [];
  const seen = new Set<number>();
  for (const [cik, ticker] of companies) {
    if (seen.has(cik)) continue;
    seen.add(cik);
    // a cheap first pass over the company's names in any year and its units on any day; the rule itself decides
    const pre = [...new Set([...namesOf(cik)(2026), ...unitYears.flatMap((d) => releaseNamesOn(cik, d))].flatMap(andSpellings).map(alnum).filter((n) => n.length >= 3))];
    const units = [...(EPA_UNITS[cik] ?? []).map((u) => u.defendant), ...(CPSC_UNITS[cik] ?? []).map((u) => u.firm)];
    const mine = dated.filter((g, j) => pre.some((p) => letters[j].includes(p)) || units.some((u) => parties(g).some((x) => u.test(x))));
    if (!mine.length) continue;
    for (const e of hsrEvents(mine, namesOf(cik), { cik, namesOn: (d) => releaseNamesOn(cik, d) })) rows.push({ ticker, date: e.date, first: first[ticker] ?? null });
  }
  const after = rows.filter((r) => r.first && r.date >= r.first);
  const top = Object.entries(after.reduce<Record<string, number>>((m, r) => ((m[r.ticker] = (m[r.ticker] ?? 0) + 1), m), {}))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([t, n]) => `${t} ${n}`)
    .join(", ");
  check(`before any first price: ${EXPECTED.total.toLocaleString("en-US")} company days on ${EXPECTED.companies.toLocaleString("en-US")} companies`,
    rows.length === EXPECTED.total && new Set(rows.map((r) => r.ticker)).size === EXPECTED.companies, `${rows.length} on ${new Set(rows.map((r) => r.ticker)).size}`);
  check(`  …from first prices: ${EXPECTED.fromFirst.toLocaleString("en-US")} on ${EXPECTED.fromFirstPages} pages, ${EXPECTED.fromFirst2017.toLocaleString("en-US")} before 2017 (${EXPECTED.top})`,
    after.length === EXPECTED.fromFirst && new Set(after.map((r) => r.ticker)).size === EXPECTED.fromFirstPages && after.filter((r) => r.date < "2017-01-01").length === EXPECTED.fromFirst2017 && top === EXPECTED.top,
    `${after.length} on ${new Set(after.map((r) => r.ticker)).size}, ${after.filter((r) => r.date < "2017-01-01").length} before 2017; ${top}`);

  console.log("\nAt ingest");
  const step = await hsrFor(fakeDb("1962-01-02"), 1, { edgarName: "JOHNSON & JOHNSON", alsoKnownAs: newsNamesFor(200406), cik: 200406 });
  check("the company's grants from its first price, with no request, as a complete answer", step.outcome === "ok" && step.events.length === on(200406, "1962-01-02").length && step.events.some((e) => e.date === "2005-05-02") && !!step.complete,
    `${step.outcome} ${step.events.length}`);
  const none = await hsrFor(fakeDb(null), 1, { edgarName: "JOHNSON & JOHNSON", alsoKnownAs: [], cik: 200406 });
  const fund = await hsrFor(fakeDb("1962-01-02"), 1, { edgarName: "JOHNSON & JOHNSON", alsoKnownAs: [], cik: 200406, fundSeries: true });
  check("  …asked again while it has no prices, and none for a fund's series", none.outcome === "error" && /no prices/.test(none.detail ?? "") && fund.events.length === 0 && fund.outcome === "empty");

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "hsr_early");
  check("the source is id 45, public domain, cleared for commercial use, reviewed 2026-11-22, credited to the Federal Trade Commission",
    src?.id === 45 && src.license === "public domain" && src.commercialOk && src.reviewedOn === "2026-11-22" && src.attribution === "Federal Trade Commission", src);
  check("  …the build quotes govinfo's notice",
    /Copyright protection under this title is not available for any work of the United States Government/.test(read("lib/hsrEarly.ts").replace(/\s*\*\s*/g, " ")) &&
      /customary credit should be given to the Government department or agency which prepared the material/.test(read("lib/ingest/store.ts").replace(/\s*\/\/\s*/g, " ")));
  check("  …a company source, quota and refresh noted, scored without the model, a multi-party source whose rows join their numbers",
    (COMPANY_SOURCES as readonly string[]).includes("hsr_early") && QUOTAS.hsr_early.perDay === null && SOURCE_TTL_MINUTES.hsr_early === 1440 &&
      deterministicScore({ eventId: 0, kind: "regulation", title: "FTC and Justice Department ended the merger waiting period early", sourceKey: "hsr_early" }, { kind: "company", displayName: "Johnson & Johnson", ticker: "JNJ" }, ["johnson"])?.score === 0.95 &&
      ALSO_ON_SOURCES.includes("hsr_early") && GROUPED_ROW_SOURCES.includes("hsr_early") && /WHERE source_id IN \([^)]*\b45\)/.test(read("db/056_also_on_hsr.sql")));
  check("  …the ingest asks it for every company", /await run\("hsr_early", [^\n]+\n\s*hsrFor\(client, subjectId, \{[^}]*cik: company\.cik, fundSeries \}\),/.test(read("scripts/ingest.ts")));
  check("  …synced monthly by `npm run sync:hsr`, a notice the file holds never asked again, and credited",
    /"sync:hsr": "tsx scripts\/sync-hsr\.ts"/.test(read("package.json")) && /if \(have\.has\(n\.document_number\)\) continue;/.test(read("scripts/sync-hsr.ts")) &&
      /early terminations of the merger waiting period from the Federal Trade Commission/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /early terminations of the merger waiting period from the Federal Trade Commission/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")));

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
