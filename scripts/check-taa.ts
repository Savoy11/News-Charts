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
  // every listed company in the index, under the rule, its names as the replay below builds them
  total: 2_684,
  companies: 470,
  // from first prices, for the 954 companies the fixtures read
  fromFirst: 1_276,
  fromFirstPages: 178,
  fromFirst2017: 1_052,
  fromFirstCertifications: 1_887,
  top: "GE 101, IBM 86, HON 45, F 40, WY 36, IP 34, GT 31, XRX 26, RTX 25, BA 24",
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
    gm.every((e) => e.date >= "2010-11-18") && gm.length === 7 && /Marion Metal Center/.test(gm.find((e) => e.date === "2014-10-08")?.title ?? "") && on(1467858).length === 97,
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
    const units = TAA_UNITS[cik] ?? [];
    const mine = certs.filter((c, j) => pre.some((p) => letters[j].includes(p)) || units.some((u) => u.firm.test(c.firm)));
    if (!mine.length) continue;
    for (const e of taaEvents(mine, namesOf(cik), { cik, namesOn: (d) => releaseNamesOn(cik, d) })) {
      rows.push({ ticker, date: e.date, first: first[ticker] ?? null, sites: (e.description?.match(/TA-W-/g) ?? []).length });
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
