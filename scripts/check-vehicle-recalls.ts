import { readFileSync } from "node:fs";
import { join } from "node:path";
import tickerIndex from "../data/edgar-tickers.json";
import { RECALL_FLOOR, RECALL_MAKERS, fetchRecalls, recallEvents, recallHeadline, recallMakersFor, recallQuery, type RecallRow } from "../lib/recalls";
import { SOURCES } from "../lib/ingest/store";
import { deterministicScore } from "../lib/enrich/relevance";
import { MARKER_STYLE } from "../lib/markers";
import { COMPANY_SOURCES } from "./ingest";

/**
 * Vehicle safety recalls from NHTSA on carmakers' pages (batch 30).
 *
 *   npm run check:vehicle-recalls
 *
 * The rows are real, read from data.transportation.gov on 2026-10-22
 * (scripts/fixtures/nhtsa-recalls.json): one from each era of subject line, the two sides of
 * Stellantis's 2014-10-12 boundary, a recall under the floor, another maker's recall, a tyre and an
 * equipment recall. Offline: the one fetch is mocked.
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
const rows: RecallRow[] = JSON.parse(read("scripts/fixtures/nhtsa-recalls.json"));
const makersOf = (ticker: string) => Object.values(RECALL_MAKERS).find((e) => e.ticker === ticker)!.makers;
const fordEvents = recallEvents(rows, makersOf("F"));
const titleOf = (id: string) => fordEvents.find((e) => e.externalId === id)?.title;

async function main(): Promise<void> {
  console.log("\nA recall's subject line, readable in every era");
  check("a 1966 component code cut at 50 characters gives way to the plain component",
    titleOf("66V004002") === "Recall of 65,000 vehicles: Seat belts", titleOf("66V004002"));
  check("  …and an uncut code reads as a part and its pieces",
    titleOf("67V018000") === "Recall of 217,000 vehicles: Brakes: hydraulic, power assist, booster" &&
      titleOf("66V012000") === "Recall of 47,300 vehicles: Fuel: throttle linkages and control", titleOf("67V018000"));
  check("the shouting middle years are lowered, the maker's own name dropped",
    titleOf("11V385000") === "Recall of 1,100,000 vehicles: Fuel tank strap corrosion" &&
      titleOf("96V007000") === "Recall of 10,600 vehicles: Air conditioner: climate control module", titleOf("96V007000"));
  check("  …while a safety standard, an acronym and a model keep their capitals",
    recallMakersFor(1467858) !== null && recallEvents(rows, makersOf("GM"))[0]?.title === "Recall of 432,183 vehicles: FMVSS 301" &&
      recallHeadline("ABS CONTROL MODULE/2004 F-150") === "ABS control module/2004 F-150",
    recallEvents(rows, makersOf("GM"))[0]?.title);
  check("a recent subject line is left as written, with its summary",
    titleOf("26V653000") === "Recall of 102,159 vehicles: Inaccurate Speedometer and Tachometer Display/FMVSS 101" &&
      /^Ford Motor Company \(Ford\) is recalling/.test(fordEvents.find((e) => e.externalId === "26V653000")?.description ?? "") &&
      (fordEvents.find((e) => e.externalId === "26V653000")?.description ?? "").length <= 400);
  check("  …but a summary in capitals is left out: the subject line carries its gist",
    fordEvents.find((e) => e.externalId === "11V385000")?.description === undefined);
  check("tyres and equipment are counted as what they are",
    recallEvents(rows, makersOf("GT"))[0]?.title === "Recall of 10,000 tires: Tires: tread" && /^Recall of 172,000 units: /.test(titleOf("90E043001") ?? ""),
    `${recallEvents(rows, makersOf("GT"))[0]?.title} | ${titleOf("90E043001")}`);

  console.log("\nA recall reaches only the company whose maker filed it");
  check("Ford's page gets Ford's recalls at the floor and nothing else",
    fordEvents.length === 7 && fordEvents.every((e) => e.externalId && !["96V234000", "26V630000", "26V655000"].includes(e.externalId)),
    fordEvents.map((e) => e.externalId).join(" "));
  check(`  …a recall of fewer than ${RECALL_FLOOR.toLocaleString("en-US")} vehicles stays off (26V655000, 2,276)`,
    !fordEvents.some((e) => e.externalId === "26V655000"));
  const stla = recallEvents(rows, makersOf("STLA"));
  check("Chrysler counts for Stellantis from 2014-10-12, when FCA N.V. became its parent: a recall four days earlier does not",
    stla.length === 1 && stla[0].externalId === "14V643000" && stla[0].date === "2014-10-14", stla.map((e) => `${e.externalId} ${e.date}`).join(" "));
  check("  …and the rule holds whatever the dataset answers, not only in the query",
    !recallEvents(rows, makersOf("STLA")).some((e) => e.date < "2014-10-12"));
  check("Indian's recalls are Polaris's after the 2011 purchase",
    recallEvents(rows, makersOf("PII")).map((e) => e.externalId).join() === "24V069000");
  check("another maker's recall reaches no mapped company (Volkswagen)",
    Object.values(RECALL_MAKERS).every((e) => !recallEvents(rows, e.makers).some((ev) => ev.externalId === "26V630000")));
  const ev = fordEvents.find((e) => e.externalId === "11V385000")!;
  check("each one is the campaign: a recall event, NHTSA's page for it, one identity however often it is read",
    ev.type === "recall" && ev.sourceKey === "nhtsa_recalls" && ev.date === "2011-07-29" && ev.dedupBasis === "nhtsa:11V385000" &&
      ev.url === "https://www.nhtsa.gov/recalls?nhtsaId=11V385000" && ev.source === "NHTSA");
  check("  …a campaign read twice is one event, and a malformed one none",
    recallEvents([...rows, rows[3], { ...rows[3], nhtsa_id: "11V385000; DROP" }, { ...rows[3], nhtsa_id: "11V385001", report_received_date: "July 2011" }], makersOf("F")).length === 7);

  console.log("\nThe map from makers to listed companies");
  const listed = new Map((tickerIndex as unknown as { companies: [number, string, string][] }).companies.map(([cik, t]) => [`${cik}:${t}`, true]));
  const entries = Object.entries(RECALL_MAKERS);
  check("every company it names is in the committed EDGAR index under its ticker",
    entries.every(([cik, e]) => listed.has(`${cik}:${e.ticker}`)), entries.filter(([cik, e]) => !listed.has(`${cik}:${e.ticker}`)).map(([, e]) => e.ticker).join(", "));
  const names = entries.flatMap(([, e]) => e.makers.map((m) => m.name));
  check("no maker belongs to two companies", new Set(names).size === names.length);
  check("every maker says why it is the company's, and a start day is a real day",
    entries.every(([, e]) => e.makers.every((m) => m.why.length > 10 && (!m.from || /^\d{4}-\d{2}-\d{2}$/.test(m.from)))));
  check("GM keeps old GM's recalls (it carries old GM's ticker); Ford's are all its own",
    makersOf("GM").every((m) => !m.from) && makersOf("F").every((m) => !m.from));
  check("a company that makes no vehicles has no makers", recallMakersFor(320193) === null && recallMakersFor("0000037996") !== null);

  console.log("\nOne request per company");
  const q = decodeURIComponent(recallQuery(makersOf("STLA")).replace(/\+/g, " "));
  check("a dated maker is asked for from its day, at the floor",
    q.includes("(manufacturer = 'Chrysler (FCA US, LLC)' AND report_received_date >= '2014-10-12T00:00:00')") && q.includes(`potentially_affected >= ${RECALL_FLOOR}`), q.slice(0, 200));
  const fq = decodeURIComponent(recallQuery(makersOf("PCAR")).replace(/\+/g, " "));
  check("  …and a company's own makers in one list", fq.includes("manufacturer IN ('PACCAR Incorporated', 'PETERBILT MOTOR COMPANY')"), fq.slice(0, 200));
  check("  …with a quote in a name doubled, as the dataset's query language wants",
    decodeURIComponent(recallQuery([{ name: "O'Neill Motors", why: "a test maker" }]).replace(/\+/g, " ")).includes("'O''Neill Motors'"));

  const realFetch = globalThis.fetch;
  let asked: string[] = [];
  const answer = (status: number, body: unknown) => {
    asked = [];
    globalThis.fetch = (async (u: RequestInfo | URL) => {
      asked.push(String(u));
      return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
    }) as typeof fetch;
  };
  try {
    answer(200, rows);
    const none = await fetchRecalls(320193);
    check("a company with no mapped maker costs no request", none.outcome === "empty" && asked.length === 0);
    const ford = await fetchRecalls(37996);
    check("Ford's request goes to the Transportation Department's dataset and comes back as its events",
      ford.outcome === "ok" && ford.events.length === 7 && asked.length === 1 && asked[0].startsWith("https://data.transportation.gov/resource/6axg-epim.json?"));
    answer(429, "slow down");
    check("a throttle is reported as one", (await fetchRecalls(37996)).outcome === "throttled");
    answer(500, "oops");
    check("  …a server error as an error", (await fetchRecalls(37996)).outcome === "error");
    answer(200, { error: true, message: "query failed" });
    const odd = await fetchRecalls(37996);
    check("  …and an answer that is not a list as an error, never as no recalls", odd.outcome === "error" && odd.events.length === 0);
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "nhtsa_recalls");
  check("the source is registered as public domain, cleared for commercial use, with the day it was read",
    src?.license === "public domain" && src.commercialOk && /^2026-10-22$/.test(src.reviewedOn ?? ""), JSON.stringify(src));
  check("a recall is scored without the model, as a filing is",
    deterministicScore({ kind: "recall", title: ev.title } as never, { kind: "company", displayName: "FORD MOTOR CO", ticker: "F" }, ["ford"])?.score === 1);
  check("it has a chart marker of its own", MARKER_STYLE.recall.text === "R");
  const ingest = read("scripts/ingest.ts");
  check("company ingest asks for recalls only for a mapped maker",
    (COMPANY_SOURCES as readonly string[]).includes("nhtsa_recalls") &&
      /const makers = recallMakersFor\(company\.cik\);\s*if \(makers\) \{\s*await run\("nhtsa_recalls"/.test(ingest) && /fetchRecalls\(company\.cik\)/.test(ingest));
  check("the company page has a Recalls chip", /\{ key: "recall", label: "Recalls" \}/.test(read("components/CompanyExplorer.tsx")));
  check("the database knows the kind: a migration for existing databases, the schema for new ones",
    /ADD VALUE IF NOT EXISTS 'recall'/.test(read("db/028_recall_kind.sql")) && /'macro','recall'\)/.test(read("db/001_init.sql")) &&
      /'macro','recall'\)/.test(read("docs/EVENTS-SCHEMA.md")));
  check("NHTSA is credited where the other sources are",
    /vehicle recalls from\s+the National Highway Traffic Safety Administration/.test(read("app/layout.tsx")) &&
      /vehicle recalls from the National Highway Traffic Safety Administration/.test(read("app/legal/terms/page.tsx")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

main();
