import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * The keyless focus filter — the intersection half of "how did X affect Y stock".
 *
 *   npm run check:focus
 *
 * The two failure modes are opposite and both silent. Too loose and the reader is told an
 * unrelated article concerns Trump. Too tight and most of the timeline vanishes behind a filter,
 * which looks identical to a subject we know very little about. The zero-match rule is the one
 * that matters most: an empty page reads as "no data on IBM", not "no overlap".
 */
import { applyFocus, focusTerms, matchesFocus } from "../lib/focus";
import type { EventType, TimelineEvent } from "../lib/types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

let n = 0;
const ev = (title: string, type: EventType = "news", description?: string): TimelineEvent => ({
  id: `e${n++}`,
  date: "2020-01-01",
  type,
  title,
  source: "test",
  description,
});

console.log("\nWhat a focus phrase narrows on");
check("scaffolding is dropped", !focusTerms("the effect of tariffs").includes("effect"), focusTerms("the effect of tariffs").join(","));
check("and the real word kept", focusTerms("the effect of tariffs").includes("tariff"), focusTerms("the effect of tariffs").join(","));
// "Trumps" (no apostrophe) is how people type it; it has to reach "Trump".
check("a possessive plural stems", focusTerms("Donald Trumps presidency").includes("trump"), focusTerms("Donald Trumps presidency").join(","));
check("multi-word phrases keep each part", focusTerms("Donald Trumps presidency").length === 3, focusTerms("Donald Trumps presidency").join(","));
// A phrase of nothing but scaffolding must not silently match everything as if it were a filter.
check("a phrase that says nothing yields no terms", focusTerms("the impact of the stock price") .length === 0, focusTerms("the impact of the stock price").join(","));
check("short words are not terms", !focusTerms("AI in the US").includes("us"), focusTerms("AI in the US").join(","));

console.log("\nMatching events");
const terms = focusTerms("Donald Trumps presidency");
check("a headline naming the person matches", matchesFocus(ev("Trump signs executive order on trade"), terms));
check("the full name matches", matchesFocus(ev("Donald Trump meets tech executives"), terms));
check("a description-only mention matches", matchesFocus(ev("Quarterly results", "earnings", "Cited the Trump tariffs as a headwind"), terms));
// The whole point of the intersection: an unrelated company event must not be swept in.
check("an unrelated headline does not match", !matchesFocus(ev("IBM opens a research lab in Zurich"), terms));
check("a filing does not match by accident", !matchesFocus(ev("10-K — Annual report", "filing"), terms));
check("no terms means no filtering", matchesFocus(ev("anything"), []));

console.log("\nApplying it to a timeline");
const timeline = [
  ev("Trump signs executive order on trade"),
  ev("IBM opens a research lab in Zurich"),
  ev("Tariffs raise costs, company says", "news", "The Trump administration's levies"),
  ev("10-K — Annual report", "filing"),
];
const applied = applyFocus(timeline, "Donald Trumps presidency");
check("only the matching events are shown", applied.events.length === 2, `${applied.events.length}`);
check("the filter reports itself as active", applied.active);
check("and reports the totals it hid", applied.matched === 2 && applied.total === 4, `${applied.matched}/${applied.total}`);

console.log("\nWhen the focus matches nothing");
// The rule that keeps a narrowed page from lying: never render an empty timeline.
const empty = applyFocus(timeline, "Vladimir Putin");
check("everything is shown rather than nothing", empty.events.length === 4, `${empty.events.length}`);
check("the filter reports itself inactive", !empty.active);
check("but the zero is still reported so the caller can say so", empty.matched === 0, `${empty.matched}`);

console.log("\nWhen there is no focus at all");
const none = applyFocus(timeline, null);
check("nothing is filtered", none.events.length === 4 && !none.active);
const noise = applyFocus(timeline, "the effect of the stock price");
check("a focus of pure scaffolding filters nothing", noise.events.length === 4 && !noise.active, `${noise.events.length}`);

console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) process.exit(1);
