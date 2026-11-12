import { readFileSync } from "node:fs";
import { join } from "node:path";
import tickerIndex from "../data/edgar-tickers.json";
import { RECALL_FLOOR, RECALL_MAKERS, fetchRecalls, recallEvents, recallHeadline, recallMakersFor, recallQuery, type RecallMaker, type RecallRow } from "../lib/recalls";
import { fetchInvestigations, investigationEvents, investigationQuery, isInvestigation, type InvestigationRow } from "../lib/investigations";
import { markerPriority, markerStyle } from "../lib/markers";
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
 * equipment recall. Offline: the one fetch is mocked. Batch 77 adds the brands Ford and GM sold
 * (scripts/fixtures/nhtsa-sold-brands.json).
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
// a company the map lacks has no makers: its checks fail, rather than the run stopping (batch 123)
const makersOf = (ticker: string): readonly RecallMaker[] => Object.values(RECALL_MAKERS).find((e) => e.ticker === ticker)?.makers ?? [];
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
  // batch 31: makers a mapped company bought count from the closing date its own filings give
  const thor = recallEvents(rows, makersOf("THO")).map((e) => e.externalId).sort().join(" ");
  check("Thor gets Keystone's, Jayco's, K.Z.'s and Tiffin's recalls from the day it bought each",
    thor === "17V746000 17V749000 17V755000 21V680000", thor);
  check("  …and none from before: Jayco 2013, K.Z. 2013 (closed 2014-05-01, not 2016), Tiffin 2017",
    !/13V585000|13V490000|17V841000/.test(thor) && makersOf("THO").find((m) => m.name === "K.Z., Inc.")?.from === "2014-05-01");
  check("Winnebago gets Grand Design's, Berkshire Hathaway Forest River's",
    recallEvents(rows, makersOf("WGO")).some((e) => e.externalId === "21V393000") &&
      recallEvents(rows, makersOf("BRK-B")).map((e) => e.externalId).join() === "17V756000");
  check("every bought maker's day cites the filing that gives it",
    ["THO", "WGO", "BRK-B"].every((t) => makersOf(t).filter((m) => m.from).every((m) => /\((Thor|Winnebago|Berkshire)'s (8-K|10-K|10-Q) filed \d{4}-\d{2}-\d{2}\)$/.test(m.why))));

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
  // since batch 123 one name may be on two pages, never on the same day: Carrier is RTX's to its
  // separation and Carrier Global's after
  const holders = entries.flatMap(([, e]) => e.makers.map((m) => ({ ticker: e.ticker, m })));
  const shared = holders.filter((a, i) => holders.some((b, j) => j !== i && b.m.name === a.m.name));
  const overlap = shared.filter((a) => shared.some((b) => b !== a && b.m.name === a.m.name && (a.m.from ?? "") <= (b.m.to ?? "9999") && (b.m.from ?? "") <= (a.m.to ?? "9999")));
  check("no maker belongs to two companies on the same day: only Carrier Corporation is on two pages, RTX's to 2020-04-01 and Carrier Global's from 2020-04-02",
    overlap.length === 0 && [...new Set(shared.map((x) => x.m.name))].join() === "Carrier Corporation" && shared.map((x) => x.ticker).sort().join() === "CARR,RTX",
    shared.map((x) => `${x.ticker} ${x.m.name} ${x.m.from ?? ""}..${x.m.to ?? ""}`).join("; "));
  check("every maker says why it is the company's, and a start day is a real day",
    entries.every(([, e]) => e.makers.every((m) => m.why.length > 10 && (!m.from || /^\d{4}-\d{2}-\d{2}$/.test(m.from)))));
  const own = (ticker: string, name: string) => makersOf(ticker).find((m) => m.name === name);
  check("GM keeps old GM's recalls (it carries old GM's ticker); Ford's own are all its own",
    !!own("GM", "General Motors, LLC") && !own("GM", "General Motors, LLC")?.from && !own("GM", "General Motors, LLC")?.to &&
      !!own("F", "Ford Motor Company") && !own("F", "Ford Motor Company")?.from && !own("F", "Ford Motor Company")?.to);
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
  check("NHTSA is credited where the other sources are, for its recalls and its investigations (batch 66)",
    /vehicle recalls and\s+defect investigations from the National Highway Traffic Safety Administration/.test(read("app/layout.tsx")) &&
      /vehicle recalls and defect investigations from the National Highway Traffic Safety\s+Administration/.test(read("app/legal/terms/page.tsx")));

  /**
   * NHTSA's defect investigations (batch 66, the 2026-10-26 proposal 4). The rows are real, read
   * from data.transportation.gov on 2026-10-27 (scripts/fixtures/nhtsa-investigations.json):
   * Toyota's 2010 acceleration query, Tesla's open FSD analysis, Ford's oldest engineering analysis
   * and a petition still open, GM's newest query, the two sides of Stellantis's 2014-10-12 boundary,
   * and another maker's audit.
   */
  console.log("\nNHTSA's defect investigations, with the recalls (batch 66)");
  const invRows: InvestigationRow[] = JSON.parse(read("scripts/fixtures/nhtsa-investigations.json"));
  const inv = (ticker: string) => investigationEvents(invRows, makersOf(ticker));
  const toyota = inv("TM").find((e) => e.externalId === "RQ10003");
  check("Toyota's 2010 acceleration query lands on its page, on the day it opened, under the Recalls tag",
    toyota?.date === "2010-02-16" && toyota.type === "recall" && toyota.title === "NHTSA opened a recall query: Unintended and Uncontrolled Acceleration",
    toyota ? `${toyota.date} ${toyota.type}: ${toyota.title}` : "missing");
  check("  …one row, its closing said in it, never a second event (the owner's call)",
    inv("TM").filter((e) => e.externalId === "RQ10003").length === 1 &&
      toyota?.description === "NHTSA investigation RQ10003 (Recall Query) into Toyota Motor Corporation. Closed 2011-03-01; NHTSA links it to recall 11V115.",
    toyota?.description);
  const tesla = inv("TSLA")[0];
  check("an investigation still open says so", tesla?.externalId === "EA26002" && tesla.description === "NHTSA investigation EA26002 (Engineering Analysis) into Tesla, Inc. Still open." &&
    tesla.title === "NHTSA opened an engineering analysis: FSD Collisions in Reduced Roadway Visibility Conditions", `${tesla?.title} / ${tesla?.description}`);
  const fordInv = inv("F");
  check("Ford's 1983 engineering analysis reads as a sentence, its capitals lowered as a recall's are",
    fordInv.find((e) => e.externalId === "EA83013")?.title === "NHTSA opened an engineering analysis: Front seatback failure",
    fordInv.find((e) => e.externalId === "EA83013")?.title);
  check("  …and a defect petition is a review of one, not a finding", fordInv.some((e) => e.externalId === "DP26011" && /^NHTSA opened a review of a defect petition: /.test(e.title)));
  const stlaInv = inv("STLA").map((e) => e.externalId);
  check("Chrysler's investigation from before 2014-10-12 is refused for Stellantis, the one after kept",
    !stlaInv.includes("DP14004") && stlaInv.includes("AQ14003"), stlaInv.join(","));
  check("another maker's investigation reaches no mapped company",
    !Object.values(RECALL_MAKERS).some((c) => investigationEvents(invRows, c.makers).some((e) => e.externalId === "AQ08001")));
  check("the query asks a dated maker only from its day, every other mapped maker in full",
    (new URL(investigationQuery(makersOf("STLA"))).searchParams.get("$where") ?? "").includes("manufacturer = 'Chrysler (FCA US, LLC)' AND open_date >= '2014-10-12T00:00:00'") &&
      new URL(investigationQuery(makersOf("TSLA"))).searchParams.get("$where") === "manufacturer IN ('Tesla, Inc.')",
    new URL(investigationQuery(makersOf("TSLA"))).searchParams.get("$where") ?? "");
  check("each has its own identity, apart from any recall's", toyota?.dedupBasis === "nhtsa-inv:RQ10003" && toyota.sourceKey === "nhtsa_investigations");
  check("on the chart it is a dot ranked like news, never the R a recall made gets",
    !!toyota && isInvestigation(toyota) && markerStyle(toyota).text === "" && markerPriority(toyota) < markerPriority({ type: "recall", title: "Recall of 10,000 vehicles: x" }));
  const scored = toyota && deterministicScore({ kind: "recall", title: toyota.title, sourceKey: "nhtsa_investigations" } as never, { kind: "company", displayName: "TOYOTA MOTOR CORP", ticker: "TM" }, ["toyota"]);
  check("  …and is scored without the model, saying it is an investigation", scored?.score === 1 && /investigation NHTSA opened/.test(scored.reason), scored?.reason);
  let invAsked = 0;
  try {
    globalThis.fetch = (async () => (invAsked++, new Response(JSON.stringify(invRows), { status: 200 }))) as typeof fetch;
    const none = await fetchInvestigations(320193);
    const f = await fetchInvestigations(37996);
    check("an unmapped company asks nothing; a mapped one asks once", invAsked === 1 && none.outcome === "empty" && f.outcome === "ok" && f.events.length === 2,
      `${invAsked} asked, ${f.events.length} of Ford's`);
  } finally {
    globalThis.fetch = realFetch;
  }
  const invSrc = SOURCES.find((s) => s.key === "nhtsa_investigations");
  check("the source is registered as public domain, cleared for commercial use, with the day it was read",
    invSrc?.license === "public domain" && invSrc.commercialOk && invSrc.reviewedOn === "2026-10-27", JSON.stringify(invSrc));
  check("company ingest asks for them beside the recalls, for a mapped maker only",
    (COMPANY_SOURCES as readonly string[]).includes("nhtsa_investigations") &&
      /if \(makers\) \{\s*await run\("nhtsa_recalls"[^\n]*\n[^\n]*\n\s*await run\("nhtsa_investigations", [^\n]*fetchInvestigations\(company\.cik\)\);\s*\}/.test(ingest));

  /**
   * The brands Ford and GM sold count for them while they owned them (batch 77, the 2026-10-28
   * proposal 5; the owner's call of 2026-10-29). The rows are real, read from data.transportation.gov
   * on 2026-10-30 (scripts/fixtures/nhtsa-sold-brands.json), on both sides of every day Ford or GM
   * bought a brand and sold it, and under the names of the brands' later owners.
   */
  console.log("\nThe brands Ford and GM sold, on their pages while they owned them (batch 77)");
  const sold: { recalls: RecallRow[]; investigations: InvestigationRow[] } = JSON.parse(read("scripts/fixtures/nhtsa-sold-brands.json"));
  const soldOf = (ticker: string) => recallEvents(sold.recalls, makersOf(ticker));
  const soldInv = (ticker: string) => investigationEvents(sold.investigations, makersOf(ticker));
  const fordSold = soldOf("F");
  const fordTitle = (id: string) => fordSold.find((e) => e.externalId === id)?.title;
  check("a Volvo Car USA recall of 2003 lands on Ford, its title naming the brand",
    fordTitle("03V284000") === "Recall of 220,407 Volvo vehicles: ISOFIX guide" && fordSold.find((e) => e.externalId === "03V284000")?.date === "2003-08-01",
    fordTitle("03V284000"));
  check("  …and so do the first after the purchase on 1999-03-31 and the last before the sale on 2010-08-02",
    !!fordTitle("99V235000") && fordTitle("09V483000") === "Recall of 158,733 Volvo vehicles: Fuel pump leak", fordTitle("09V483000"));
  check("  …but not one of 1998, nor of 2011 or 2016, when Volvo was AB Volvo's and then Geely's",
    !["98V254000", "11V508000", "16V268000"].some((id) => fordTitle(id)));
  check("a Land Rover recall of 2004 lands on Ford, the brand said and its own name dropped from the subject",
    fordTitle("04V005000") === "Recall of 100,174 Land Rover vehicles: ABS valve cover bolt" && !!fordTitle("08V055000"), fordTitle("04V005000"));
  check("  …but not BMW's of 1999, nor one two days after the sale to Tata on 2008-06-02, filed under the same name",
    !fordTitle("99V237000") && !fordTitle("08V248000"));
  check("Jaguar Land Rover North America's recall of 2015, Tata's, reaches no mapped company",
    Object.values(RECALL_MAKERS).every((c) => !recallEvents(sold.recalls, c.makers).some((e) => e.externalId === "15V039000")));
  check("Jaguar's recalls are Ford's from 1990 to the sale, under both of Jaguar's names",
    !!fordTitle("90V023000") && !!fordTitle("06V418000") && fordTitle("90V123000") === "Recall of 35,000 Jaguar vehicles: Fuel: fuel tank assembly, tank",
    fordTitle("90V123000"));
  check("  …but not those of 1985, 1988 and 2009",
    !["85V059000", "88V018000", "09V144000"].some((id) => fordTitle(id)));
  const gmSold = soldOf("GM");
  check("a 2004 Saab recall lands on GM, both makers' names dropped from \"GM/SAAB/FUEL PUMP\"",
    gmSold.find((e) => e.externalId === "04V557000")?.title === "Recall of 17,394 Saab vehicles: Fuel pump", gmSold.find((e) => e.externalId === "04V557000")?.title);
  check("  …and \"SAAB\\AIR BAG MODULE\" of 2001 loses its prefix too",
    gmSold.find((e) => e.externalId === "01V222000")?.title === "Recall of 12,036 Saab vehicles: Air bag module", gmSold.find((e) => e.externalId === "01V222000")?.title);
  check("  …but not one of 1999, when GM held half of Saab, a joint venture",
    !gmSold.some((e) => e.externalId === "99V109000") && gmSold.length === 3, gmSold.map((e) => e.externalId).join(" "));
  check("the rule holds on the rows whatever the query asked: no Ford recall of a sold brand outside its days",
    fordSold.length === 8 && fordSold.every((e) => e.date >= "1990-01-01" && e.date <= "2010-08-01"), fordSold.map((e) => e.externalId).join(" "));
  const fordInvSold = soldInv("F").map((e) => e.externalId);
  check("a Volvo investigation of 2003 lands on Ford, naming the brand",
    soldInv("F").find((e) => e.externalId === "PE03003")?.title === "NHTSA opened a preliminary evaluation (Volvo): Fuel tank leaks" && fordInvSold.includes("PE10025"),
    soldInv("F").find((e) => e.externalId === "PE03003")?.title);
  check("  …a Land Rover one of 2005 and a Jaguar petition of 1998 too, but not Land Rover's of 2016 or Jaguar's of 1989 and 2019",
    fordInvSold.includes("PE05034") && fordInvSold.includes("DP98002") && !["PE16015", "EA90004", "RQ19004", "PE99005"].some((id) => fordInvSold.includes(id)),
    fordInvSold.join(" "));
  check("  …and none filed under Jaguar Land Rover North America reaches a mapped company",
    Object.values(RECALL_MAKERS).every((c) => !investigationEvents(sold.investigations, c.makers).some((e) => e.externalId === "PE25006")));
  const gmInvSold = soldInv("GM").map((e) => e.externalId);
  check("a Saab investigation of 2004 lands on GM, and one of 2009, opened while GM still owned Saab; not one of 1995",
    [...gmInvSold].sort().join(" ") === "EA04008 PE09048" && soldInv("GM").find((e) => e.externalId === "EA04008")?.title === "NHTSA opened an engineering analysis (Saab): Engine stall",
    gmInvSold.join(" "));
  const fordWhere = decodeURIComponent(recallQuery(makersOf("F")).replace(/\+/g, " "));
  check("the request asks each sold brand only between its days",
    fordWhere.includes("manufacturer IN ('Ford Motor Company') OR (manufacturer = 'Volvo Car USA, LLC' AND report_received_date >= '1999-03-31T00:00:00' AND report_received_date <= '2010-08-01T23:59:59')") &&
      (new URL(investigationQuery(makersOf("GM"))).searchParams.get("$where") ?? "").includes("(manufacturer = 'SAAB CARS USA, INC.' AND open_date >= '2000-01-28T00:00:00' AND open_date <= '2010-02-22T23:59:59')"),
    fordWhere.slice(0, 300));
  check("  …and a maker with only an end day is asked to that day",
    decodeURIComponent(recallQuery([{ name: "Old Brand", to: "2001-02-03", why: "a test maker" }]).replace(/\+/g, " ")).includes("((manufacturer = 'Old Brand' AND report_received_date <= '2001-02-03T23:59:59'))"));
  const ended = entries.flatMap(([, e]) => e.makers.filter((m) => m.to));
  check("Ford's four sold makers and GM's Saab carry an end day",
    makersOf("F").filter((m) => m.to).length === 4 && makersOf("GM").filter((m) => m.to).length === 1);
  // batch 148: a maker under another name than the company's names its brand too (Buell, Kelly, Fisher-Price)
  check("  …a maker that ended names its brand, and a brand ends after it begins",
    entries.every(([, e]) => e.makers.every((m) => (!m.to || !!m.brand) && (!m.to || /^\d{4}-\d{2}-\d{2}$/.test(m.to)) && (!m.from || !m.to || m.from < m.to))) &&
      ["Buell", "Kelly", "Fisher-Price"].every((b) => entries.some(([, e]) => e.makers.some((m) => m.brand === b && !m.to))));
  // …and RTX's Carrier since batch 123, whose start is older than the filings here: one day, one filing;
  // Toyota's Hino and Thor California since batch 148, read from the filings' text
  const cites = (m: { why: string }) =>
    (m.why.match(/\((?:old )?(?:Ford|GM|RTX|Toyota|Thor)'s (?:8-K|10-K|10-K405|10-Q|20-F|6-K) filed \d{4}-\d{2}-\d{2}(?:, items? [\d., and]+)?(?:; batch \d+)?\)/g) ?? []).length;
  check("  …and each of its days cites the filing that gives it",
    ended.length === 8 && ended.every((m) => cites(m) >= (m.from ? 2 : 1)), ended.filter((m) => cites(m) < (m.from ? 2 : 1)).map((m) => m.name).join(", "));

  /**
   * The parts, tire, child seat and equipment makers listed companies own (batch 123, the 2026-11-08
   * proposal 3). The rows are real, read from data.transportation.gov on 2026-11-08
   * (scripts/fixtures/nhtsa-owned-makers.json): every recall at the floor and every investigation
   * under the 16 makers batch 123 maps and the six it leaves for a filing's text.
   */
  console.log("\nThe parts, tire, child seat and equipment makers listed companies own (batch 123)");
  const owned: { recalls: RecallRow[]; investigations: InvestigationRow[] } = JSON.parse(read("scripts/fixtures/nhtsa-owned-makers.json"));
  const ownedOf = (ticker: string) => recallEvents(owned.recalls, makersOf(ticker));
  const ownedInv = (ticker: string) => investigationEvents(owned.investigations, makersOf(ticker));
  const idsOf = (ticker: string) => ownedOf(ticker).map((e) => e.externalId);
  const onNoPage = (id: string) => Object.values(RECALL_MAKERS).every((c) => !recallEvents(owned.recalls, c.makers).some((e) => e.externalId === id));
  const graco = ownedOf("NWL").find((e) => e.externalId === "14C001000");
  check("Graco's buckle recall of 2014-02-10, 4,176,601 child seats, lands on Newell, its owner from the Rubbermaid merger of 1999-03-24",
    graco?.date === "2014-02-10" && /^Recall of 4,176,601 child seats: /.test(graco.title) && ownedOf("NWL").length === 12 && makersOf("NWL")[0]?.from === "1999-03-24",
    graco?.title);
  check("  …but its seat recall of 1986 (86C006000) is on no page, and \"GRACO/MISSING HOOKS\" loses its prefix",
    onNoPage("86C006000") && !/^Recall of [\d,]+ child seats: Graco/i.test(ownedOf("NWL").map((e) => e.title).join("\n")) && recallHeadline("GRACO/MISSING HOOKS") === "Missing hooks");
  check("Dana's ten land on Dana, Dana Corporation's of 1978–1990 among them: the record is its own, Dana Corp to 2007",
    ownedOf("DAN").length === 10 && idsOf("DAN").includes("78E012000") && idsOf("DAN").includes("24E048000"), idsOf("DAN").join(" "));
  check("Lippert's nine land on LCI, its 2013 door lock recall of 528,228 the largest",
    ownedOf("LCII").length === 9 && /^Recall of 528,228 units: /.test(ownedOf("LCII").find((e) => e.externalId === "13E067000")?.title ?? ""));
  check("Supreme's recalls of 2016 and 2017 are on no page, its of 2018 on Wabash, its owner from 2017-09-27",
    onNoPage("16V296000") && onNoPage("17V369000") && idsOf("WNC").join() === "18V168000" && makersOf("WNC").find((m) => m.name === "Supreme Corporation")?.from === "2017-09-27");
  const carrier = ownedOf("RTX").find((e) => e.externalId === "16E087000");
  check("Carrier's 2016 starter recall lands on RTX, naming the brand it no longer owns; its 2023 recall on Carrier Global",
    carrier?.title === "Recall of 29,180 Carrier units: Starter Housing May Come Apart" && idsOf("CARR").join() === "23E026000" && !idsOf("RTX").includes("23E026000") && !idsOf("CARR").includes("16E087000"),
    carrier?.title);
  const counts = ["NWL", "DAN", "LCII", "ALV", "CAT", "RTX", "CARR", "SKY", "GE", "HON", "DORM", "PSNY", "ETN", "WGO", "THO", "WNC"].map((t) => `${t} ${ownedOf(t).length}`).join(", ");
  check("Autoliv, Caterpillar, Skyline, GE, Honeywell, Dorman, Polestar, Eaton, Winnebago's towables and Thor's own name each land on their company (Thor 1 before batch 148's Thor California and Thor America)",
    counts === "NWL 12, DAN 10, LCII 9, ALV 6, CAT 5, RTX 4, CARR 1, SKY 4, GE 3, HON 3, DORM 3, PSNY 3, ETN 2, WGO 2, THO 4, WNC 1", counts);
  check("  …a maker's name dropped from an old subject line: GE's \"GE/FMVSS 108/HEADLAMP BULBS\", Honeywell's Prestone",
    ownedOf("GE").find((e) => e.externalId === "01E044000")?.title === "Recall of 90,098 units: FMVSS 108/headlamp bulbs" &&
      /^Recall of 13,706 units: Prestone/i.test(ownedOf("HON").find((e) => e.externalId === "03E022000")?.title ?? ""),
    `${ownedOf("GE").find((e) => e.externalId === "01E044000")?.title} | ${ownedOf("HON").find((e) => e.externalId === "03E022000")?.title}`);
  check("  …Eaton's clutch recall of 2018, filed under Eaton Corporation itself, is Eaton's",
    idsOf("ETN").includes("18E102000") && /Eaton Corporation \(Eaton\) is recalling/.test(ownedOf("ETN").find((e) => e.externalId === "18E102000")?.description ?? ""));
  // batch 148: the six that waited for a filing's text, each day read from www.sec.gov with the build contact
  const invIds = (t: string) => ownedInv(t).map((e) => e.externalId).sort().join(" ");
  const onNoInv = (id: string) => Object.values(RECALL_MAKERS).every((c) => !investigationEvents(owned.investigations, c.makers).some((e) => e.externalId === id));
  const hino = ownedOf("TM");
  check("Hino's six recalls of 2007–2025 land on Toyota, named Hino's, between Toyota's control of August 2001 and its end on 2026-04-01 (on no page before batch 148)",
    hino.map((e) => e.externalId).sort().join(" ") === "07V208000 08V195000 12V555000 20V244000 24V075000 25V057000" &&
      hino.find((e) => e.externalId === "12V555000")?.title === "Recall of 35,142 Hino vehicles: Battery B+ Short Circuit/Possible Fire" &&
      recallEvents([{ ...owned.recalls.find((r) => r.nhtsa_id === "25V057000")!, nhtsa_id: "26V999000", report_received_date: "2026-04-02T00:00:00.000" }], makersOf("TM")).length === 0,
    hino.map((e) => e.externalId).join(" "));
  check("  …Kelly-Springfield's of 1994 and 1998 on Goodyear, named Kelly's, from 1991-10-01, the first day its filings show it held; its 1976 recall and its investigations to August 1991 on no page, its engineering analysis of 1991-12-31 on Goodyear",
    idsOf("GT").sort().join(" ") === "94T007000 98T002000" && ownedOf("GT").find((e) => e.externalId === "98T002000")?.title === "Recall of 594,853 Kelly tires: Sidewall cracks" &&
      onNoPage("76T001000") && invIds("GT") === "EA91059" && ["PE87007", "EA88002", "PE91122"].every(onNoInv),
    `${idsOf("GT").join(" ")}; ${invIds("GT")}`);
  check("  …Buell's three of 1999 and its investigations of 2003 and 2012 on Harley-Davidson, from its purchase in February 1998: Buell Motorcycle Company stayed its subsidiary after Buell's production ended in 2009",
    idsOf("HOG").sort().join(" ") === "99V097000 99V104000 99V105000" && invIds("HOG") === "PE03043 PE12035" &&
      ownedOf("HOG").find((e) => e.externalId === "99V105000")?.title === "Recall of 12,321 Buell vehicles: Fuel tank vent valve assembly",
    `${idsOf("HOG").join(" ")}; ${invIds("HOG")}`);
  check("  …Fisher-Price's child seats of 1994 and 1998 on Mattel, from the merger of 1993-11-30; its ten recalls and six investigations of 1988–1992, a listed company's own then, on no page",
    idsOf("MAT").sort().join(" ") === "94C035000 98C019000" && ownedOf("MAT").find((e) => e.externalId === "98C019000")?.title === "Recall of 54,500 Fisher-Price child seats: Restraint adjuster" &&
      owned.recalls.filter((r) => r.manufacturer === "FISHER-PRICE, INC." && (r.report_received_date ?? "") < "1993").every((r) => onNoPage(r.nhtsa_id ?? "")) && invIds("MAT") === "",
    `${idsOf("MAT").join(" ")}; ${invIds("MAT")}`);
  check("  …Thor California's of 2003 and 2006 and Thor America's of 2007 on Thor, the prefix off its own name; a Thor California recall after the sale of June 2008 on no page",
    ["03V448000", "06V208000", "07V127000"].every((id) => idsOf("THO").includes(id)) && ownedOf("THO").find((e) => e.externalId === "03V448000")?.title === "Recall of 14,522 Thor California vehicles: Samsung/microwave" &&
      recallEvents([{ ...owned.recalls.find((r) => r.nhtsa_id === "06V208000")!, nhtsa_id: "08V999000", report_received_date: "2008-06-02T00:00:00.000" }], makersOf("THO")).length === 0,
    ownedOf("THO").map((e) => e.title).join(" | "));
  const all = Object.values(RECALL_MAKERS).flatMap((c) => recallEvents(owned.recalls, c.makers));
  const allPages = Object.values(RECALL_MAKERS).filter((c) => recallEvents(owned.recalls, c.makers).length).length;
  check("85 recalls on 20 pages, 58 of them before 2017 (69 on 16, 45 before 2017, before batch 148); every maker named once a day",
    all.length === 85 && allPages === 20 && all.filter((e) => e.date < "2017").length === 58 && new Set(all.map((e) => e.externalId)).size === 85,
    `${all.length} on ${allPages}, ${all.filter((e) => e.date < "2017").length} before 2017`);
  const invCounts = ["CAT", "NWL", "DAN", "RTX", "LCII", "ALV", "PSNY"].map((t) => `${t} ${ownedInv(t).length}`).join(", ");
  check("their investigations come with them, on the same days: Caterpillar's ten, Graco's three from 2002, Carrier's three on RTX; Supreme's of 2002 on no page",
    invCounts === "CAT 10, NWL 3, DAN 4, RTX 3, LCII 2, ALV 1, PSNY 1" && Object.values(RECALL_MAKERS).every((c) => !investigationEvents(owned.investigations, c.makers).some((e) => e.externalId === "PE02014")),
    invCounts);
  check("every day a new maker begins or ends on cites the filing list's report that gives it: Newell's 8-K of 1999-03-25, Wabash's of 2017-09-27, RTX's of 2020-04-08",
    /\(Newell's 8-K filed 1999-03-25, item 2\)$/.test(makersOf("NWL")[0]?.why ?? "") && /\(Wabash's 8-K filed 2017-09-27, item 2\.01; batch 123\)$/.test(makersOf("WNC").find((m) => m.from)?.why ?? "") &&
      [makersOf("RTX")[0], makersOf("CARR")[0]].every((m) => /\(RTX's 8-K filed 2020-04-08, items 1\.01 and 2\.01\)/.test(m?.why ?? "")));
  const nwlWhere = decodeURIComponent(recallQuery(makersOf("NWL")).replace(/\+/g, " "));
  check("  …and Newell's one request asks Graco only from its day",
    nwlWhere.includes("(manufacturer = 'Graco Children''s Products, Inc.' AND report_received_date >= '1999-03-24T00:00:00')"), nwlWhere.slice(0, 200));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

main();
