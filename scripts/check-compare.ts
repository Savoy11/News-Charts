import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * What /compare treats as one happening on both sides.
 *
 *   npm run check:compare
 *
 * The failure this guards against is quiet in both directions. Miss an intersection and one
 * regulation reads as two coincidences, which is a weaker claim than the truth. Invent one and
 * two unrelated stories merge into a shared event that never happened, which is a stronger claim
 * than the truth. Neither looks wrong on screen.
 */
import { readFileSync } from "node:fs";
import { identity, intersect } from "../lib/compareEvents";
import { growthOf100 } from "../lib/growth";
import type { EventType, PricePoint, TimelineEvent } from "../lib/types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const ev = (id: string, date: string, title: string, type: EventType = "news"): TimelineEvent => ({
  id,
  date,
  type,
  title,
  source: "test",
});

console.log("\nA sector rule reaches both sides as one row");
// loadSectorEvents ids every sector event `sector-<n>`, and both members of an industry get the
// same one — this is the BABA-vs-JD case the feature exists for.
const rule = (id: string) => ev(id, "2024-03-21", "EPA Finalises Vehicle Emissions Rules", "regulation");
const sharedRule = intersect(
  [rule("sector-9"), ev("db-1", "2024-02-01", "Ford recalls SUVs")],
  [rule("sector-9"), ev("db-2", "2024-02-03", "GM cuts EV output")]
);
check("the rule is found on both", sharedRule.has("sector-9"), [...sharedRule].join(","));
check("only the rule is shared", sharedRule.size === 1, `${sharedRule.size}`);

console.log("\nOne wire story written about both");
const shared = intersect(
  [ev("db-11", "2024-05-02", "Automakers Face New Tariffs — Reuters")],
  [ev("db-77", "2024-05-02", "Automakers face new tariffs | Bloomberg")]
);
check("outlet garnish and casing don't hide it", shared.size === 1, `${shared.size}`);

console.log("\nBoilerplate must not merge");
// The merge that actually shipped: two issuers file an identically-titled 10-K on one day, and
// title identity called it a shared happening. It is a filing calendar, not an event they share.
const tenK = (id: string) =>
  ev(id, "2026-02-17", "10-K — Annual report for the fiscal year ended December 31, 2025", "filing");
check("two identically-titled filings are not one event", intersect([tenK("db-1")], [tenK("db-2")]).size === 0);
check(
  "nor two identically-titled earnings",
  intersect([ev("db-1", "2026-02-04", "Q4 2025 results", "earnings")], [ev("db-2", "2026-02-04", "Q4 2025 results", "earnings")]).size === 0
);
check(
  "nor two corporate actions worded the same",
  intersect([ev("db-1", "2026-03-04", "2:1 stock split", "corporate_action")], [ev("db-2", "2026-03-04", "2:1 stock split", "corporate_action")]).size === 0
);
check(
  "nor a history sentence that happens to match",
  intersect([ev("db-1", "1908-01-01", "The company is founded", "history")], [ev("db-2", "1908-01-01", "The company is founded", "history")]).size === 0
);
// A cited article is one document, so two subjects citing it on a day really is one thing.
check(
  "but a cited article on both really is shared",
  intersect(
    [ev("db-1", "2024-03-21", "EPA Finalises Vehicle Emissions Rules", "citation")],
    [ev("db-2", "2024-03-21", "EPA Finalises Vehicle Emissions Rules", "citation")]
  ).size === 1
);

console.log("\nWhat must not merge");
// Same headline, different day: two filings, two announcements, two separate happenings.
check(
  "the same headline on another day is not shared",
  intersect(
    [ev("db-1", "2024-05-02", "Quarterly results announced")],
    [ev("db-2", "2024-08-02", "Quarterly results announced")]
  ).size === 0
);
check(
  "different stories on one day are not shared",
  intersect(
    [ev("db-1", "2024-05-02", "Ford recalls SUVs over software defect")],
    [ev("db-2", "2024-05-02", "GM names a new chief financial officer")]
  ).size === 0
);
// Ids are scoped per row everywhere except sector events, so trusting them generally would
// either find nothing or collide two unrelated rows that happen to share a number.
check(
  "a coincidental id match is not enough on its own",
  intersect(
    [ev("db-5", "2024-05-02", "Ford recalls SUVs")],
    [ev("db-5", "2024-09-09", "GM opens a battery plant")]
  ).size === 0
);
check("nothing on one side means nothing shared", intersect([], [ev("db-1", "2024-05-02", "x")]).size === 0);

console.log("\nIdentity");
check("a sector event is identified by its row", identity(rule("sector-4")) === "sector-4");
check(
  "anything else is identified by headline and day",
  identity(ev("db-1", "2024-05-02", "Automakers Face New Tariffs")) ===
    identity(ev("db-2", "2024-05-02", "automakers face new tariffs"))
);

console.log("\nGrowth of 100 starts both lines on the same day");
{
  const series = (rows: [string, number][]): PricePoint[] => rows.map(([time, value]) => ({ time, value }));
  // NC-048: the stock's history is longer, BTC's begins on a Saturday. The overlap started on
  // BTC's first day, and each line took its own first point in it as 100 — BTC on Saturday, the
  // stock (no weekend rows) on Monday — so "100" meant two different moments.
  const coin = series([["2024-01-04", 140], ["2024-01-05", 145], ["2024-01-08", 150], ["2024-01-09", 165]]);
  const btc = series([["2024-01-06", 44000], ["2024-01-07", 44500], ["2024-01-08", 47000], ["2024-01-09", 46000]]);
  const g = growthOf100(btc, coin);
  check("the base is the first day both have a row", g?.start === "2024-01-08", g?.start);
  check("  …and both lines read exactly 100 on it", g?.an[0]?.value === 100 && g?.bn[0]?.value === 100, `${g?.an[0]?.value} / ${g?.bn[0]?.value}`);
  check("  …so the next day compares like with like", Math.abs((g?.bn[1]?.value ?? 0) - 110) < 1e-9, `${g?.bn[1]?.value}`);
  check("nothing is drawn before the base day", g?.an.every((p) => p.time >= "2024-01-08") === true);

  // A holiday on one listing: the first overlapping day is missing from one side.
  const gap = growthOf100(series([["2024-07-03", 10], ["2024-07-05", 11]]), series([["2024-07-03", 5], ["2024-07-04", 6], ["2024-07-05", 7]]));
  check("a day only one side traded is not a base", gap?.start === "2024-07-03" && gap?.bn.length === 3, `${gap?.start} ${gap?.bn.length}`);
  const late = growthOf100(series([["2024-07-04", 10], ["2024-07-05", 11]]), series([["2024-07-03", 5], ["2024-07-05", 7]]));
  check("  …the base moves to the next shared day", late?.start === "2024-07-05", late?.start);

  check("no shared day at all draws nothing", growthOf100(series([["2024-01-06", 1]]), series([["2024-01-08", 1]])) === null);
  check("an empty side draws nothing", growthOf100([], coin) === null);
  check("a zero close is never a base", growthOf100(series([["2024-01-08", 0], ["2024-01-09", 2]]), coin)?.start === "2024-01-09");
}

console.log("\nA priced topic keeps its prices on /compare");
// NC-098: the topic branch hard-coded `prices: []`, so btc vs eth lost the growth-of-100 overlay
// even though getTopicPageData returns the crypto series.
const compareSrc = readFileSync("lib/compare.ts", "utf8");
check("the topic branch passes topic.prices through", /prices: topic\.prices/.test(compareSrc));
check("  …and no branch hard-codes an empty series", !/prices: \[\]/.test(compareSrc));

console.log(`\n${pass}/${pass + fail} checks passed`);
if (fail > 0) process.exit(1);
