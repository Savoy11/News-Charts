import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * The arithmetic behind the search accuracy number.
 *
 *   npm run check:search-log
 *
 * A metric nobody checks is worse than no metric, because it gets quoted. The failure this is
 * aimed at is not a crash — it is a number that reads 100% while a fifth of searches landed on
 * an empty page, or a top-misses list that splits one query across four rows and buries it.
 *
 * Offline: pure functions over hand-built rows, no database.
 */
import {
  MAX_QUERY,
  fromCorpus,
  normaliseQuery,
  percentile,
  summarise,
  topQueries,
  trimForLog,
  type LoggedRow,
  type ResolutionRung,
} from "../lib/searchLog";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  }
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const row = (
  query: string,
  resolvedBy: ResolutionRung,
  hasEvents: boolean | null,
  durationMs = 10,
  subject = query
): LoggedRow => ({ query, subject, resolvedBy, hasEvents, durationMs });

console.log("\nWhat gets stored");
check("whitespace is collapsed", trimForLog("  ford   motor \n company ") === "ford motor company");
check("a pasted essay is capped", trimForLog("x".repeat(500)).length === MAX_QUERY);
check("a normal query is untouched", trimForLog("AAPL") === "AAPL");

console.log("\nTwo spellings of one search are one search");
check("case is not a distinction", normaliseQuery("Ford") === normaliseQuery("ford"));
check("trailing punctuation is not either", normaliseQuery("ford?") === normaliseQuery("ford"));
check("inner spacing is normalised", normaliseQuery("electric   cars") === "electric cars");
// Accents and non-Latin scripts are real subjects, not noise to be stripped to nothing.
check("accents survive", normaliseQuery("Nestlé") === "nestlé", normaliseQuery("Nestlé"));
check("non-Latin scripts survive", normaliseQuery("阿里巴巴") === "阿里巴巴", normaliseQuery("阿里巴巴"));

console.log("\nThe accuracy number");
const mixed: LoggedRow[] = [
  row("aapl", "known_company", true),
  row("ford", "known_company", true),
  row("bicycle", "known_subject", true),
  row("zzqq", "edgar", false),
  row("how did trump affect ibm", "assumed_topic", false, 10, "trump"),
];
const s = summarise(mixed);
check("counts every search", s.searches === 5, String(s.searches));
check("landed is the share that reached events", Math.abs(s.landed - 0.6) < 1e-9, pctOf(s.landed));
check("per-rung shares sum to 1", Math.abs(s.byRung.reduce((t, r) => t + r.share, 0) - 1) < 1e-9);
check(
  "a rung's landed rate is its own, not the whole",
  s.byRung.find((r) => r.rung === "known_company")?.landed === 1,
  String(s.byRung.find((r) => r.rung === "known_company")?.landed)
);
check("rungs nobody hit are omitted", !s.byRung.some((r) => r.rung === "empty"));
check(
  "a rewritten query is counted as rewritten",
  Math.abs(s.parserRewrote - 0.2) < 1e-9,
  pctOf(s.parserRewrote)
);

console.log("\nAn unknown outcome is not a success");
// The failure mode worth guarding: `has_events` is null when the probe itself failed, and
// counting those as landed would make a broken database look like a perfect search engine.
const withUnknown = [...mixed, row("dropped", "known_subject", null)];
const u = summarise(withUnknown);
check("unknown rows are excluded from landed", Math.abs(u.landed - 0.6) < 1e-9, pctOf(u.landed));
check("and are reported separately", u.unknown === 1, String(u.unknown));
check("while still counting as searches", u.searches === 6, String(u.searches));

console.log("\nNo searches at all is 0%, not a crash and not 100%");
const empty = summarise([]);
check("no searches", empty.searches === 0);
check("landed is 0, not NaN", empty.landed === 0);
check("no rungs", empty.byRung.length === 0);

console.log("\nThe miss list");
const misses = topQueries(
  [
    row("Ford", "assumed_topic", false),
    row("ford", "assumed_topic", false),
    row("ford?", "known_company", false),
    row("bicycle", "assumed_topic", false),
  ],
  10
);
check("one query, counted once", misses.length === 2, misses.map((m) => m.query).join(", "));
check("with every ask counted", misses[0].asked === 3, String(misses[0].asked));
check("most-asked first", misses[0].query === "ford", misses[0].query);
// A query answered by two different rungs is either the corpus filling in behind it or the
// ladder being unstable. Both are worth seeing; neither is visible row by row.
check("an inconsistently answered query shows both rungs", misses[0].rungs.length === 2, misses[0].rungs.join(", "));
check("the limit is honoured", topQueries(misses.map((m) => row(m.query, "edgar", false)), 1).length === 1);

console.log("\nWhich rungs mean we already knew the answer");
check("a known company did", fromCorpus("known_company"));
check("a known subject did", fromCorpus("known_subject"));
check("EDGAR did not", !fromCorpus("edgar"));
// The rung that produces a confidently wrong page. It must never read as a corpus hit.
check("an assumed topic did not", !fromCorpus("assumed_topic"));

console.log("\nLatency percentiles");
const ds = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
check("p50", percentile(ds, 50) === 50, String(percentile(ds, 50)));
check("p95", percentile(ds, 95) === 100, String(percentile(ds, 95)));
check("a single sample is its own percentile", percentile([7], 95) === 7);
check("no samples is 0", percentile([], 50) === 0);
check("input is not mutated", (() => { const xs = [3, 1, 2]; percentile(xs, 50); return xs[0] === 3; })());

function pctOf(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) {
  console.log("Failed:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("");
  process.exit(1);
}
