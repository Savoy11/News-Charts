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
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { types } from "pg";
import { parseCiteDate } from "../lib/wiki";
import { PG_TYPES } from "../lib/db";
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

console.log("\nA stored calendar date never passes through a time zone");
{
  // NC-100: node-pg's default turns a DATE into a JS Date at local midnight, and the readers took
  // toISOString().slice(0, 10) — the day before, on any host east of UTC. Node re-reads TZ when
  // it is assigned, so the host's zone can be simulated here.
  const DATE = types.builtins.DATE;
  const readerDay = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
  const was = process.env.TZ;
  process.env.TZ = "Asia/Tokyo";
  try {
    const before = readerDay(types.getTypeParser(DATE, "text")("2024-03-21"));
    check("the default parser shifts a day east of UTC (the bug this guards)", before === "2024-03-20", before);
    // @types/pg types the returned parser as taking a number; at runtime it takes the text value
    const ours = PG_TYPES.getTypeParser(DATE, "text") as unknown as (value: string) => unknown;
    const after = readerDay(ours("2024-03-21"));
    check("PG_TYPES hands the date back exactly as stored", after === "2024-03-21", after);
  } finally {
    if (was === undefined) delete process.env.TZ;
    else process.env.TZ = was;
  }

  // The parser only helps a pool that is built with it.
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return walk(path);
      return /\.tsx?$/.test(name) ? [path] : [];
    });
  const pools = ["lib", "scripts", "app"].flatMap(walk).flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/new (?:Pool|Client)\(\{[^}]*\}\)/g)].map((m) => ({ file, src: m[0] }))
  );
  const bare = pools.filter((p) => !p.src.includes("types: PG_TYPES"));
  check(`every pool is built with PG_TYPES (${pools.length} found)`, pools.length >= 2 && bare.length === 0, bare.map((p) => p.file).join(", "));
}

console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) process.exit(1);
