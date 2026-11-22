/**
 * The European Commission's merger notifications, 1990–2026 (batch 174, the 2026-11-22b proposal 3, approved by the
 * owner that day with call (a): a row on the notification's day, the Commission's clearance a line on that row).
 *
 *   npm run check:eu-mergers
 *
 * Offline: the committed file (`data/eu-mergers.json.gz`, written by `npm run sync:eu-mergers` from the lists the
 * Publications Office's SPARQL endpoint gave and the texts CELLAR served on 2026-11-22), a slice of those texts
 * (scripts/fixtures/eu-mergers-texts.json.gz), and the first trading days the other checks' fixtures carry.
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
import {
  NOT_THE_COMPANY,
  caseOf,
  clearanceOf,
  euEvents,
  euMergers,
  firstParagraph,
  isCorrigendum,
  noticeParties,
  noticeText,
  notifiedOn,
  titleKey,
  titleParties,
} from "../lib/euMergers";
import { companyNames } from "../lib/frCompany";
import { euMergersFor } from "../lib/ingest/euMergersFor";
import { namesForYear } from "../lib/ingest/frBackfill";
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
  notifications: 10_264,
  // the 8,507 notices of non-opposition listed, less the 42 whose title gives no case number
  clearances: 8_465,
  texts: 2_479,
  withParties: 2_456,
  // every listed company in the index, under the rule, its names as the replay below builds them
  total: 1_853,
  companies: 422,
  // from first prices, for the companies the fixtures read
  fromFirst: 733,
  fromFirstPages: 158,
  fromFirst2017: 450,
  top: "GS 100, DB 31, GE 23, BN 18, BP 15, IBM 15, BA 13, SHEL 13, TPG 13, BRK-B 12",
};

const companies = (tickerIndex as unknown as { companies: [number, string, string][] }).companies;
const titleOf = (cik: number) => companies.find((c) => c[0] === cik)![2];
/** A company's names of a year as ingest builds them, less the former names only the database holds. */
const namesOf = (cik: number, extra: (year: number) => string[] = () => []) => (year: number) => {
  const title = titleOf(cik);
  const own = dojPossessive(title, possessiveNameFor(cik));
  return [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title), ...extra(year)];
};
const { notifications, clearances } = euMergers();
const on = (cik: number, from = "", extra?: (year: number) => string[]) => euEvents(notifications, clearances, namesOf(cik, extra), { cik, from, namesOn: (d) => releaseNamesOn(cik, d) });
const caseOn = (cik: number, c: string, extra?: (year: number) => string[]) => on(cik, "", extra).find((e) => e.externalId?.split(",").includes(c));

async function main(): Promise<void> {
  const slice = JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", "eu-mergers-texts.json.gz"))).toString()) as { texts: Record<string, { kind: "xhtml" | "pdf"; raw: string }> };
  const para = (c: string) => firstParagraph(noticeText(slice.texts[c].raw, slice.texts[c].kind)) ?? "";

  console.log("The titles");
  check("a title's case number in every era's form: \"Case No IV/M.877\", \"IV/M 004\", \"COMP/M.3083\", \"M.12513\"",
    caseOf("Prior notification of a concentration (Case No IV/M.877 - Boeing/McDonnell Douglas)") === "M.877" &&
      caseOf("Prior notification of a concentration (Case No IV/M 004-Renault/Volvo) — Council Regulation (EEC) No 4064/89") === "M.4" &&
      caseOf("Prior notification of a concentration (Case COMP/M.3083 — GE/Instrumentarium) (Text with EEA relevance)") === "M.3083" &&
      caseOf("Prior notification of a concentration (Case M.12513 – AEQUITA / SABIC EUROPE) – Candidate case for simplified procedure") === "M.12513");
  check("  …its parties by their short names, a party's own bracket kept, a joint venture's placeholder off; a corrigendum no notification",
    JSON.stringify(titleParties("Prior notification of a concentration (Case M.10876 – BSA (LACTALIS) / AMBROSI) (Text with EEA relevance)")) === JSON.stringify(["BSA (LACTALIS)", "AMBROSI"]) &&
      JSON.stringify(titleParties("Prior notification of a concentration (Case COMP/M.6474 — GE/Microsoft/JV) Candidate case for simplified procedure")) === JSON.stringify(["GE", "Microsoft"]) &&
      titleKey("Procter & Gamble Co.") === titleKey("PROCTER AND GAMBLE") && isCorrigendum("Corrigendum to Prior notification of a concentration (Case No IV/M.398)"));

  console.log("\nThe texts");
  const m7435 = para("M.7435");
  check("M.7435 (2015): received on 2015-04-21, a week before its publication; Merck KGaA acquires Sigma-Aldrich Corporation",
    notifiedOn(m7435) === "2015-04-21" &&
      JSON.stringify(noticeParties(m7435).map((p) => [p.name, p.role])) === JSON.stringify([["Merck KGaA", "acquiring"], ["Sigma-Aldrich Corporation", "acquired"]]),
    noticeParties(m7435));
  const m877 = para("M.877");
  check("M.877 (1997), a PDF's text: The Boeing Company acquires McDonnell Douglas Corporation, received on 1997-02-18",
    notifiedOn(m877) === "1997-02-18" && noticeParties(m877).some((p) => p.name === "The Boeing Company" && p.role === "acquiring") && noticeParties(m877).some((p) => /^McDonnell Douglas Corporation$/.test(p.name) && p.role === "acquired"),
    noticeParties(m877));
  const shazam = noticeParties(para("M.8788"));
  check("the list form since 2016: \"This notification concerns the following undertakings: — Apple Inc. (United States), — Shazam … Apple Inc. acquires\"",
    shazam.some((p) => p.name === "Apple Inc." && p.role === "acquiring") && shazam.some((p) => p.name === "Shazam Entertainment Limited" && p.role === "acquired"), shazam);
  const fitbit = noticeParties(para("M.9660"));
  const verily = noticeParties(para("M.8991"));
  check("  …a controller takes its unit's part (\"Verily Life Sciences LLC, belonging to Alphabet Inc.\"); a sentence is never cut at \"Inc.\"",
    verily.some((p) => p.name === "Alphabet Inc." && p.role === "acquiring") && fitbit.some((p) => /^Google LLC$/.test(p.name) && p.role === "acquiring") && fitbit.some((p) => /^Fitbit/.test(p.name) && p.role === "acquired"),
    { verily, fitbit });
  const walmart = noticeParties(para("M.1612"));
  const chase = noticeParties(para("M.642"));
  check("a notice that writes no bracket after its parties: Walmart Stores Inc. acquires ASDA (1999), Chase Manhattan and Chemical Banking merge (1995); the 1998 PDFs' \"@\" read as \"&\" (Johnson & Johnson's DePuy)",
    walmart.some((p) => p.name === "Walmart Stores Inc." && p.role === "acquiring") && walmart.some((p) => /^ASDA Group/.test(p.name) && p.role === "acquired") &&
      chase.filter((p) => p.role === "merging").length === 2 && noticeParties(para("M.1286")).some((p) => p.name === "Johnson & Johnson" && p.role === "acquiring"),
    { walmart, chase });

  console.log("\nThe committed file");
  const file = JSON.parse(gunzipSync(readFileSync(join(__dirname, "..", "data", "eu-mergers.json.gz"))).toString()) as { read: string };
  const withParties = notifications.filter((n) => n.read && n.parties.length).length;
  check(`the lists of 2026-11-22: ${EXPECTED.notifications.toLocaleString("en-US")} notifications from 1990-10-09 and ${EXPECTED.clearances.toLocaleString("en-US")} notices of non-opposition with a case number; ${EXPECTED.texts.toLocaleString("en-US")} candidates' texts read, ${EXPECTED.withParties.toLocaleString("en-US")} of them naming their parties`,
    file.read === "2026-11-22" && notifications.length === EXPECTED.notifications && clearances.length === EXPECTED.clearances && notifications.filter((n) => n.read).length === EXPECTED.texts && withParties === EXPECTED.withParties &&
      notifications[0].published === "1990-10-09" && !notifications.some((n) => isCorrigendum(n.title)),
    { read: file.read, n: notifications.length, c: clearances.length, texts: notifications.filter((n) => n.read).length, withParties });
  check("  …every notification with its work, day and title; none listed twice",
    notifications.every((n) => /^[0-9a-f-]{36}$/.test(n.work) && /^\d{4}-\d{2}-\d{2}$/.test(n.published) && n.title) && new Set(notifications.map((n) => n.work)).size === notifications.length);

  console.log("\nThe rule and the rows");
  const beats = caseOn(320193, "M.7290");
  const oracle = caseOn(1341439, "M.5529");
  const boeing = caseOn(12927, "M.877");
  const pg = caseOn(80424, "M.3732");
  check("M.7290 Apple/Beats lands on AAPL, M.5529 Oracle/Sun Microsystems on ORCL, M.877 Boeing/McDonnell Douglas on BA and M.3732 Procter & Gamble/Gillette on PG",
    !!beats && !!oracle && !!boeing && !!pg && beats.sourceKey === "eu_mergers" && /^European Commission received notification of Oracle Corporation's acquisition of Sun Microsystems, Inc\. \(M\.5529\)$/.test(oracle.title),
    [beats?.title, oracle?.title, boeing?.title, pg?.title]);
  check("M.7435 Merck/Sigma-Aldrich stays off MRK, its text naming Merck KGaA, and M.5502 Merck/Schering-Plough lands on MRK",
    !caseOn(310158, "M.7435") && !!caseOn(310158, "M.5502"), caseOn(310158, "M.7435")?.title);
  check("  …EQT/Investindustrial (M.10202) stays off EQT, and ADP/JCDecaux (M.11023), Aéroports de Paris's, off ADP",
    !caseOn(33213, "M.10202") && !caseOn(8670, "M.11023"));
  check("the row is dated by the day the Commission received the notification, M.7435's 2015-04-21, not its publication of 2015-04-28",
    (oracle?.date ?? "") < "2009-08-05" && notifications.find((n) => n.case === "M.7435")?.day === "2015-04-21", [oracle?.date]);
  const cleared = beats;
  check("  …a case with a notice of non-opposition carries it as a line (Apple/Beats, M.7290, published 2014-08-09), one without none (Microsoft/LinkedIn, M.8124, cleared with commitments); the row never says the deal closed",
    /The Commission's decision not to oppose it was published on August 9, 2014\./.test(cleared?.description ?? "") && /a notification is not a clearance or a closing/.test(cleared?.description ?? "") &&
      clearanceOf({ case: "M.7290", published: "2014-07-02" }, clearances)?.published === "2014-08-09" && !clearanceOf({ case: "M.8124", published: "2016-10-21" }, clearances) &&
      !/not to oppose/.test(caseOn(789019, "M.8124")?.description ?? "not to oppose"),
    cleared?.description);
  check("every namesake read by hand says why", Object.values(NOT_THE_COMPANY).flat().every((n) => n.why.length > 30));

  console.log("\nEvery listed company");
  const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const first: Record<string, string> = {};
  for (const [f, k] of [["digest-1985-entries.json.gz", "firstPrices"], ["eeoc-listing.json.gz", "first"], ["fda-device-recalls.json.gz", "first"], ["occ-actions.json.gz", "first"]] as const) {
    Object.assign(first, JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", f))).toString())[k]);
  }
  const readOnes = notifications.filter((n) => n.read && n.parties.length);
  const letters = readOnes.map((n) => n.parties.map((p) => alnum(p.name)).join("|"));
  const unitYears = Array.from({ length: 37 }, (_, k) => `${1990 + k}-07-01`);
  const rows: { ticker: string; date: string; first: string | null }[] = [];
  const seen = new Set<number>();
  for (const [cik, ticker] of companies) {
    if (seen.has(cik)) continue;
    seen.add(cik);
    const pre = [...new Set([...namesOf(cik)(2026), ...unitYears.flatMap((d) => releaseNamesOn(cik, d))].flatMap(andSpellings).map(alnum).filter((n) => n.length >= 3))];
    const mine = readOnes.filter((_, j) => pre.some((p) => letters[j].includes(p)));
    if (!mine.length) continue;
    for (const e of euEvents(mine, clearances, namesOf(cik), { cik, namesOn: (d) => releaseNamesOn(cik, d) })) rows.push({ ticker, date: e.date, first: first[ticker] ?? null });
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
  const step = await euMergersFor(fakeDb("1980-12-12"), 1, { edgarName: "Apple Inc.", alsoKnownAs: newsNamesFor(320193), cik: 320193 });
  check("the company's notifications from its first price, with no request, as a complete answer", step.outcome === "ok" && step.events.length === on(320193, "1980-12-12").length && !!step.complete,
    `${step.outcome} ${step.events.length}`);
  const none = await euMergersFor(fakeDb(null), 1, { edgarName: "Apple Inc.", alsoKnownAs: [], cik: 320193 });
  const fund = await euMergersFor(fakeDb("1980-12-12"), 1, { edgarName: "Apple Inc.", alsoKnownAs: [], cik: 320193, fundSeries: true });
  check("  …asked again while it has no prices, and none for a fund's series", none.outcome === "error" && /no prices/.test(none.detail ?? "") && fund.events.length === 0 && fund.outcome === "empty");

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "eu_mergers");
  check("the source is id 50, reusable commercially under Decision 2011/833/EU, reviewed 2026-11-22, credited \"© European Union, https://eur-lex.europa.eu\"",
    src?.id === 50 && /Decision 2011\/833\/EU/.test(src.license) && src.commercialOk && src.reviewedOn === "2026-11-22" && src.attribution === "© European Union, https://eur-lex.europa.eu", src);
  check("  …a company source, quota and refresh noted, scored without the model, a multi-party source whose rows join their case numbers",
    (COMPANY_SOURCES as readonly string[]).includes("eu_mergers") && QUOTAS.eu_mergers.perDay === null && SOURCE_TTL_MINUTES.eu_mergers === 1440 &&
      deterministicScore({ eventId: 0, kind: "regulation", title: "European Commission received notification", sourceKey: "eu_mergers" }, { kind: "company", displayName: "Apple", ticker: "AAPL" }, ["apple"])?.score === 0.95 &&
      ALSO_ON_SOURCES.includes("eu_mergers") && GROUPED_ROW_SOURCES.includes("eu_mergers") && /WHERE source_id IN \([^)]*\b50\)/.test(read("db/059_also_on_eu_mergers.sql")));
  check("  …the ingest asks it for every company", /await run\("eu_mergers", [^\n]+\n\s*euMergersFor\(client, subjectId, \{[^}]*cik: company\.cik, fundSeries \}\),/.test(read("scripts/ingest.ts")));
  check("  …synced monthly by `npm run sync:eu-mergers`, and credited with the European Union's notice",
    /"sync:eu-mergers": "tsx scripts\/sync-eu-mergers\.ts"/.test(read("package.json")) &&
      /merger notifications from the European Commission&apos;s Official Journal \(© European Union, https:\/\/eur-lex\.europa\.eu\)/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /merger notifications from the European Commission&apos;s Official Journal \(© European Union, https:\/\/eur-lex\.europa\.eu\)/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")));

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
