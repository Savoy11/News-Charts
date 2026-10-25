/**
 * The live-assertion suite's own rules, checked offline (NC-038).
 *
 *   npm run check:live-harness
 *
 * `npm run check:live` cannot run here — it needs the network, and its answers move with the
 * world. What can be proved without either is that it sorts answers honestly:
 * - a blocked network is never reported as a broken source, and a wrong answer is never excused
 *   as a blocked network;
 * - `--strict` is the only thing that turns silence into failure;
 * - its assertions reject the wrong answers they exist to catch;
 * - every source the site may publish from has a live case.
 *
 * Offline by construction: fetch is replaced wherever a case would touch it.
 */

import { readFileSync } from "node:fs";
import {
  CASES,
  KNOWN_HALVINGS,
  NoAnswer,
  classify,
  eventProblems,
  companyRegulationProblems,
  exploitUnitProblems,
  exitCode,
  HEADLINE_SAMPLE,
  halvingProblems,
  headlineProblems,
  outcomeProblems,
  runCase,
  seriesProblems,
  uncovered,
  type LiveCase,
} from "./check-live";
import type { TimelineEvent } from "../lib/types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const ev = (date: string): TimelineEvent => ({ id: date, date, type: "news", title: "t", source: "s" });
const NOW = new Date("2026-10-17T12:00:00Z");

async function main(): Promise<void> {
  console.log("\nVerdicts");
  check("a missing key is SKIPPED, ahead of the network",
    classify({ keyMissing: true, reachable: false, failures: ["x"] }) === "SKIPPED");
  check("no connection is UNREACHABLE, whatever the adapter made of it",
    classify({ keyMissing: false, reachable: false, failures: ["adapter outcome \"error\""] }) === "UNREACHABLE");
  check("a throttle is UNREACHABLE, not FAIL",
    classify({ keyMissing: false, reachable: true, failures: [], declined: true }) === "UNREACHABLE");
  check("an answer with a wrong part is FAIL",
    classify({ keyMissing: false, reachable: true, failures: ["newest filing 2024-01-02"] }) === "FAIL");
  check("an adapter that throws on a reachable host is FAIL",
    classify({ keyMissing: false, reachable: true, failures: [], threw: "TypeError" }) === "FAIL");
  check("a right answer is PASS", classify({ keyMissing: false, reachable: true, failures: [] }) === "PASS");

  console.log("\nExit codes");
  check("a FAIL fails the run", exitCode([{ verdict: "PASS" }, { verdict: "FAIL" }], false) === 1);
  check("silence alone does not", exitCode([{ verdict: "UNREACHABLE" }, { verdict: "SKIPPED" }], false) === 0);
  check("…unless --strict", exitCode([{ verdict: "PASS" }, { verdict: "UNREACHABLE" }], true) === 1);
  check("a clean strict run passes", exitCode([{ verdict: "PASS" }, { verdict: "PASS" }], true) === 0);

  console.log("\nA case, end to end, with fetch replaced");
  const realFetch = globalThis.fetch;
  const fake = (over: Partial<LiveCase>): LiveCase => ({
    name: "fake",
    covers: [],
    hosts: ["example.invalid"],
    run: async () => [],
    ...over,
  });
  try {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const r = await runCase(fake({ run: async () => ["would be wrong"] }));
    check("a host that refuses the connection is UNREACHABLE, and the case is not run",
      r.verdict === "UNREACHABLE" && !r.detail.includes("would be wrong"), r.detail.join("; "));
    globalThis.fetch = (async () => new Response(null, { status: 405 })) as typeof fetch;
    check("any HTTP answer counts as reachable — even a 405 to the probe",
      (await runCase(fake({}))).verdict === "PASS");
    check("a wrong answer from a reachable host is FAIL",
      (await runCase(fake({ run: async () => ["chain says 2022-09-16"] }))).verdict === "FAIL");
    check("a case that throws NoAnswer is UNREACHABLE",
      (await runCase(fake({ run: async () => { throw new NoAnswer("throttled"); } }))).verdict === "UNREACHABLE");
    delete process.env.CHECK_LIVE_HARNESS_KEY;
    check("a case needing an unset key is SKIPPED",
      (await runCase(fake({ needs: "CHECK_LIVE_HARNESS_KEY" }))).verdict === "SKIPPED");
  } finally {
    globalThis.fetch = realFetch;
  }
  check("a throttled outcome becomes NoAnswer", (() => {
    try {
      outcomeProblems("throttled");
      return false;
    } catch (e) {
      return e instanceof NoAnswer;
    }
  })());
  check("an error outcome is a wrong answer", outcomeProblems("error", "HTTP 500").length === 1);

  console.log("\nThe assertions reject what they exist to catch");
  check("too few events", eventProblems([ev("2026-10-01")], 5, NOW).length === 1);
  check("a malformed date", eventProblems([ev("2026-13-45")], 1, NOW).some((p) => /malformed/.test(p)));
  check("a date in the future", eventProblems([ev("2027-01-01")], 1, NOW).some((p) => /future/.test(p)));
  check("…and a clean list passes", eventProblems([ev("2026-10-16"), ev("2001-01-01")], 2, NOW).length === 0);
  const series = (days: string[]) => days.map((time) => ({ time, value: 100 }));
  check("a stale series", seriesProblems(series(["2026-09-01", "2026-09-02"]), 2, 7, NOW).some((p) => /days old/.test(p)));
  check("closes out of order", seriesProblems(series(["2026-10-16", "2026-10-15"]), 2, 7, NOW).some((p) => /out of order/.test(p)));
  check("a zero close", seriesProblems([{ time: "2026-10-16", value: 0 }], 1, 7, NOW).length === 1);
  check("…and a fresh, ordered series passes", seriesProblems(series(["2026-10-15", "2026-10-16"]), 2, 7, NOW).length === 0);
  check("the right halvings pass", halvingProblems(KNOWN_HALVINGS.map(ev)).length === 0);
  check("a halving a day off fails",
    halvingProblems(["2012-11-28", "2016-07-10", "2020-05-11", "2024-04-20"].map(ev)).length === 1);
  check("a missing halving fails", halvingProblems(KNOWN_HALVINGS.slice(0, 3).map(ev)).length === 1);

  check("hack amounts read as plain USD pass", exploitUnitProblems([{ name: "Ronin", amount: 624_000_000 }]).length === 0);
  check("…and the unit DefiLlama documented, millions, fails", exploitUnitProblems([{ name: "Ronin", amount: 624 }]).length === 1);
  check("…as does a feed with nothing to pin it on", exploitUnitProblems([{ name: "Other", amount: 1 }]).length === 1);

  const doc = (title: string, date = "2026-03-02"): TimelineEvent =>
    ({ id: `fr-${title}`, date, type: "regulation", title, source: "Federal Register", url: "https://www.federalregister.gov/d/x" });
  const petition = doc("Ford Motor Company, Receipt of Petition for Decision of Inconsequential Noncompliance");
  check("a company's own Federal Register documents pass", companyRegulationProblems([petition], "FORD MOTOR CO").length === 0);
  check("…one whose title doesn't name it fails",
    companyRegulationProblems([petition, doc("Fuel Economy Standards for Light Trucks")], "FORD MOTOR CO").length === 1);
  check("…as does an airworthiness directive",
    companyRegulationProblems([petition, doc("Airworthiness Directives; Ford Motor Company Airplanes")], "FORD MOTOR CO").length === 1);
  check("…a document older than the floor",
    companyRegulationProblems([doc(petition.title, "2009-06-01")], "FORD MOTOR CO").length === 1);
  check("…and an empty feed", companyRegulationProblems([], "FORD MOTOR CO").length > 0);

  console.log("\nRecent press releases read as headlines");
  // every headline the reader's fixtures hold is a real one, so not one may smell
  const fixture = JSON.parse(readFileSync("scripts/fixtures/sec-headlines.json", "utf8")) as { cases: { filer: string; accession: string; headline: string | null }[] };
  const real = fixture.cases.filter((c) => c.headline).map((c) => ({ filer: c.filer, accession: c.accession, headline: c.headline! }));
  const falseAlarms = headlineProblems(real);
  check(`none of the ${real.length} headlines the reader's fixtures hold is taken for a wrong one`, falseAlarms.length === 0, falseAlarms.slice(0, 3).join("; "));
  // and every wrong title the reader once gave (the 2026-10-25 audit, batches 47–48) is caught
  const once = [
    "By: /s/ Yoshitaka Sekine Name: Yoshitaka Sekine",
    "Managing Director, Head of Documentation & Corporate Secretary Department, Corporate Administration Division",
    "Chief Accounting Officer and Corporate Controller",
    "Issued: 20 October 2026, London UK",
    "24th August 2026, London UK",
    "SAP Proposes Dividend of &euro;2.20 per Share",
    "Source: Pekka Ala-Pietilä Proposed as Successor to Hasso Plattner (sap.com)",
    "Mitsubishi UFJ Financial Group, Inc. (MUFG)",
    "Company Name: Mizuho Financial Group, Inc.",
    "Form 20-F ☒ Form 40-F ☐",
    "Index to Exhibits Item",
    "Ian Tyler appointed bp Chair dated 02 September 2026 Exhibit 1.1",
    "AMD Announces Completion of Partial Tender Offer for its 6.00%",
    "Takeda Announces Chief Financial Officer Succession OSAKA, Japan, and",
    "Akito Bato Senior Managing Director Table of Contents",
    "Page 1 of 21 UnitedHealth Group Reports 2025 Results and Issues 2026 Outlook",
  ].map((headline, i) => ({ filer: "X", accession: String(i), headline }));
  const caught = headlineProblems(once);
  check(`each of the ${once.length} wrong titles the reader once gave is caught`, caught.length === once.length,
    once.filter((o) => !caught.some((c) => c.startsWith(`X ${o.accession}:`))).map((o) => o.headline).join("; "));
  const smfg = "SUMITOMO MITSUI FINANCIAL GROUP, INC.";
  check("the company's name alone, its legal form left off, is caught by the filer's own name",
    headlineProblems([{ filer: "SMFG", accession: "1", headline: "Sumitomo Mitsui Financial Group", name: smfg }]).length === 1);
  check("…but a headline naming the company is not, nor one ending \"…haemophilia A\" or \"…per Share of $1.12\"",
    headlineProblems([
      { filer: "SMFG", accession: "2", headline: "Sumitomo Mitsui Financial Group Announces New Group Vision", name: smfg },
      { filer: "NVO", accession: "3", headline: "CHMP recommends EU approval of FREHEMGO for the treatment of haemophilia A" },
      { filer: "NKE", accession: "4", headline: "Nike Reports First Quarter Earnings per Share of $1.12" },
    ]).length === 0);
  const headlineCase = CASES.find((c) => /press releases read as headlines/.test(c.name));
  check("a live case samples the headline reader on both 8-K and 6-K filers",
    Boolean(headlineCase?.covers.includes("sec_edgar")) && HEADLINE_SAMPLE.includes("AAPL") && HEADLINE_SAMPLE.includes("TAK") && HEADLINE_SAMPLE.includes("UNH"));

  console.log("\nCoverage");
  check("every source the site may publish from has a live case", uncovered().length === 0, uncovered().join(", "));
  check("a source with no case would be named",
    uncovered(CASES.filter((c) => !c.covers.includes("snapshot"))).includes("snapshot"));
  check("every case names at least one host", CASES.every((c) => c.hosts.length > 0));
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  check("check:live stays out of the offline `npm run check` chain",
    !/run check:live(\s|$|&)/.test(pkg.scripts.check) && Boolean(pkg.scripts["check:live"]));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

main();
