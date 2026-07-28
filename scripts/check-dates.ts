import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Citation date parsing and the precision it reports.
 *
 *   npm run check:dates
 *
 * `date` is always a full day so events can be sorted and plotted, which makes the precision
 * field the only thing standing between "the source said January 2015" and a page that prints
 * "Jan 1". An over-precise date is worse than a vague one: it reads as a fact.
 */
import { parseCiteDate } from "../lib/wiki";
import type { DatePrecision } from "../lib/types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

function expect(raw: string, date: string | null, precision?: DatePrecision): void {
  const got = parseCiteDate(raw);
  if (date === null) {
    check(`${JSON.stringify(raw)} → rejected`, got === null, got ? JSON.stringify(got) : "");
    return;
  }
  check(
    `${JSON.stringify(raw)} → ${date} (${precision})`,
    got?.date === date && got?.precision === precision,
    got ? `${got.date} (${got.precision})` : "null"
  );
}

console.log("\nForms Wikipedia's style guide allows");
expect("2015-01-05", "2015-01-05", "day");
expect("January 5, 2015", "2015-01-05", "day");
expect("5 January 2015", "2015-01-05", "day");
expect("Jan. 5, 2015", "2015-01-05", "day");

console.log("\nMonth precision — the day was never given");
// Normalised to the 1st so it sorts, but reported as month precision so nothing prints "Jan 1".
expect("January 2015", "2015-01-01", "month");
expect("Sept 2015", "2015-09-01", "month");
expect("December 1999", "1999-12-01", "month");

console.log("\nYear precision");
expect("2015", "2015-01-01", "year");

console.log("\nRejected — an undatable citation cannot take a place on a timeline");
expect("n.d.", null);
expect("Spring 2015", null);
expect("2015-01-05/2015-02-01", null);
expect("", null);
expect("Januarie 2015", null);

console.log("\nImplausible values are rejected rather than repaired");
expect("February 30, 2015", null);
expect("1500", null);
expect("January 5, 3000", null);
expect("2015-13-01", null);

console.log("\nOrdering still works across precisions");
{
  // Every parse yields a sortable full date; precision only governs display.
  const dates = ["2015", "January 2015", "January 5, 2015"]
    .map((r) => parseCiteDate(r))
    .filter(Boolean) as { date: string; precision: DatePrecision }[];
  check("all three parse", dates.length === 3);
  check(
    "a full date sorts after the month and year it belongs to",
    dates[0].date <= dates[1].date && dates[1].date <= dates[2].date,
    dates.map((d) => d.date).join(" ≤ ")
  );
  check(
    "each reports a different precision",
    new Set(dates.map((d) => d.precision)).size === 3,
    dates.map((d) => d.precision).join(", ")
  );
}

console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) process.exit(1);
