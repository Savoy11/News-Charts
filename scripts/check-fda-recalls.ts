import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FDA_FIRMS, fdaFirmsFor, fdaQuery, fdaRecallEvents, fetchFdaRecalls, firmFor, productName, recallDay, type FdaKind, type FdaRecord } from "../lib/fdaRecalls";
import { SOURCES } from "../lib/ingest/store";
import { deterministicScore } from "../lib/enrich/relevance";
import { MARKER_STYLE, markerEventsByDay, markerPriority, markerStyle } from "../lib/markers";
import { nearestCatalyst } from "../components/BiggestMoves";
import type { TimelineEvent } from "../lib/types";
import { COMPANY_SOURCES } from "./ingest";

/**
 * Drug, device and food recalls from the FDA's enforcement report on company pages (batch 40).
 *
 *   npm run check:fda-recalls
 *
 * The records are real, read from openFDA on 2026-10-24 (scripts/fixtures/fda-recalls.json): both
 * sides of the days Medtronic bought Covidien, Pfizer bought Hospira, Abbott sold its eye-care
 * business and GE spun off GE HealthCare; the look-alike firms that are other companies; a
 * recall of three products; a Class III recall; and the one record dated 1930. Offline: every
 * fetch is mocked.
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
const fixture: { cases: Record<string, { kind: FdaKind; records: FdaRecord[] }> } = JSON.parse(read("scripts/fixtures/fda-recalls.json"));
const recs = (label: string) => fixture.cases[label].records;
const firmsOf = (ticker: string) => Object.values(FDA_FIRMS).find((e) => e.ticker === ticker)!.firms;
const eventsOf = (ticker: string, ...labels: string[]) =>
  labels.flatMap((l) => fdaRecallEvents(recs(l), firmsOf(ticker), fixture.cases[l].kind));

async function main(): Promise<void> {
  console.log("\nWhose recall it is");
  check("Covidien's recalls are Medtronic's from the day Medtronic bought it, 2015-01-26, and not before",
    eventsOf("MDT", "covidien_after").length > 0 && eventsOf("MDT", "covidien_before").length === 0,
    `${eventsOf("MDT", "covidien_before").length} before, ${eventsOf("MDT", "covidien_after").length} after`);
  check("Hospira's are Pfizer's from 2015-09-03, and not before",
    eventsOf("PFE", "hospira_after").length > 0 && eventsOf("PFE", "hospira_before").length === 0);
  check("Abbott Medical Optics' are Abbott's until its sale to Johnson & Johnson, and not after",
    eventsOf("ABT", "amo_before_sale").length > 0 && !firmFor("Abbott Medical Optics Inc. (AMO)", "2017-03-15", firmsOf("ABT")) &&
      firmFor("Abbott Medical Optics Inc. (AMO)", "2017-02-26", firmsOf("ABT")) !== null);
  check("GE Healthcare's are GE's until the spin-off on 2023-01-03, and GE HealthCare's after",
    eventsOf("GE", "ge_before_spin").length > 0 && eventsOf("GEHC", "ge_before_spin").length === 0 &&
      eventsOf("GEHC", "ge_after_spin").length > 0 && eventsOf("GE", "ge_after_spin").length === 0);
  check("firms of the same name that are other companies are left out: Hershey Creamery, Merck Millipore, the Philips–Neusoft and Wipro–GE ventures",
    eventsOf("HSY", "hershey_creamery").length === 0 && eventsOf("HSY", "hershey_company").length === 2 &&
      eventsOf("MRK", "merck_millipore").length === 0 && eventsOf("PHG", "philips_neusoft").length === 0 &&
      eventsOf("GEHC", "wipro_ge").length === 0);
  check("a company with no mapped firm has none", fdaFirmsFor(320193) === null && fdaFirmsFor("0001613103") !== null);

  console.log("\nBusinesses that changed hands (batch 41)");
  const n = (ticker: string, label: string) => eventsOf(ticker, label).length;
  check("Synthes's recalls are J&J's from the day J&J bought it, 2012-06-14, and not before",
    n("JNJ", "synthes_before") === 0 && n("JNJ", "synthes_after") > 0);
  check("Ortho-Clinical's are J&J's until its sale to Carlyle, nobody's while Carlyle owned it, and QuidelOrtho's from 2022-05-27",
    n("JNJ", "ortho_clinical_jnj") > 0 && n("QDEL", "ortho_clinical_jnj") === 0 &&
      n("JNJ", "ortho_clinical_carlyle") === 0 && n("QDEL", "ortho_clinical_carlyle") === 0 &&
      n("QDEL", "ortho_clinical_quidelortho") > 0 && n("JNJ", "ortho_clinical_quidelortho") === 0);
  check("Cordis's are J&J's until 2015-10-01, Cardinal Health's from 2015-10-02 to mid-2021, and the later Cordis US Corp is neither's",
    n("JNJ", "cordis_jnj") > 0 && n("CAH", "cordis_jnj") === 0 && n("CAH", "cordis_cardinal") > 0 && n("JNJ", "cordis_cardinal") === 0 &&
      n("CAH", "cordis_us_corp") === 0 && n("JNJ", "cordis_us_corp") === 0);
  check("Alcon's are Novartis's until the spin-off on 2019-04-09, and Alcon's from then",
    n("NVS", "alcon_novartis") > 0 && n("ALC", "alcon_novartis") === 0 && n("ALC", "alcon_own") > 0 && n("NVS", "alcon_own") === 0);
  check("Mylan's are Viatris's only from its formation, 2020-11-16: Viatris does not carry Mylan's ticker",
    n("VTRS", "mylan_before") === 0 && n("VTRS", "mylan_after") > 0);
  check("a firm called Integra that is not shown to be Integra LifeSciences is left out", n("IART", "integra_limited") === 0);
  const consumer = "Johnson & Johnson Consumer, Inc.";
  check("J&J's consumer business is J&J's before Kenvue's IPO, both companies' until the exchange offer, and Kenvue's after",
    n("JNJ", "jnj_consumer") === 1 && n("KVUE", "jnj_consumer") === 0 &&
      firmFor(consumer, "2023-06-01", firmsOf("JNJ")) !== null && firmFor(consumer, "2023-06-01", firmsOf("KVUE")) !== null &&
      firmFor(consumer, "2024-01-15", firmsOf("JNJ")) === null && firmFor(consumer, "2024-01-15", firmsOf("KVUE")) !== null);
  const filing = /\b(?:8-K|8-K\/A|10-Q|10-K|20-F|6-K)\b/;
  const whys = Object.values(FDA_FIRMS).flatMap((e) => e.firms.map((f) => f.why));
  const dayAfter = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const uncited = Object.values(FDA_FIRMS).flatMap((e) =>
    e.firms
      .filter((f) => f.from || f.to)
      .filter((f) => {
        const day = f.from ?? dayAfter(f.to!);
        return !filing.test(f.why) && !whys.some((w) => w.includes(day) && filing.test(w));
      })
      .map((f) => `${e.ticker} ${f.search}`));
  check("every day a firm joined or left a company is cited to an SEC filing", uncited.length === 0, uncited.join(", "));

  console.log("\nOne recall, one event");
  const pump = eventsOf("MDT", "medtronic_two_products");
  check("a recall of three products is one event, on the day it started, at its most serious class",
    pump.length === 1 && pump[0].date === "2025-08-06" && pump[0].title === "Class I device recall: DLP Left Heart Vent Catheter Malleable body and vented connector (3 products)",
    JSON.stringify(pump[0]?.title));
  check("  …linked to the enforcement report's page for it, as a recall from the FDA",
    pump[0]?.url === "https://www.accessdata.fda.gov/scripts/ires/index.cfm?Event=97295" && pump[0].type === "recall" &&
      pump[0].source === "FDA" && pump[0].sourceKey === "fda_enforcement" && pump[0].dedupBasis === "fda:97295");
  check("  …and says why, from the recall's own reason", pump[0]?.description === "The catheters may not retain their shape.", pump[0]?.description);
  check("a Class III recall, unlikely to cause harm, is left out", eventsOf("SYK", "stryker_class_iii").length === 0);
  const isrg = eventsOf("ISRG", "isrg_1930");
  check("a start dated 1930 gives way to the day the report published it",
    isrg.length === 1 && isrg[0].date === "2013-11-13" && recallDay({ recall_initiation_date: "20250806", report_date: "20250910" }) === "2025-08-06",
    isrg[0]?.date);

  console.log("\nOn the chart");
  const classII = eventsOf("MDT", "covidien_after")[0];
  const vehicle = { id: "recall-11V385000", date: "2025-08-06", type: "recall", title: "Recall of 1,100,000 vehicles: Fuel tank strap corrosion", source: "NHTSA" } as TimelineEvent;
  check("a Class II recall, of which Medtronic alone has 470, is drawn without the R and ranked like news",
    classII.title.startsWith("Class II ") && markerStyle(classII).text === "" && markerPriority(classII) === markerPriority({ type: "news", title: "" }),
    `${classII.title.slice(0, 40)} → "${markerStyle(classII).text}", ${markerPriority(classII)}`);
  check("  …while a Class I recall and a vehicle recall keep the R and a recall's rank",
    markerStyle(pump[0]).text === "R" && markerPriority(pump[0]) === 3 && markerStyle(vehicle) === MARKER_STYLE.recall && markerPriority(vehicle) === 3);
  const filingSameDay = { id: "f1", date: classII.date, type: "filing", title: "8-K filing", source: "SEC EDGAR" } as TimelineEvent;
  check("  …so a filing on the same day takes the day's marker from a Class II recall, and a Class I takes it from a filing",
    markerEventsByDay([classII, filingSameDay], [classII.date])[0].type === "filing" &&
      markerEventsByDay([{ ...filingSameDay, date: pump[0].date }, pump[0]], [pump[0].date])[0].type === "recall");
  const fedSameDay = { id: "m1", date: classII.date, type: "macro", title: "Fed holds rates", source: "Federal Reserve" } as TimelineEvent;
  check("  …and a big move's caption goes to a Fed decision that day before a Class II recall, never before a Class I (batch 56)",
    nearestCatalyst([classII, fedSameDay], classII.date)?.type === "macro" &&
      nearestCatalyst([{ ...fedSameDay, date: pump[0].date }, pump[0]], pump[0].date)?.type === "recall" &&
      nearestCatalyst([{ ...fedSameDay, date: vehicle.date }, vehicle], vehicle.date)?.type === "recall",
    nearestCatalyst([classII, fedSameDay], classII.date)?.title);

  console.log("\nA product name from a label");
  const names: [string, string][] = [
    ["Vial Label: Epinephrine Injection, USP, 1mg/10mL (0.1 mg/mL), Rx only", "Epinephrine Injection"],
    ["28 oz. Gatorade Lemon Lime, Gatorade Lemon Lime Zero, Gatorade Orange, and Gatorade Orange Zero.", "Gatorade Lemon Lime"],
    ["13.5 ounce Gold Medal Wondra   Case UPC 000-16000-42476", "Gold Medal Wondra"],
    ["Brand Name: FEM-FLEX II  Product Name: Femoral Arterial Cannula  Model/Catalog Number: FEM", "FEM-FLEX II"],
    ["Edwards EVOQUE tricuspid delivery system  REF:9850TDS  Sterile EO", "Edwards EVOQUE tricuspid delivery system"],
    ["Grafton DBM (Flex), Model Numbers: T42100, Demineralized Bone Matrix", "Grafton DBM (Flex)"],
  ];
  const wrong = names.filter(([d, want]) => productName(d) !== want);
  check("the name before the first comma, model or lot number, after a label word or a package size",
    wrong.length === 0, wrong.map(([d]) => `${d.slice(0, 30)} → ${productName(d)}`).join("; "));
  check("  …and the Gatorade recall reads as Gatorade, not \"28 oz\"",
    eventsOf("PEP", "gatorade_28oz")[0]?.title.startsWith("Class II food recall: Gatorade Lemon Lime"), eventsOf("PEP", "gatorade_28oz")[0]?.title);

  console.log("\nThe request");
  const q = decodeURIComponent(fdaQuery("device", firmsOf("MDT")).replace(/\+/g, " "));
  check("the company's firm names are asked in brackets: unbracketed, openFDA answers for the last name alone",
    q.includes('search=(recalling_firm:"Medtronic" recalling_firm:"Covidien")') && q.includes("sort=recall_initiation_date:desc") && q.includes("limit=1000"), q.slice(0, 160));

  const realFetch = globalThis.fetch;
  let asked: string[] = [];
  const answer = (respond: (url: string) => [number, unknown]) => {
    asked = [];
    globalThis.fetch = (async (u: RequestInfo | URL) => {
      asked.push(String(u));
      const [status, body] = respond(String(u));
      return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
    }) as typeof fetch;
  };
  const page = (records: FdaRecord[], total = records.length) => ({ meta: { results: { total } }, results: records });
  try {
    answer(() => [200, page([])]);
    const none = await fetchFdaRecalls(320193);
    check("a company with no mapped firm costs no request", none.outcome === "empty" && asked.length === 0);
    // the device set answers with Medtronic's records; drugs and food match nothing, which openFDA answers with a 404
    answer((u) => (u.includes("/device/") ? [200, page([...recs("medtronic_two_products"), ...recs("covidien_after"), ...recs("covidien_before")])] : [404, { error: { code: "NOT_FOUND" } }]));
    const mdt = await fetchFdaRecalls(1613103);
    check("Medtronic's three product types are asked, and a 404 is no recalls, not an error",
      mdt.outcome === "ok" && asked.length === 3 && ["/drug/", "/device/", "/food/"].every((k) => asked.some((u) => u.includes(k))) &&
        mdt.events.length === 1 + new Set(recs("covidien_after").map((r) => r.event_id)).size,
      `${mdt.outcome}, ${mdt.events.length} events, ${asked.length} requests`);
    // a second page is asked for while openFDA says there are more
    let pages = 0;
    answer((u) => {
      if (!u.includes("/device/")) return [404, {}];
      pages++;
      return [200, page(Array.from({ length: 1000 }, () => recs("medtronic_two_products")[0]), 1500)];
    });
    await fetchFdaRecalls(1613103);
    check("a set larger than one page is read a page at a time", pages === 2, `${pages} pages`);
    answer(() => [429, "slow down"]);
    check("a throttle is reported as one", (await fetchFdaRecalls(1613103)).outcome === "throttled");
    answer(() => [500, "oops"]);
    check("  …a server error as an error", (await fetchFdaRecalls(1613103)).outcome === "error");
    answer(() => [200, { error: true }]);
    const odd = await fetchFdaRecalls(1613103);
    check("  …and an answer with no list of records as an error, never as no recalls", odd.outcome === "error" && odd.events.length === 0);
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "fda_enforcement");
  check("the source is registered as public domain under CC0, cleared for commercial use, with the day its licence was read",
    src?.license === "public domain (CC0 1.0)" && src.commercialOk && src.reviewedOn === "2026-10-24", JSON.stringify(src));
  check("a recall is scored without the model, as a filing is, in words that fit an FDA recall too",
    deterministicScore({ kind: "recall", title: pump[0].title } as never, { kind: "company", displayName: "Medtronic plc", ticker: "MDT" }, ["medtronic"])?.reason ===
      "a recall filed by a maker or firm the company owned that day");
  check("the chart calls it a recall, not a vehicle recall, and draws each by `markerStyle`",
    /recall: "Recall",/.test(read("components/PriceTimeline.tsx")) && /const s = markerStyle\(ev\);/.test(read("components/PriceTimeline.tsx")) &&
      /shape: markerStyle\(ev\)\.shape,/.test(read("components/PriceOverlay.tsx")));
  const ingest = read("scripts/ingest.ts");
  check("company ingest asks for FDA recalls only for a mapped company",
    (COMPANY_SOURCES as readonly string[]).includes("fda_enforcement") &&
      /const fdaFirms = fdaFirmsFor\(company\.cik\);\s*if \(fdaFirms\) \{\s*await run\("fda_enforcement"/.test(ingest) && /fetchFdaRecalls\(company\.cik\)/.test(ingest));
  check("the FDA is credited where the other sources are",
    /drug, device and food recalls\s+from the U\.S\. Food and Drug Administration/.test(read("app/layout.tsx")) &&
      /drug, device and\s+food recalls from the U\.S\. Food and Drug Administration/.test(read("app/legal/terms/page.tsx")));
  check("the sources plan records the owner's approval", /## 3\. FDA enforcement reports[^#]*\*\*Status:\*\* APPROVED/.test(read("docs/proposals/2026-10-22-news-sources.md")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

main();
