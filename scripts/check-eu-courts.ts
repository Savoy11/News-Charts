/**
 * The EU courts' judgments in the company's own cases (batch 183; the 2026-11-22c proposal 3, approved by the owner that
 * day with call (a): every judgment naming the company as a party, but trade mark and design cases against the EU's IP
 * office and staff cases).
 *
 *   npm run check:eu-courts
 *
 * Offline: the committed file (`data/eu-courts.json.gz`, written by `npm run sync:eu-courts` from the Publications
 * Office's 73 yearly lists of 2026-11-24 and the operative parts of the judgments a listed company is a party to),
 * hand-built titles of each form, and the first trading days the other checks' fixtures carry.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { dojPossessive } from "../lib/doj";
import { andSpellings, withoutTag } from "../lib/edgarName";
import {
  EU_COURTS_DATA,
  EU_COURT_UNITS,
  caseNumbers,
  courtPartyIsCompany,
  euCourts,
  euCourtsEvents,
  isTradeMarkCase,
  legalParts,
  mergeJudgments,
  operativePart,
  readJudgmentTitle,
  sideOf,
  sideParties,
} from "../lib/euCourts";
import { companyNames } from "../lib/frCompany";
import { deterministicScore } from "../lib/enrich/relevance";
import { namesForYear } from "../lib/ingest/frBackfill";
import { euCourtsFor } from "../lib/ingest/euCourtsFor";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import { isNotesRecord, releaseNamesOn } from "../lib/releaseNames";
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
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The file as written on 2026-11-24, and every company replayed against it. */
const EXPECTED = {
  titles: 77_858,
  judgments: 21_274,
  withOperative: 286,
  total: 312,
  companies: 106,
  // from first prices, for the companies the fixtures read
  fromFirst: 135,
  fromFirstPages: 55,
  fromFirst2017: 68,
  top: "MRK 11, SAN 11, AKZOY 9, ADM 5, DB 5, INTC 5, HSBC 4, IFNNY 4, QCOM 4, AAL 3",
};

const companies = (tickerIndex as unknown as { companies: [number, string, string][] }).companies;
const titleOf = (cik: number) => companies.find((c) => c[0] === cik)![2];
/** A company's names of a year as ingest builds them, less the former names only the database holds. */
const namesOf = (cik: number) => (year: number) => {
  const title = titleOf(cik);
  const own = dojPossessive(title, possessiveNameFor(cik));
  return [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)];
};
const judgments = euCourts();
const on = (cik: number, from = "") => euCourtsEvents(judgments, namesOf(cik), { cik, from, namesOn: (d) => releaseNamesOn(cik, d) });
const caseOn = (cik: number, c: string, day?: string) => on(cik).find((e) => e.externalId?.split(",").includes(c) && (!day || e.date === day));

async function main(): Promise<void> {
  console.log("The titles");
  const ge = readJudgmentTitle(
    "Judgment of the Court of First Instance (Second Chamber, extended composition) of 14 December 2005.#General Electric Company v Commission of the European Communities.#Action for annulment - Competition - Commission decision declaring a concentration to be incompatible with the common market#Case T-210/01.",
  );
  check("a judgment's own title: the court (the Court of First Instance the General Court), the day, the parties, the subject and the case",
    ge?.form === "judgment" && ge.court === "General Court" && ge.day === "2005-12-14" && same(ge.cases, ["T-210/01"]) && same(ge.sides, ["General Electric Company", "Commission of the European Communities"]) &&
      /^Action for annulment - Competition/.test(ge.subject),
    ge);
  const old = readJudgmentTitle("Judgment of the Court of 19 July 1955.#Antoine Kergall v Common Assembly of the ECSC.#Case 1/55.");
  const comma = readJudgmentTitle("Judgment of the Court (Eighth Chamber), 20 November 2014.#Rohm Semiconductor GmbH v Hauptzollamt Krefeld.#Request for a preliminary ruling from the Finanzgericht Düsseldorf.#Customs union#Case C-666/13.");
  check("  …a case before 1989 written with no letter is the Court of Justice's (\"Case 1/55\" C-1/55); a day after a comma; a request for a preliminary ruling its court",
    same(old?.cases, ["C-1/55"]) && old?.day === "1955-07-19" && comma?.day === "2014-11-20" && comma.reference === "Finanzgericht Düsseldorf" && same(comma.cases, ["C-666/13"]), { old, comma });
  const notice = readJudgmentTitle(
    "Judgment of the Court (Fourth Chamber) of 20 January 2005 in Case C-300/03 (reference for a preliminary ruling by the Hessisches Finanzgericht, Kassel): Honeywell Aerospace GmbH v Hauptzollamt Gießen (Community transit — Incurrence of a customs debt)",
  );
  const led = readJudgmentTitle(
    "Case T-485/11: Judgment of the General Court of 15 July 2015 — Akzo Nobel and Others v Commission (Competition — Agreements, decisions and concerted practices — Heat stabilisers)",
  );
  const noColon = readJudgmentTitle("Judgment of the Court of First Instance of 16 February 2005 in Case T-354/03 Gemma Reggimenti v European Parliament (Officials — Reimbursement)");
  check("the Official Journal's notice in its three forms: the case after the day, the case leading the title (since 2008), the colon left out",
    notice?.form === "notice" && notice.day === "2005-01-20" && same(notice.cases, ["C-300/03"]) && same(notice.sides, ["Honeywell Aerospace GmbH", "Hauptzollamt Gießen"]) && /Kassel/.test(notice.reference ?? "") &&
      led?.form === "notice" && led.day === "2015-07-15" && same(led.cases, ["T-485/11"]) && same(led.sides, ["Akzo Nobel and Others", "Commission"]) && /^Competition/.test(led.subject) &&
      same(noColon?.sides, ["Gemma Reggimenti", "European Parliament"]),
    { notice, led, noColon });
  check("  …an appeal brought, an opinion, a question are no judgment",
    readJudgmentTitle("Case C-738/22 P: Appeal brought on 30 November 2022 by Google LLC, Alphabet, Inc. against the judgment of the General Court") === null &&
      readJudgmentTitle("Opinion of Advocate General Wahl delivered on 21 July 2016.#European Commission v Total SA") === null);
  check("case numbers: an appeal's \"P\", the General Court's, joined cases each once", same(caseNumbers("Joined Cases C-214/12 P, C-215/12 P and T-1/05"), ["C-214/12 P", "C-215/12 P", "T-1/05"]));
  check("a side's parties split only where every part is a legal name or a public body: \"Apple and Pear Australia Ltd\" one, \"Ministero … and ENI SpA\" two, \"Eli Lilly and Co.\" one name, a former name its own",
    same(sideParties("Apple and Pear Australia Ltd"), ["Apple and Pear Australia Ltd"]) && same(sideParties("Ministero dello Sviluppo economico and Others (C-379/08) and ENI SpA"), ["Ministero dello Sviluppo economico", "ENI SpA"]) &&
      sideParties("Glaxo Group Ltd, SmithKline Beecham plc and Eli Lilly and Co.").includes("Eli Lilly & Co.") && same(sideParties("Ryanair DAC, formerly Ryanair Ltd"), ["Ryanair DAC", "Ryanair Ltd"]),
    sideParties("Ryanair DAC, formerly Ryanair Ltd"));
  check("  …a public body whose name ends in an accent is one (\"Autorità Garante …\", batch 184), and a Grand Duchy",
    same(sideParties("Ryanair Ltd and Autorità Garante della Concorrenza e del Mercato - Antitrust"), ["Ryanair Ltd", "Autorità Garante della Concorrenza e del Mercato - Antitrust"]) &&
      same(sideParties("Grand Duchy of Luxembourg , Amazon EU Sàrl and Amazon.com, Inc."), ["Grand Duchy of Luxembourg", "Amazon EU Sàrl", "Amazon.com, Inc."]),
    sideParties("Grand Duchy of Luxembourg , Amazon EU Sàrl and Amazon.com, Inc."));
  check("  …a side kept whole prints the company's own part, the one ending in a legal word (\"Matina Stevi and The New York Times Company\")",
    same(legalParts("Matina Stevi and The New York Times Company"), ["The New York Times Company"]) && same(legalParts("Apple and Pear Australia Ltd"), ["Pear Australia Ltd"]) && same(legalParts("Microsoft Corp"), []));
  check("a trade mark or design case against the EU's IP office makes no row (call (a)); nor a staff case",
    isTradeMarkCase(["Apple and Pear Australia Ltd", "Office for Harmonisation in the Internal Market (Trade Marks and Designs) (OHIM)"]) && isTradeMarkCase(["BlackRock, Inc.", "European Union Intellectual Property Office"]) &&
      !isTradeMarkCase(["Apple Inc.", "Deutsches Patent- und Markenamt"]) &&
      mergeJudgments([{ ...readJudgmentTitle("Judgment of the Civil Service Tribunal (First Chamber) of 28 October 2010.#Vicente Carajosa v Commission.#Case F-77/08.")!, work: "w" }]).length === 0);
  const merged = mergeJudgments([{ ...ge!, work: "judgment-work" }, { ...readJudgmentTitle("Judgment of the Court of First Instance of 14 December 2005 in Case T-210/01: General Electric Company v Commission of the European Communities (Competition)")!, work: "notice-work" }]);
  check("a judgment and its notice are one, by their case and day, the judgment's title giving the parties", merged.length === 1 && merged[0].judgment === "judgment-work" && merged[0].notice === "notice-work", merged);
  check("the operative part as a notice prints it, or a judgment's text closes",
    operativePart("… Operative part of the judgment 1. Annuls the Commission Decision of 30 June 2011; 2. Orders the Commission to pay the costs.") === "1. Annuls the Commission Decision of 30 June 2011; 2. Orders the Commission to pay the costs." &&
      operativePart("On those grounds, THE GENERAL COURT (Second Chamber) hereby: 1. Dismisses the action; 2. Orders General Electric Company to bear its own costs. Delivered in open court in Luxembourg") === "1. Dismisses the action; 2. Orders General Electric Company to bear its own costs." &&
      operativePart("no such words") === null);
  check("the company's side: the applicant or defendant of one case between two sides, an appeal's appellant or respondent, a party in a reference or joined cases",
    sideOf({ cases: ["T-210/01"], sides: ["a", "b"] }, 0) === "the applicant" && sideOf({ cases: ["C-413/14 P"], sides: ["a", "b"] }, 1) === "the respondent" &&
      sideOf({ cases: ["C-300/03"], sides: ["a", "b"], reference: "x" }, 0) === "a party to the national case referred" && sideOf({ cases: ["C-1/08", "C-2/08"], sides: ["a", "b", "c"] }, 1) === "a party");

  console.log("\nThe rule");
  check("Honeywell Aerospace GmbH is Honeywell's to the spin-off's record (2025-10-01), never the spin-off's before it",
    courtPartyIsCompany("Honeywell Aerospace GmbH", "2005-01-20", 773840, namesOf(773840).bind(null, 2005)) && !courtPartyIsCompany("Honeywell Aerospace GmbH", "2005-01-20", 2089271, namesOf(2089271).bind(null, 2005)) &&
      !!EU_COURT_UNITS[773840]);

  console.log("\nThe committed file");
  const body = JSON.parse(gunzipSync(readFileSync(EU_COURTS_DATA)).toString()) as { listed: Record<string, number>; about: string; read: string };
  const titles = Object.values(body.listed).reduce((s, n) => s + n, 0);
  check(`${EXPECTED.titles.toLocaleString("en-US")} titles listed, 1954–2026; ${EXPECTED.judgments.toLocaleString("en-US")} judgments kept (trade mark cases against the EU's IP office and staff cases left out), ${EXPECTED.withOperative} with an operative part`,
    titles === EXPECTED.titles && judgments.length === EXPECTED.judgments && judgments.filter((j) => j.operative).length === EXPECTED.withOperative && Object.keys(body.listed).length === 73,
    { titles, judgments: judgments.length, withOperative: judgments.filter((j) => j.operative).length });
  check("  …the file credits the Court and the Official Journal and names its batch", /Court of Justice of the European Union/.test(body.about) && /© European Union/.test(body.about) && /batch 183/.test(body.about) && body.read === "2026-11-24");

  console.log("\nThe rows");
  const geRow = caseOn(40545, "T-210/01", "2005-12-14");
  const honRow = caseOn(773840, "T-209/01", "2005-12-14");
  check("GE's and Honeywell's appeals of the merger ban, 2005-12-14, each on its page, the company the applicant",
    !!geRow && /^The EU General Court ruled in General Electric Company v Commission \(T-210\/01\)/.test(geRow.title) && /General Electric Company the applicant/.test(geRow.description ?? "") &&
      !!honRow && /Honeywell International, Inc\. the applicant/.test(honRow.description ?? ""),
    [geRow?.title, honRow?.title]);
  const akzoCik = companies.find((c) => c[1] === "AKZOY")?.[0] ?? 0;
  const akzoRow = caseOn(akzoCik, "T-485/11", "2015-07-15");
  check("Akzo Nobel's appeal of the heat stabiliser decision, 2015-07-15, with its operative part: \"Annuls the Commission Decision of 30 June 2011\"",
    !!akzoRow && /Annuls (?:Article 1 of )?(?:the )?Commission Decision C\(2011\) 4647 final of 30 June 2011|Annuls the Commission Decision of 30 June 2011/i.test(akzoRow.description ?? ""), akzoRow?.description?.slice(0, 400));
  const aapl = on(320193);
  const slm = on(companies.find((c) => c[1] === "SLM")?.[0] ?? 0);
  const mlkn = on(66382);
  const blk = on(companies.find((c) => c[1] === "BLK")?.[0] ?? 0);
  check("T-378/13 Apple and Pear Australia v OHIM stays off AAPL, T-389/10 SLM and Ori Martin off SLM, C-516/13 Knoll International off MLKN, T-59/14 BlackRock v OHIM no row",
    !aapl.some((e) => /T-378\/13/.test(e.externalId ?? "")) && !slm.some((e) => /T-389\/10/.test(e.externalId ?? "")) && !mlkn.some((e) => /C-516\/13/.test(e.externalId ?? "")) &&
      !blk.some((e) => /T-59\/14/.test(e.externalId ?? "")),
    { aapl: aapl.map((e) => e.externalId), mlkn: mlkn.map((e) => e.externalId) });
  check("a row's id and key are the company and the day, its external id the day's case numbers", !!geRow && geRow.dedupBasis === "eu-courts:40545@2005-12-14" && geRow.externalId === "T-210/01" && geRow.sourceKey === "eu_courts");

  console.log("\nEvery company");
  const first: Record<string, string> = {};
  for (const [f, k] of [["digest-1985-entries.json.gz", "firstPrices"], ["eeoc-listing.json.gz", "first"], ["fda-device-recalls.json.gz", "first"], ["occ-actions.json.gz", "first"]] as const) {
    Object.assign(first, JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", f))).toString())[k]);
  }
  const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const jl = judgments.map((j) => alnum(j.sides.join(" ")));
  const unitYears = Array.from({ length: 73 }, (_, k) => `${1954 + k}-07-01`);
  const rows: { ticker: string; date: string; first: string | null }[] = [];
  const seen = new Set<number>();
  for (const [cik, ticker] of companies) {
    if (seen.has(cik) || isNotesRecord(cik)) continue;
    seen.add(cik);
    const pre = [...new Set([...namesOf(cik)(2026), ...namesOf(cik)(2005), ...namesOf(cik)(1985), ...unitYears.flatMap((d) => releaseNamesOn(cik, d))].flatMap(andSpellings).map(alnum).filter((n) => n.length >= 3))];
    const mj = judgments.filter((_, k) => !!EU_COURT_UNITS[cik] || pre.some((n) => jl[k].includes(n)));
    if (!mj.length) continue;
    for (const e of euCourtsEvents(mj, namesOf(cik), { cik, namesOn: (d) => releaseNamesOn(cik, d) })) rows.push({ ticker, date: e.date, first: first[ticker] ?? null });
  }
  const after = rows.filter((r) => r.first && r.date >= r.first);
  const top = Object.entries(after.reduce<Record<string, number>>((m, r) => ((m[r.ticker] = (m[r.ticker] ?? 0) + 1), m), {}))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([t, n]) => `${t} ${n}`)
    .join(", ");
  check(`before any first price: ${EXPECTED.total} company days on ${EXPECTED.companies} companies`, rows.length === EXPECTED.total && new Set(rows.map((r) => r.ticker)).size === EXPECTED.companies, `${rows.length} on ${new Set(rows.map((r) => r.ticker)).size}`);
  check(`  …from first prices: ${EXPECTED.fromFirst} on ${EXPECTED.fromFirstPages} pages, ${EXPECTED.fromFirst2017} before 2017 (${EXPECTED.top})`,
    after.length === EXPECTED.fromFirst && new Set(after.map((r) => r.ticker)).size === EXPECTED.fromFirstPages && after.filter((r) => r.date < "2017-01-01").length === EXPECTED.fromFirst2017 && top === EXPECTED.top,
    `${after.length} on ${new Set(after.map((r) => r.ticker)).size}, ${after.filter((r) => r.date < "2017-01-01").length} before 2017; ${top}`);

  console.log("\nAt ingest");
  const step = await euCourtsFor(fakeDb("1962-01-02"), 1, { edgarName: titleOf(40545), alsoKnownAs: newsNamesFor(40545), cik: 40545 });
  check("the company's judgments from its first price, with no request, as a complete answer", step.outcome === "ok" && step.events.length === on(40545, "1962-01-02").length && !!step.complete, `${step.outcome} ${step.events.length}`);
  const none = await euCourtsFor(fakeDb(null), 1, { edgarName: titleOf(40545), alsoKnownAs: [], cik: 40545 });
  const fund = await euCourtsFor(fakeDb("2000-01-03"), 1, { edgarName: "Vanguard 500 Index Fund", alsoKnownAs: [], cik: 36405, fundSeries: true });
  check("  …asked again while it has no prices; a fund's series none", none.outcome === "error" && /no prices/.test(none.detail ?? "") && fund.events.length === 0);

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "eu_courts");
  check("the source is id 56, cleared for commercial use under the Court's terms, reviewed 2026-11-24, credited to the Court of Justice of the European Union",
    src?.id === 56 && src.commercialOk && src.reviewedOn === "2026-11-24" && src.attribution === "Court of Justice of the European Union", src);
  check("  …a company source, quota and refresh noted", (COMPANY_SOURCES as readonly string[]).includes("eu_courts") && QUOTAS.eu_courts.perDay === null && SOURCE_TTL_MINUTES.eu_courts === 1440);
  check("  …scored by the free rule, a unit's row too (\"Lubrizol France SAS\" on Berkshire, batch 184)",
    deterministicScore({ eventId: 0, kind: "regulation", title: "The EU General Court ruled in Lubrizol France SAS v Council (T-369/08)", sourceKey: "eu_courts" }, { kind: "company", displayName: "Berkshire Hathaway", ticker: "BRK-B" }, ["berkshire hathaway"])?.score === 0.95);
  check("  …the ingest asks it for every page; synced monthly by `npm run sync:eu-courts`; credited on the footer and the terms page",
    /await run\("eu_courts", [^\n]+\n\s*euCourtsFor\(client, subjectId,/.test(read("scripts/ingest.ts")) && /"sync:eu-courts": "tsx scripts\/sync-eu-courts\.ts"/.test(read("package.json")) &&
      /judgments of the Court of Justice of the European Union/.test(read("app/layout.tsx").replace(/\s+/g, " ")) && /judgments of the Court of Justice of the European Union/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")));

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
