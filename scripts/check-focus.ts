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
import { applyFocus, focusScore, focusTerms, matchesFocus } from "../lib/focus";
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

console.log("\nThe grade agrees with the gate — membership can never differ");
// Every fixture above, both ways: matchesFocus is exactly focusScore > 0 (empty-terms aside).
const gateFixtures = [
  ev("Trump signs executive order on trade"),
  ev("IBM opens a research lab in Zurich"),
  ev("Quarterly results", "earnings", "Cited the Trump tariffs as a headwind"),
  ev("10-K — Annual report", "filing"),
];
check(
  "gate equivalence over every fixture",
  gateFixtures.every((e) => matchesFocus(e, terms) === (focusScore(e, terms) > 0))
);

console.log("\nGrading — the phrase the reader typed beats two stray words");
const fireTerms = focusTerms("battery fires");
const probe = ev("Tesla battery fire probe widens");
const layoffs = ev("Tesla fires 700 workers");
check("both pass the gate", matchesFocus(probe, fireTerms) && matchesFocus(layoffs, fireTerms));
check(
  "the adjacent full phrase outranks the single stray term",
  focusScore(probe, fireTerms) > focusScore(layoffs, fireTerms),
  `${focusScore(probe, fireTerms).toFixed(2)} vs ${focusScore(layoffs, fireTerms).toFixed(2)}`
);
const titleHit = ev("Tariff ruling lands");
const bodyHit = ev("Markets shrug", "news", "traders discounted the tariff ruling");
const tariffTerms = focusTerms("tariff ruling");
check(
  "a title match outranks a description match",
  focusScore(titleHit, tariffTerms) > focusScore(bodyHit, tariffTerms),
  `${focusScore(titleHit, tariffTerms).toFixed(2)} vs ${focusScore(bodyHit, tariffTerms).toFixed(2)}`
);
check("scores stay within [0, 1]", [probe, layoffs, titleHit, bodyHit].every((e) => {
  const s = focusScore(e, fireTerms);
  return s >= 0 && s <= 1;
}));

console.log("\nRanking — best-first, with the stored score as the tiebreak");
const rel = (title: string, relevance?: number): TimelineEvent => ({ ...ev(title), relevance });
const tie = [rel("battery fire report A", 0.41), rel("battery fire report B"), rel("battery fire report C", 0.9)];
const rankedOut = applyFocus(tie, "battery fires");
const names = rankedOut.ranked.map((e) => e.title.slice(-1));
check("equal grades break on stored relevance, unscored as a neutral prior", names.join("") === "CBA", names.join(""));
check(
  "ranked is a permutation of the matches",
  rankedOut.ranked.length === rankedOut.matched &&
    new Set(rankedOut.ranked.map((e) => e.id)).size === rankedOut.matched
);
check("an inactive focus ranks nothing", applyFocus(tie, null).ranked.length === 0);
// The spine stays chronological: applyFocus's events field must be the original order.
check(
  "the filtered view keeps timeline order — ranking never reorders it",
  applyFocus(tie, "battery fires").events.map((e) => e.id).join() === tie.map((e) => e.id).join()
);

console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) process.exit(1);
