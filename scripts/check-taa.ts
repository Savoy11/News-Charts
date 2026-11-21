/**
 * The Labor Department's trade adjustment certifications, 1975–2022 (batch 159, the 2026-11-18
 * proposal 1, approved by the owner that day with denials making no row).
 *
 *   npm run check:taa
 *
 * Offline: the committed file (`data/taa-certifications.json.gz`, written by `npm run sync:taa` from the
 * zip of 2026-11-18), a slice of that zip (scripts/fixtures/taa-petitions-slice.zip: its header and 18
 * petitions, the file's first among them), and the first trading days the other checks' fixtures carry.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { dojPossessive } from "../lib/doj";
import { andSpellings, withoutTag } from "../lib/edgarName";
import { deterministicScore } from "../lib/enrich/relevance";
import { companyNames } from "../lib/frCompany";
import { namesForYear } from "../lib/ingest/frBackfill";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import { taaFor } from "../lib/ingest/taaFor";
import { releaseNamesOn } from "../lib/releaseNames";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
import {
  CERTIFIED,
  NOT_THE_COMPANY,
  TAA_FILE,
  TAA_UNITS,
  noticeSearch,
  petitionNumber,
  readTaaPetitions,
  taaCertifications,
  taaEvents,
  type TaaCertification,
} from "../lib/taaPetitions";
import { UNITS as CPSC_UNITS } from "../lib/cpscRecalls";
import { UNITS as EPA_UNITS } from "../lib/epaCases";
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

/** The committed file's own counts, as `npm run sync:taa` read them on 2026-11-18. */
const EXPECTED = {
  petitions: 86_334,
  certifications: 47_628,
  byCode: { C: 23_767, C1: 8_539, C2: 13_338, CU: 1_984, D: 31_130, T: 6_854, P: 515, CD: 179 },
  lastDecided: "2022-06-30",
  // every listed company in the index, under the rule, its names as the replay below builds them; batch
  // 159 gave 2,684 on 470, and 1,276 on 178 pages, 1,052 before 2017, from first prices; batch 160, with EPA's and the
  // CPSC's units and the units named after their owners, 3,307 on 492, and 1,729 on 193, 1,441 before 2017, from first
  // prices, whose certifications it gave as 2,824, counting the petition numbers in the rows' text, which the
  // 900-character cap cuts: 3,298 by the rows' titles. Batch 164 reads GE's "GE …" businesses, AT&T's companies and
  // ADM's two (the 2026-11-21 audit's finding 3): 98 more certifications, 58 more company days, T a page more.
  total: 3_365,
  companies: 493,
  // from first prices, for the 954 companies the fixtures read
  fromFirst: 1_787,
  fromFirstPages: 194,
  fromFirst2017: 1_481,
  fromFirstCertifications: 3_396,
  top: "GE 182, HON 95, IBM 86, WY 66, RTX 51, F 42, GT 34, IP 34, HAL 33, XRX 33",
};

const companies = (tickerIndex as unknown as { companies: [number, string, string][] }).companies;
const titleOf = (cik: number) => companies.find((c) => c[0] === cik)![2];
/** A company's names of a year as ingest builds them, less the former names only the database holds. */
const namesOf = (cik: number, extra: (year: number) => string[] = () => []) => (year: number) => {
  const title = titleOf(cik);
  const own = dojPossessive(title, possessiveNameFor(cik));
  return [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title), ...extra(year)];
};
const certs = taaCertifications();
const on = (cik: number, from = "", extra?: (year: number) => string[]) => taaEvents(certs, namesOf(cik, extra), { cik, from, namesOn: (d) => releaseNamesOn(cik, d) });

async function main(): Promise<void> {
  console.log("The petition file");
  const slice = readTaaPetitions(readFileSync(join(__dirname, "fixtures", "taa-petitions-slice.zip")));
  check("the zip's one CSV is read whatever its day's name, every petition a row, the file's first (TA-W-1, a denial of 1975) among them",
    slice.petitions === 18 && slice.byCode.D === 1 && slice.lastDecided === "2008-12-19", { petitions: slice.petitions, byCode: slice.byCode, lastDecided: slice.lastDecided });
  check("  …and its certifications only, the four whole codes the Federal Register lists as issued: not a denial (D), a termination (T), a partial (P, CD) or an undecided petition",
    JSON.stringify(CERTIFIED) === JSON.stringify(["C", "C1", "C2", "CU"]) && slice.certifications.length === 13 && slice.certifications.every((c) => CERTIFIED.includes(c.code)) &&
      !slice.certifications.some((c) => [1, 102, 107, 51571, 98351].includes(c.petition)),
    slice.certifications.map((c) => `${petitionNumber(c)} ${c.code}`).join(", "));
  const wayne = slice.certifications.find((c) => c.petition === 6955)!;
  check("  …each with its firm, division, town, product, day, code, the day separations are covered from and the Department's worker estimate",
    JSON.stringify(wayne) === JSON.stringify({ petition: 6955, suffix: "", firm: "FORD MOTOR CO", division: "WAYNE ASSEMBLY", city: "Wayne", state: "MI", what: "MID-SIZE CARS", day: "1980-04-17", code: "C", impact: "1979-01-30", workers: 6844 }), wayne);
  const phb = slice.certifications.find((c) => c.petition === 64292)!;
  const goodyear = slice.certifications.find((c) => c.petition === 5889)!;
  check("  …a name's web codes read as what they write (\"Career Concepts &amp; Volt\"), and a legal word the file put in the second name (\" INC\") no division",
    phb.division === "PHB, Inc. , Career Concepts & Volt, Burns Industrial" && goodyear.firm === "GOODYEAR TIRE & RUBBER CO" && goodyear.division === "", [phb.division, goodyear.division]);
  check("  …a worker estimate of nothing (\"0E-10\") read as none, not as zero workers", slice.certifications.some((c) => c.workers === null), slice.certifications.filter((c) => c.workers === null).map(petitionNumber));

  console.log("\nThe committed file");
  const file = JSON.parse(gunzipSync(readFileSync(join(__dirname, "..", "data", "taa-certifications.json.gz"))).toString()) as {
    read: string; petitions: number; byCode: Record<string, number>; lastDecided: string; file: { bytes: number; modified?: string }; about: string;
  };
  check(`the zip of 2026-11-18: ${EXPECTED.petitions.toLocaleString("en-US")} petitions, the last decided ${EXPECTED.lastDecided}, the program having lapsed on 2022-07-01`,
    file.read === "2026-11-18" && file.petitions === EXPECTED.petitions && file.lastDecided === EXPECTED.lastDecided && file.file.bytes === 47_935_779 && file.file.modified === "Wed, 18 Nov 2026 11:20:46 GMT",
    { read: file.read, petitions: file.petitions, lastDecided: file.lastDecided, file: file.file });
  check("  …its codes as counted", JSON.stringify(Object.entries(file.byCode).sort()) === JSON.stringify(Object.entries(EXPECTED.byCode).sort()), file.byCode);
  check(`  …and ${EXPECTED.certifications.toLocaleString("en-US")} certifications kept, C, C1, C2 and CU's sum`,
    certs.length === EXPECTED.certifications && EXPECTED.byCode.C + EXPECTED.byCode.C1 + EXPECTED.byCode.C2 + EXPECTED.byCode.CU === certs.length && certs.every((c) => CERTIFIED.includes(c.code)), certs.length);

  console.log("\nThe rule");
  const ford = on(37996, "1972-06-01");
  const april = ford.find((e) => e.date === "1980-04-17");
  check("Ford's thirteen plants certified on 1980-04-17 are one row on F, Wayne Assembly's TA-W-6,955 (6,844 workers) and Lorain's (6,751) among them",
    !!april && /^Labor Department certified workers at 13 sites of FORD MOTOR CO for trade adjustment assistance$/.test(april.title) &&
      /ATLANTA ASSEMBLY, Atlanta, GA: STANDARD CARS, 3,894 workers, separations from 1979-01-30 \(TA-W-6,946\)/.test(april.description ?? "") &&
      /And 9 more: [^.]*TA-W-6,953[^.]*TA-W-6,955, TA-W-6,955A[^.]*TA-W-6,958\./.test(april.description ?? ""),
    april);
  check("  …each site's workers given as the Department's estimate for its group, never added up", /not added up/.test(april?.description ?? "") && !/71,|74,|7[0-9],[0-9]{3} workers/.test(april?.description ?? ""));
  check("  …before 1994 with no link (the Federal Register's search reads from 1994); the row is the company's one event that day",
    april?.url === undefined && april?.sourceKey === "dol_taa" && april?.type === "regulation" && april?.externalId === "taa:37996@1980-04-17" && april?.dedupBasis === april?.externalId);
  const boeing = on(12927, "1962-01-02").find((e) => e.date === "2002-03-18");
  check("Boeing's TA-W-40,525 and its six letters of 2002-03-18 are one row on BA, four sites shown and the rest named",
    !!boeing && /7 sites of Boeing Co\. \(The\)/.test(boeing.title) && /Commercial Airplane Group, Seattle, WA: Commercial Aircraft, 6,000 workers, separations from 2002-02-25 \(TA-W-40,525\)/.test(boeing.description ?? "") &&
      /And 3 more: TA-W-40,525D, TA-W-40,525E, TA-W-40,525F\./.test(boeing.description ?? ""),
    boeing);
  check("  …linked to the Federal Register's search for its number, where the notice is",
    boeing?.url === "https://www.federalregister.gov/documents/search?conditions%5Bterm%5D=%22TA-W-40%2C525%22", boeing?.url);
  const jci = on(833444, "1987-09-28");
  check("Johnson Controls, Inc.'s certification of 2007-01-25 (TA-W-60,727) stays off JCI, Tyco's record, which took that name on 2016-09-02; TA-W-91,818 and -A of 2016-09-14 land",
    !jci.some((e) => e.date === "2007-01-25") && /2 sites of Johnson Controls, Inc\./.test(jci.find((e) => e.date === "2016-09-14")?.title ?? ""), jci.map((e) => e.date).slice(-3));
  const gm = on(1467858, "2010-11-18");
  check("General Motors Corp.'s certifications before GM's first price of 2010-11-18 stay off GM; General Motors Company's of 2014-10-08 (TA-W-85,510, Marion Metal Center) lands",
    gm.every((e) => e.date >= "2010-11-18") && gm.length === 18 && /Marion Metal Center/.test(gm.find((e) => e.date === "2014-10-08")?.title ?? "") && on(1467858).filter((e) => e.date < "2010-11-18").length > 80,
    gm.map((e) => e.date));
  const dana = on(26780);
  const danaUnguarded = taaEvents(certs.filter((c) => c.petition === 64187), namesOf(26780), { cik: 26780 });
  check("\"Coupled Products LLC (Formerly known as Dana Corporation)\" of 2008-10-27, a business Dana sold, stays off DAN (`NOT_THE_COMPANY`), though the rule reads Dana in it",
    !dana.some((e) => e.date === "2008-10-27") && NOT_THE_COMPANY[26780]?.[0].firm.test("Coupled Products LLC (Formerly known as Dana Corporation)") === true && danaUnguarded.length === 0 &&
      taaEvents(certs.filter((c) => c.petition === 64187), (y) => [...namesOf(26780)(y), "Dana Corporation"], { cik: 999999999 }).length === 1);
  const vf = on(103379);
  check("VF's own apparel companies, named after it, are its (`TAA_UNITS`): VF Knitwear's three plants of 1998-02-06 one row, 35 days of 1998–2014 in all with VF Corporation's own",
    /3 sites of VF Knitwear, Inc/.test(vf.find((e) => e.date === "1998-02-06")?.title ?? "") && vf.length === 35 && vf.every((e) => e.date <= "2014-11-18") &&
      vf.filter((e) => !/ (?:sites of )?VF (?:Jeanswear|Knitwear|Imagewear)/.test(e.title)).length === 1,
    vf.length);
  const oracle = on(1341439, "1986-03-12");
  check("Oracle America, the name Oracle gave Sun Microsystems, is Oracle's: eight days of 2010–2022; Oracle Lens Manufacturing of Warwick, R.I., a namesake, is not",
    oracle.length === 8 && !oracle.some((e) => e.date === "2009-08-24") && oracle.every((e) => /Oracle America/.test(e.title)) && TAA_UNITS[1341439][0].firm.test("Oracle Lens Manufacturing") === false,
    oracle.map((e) => e.date));
  console.log("\nUnits named after their owners, and EPA's and the CPSC's (batch 160)");
  check("GM's own plants after its first price, which the caption rule refuses (\"General Motors Lordstown Complex\", 2019-03-22), are GM's (`TAA_UNITS`)",
    /General Motors Lordstown Complex/.test(gm.find((e) => e.date === "2019-03-22")?.title ?? "") && /General Motors Components Holdings/.test(gm.find((e) => e.date === "2011-02-22")?.title ?? ""));
  const ge = on(40545, "1970-01-02");
  check("  …GE's divisions written as firms (\"GENERAL ELECTRIC CO. O\", 1987; \"General Electric Transportation\", 2018-06-15), Weyerhaeuser NR Company (2009-05-08), State Street's bank (2020-09-13)",
    ge.some((e) => e.date === "1987-06-03") && /General Electric Transportation/.test(ge.find((e) => e.date === "2018-06-15")?.title ?? "") &&
      /Weyerhaeuser NR Company/.test(on(106535).find((e) => e.date === "2009-05-08")?.title ?? "") && /19 sites of State Street Bank & Trust Co\./.test(on(93751).find((e) => e.date === "2020-09-13")?.title ?? ""),
    ge.length);
  const xrx = on(1770450, "1962-01-02");
  check("  …Xerox's units to the separation of Conduent, \"On December 31, 2016\" by its 8-K: six sites of Xerox Business Services on 2016-12-09 land, the one of 2018-09-18 does not",
    /6 sites of Xerox Business Services/.test(xrx.find((e) => e.date === "2016-12-09")?.title ?? "") && !xrx.some((e) => e.date === "2018-09-18") && TAA_UNITS[1770450][0].to === "2016-12-30");
  const mt = on(1243429);
  const clf = on(764065);
  check("  …ArcelorMittal's US mills are ArcelorMittal's to 2020-12-08, and Indiana Harbor's certification of 2020-12-15, after Cleveland-Cliffs' closing of 2020-12-09, is Cleveland-Cliffs'",
    mt.some((e) => e.date === "2018-11-01") && !mt.some((e) => e.date === "2020-12-15") && /ArcelorMittal USA Indiana Harbor/.test(clf.find((e) => e.date === "2020-12-15")?.title ?? ""),
    { mt: mt.length, clf: clf.map((e) => e.date) });
  check("  …A. O. Smith Electrical, as the file writes it (1987–2002), to its sale of 2011, the CPSC's day",
    ["1987-09-01", "1988-10-03", "1989-08-15", "1990-01-09", "1992-03-24", "1997-02-21", "2000-09-19", "2000-11-22", "2001-02-05", "2002-01-28", "2002-08-29"].every((d) => on(91142).some((e) => e.date === d)) &&
      TAA_UNITS[91142][0].to === "2011-08-21");
  check("  …and EPA's units on their days: Chevron Chemical on CVX in 1992 (to 2000-06-30), Sunoco, Inc. on Energy Transfer from 2012-10-05, not before",
    /CHEVRON CHEMICAL CO/.test(on(93410).find((e) => e.date === "1992-02-07")?.title ?? "") &&
      /3 sites of Sunoco, Inc\./.test(on(1276187).find((e) => e.date === "2013-03-28")?.title ?? "") && !on(1276187).some((e) => e.date < "2012-10-05" && /Sunoco/.test(e.title)));
  const hpFormer = (year: number) => (year <= 2015 ? ["HEWLETT PACKARD CO"] : []);
  const hp = on(47217, "1962-01-02", hpFormer);
  check("Hewlett-Packard's certifications reach HP Inc.'s record under its former name, read by ingest from EDGAR, while it bore it: TA-W-85,726 of 2015-03-02 lands, Hewlett Packard Company's of 2016 do not",
    hp.some((e) => e.date === "2015-03-02") && !hp.some((e) => e.date >= "2016-01-01" && /Hewlett/.test(e.title)) && !on(47217, "1962-01-02").some((e) => e.date === "2015-03-02"), hp.length);
  const denial: TaaCertification = { petition: 1, suffix: "", firm: "FORD MOTOR CO", division: "", city: "Dearborn", state: "MI", what: "", day: "1990-01-02", code: "D", impact: "", workers: 10 };
  check("a denial makes no row (the owner's call (a)), whatever its firm", taaEvents([denial], namesOf(37996), { cik: 37996 }).length === 0 && taaEvents([{ ...denial, code: "C" }], namesOf(37996), { cik: 37996 }).length === 1);
  const long = taaEvents([{ ...denial, code: "C", division: "Business Processing Services-CRM, Enterprise, Volt Services Group, Teksystems, Adecco, etc." }], namesOf(37996), { cik: 37996 })[0];
  check("  …and a long division, listing the staffing agencies too, is cut at a comma in the title and kept whole below",
    /at FORD MOTOR CO, Business Processing Services-CRM, Enterprise… \(Dearborn, MI\) for/.test(long.title) && /Teksystems, Adecco, etc\./.test(long.description ?? ""), long.title);
  check("  …and a notice's search link from 1994, none before",
    noticeSearch({ petition: 40525, day: "2002-03-18" })?.endsWith("%22TA-W-40%2C525%22") === true && noticeSearch({ petition: 6955, day: "1980-04-17" }) === undefined);

  console.log("\nGE's, AT&T's and ADM's units (batch 164, the 2026-11-21 audit's finding 3)");
  const t = on(732717, "1984-07-19");
  const tDay = t.find((e) => e.date === "2012-12-05");
  check("AT&T's own companies are T's from the day SBC's record took the name: 58 certifications on 20 days, 2009–2021, TA-W-82,064's 20 sites of 2012-12-05 one row",
    t.length === 20 && t.every((e) => e.date >= "2009-10-02" && e.date <= "2021-07-21") && / at 20 sites of AT&T Services, Inc\. /.test(tDay?.title ?? "") &&
      t.reduce((n, e) => n + Number(/ at (\d+) sites of /.exec(e.title)?.[1] ?? 1), 0) === 58 && TAA_UNITS[732717][0].from === "2005-11-18",
    t.map((e) => e.date).join(", "));
  const adm = on(7084, "1962-01-02");
  check("  …ADM's two, ADM Cocoa (2015-04-28) to the cocoa business's sale in October 2015 and ADM Milling Co. (2018-04-03)",
    ["2015-04-28", "2018-04-03"].every((d) => adm.some((e) => e.date === d)) && TAA_UNITS[7084][1].to === "2015-09-30",
    adm.map((e) => e.date).join(", "));
  const ge164 = on(40545, "1962-01-02");
  check("  …GE's businesses written \"GE …\": GE Aviation (2007-11-16), GE Healthcare (2008-11-12), GE Drives and Controls (2020-08-29), GE Transportation Systems (2003-07-09)",
    ["2007-11-16", "2008-11-12", "2020-08-29", "2003-07-09"].every((d) => ge164.some((e) => e.date === d && / GE /.test(e.title))) && ge164.length === EXPECTED.top.match(/^GE (\d+)/)!.slice(1).map(Number)[0],
    ge164.length);
  check("  …but not \"GE Transportation | A WABTEC Company\" (2021-02-07), Wabtec's from 2019-02-25 (its 8-K), nor GE-RIC Inc. (1976) or Ge-Ray Fabrics (2003)",
    !ge164.some((e) => e.date === "2021-02-07") && !on(40545).some((e) => /GE-RIC|Ge-Ray/i.test(e.title)) && TAA_UNITS[40545][2].to === "2019-02-24",
    ge164.filter((e) => /Transportation|GE-RIC|Ge-Ray/i.test(e.title)).map((e) => `${e.date} ${e.title.slice(0, 60)}`).join(" | "));

  console.log("\nEvery listed company");
  const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const first: Record<string, string> = {};
  for (const [f, k] of [["digest-1985-entries.json.gz", "firstPrices"], ["eeoc-listing.json.gz", "first"], ["fda-device-recalls.json.gz", "first"], ["occ-actions.json.gz", "first"]] as const) {
    Object.assign(first, JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", f))).toString())[k]);
  }
  const letters = certs.map((c) => alnum(c.firm));
  const unitYears = Array.from({ length: 49 }, (_, k) => `${1975 + k}-07-01`);
  const rows: { ticker: string; date: string; first: string | null; sites: number }[] = [];
  const seen = new Set<number>();
  for (const [cik, ticker] of companies) {
    if (seen.has(cik)) continue;
    seen.add(cik);
    // a cheap first pass over the company's names in any year and its units on any day; the rule itself decides
    const pre = [...new Set([...namesOf(cik)(2026), ...unitYears.flatMap((d) => releaseNamesOn(cik, d))].flatMap(andSpellings).map(alnum).filter((n) => n.length >= 3))];
    // …and the units the rule reads by pattern: its own, and EPA's and the CPSC's (batch 160)
    const units = [...(TAA_UNITS[cik] ?? []).map((u) => u.firm), ...(EPA_UNITS[cik] ?? []).map((u) => u.defendant), ...(CPSC_UNITS[cik] ?? []).map((u) => u.firm)];
    const mine = certs.filter((c, j) => pre.some((p) => letters[j].includes(p)) || units.some((u) => u.test(c.firm.trim())));
    if (!mine.length) continue;
    for (const e of taaEvents(mine, namesOf(cik), { cik, namesOn: (d) => releaseNamesOn(cik, d) })) {
      // the sites a row names, by its title ("at 13 sites of"), not by the numbers in its text, which the 900-character cap
      // can cut (the 2026-11-21 audit; batch 164)
      rows.push({ ticker, date: e.date, first: first[ticker] ?? null, sites: Number(/ at (\d+) sites of /.exec(e.title)?.[1] ?? 1) });
    }
  }
  const after = rows.filter((r) => r.first && r.date >= r.first);
  const top = Object.entries(after.reduce<Record<string, number>>((m, r) => ((m[r.ticker] = (m[r.ticker] ?? 0) + 1), m), {}))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([t, n]) => `${t} ${n}`)
    .join(", ");
  check(`before any first price: ${EXPECTED.total.toLocaleString("en-US")} company days on ${EXPECTED.companies} companies`,
    rows.length === EXPECTED.total && new Set(rows.map((r) => r.ticker)).size === EXPECTED.companies, `${rows.length} on ${new Set(rows.map((r) => r.ticker)).size}`);
  check(`  …from first prices: ${EXPECTED.fromFirst.toLocaleString("en-US")} on ${EXPECTED.fromFirstPages} pages, ${EXPECTED.fromFirst2017.toLocaleString("en-US")} before 2017, ${EXPECTED.fromFirstCertifications.toLocaleString("en-US")} certifications (${EXPECTED.top})`,
    after.length === EXPECTED.fromFirst && new Set(after.map((r) => r.ticker)).size === EXPECTED.fromFirstPages && after.filter((r) => r.date < "2017-01-01").length === EXPECTED.fromFirst2017 &&
      after.reduce((n, r) => n + r.sites, 0) === EXPECTED.fromFirstCertifications && top === EXPECTED.top,
    `${after.length} on ${new Set(after.map((r) => r.ticker)).size}, ${after.filter((r) => r.date < "2017-01-01").length} before 2017, ${after.reduce((n, r) => n + r.sites, 0)} certifications; ${top}`);

  console.log("\nAt ingest");
  const step = await taaFor(fakeDb("1972-06-01"), 1, { edgarName: "FORD MOTOR CO", alsoKnownAs: newsNamesFor(37996), cik: 37996 });
  check("the company's certifications from its first price, with no request, as a complete answer", step.outcome === "ok" && step.events.length === ford.length && !!step.complete, `${step.outcome} ${step.events.length}`);
  const none = await taaFor(fakeDb(null), 1, { edgarName: "FORD MOTOR CO", alsoKnownAs: [], cik: 37996 });
  const fund = await taaFor(fakeDb("1972-06-01"), 1, { edgarName: "FORD MOTOR CO", alsoKnownAs: [], cik: 37996, fundSeries: true });
  check("  …asked again while it has no prices, and none for a fund's series", none.outcome === "error" && /no prices/.test(none.detail ?? "") && fund.events.length === 0 && fund.outcome === "empty");

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "dol_taa");
  check("the source is id 43, public domain, cleared for commercial use, reviewed 2026-11-18, credited to the U.S. Department of Labor",
    src?.id === 43 && src.license === "public domain" && src.commercialOk && src.reviewedOn === "2026-11-18" && src.attribution === "U.S. Department of Labor", src);
  check("  …the build quotes the Department's terms",
    /Materials created by the federal government are generally part of the public domain and may be used, reproduced and distributed without permission/.test(read("lib/taaPetitions.ts").replace(/\s*\*\s*/g, " ")));
  check("  …a company source, quota and refresh noted, scored without the model",
    (COMPANY_SOURCES as readonly string[]).includes("dol_taa") && QUOTAS.dol_taa.perDay === null && SOURCE_TTL_MINUTES.dol_taa === 1440 &&
      deterministicScore({ eventId: 0, kind: "regulation", title: "Labor Department certified workers at FORD MOTOR CO", sourceKey: "dol_taa" }, { kind: "company", displayName: "Ford", ticker: "F" }, ["ford"])?.score === 0.95);
  check("  …the ingest asks it for every company", /await run\("dol_taa", [^\n]+\n\s*taaFor\(client, subjectId, \{[^}]*cik: company\.cik, fundSeries \}\),/.test(read("scripts/ingest.ts")));
  check("  …synced by `npm run sync:taa` from the Department's zip, and credited",
    /"sync:taa": "tsx scripts\/sync-taa\.ts"/.test(read("package.json")) && TAA_FILE === "https://data.dol.gov/data-catalog/ETA/otaa_petition/ETA_otaa_petition.zip" &&
      /trade adjustment certifications from the U\.S\. Department of Labor/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /trade adjustment certifications from the U\.S\. Department of Labor/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")));

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
