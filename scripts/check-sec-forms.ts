/**
 * What EDGAR says about a filing reaches its title (2026-10-17 proposal 1).
 *
 *   npm run check:sec-forms
 *
 * Every 8-K but a results one was titled "8-K filing", with its item codes printed underneath as
 * "Items: 5.02,9.01"; a foreign private issuer's annual report (20-F) could only ever be a filing,
 * and a Canadian one's (40-F) was dropped at the door. Offline by construction: fetch is replaced
 * with a submissions record built here.
 */

import { readFileSync } from "node:fs";
import { describeItems, leadItem, reportsResults } from "../lib/secForms";
import type { TimelineEvent } from "../lib/types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

/** The SEC's Form 8-K item list as in force since August 2004. */
const CURRENT_ITEMS = [
  "1.01", "1.02", "1.03", "1.04", "1.05",
  "2.01", "2.02", "2.03", "2.04", "2.05", "2.06",
  "3.01", "3.02", "3.03",
  "4.01", "4.02",
  "5.01", "5.02", "5.03", "5.04", "5.05", "5.06", "5.07", "5.08",
  "6.01", "6.02", "6.03", "6.04", "6.05", "6.06",
  "7.01", "8.01", "9.01",
];

async function main(): Promise<void> {
  console.log("\nThe item list");
  const unnamed = CURRENT_ITEMS.filter((c) => describeItems(c) === `Item ${c}`);
  check("every current 8-K item has a plain name", unnamed.length === 0, unnamed.join(", "));
  check("an officer change leads over the exhibit index", leadItem("5.02,9.01")?.code === "5.02");
  check("the most material item leads, whatever order EDGAR lists them in",
    leadItem("8.01,1.03,9.01")?.code === "1.03" && leadItem("7.01,4.02")?.code === "4.02");
  check("an exhibit index alone names nothing", leadItem("9.01") === null);
  check("pre-2004 item numbers are not guessed at", leadItem("5,7") === null);
  check("results are item 2.02 exactly, not a substring of another code",
    reportsResults("2.02,9.01") && !reportsResults("12") && !reportsResults(""));
  check("the description keeps the codes and names them",
    describeItems("5.02,9.01") === "Items 5.02 Officer or director change · 9.01 Financial statements and exhibits",
    describeItems("5.02,9.01"));
  check("a code outside the list is shown bare", describeItems("5,7") === "Items 5 · 7");

  console.log("\nA submissions record, through the parser");
  const rows: [form: string, date: string, items: string][] = [
    ["8-K", "2026-09-02", "5.02,9.01"],
    ["8-K", "2026-08-01", "2.02,9.01"],
    ["8-K", "2026-07-15", "1.01,2.03,9.01"],
    ["8-K", "2026-06-10", "9.01"],
    ["8-K", "2001-03-05", "5,7"],
    ["20-F", "2026-04-28", ""],
    ["40-F", "2026-03-20", ""],
    ["6-K", "2026-05-14", ""],
    ["10-K", "2026-02-20", ""],
  ];
  const realFetch = globalThis.fetch;
  let events: TimelineEvent[] = [];
  try {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          name: "TEST CO",
          filings: {
            recent: {
              form: rows.map((r) => r[0]),
              filingDate: rows.map((r) => r[1]),
              accessionNumber: rows.map((_, i) => `0000000001-26-${String(i).padStart(6, "0")}`),
              primaryDocument: rows.map(() => "a.htm"),
              items: rows.map((r) => r[2]),
            },
          },
        }),
        { status: 200 }
      )) as typeof fetch;
    const { getFilings } = await import("../lib/sec");
    events = await getFilings({ ticker: "TST", cik: "0000000001", name: "Test Co" });
  } finally {
    globalThis.fetch = realFetch;
  }
  const on = (date: string) => events.find((e) => e.date === date);

  check("an 8-K is titled by its item",
    on("2026-09-02")?.title === "Test Co: Officer or director change (8-K 5.02)", on("2026-09-02")?.title);
  check("  …and stays a filing", on("2026-09-02")?.type === "filing");
  check("a results 8-K is still an earnings announcement",
    on("2026-08-01")?.title === "Test Co: Earnings announcement (8-K)" && on("2026-08-01")?.type === "earnings");
  check("a deal outranks the debt that funds it",
    on("2026-07-15")?.title === "Test Co: Material agreement (8-K 1.01)", on("2026-07-15")?.title);
  check("an exhibits-only 8-K keeps the plain title", on("2026-06-10")?.title === "Test Co: 8-K filing");
  check("a pre-2004 8-K keeps the plain title", on("2001-03-05")?.title === "Test Co: 8-K filing");
  check("a 20-F is an annual report, typed earnings",
    on("2026-04-28")?.title === "Test Co: Annual report (20-F)" && on("2026-04-28")?.type === "earnings",
    `${on("2026-04-28")?.title} / ${on("2026-04-28")?.type}`);
  check("a 40-F is admitted, as an annual report typed earnings",
    on("2026-03-20")?.title === "Test Co: Annual report (40-F)" && on("2026-03-20")?.type === "earnings",
    on("2026-03-20") ? `${on("2026-03-20")?.title} / ${on("2026-03-20")?.type}` : "dropped");
  check("a 6-K stays a filing — the list does not say whether it carries results",
    on("2026-05-14")?.type === "filing" && on("2026-05-14")?.title === "Test Co: 6-K filing");
  check("a 10-K is unchanged", on("2026-02-20")?.title === "Test Co: Annual report (10-K)");

  console.log("\nThe filing stack still reads the form out of the new titles");
  const src = readFileSync("components/EventList.tsx", "utf8");
  const reSrc = src.match(/const FORM_RE = \/(.+)\/i;/)?.[1];
  check("EventList's form pattern is where this check expects it", Boolean(reSrc));
  if (reSrc) {
    const FORM_RE = new RegExp(reSrc, "i");
    const forms = events.map((e) => e.title.match(FORM_RE)?.[1].toUpperCase() ?? "?");
    check("every title yields its form", forms.every((f, i) => f === rows[i][0]), forms.join(" "));
  }

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

main();
