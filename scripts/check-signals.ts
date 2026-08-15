/**
 * The arithmetic behind the figures a reader takes as findings.
 *
 *   npm run check:signals
 *
 * `lib/signals.ts` was the one pure-arithmetic module in this repo with no suite of any kind,
 * while three production consumers render its output — `app/api/signals/route.ts`,
 * `components/SignalPanel.tsx` and `lib/enrich/explain.ts`. Markers, dates, refresh windows,
 * cost, relevance, sentiment and compare all have one; this produces the numbers most likely to
 * be read as a claim about a company, and it was the exception.
 *
 * It is DB-backed, which explains the gap without excusing it: the statistics are separable from
 * the queries, and these are the separable parts. They were also module-private until 2026-08-12,
 * so no check could have reached them even if one had been written.
 */
import { median, mad, isSpike, weekEnd } from "../lib/signals";
import { configProblem } from "../lib/db";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

console.log("\nMedian");
check("odd count takes the middle", median([3, 1, 2]) === 2, `${median([3, 1, 2])}`);
check("even count averages the pair", median([1, 2, 3, 4]) === 2.5, `${median([1, 2, 3, 4])}`);
check("input order does not matter", median([9, 1, 5]) === median([1, 5, 9]));
// Sorting numbers with the default comparator is lexicographic: [10, 9, 8] would give 9 either
// way, but [1, 2, 10] would give 10 rather than 2. The explicit comparator is load-bearing.
check("sorts numerically, not lexicographically", median([1, 2, 10]) === 2, `${median([1, 2, 10])}`);
check("does not mutate its input", (() => { const xs = [3, 1, 2]; median(xs); return xs[0] === 3; })());
check("empty is 0, not NaN", median([]) === 0, `${median([])}`);
check("negatives are handled", median([-5, -1, -3]) === -3, `${median([-5, -1, -3])}`);

console.log("\nMedian absolute deviation");
check("a flat series has no spread", mad([4, 4, 4, 4]) === 0, `${mad([4, 4, 4, 4])}`);
check("spread is robust to one outlier", mad([1, 1, 1, 1, 100]) === 0, `${mad([1, 1, 1, 1, 100])}`);
check("a genuinely varied series has spread", mad([1, 3, 5, 7]) === 2, `${mad([1, 3, 5, 7])}`);
check("empty is 0, not NaN", mad([]) === 0, `${mad([])}`);

console.log("\nSpike detection");
// The floor is why a quiet sector does not produce noise: 2 events against a baseline of 0 is
// infinitely significant by ratio and means nothing in fact.
check("below the floor is never a spike", !isSpike(2, 0, 0, 5, 3), "n=2 floor=5");
check("at the floor with no baseline is a spike", isSpike(5, 0, 0, 5, 3), "n=5 baseline=0");
// The zero-spread arm: with no variation to measure, the threshold falls back to baseline+sigma+1
// rather than dividing by a spread of zero.
check("zero spread uses the additive threshold", isSpike(5, 1, 0, 2, 3), "n=5 baseline=1 sigma=3");
check("  …and just below it is not a spike", !isSpike(4, 1, 0, 2, 3), "n=4 needs 5");
check("a normal week against a real spread is not a spike", !isSpike(6, 5, 2, 2, 3), "n=6 needs 11");
check("a real spike against a real spread is", isSpike(12, 5, 2, 2, 3), "n=12 needs 11");
check("the threshold is inclusive", isSpike(11, 5, 2, 2, 3), "n=11 needs 11");

console.log("\nWeek boundaries");
check("a week ends six days after it starts", weekEnd("2026-08-10") === "2026-08-16", weekEnd("2026-08-10"));
// Month and year rollovers are where a hand-rolled date walk goes wrong, and a wrong window
// silently mis-attributes every event inside it.
check("crosses a month boundary", weekEnd("2026-07-28") === "2026-08-03", weekEnd("2026-07-28"));
check("crosses a year boundary", weekEnd("2026-12-28") === "2027-01-03", weekEnd("2026-12-28"));
check("crosses a leap day", weekEnd("2028-02-26") === "2028-03-03", weekEnd("2028-02-26"));
// Built in UTC on purpose: a local-time walk shifts the boundary by a day for half the world.
check("does not drift with the local zone", weekEnd("2026-01-01") === "2026-01-07", weekEnd("2026-01-01"));

/**
 * How an operator script reports a failure it caught on the way up.
 *
 * Lives here rather than in its own suite because it is four assertions over one pure function.
 * The rule: a condition the operator can fix gets a sentence and a remedy; anything else keeps
 * its stack, because hiding a real fault to look tidy is how it becomes hard to diagnose.
 */
console.log("\nStartup failures an operator can fix");
{
  const missing = configProblem(new Error("DATABASE_URL is not set — see .env.local"));
  check("a missing DATABASE_URL is explained", missing !== null);
  check("  …and says what to do about it", /Set it in \.env\.local/.test(missing ?? ""), missing?.split("\n")[1]?.trim());
  check("a refused connection is explained", configProblem(new Error("connect ECONNREFUSED 127.0.0.1:5432")) !== null);
  // The half that matters more: an unexpected error must NOT be swallowed into a tidy sentence.
  check("an unexpected error keeps its stack", configProblem(new Error("Cannot read properties of undefined")) === null);
  check("a non-Error is handled without throwing", configProblem("boom") === null);
}

console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) process.exit(1);
