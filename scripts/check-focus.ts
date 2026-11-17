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
import { readFileSync } from "node:fs";
import Module from "node:module";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FocusBar from "../components/FocusBar";
import BestMatches from "../components/BestMatches";
import { applyFocus, composableFocus, focusFromParam, FOCUS_MAX, focusPreview, focusScore, focusTerms, focusWindow, isFormTerm, matchesFocus, relatedWords } from "../lib/focus";
import { companyFocusPool, focusedMetadata } from "../lib/focusMeta";
import { MAX_QUERY } from "../lib/searchLog";
import { absolute } from "../lib/seo";
import { CONCEPTS } from "../lib/concepts";
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

// NC-008: search now carries the parser's qualifiers onto the page, so a focus can be "in 2020"
// or "after the export rules" as well as an influence.
console.log("\nA year narrows by date, not by a word in the headline");
const dated = (title: string, date: string): TimelineEvent => ({ ...ev(title), date });
const years = [
  dated("Tariff ruling lands", "2019-06-01"),
  dated("Tariffs widen to parts", "2020-03-15"),
  dated("Plant opens", "2020-09-01"),
  dated("Recall announced", "2021-02-01"),
  dated("2020 annual meeting recap", "2022-05-05"),
  dated("Monthly sales", "2020-11"),
];
check("a year is not a term", focusTerms("in 2020").length === 0 && !focusTerms("tariffs in 2025").includes("2025"), focusTerms("tariffs in 2025").join(","));
const y2020 = applyFocus(years, "in 2020");
check("\"in 2020\" keeps 2020's events, month-dated ones included",
  y2020.active && y2020.events.map((e) => e.title).join("|") === "Tariffs widen to parts|Plant opens|Monthly sales",
  y2020.events.map((e) => e.title).join("|"));
check("  …and not a later headline that merely prints \"2020\"", !y2020.events.some((e) => e.date.startsWith("2022")));
const both = applyFocus(years, "tariffs · in 2020");
check("words and a year together are the intersection", both.events.map((e) => e.title).join("|") === "Tariffs widen to parts",
  both.events.map((e) => e.title).join("|"));
const span = focusWindow("between 2019 and 2021");
check("two years span from the first to the last", span?.from === "2019-01-01" && span?.to === "2021-12-31" && span?.label === "2019–2021", JSON.stringify(span));
const since = focusWindow("since 2020");
const after = focusWindow("after 2020");
const before = focusWindow("before 2020");
check("\"since\", \"after\" and \"before\" open one end",
  since?.from === "2020-01-01" && since.to === null && after?.from === "2021-01-01" && after.to === null &&
    before?.from === null && before?.to === "2019-12-31", JSON.stringify([since, after, before]));
check("a year with nothing in it says so rather than emptying the page", (() => {
  const r = applyFocus(years, "in 1999");
  return !r.active && r.matched === 0 && r.events.length === years.length;
})());

console.log("\nQualifier words are not terms");
check("\"after the export rules\" narrows on the rules, not on \"after\"",
  focusTerms("after the export rules").join(",") === "export,rule", focusTerms("after the export rules").join(","));
check("  …so a \"shares fall after earnings\" headline is not swept in",
  !matchesFocus(ev("Shares fall after earnings"), focusTerms("after the export rules")));

console.log("\nThe compare offered beside a focus is for things with a timeline");
check("an influence is offered", composableFocus("Donald Trumps presidency") === "Donald Trumps presidency");
check("  …the influence part of a focus that also has a qualifier", composableFocus("tariffs · in 2025") === "tariffs");
check("a qualifier is not", composableFocus("in 2020") === null && composableFocus("after the export rules") === null);
check("the focus bar only links the compare when there is one",
  /\{composeWith && \(/.test(readFileSync("components/FocusBar.tsx", "utf8")));

// The concern a visitor names is printed other ways in headlines: covid coverage says "pandemic"
// and "lockdown" at least as often. Before lib/concepts.ts, a covid focus found none of it.
console.log("\nOther words for the same concern count, below the word typed");
const covid = focusTerms("covid");
const pandemic = ev("Pandemic shuts stores nationwide");
const lockdown = ev("Quarterly results", "earnings", "Lockdowns weighed on traffic");
const direct = ev("Covid cases slow store reopening");
check("a headline that says \"pandemic\" matches a covid focus", matchesFocus(pandemic, covid));
check("  …and one that says \"lockdowns\" in its description", matchesFocus(lockdown, covid));
check("the typed word still ranks first", focusScore(direct, covid) > focusScore(pandemic, covid),
  `${focusScore(direct, covid).toFixed(2)} vs ${focusScore(pandemic, covid).toFixed(2)}`);
check("  …and a related word in the headline beats the typed word only in the description",
  focusScore(pandemic, covid) > focusScore(ev("Store update", "news", "covid mentioned"), covid));
check("an unrelated headline still does not match", !matchesFocus(ev("New store opens in Ohio"), covid));
const rates = focusTerms("interest rates");
check("a listed phrase is one term, not two loose words", rates.length === 1 && rates[0] === "interest rate", rates.join(","));
check("  …so \"Fed raises rates\" matches it", matchesFocus(ev("Fed raises rates again"), rates));
check("  …and a headline with \"interest\" and \"rate\" apart does not",
  !matchesFocus(ev("Interest in the stock grows at a rate few expected"), rates));
check("a short concern word is kept: \"how did AI affect\" narrows on AI",
  focusTerms("AI").join(",") === "ai" && matchesFocus(ev("Artificial intelligence spending surges"), focusTerms("AI")));
check("  …but other short words are still dropped", !focusTerms("AI in the US").includes("us"));
check("a phrase partly made of weak words is kept whole", focusTerms("consumer price index").join(",") === "consumer price index");
check("a focus outside the list is unchanged", relatedWords(focusTerms("Donald Trumps presidency")).length === 0 &&
  focusTerms("Donald Trumps presidency").length === 3);
const shown = applyFocus([pandemic, direct, ev("New store opens in Ohio")], "covid");
check("the result names the related words, for the focus bar to show",
  shown.related.join(",") === "coronavirus,pandemic,lockdown,quarantine" && shown.matched === 2, `${shown.related.join(",")} / ${shown.matched}`);

console.log("\nThe list keeps its own rules");
const owner = new Map<string, number>();
const twice: string[] = [];
CONCEPTS.forEach((g, i) => g.forEach((w) => {
  const key = w.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim().split(" ").map((t) => (t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t)).join(" ");
  if (owner.has(key) && owner.get(key) !== i) twice.push(w);
  owner.set(key, i);
}));
check("no word belongs to two concerns", twice.length === 0, twice.join(", "));
check("every concern has at least two ways to say it", CONCEPTS.every((g) => new Set(g.map((w) => w.toLowerCase())).size >= 2));
check("no left-out ambiguous word crept in", !CONCEPTS.flat().some((w) => ["deal", "duty", "duties", "settlement", "rule", "rules", "vaccine"].includes(w)));
check("the focus bar says which related words counted", /alsoMatched/.test(readFileSync("components/FocusBar.tsx", "utf8")) &&
  /result\.related/.test(readFileSync("components/FocusBar.tsx", "utf8")));
check("  …and the best-matches strip names one when it is what matched", /result\.related\.filter/.test(readFileSync("components/BestMatches.tsx", "utf8")));

console.log("\nA short word: a letter-and-digit code is looked for, and a focus with nothing to look for says so (batch 39)");
// what lib/prompt.ts leaves as the focus of "how did 5G affect Verizon's stock", "Ford in Q3",
// "how did the US affect Ford", "how did the EU affect Apple" and "how did 8-K filings affect JPMorgan"
check("\"5G\" and \"Q3\" are focus words: a letter and a digit, too specific to turn up by chance",
  focusTerms("5G").join() === "5g" && focusTerms("in Q3").join() === "q3", `${focusTerms("5G")} | ${focusTerms("in Q3")}`);
check("  …while \"the US\" and \"the EU\" give none, and \"COVID-19\" gains no \"19\"",
  ["the US", "the EU"].every((f) => focusTerms(f).length === 0) && focusTerms("COVID-19").join() === "covid");
const verizon = [ev("Verizon expands its 5G network to 30 more cities"), ev("Verizon raises its quarterly dividend"), ev("Verizon Q3 results beat estimates")];
const fiveG = applyFocus(verizon, "5G");
check("how did 5G affect Verizon narrows to the 5G headline", fiveG.active && fiveG.matched === 1 && fiveG.events[0].title.includes("5G"), `${fiveG.matched} matched`);
const bar = (focus: string) =>
  renderToStaticMarkup(createElement(FocusBar, { focus, result: applyFocus(verizon, focus), subject: "VZ", onClear: () => {} })).replace(/<[^>]+>/g, "");
check("a focus with nothing to look for no longer claims every event mentions it",
  !bar("the US").includes("that mention") && bar("the US").includes("Nothing in “the US” can be looked for in headlines") && bar("the US").includes("Dismiss"),
  bar("the US").slice(0, 120));
check("  …while a real match still says how many of how many", bar("5G").includes("Showing the 1 of 3 events that mention “5G”"), bar("5G").slice(0, 90));
check("  …and a focus that matches nothing still says that", bar("Brexit").includes("Nothing on this timeline mentions “Brexit”"), bar("Brexit").slice(0, 90));

console.log("\nAn SEC form is one term: \"Apple 10-K\" narrows to the annual reports (batch 52)");
check("\"10-K\", \"10K\", \"10-Q\", \"8-K\", \"20-F\" and \"S-4\" are each one term, as a filing's title holds them",
  ["10-K", "10K", "10-Q", "8-K", "20-F", "S-4"].map((f) => focusTerms(f).join("|")).join(",") === "10 k,10 k,10 q,8 k,20 f,s 4",
  ["10-K", "10K", "10-Q", "8-K", "20-F", "S-4"].map((f) => focusTerms(f).join("|")).join(","));
check("  …and \"8-K filings\" is the form alone: \"filings\" would match every title that says \"filing\"",
  focusTerms("8-K filings").join() === "8 k" && focusTerms("Ford's 8-Ks").join("|") === "8 k|ford", `${focusTerms("8-K filings")} | ${focusTerms("Ford's 8-Ks")}`);
check("  …while \"4K\", \"8K video\", \"$10K bonus\" and \"Ford's 3 recalls\" hold no form",
  !["4K", "8K video", "$10K bonus", "Ford's 3 recalls"].some((f) => focusTerms(f).some(isFormTerm)),
  ["4K", "8K video", "$10K bonus", "Ford's 3 recalls"].map((f) => focusTerms(f).join("|")).join(", "));
const filings = [
  ev("Apple Inc.: Annual report (10-K)", "earnings"),
  ev("Apple Inc.: Amended annual report (10-K/A)", "filing"),
  ev("Apple Computer Inc.: Annual report (10-K405)", "earnings"),
  ev("Apple Inc.: Quarterly report (10-Q)", "earnings"),
  ev("Apple Inc.: Apple Reports Fourth Quarter Results (8-K 2.02)", "earnings"),
  ev("Apple Inc.: 6-K filing", "filing"),
  ev("Apple shares rise 10 percent after the iPhone launch"),
];
const annual = applyFocus(filings, "10-K");
check("\"10-K\" narrows to the annual reports: the amended one too, and the 10-K405 the form was until 2002", annual.active && annual.matched === 3 && annual.events.every((e) => /10-K/.test(e.title)),
  annual.events.map((e) => e.title).join(" | "));
const current = applyFocus(filings, "8-K filings");
check("\"8-K filings\" narrows to the 8-K, not to the 6-K titled \"filing\"", current.matched === 1 && current.events[0].title.includes("(8-K 2.02)"),
  current.events.map((e) => e.title).join(" | "));
const formBar = renderToStaticMarkup(createElement(FocusBar, { focus: "10-K", result: annual, subject: "AAPL", onClear: () => {} })).replace(/<[^>]+>/g, "");
check("the focus bar says what it narrowed to", formBar.includes("Showing the 3 of 7 events that mention “10-K”"), formBar.slice(0, 90));
check("a form is no subject to draw on its own timeline", composableFocus("10-K") === null && composableFocus("tariffs") === "tariffs");
const strip = renderToStaticMarkup(
  createElement(BestMatches, { result: annual, activeTypes: new Set(["earnings", "filing", "news"]), onJump: () => {} })
).replace(/<[^>]+>/g, " ");
check("the best matches name the form as it is written: “10-K” in the headline, never \"10 k\"",
  strip.includes("“10-K” in the headline") && !/10 k\b/.test(strip), strip.replace(/\s+/g, " ").slice(0, 160));
// batch 80: a small company's reports of the same years, as EDGAR writes their forms, unhyphenated
const small = [
  ev("EAGLE BANCORP INC: Annual report (10KSB)", "earnings"),
  ev("EAGLE BANCORP INC: Quarterly report (10QSB)", "earnings"),
  ev("EAGLE BANCORP INC: Amended annual report (10KSB/A)", "filing"),
  ev("DILLARD'S, INC.: Amended annual report (10-K405/A)", "filing"),
  ev("EAGLE BANCORP INC: Registration to sell shares (small company) (SB-2)", "filing"),
];
check("\"10-K\" finds a small company's annual reports and their amendments, \"10-Q\" its quarterly ones (batch 80)",
  applyFocus(small, "10-K").matched === 3 && applyFocus(small, "10-Q").matched === 1 &&
    applyFocus(small, "10-Q").events[0].title.endsWith("(10QSB)"),
  `${applyFocus(small, "10-K").events.map((e) => e.title).join(" | ")} // ${applyFocus(small, "10-Q").matched}`);

console.log("\nThe forms batch 65 keeps, as a focus reads them");
const more = [
  ev("Apple Inc.: Annual report (10-K)", "earnings"),
  ev("Apple Inc.: Notice that the annual report will be late (NT 10-K)", "filing"),
  ev("Apple Inc.: Shelf registration for new securities (S-3ASR)", "filing"),
  ev("Apple Inc.: Shelf registration for new securities (S-3)", "filing"),
  ev("Arm Holdings plc: Registration to sell shares (foreign company) (F-1)", "filing"),
  ev("Shopify Inc.: Registration for new securities (Canadian company) (F-10)", "filing"),
];
const tenK = applyFocus(more, "10-K");
check("\"10-K\" finds the annual report, not the notice that it will be late", tenK.matched === 1 && tenK.events[0].title.endsWith("(10-K)"),
  tenK.events.map((e) => e.title).join(" | "));
const shelf = applyFocus(more, "S-3");
check("\"S-3\" finds an automatic shelf too, the S-3ASR a large company files", shelf.matched === 2, shelf.events.map((e) => e.title).join(" | "));
const listing = applyFocus(more, "F-1");
check("\"F-1\" finds ARM's listing, which is now kept, and not a Canadian F-10", listing.matched === 1 && /\(F-1\)$/.test(listing.events[0].title),
  listing.events.map((e) => e.title).join(" | "));

/*
 * The focus on the server (NC-003). "How did covid affect Best Buy" opens /company/BBY?focus=covid, and
 * the page used to arrive whole and narrow once its script ran: a shared link's preview, a crawler and
 * a reader without scripts saw the unfocused page. The server reads the focus now, the explorer starts
 * from it, and the link's preview says what the focused page shows, in words the page's records hold.
 */
console.log("\nThe focus on the server (NC-003)");
check("the address's focus is its first value, its spaces collapsed",
  focusFromParam("  covid \t relief ") === "covid relief" && focusFromParam(["tariffs", "covid"]) === "tariffs" && focusFromParam(" ") === null && focusFromParam(undefined) === null && focusFromParam([]) === null);
check(`  …cut at ${FOCUS_MAX} characters, a search's own cap (MAX_QUERY), since every focus came out of a query that long`,
  FOCUS_MAX === MAX_QUERY && focusFromParam("x".repeat(250))?.length === FOCUS_MAX, `${FOCUS_MAX} vs ${MAX_QUERY}`);

const bby = (id: string, date: string, title: string, type: EventType = "news", source = "Test"): TimelineEvent => ({ id, date, type, title, source });
const page = [
  bby("p1", "2020-03-20", "Best Buy closes stores as the pandemic spreads"),
  bby("p2", "2019-05-13", "Tariffs on Chinese goods lift Best Buy's costs"),
  bby("p3", "2019-05-01", "Best Buy beats estimates"),
  bby("p4", "2021-03-19", "Best Buy Co., Inc.: Annual report (10-K)", "filing", "SEC EDGAR"),
  bby("p5", "2022-08-02", "Best Buy shares slide", "news", "Scandal Weekly"),
];
const prev = (focus: string) => focusPreview(page, focus);
const covidPrev = prev("covid");
check("a focused link's preview counts the events the focus keeps and names the best match: \"covid\", a concern, by its other word",
  covidPrev?.matched === 1 && covidPrev.total === 5 && covidPrev.phrase === "on “covid”" && covidPrev.best.id === "p1", JSON.stringify(covidPrev && { ...covidPrev, best: covidPrev.best.id }));
check("  …a word as the visitor wrote it, \"tariffs\", not its stem", prev("tariffs")?.phrase === "on “tariffs”", prev("tariffs")?.phrase);
check("  …and only a word the page's records hold: \"tariffs scandal\" names \"tariffs\", and the address's other word nowhere",
  prev("tariffs scandal")?.phrase === "on “tariffs”", prev("tariffs scandal")?.phrase);
check("  …counting the rows the words it names keep: the page shows \"Scandal Weekly\"'s row too, and the preview does not call it one on tariffs",
  applyFocus(page, "tariffs scandal").matched === 2 && prev("tariffs scandal")?.matched === 1 && prev("tariffs scandal")?.best.id === "p2");
check("  …nor a word only a source's name holds, which then makes no preview: \"scandal\" is in \"Scandal Weekly\" alone",
  applyFocus(page, "scandal").active && prev("scandal") === null);
check("  …a year is named as its window, with the words or alone",
  prev("tariffs in 2019")?.phrase === "on “tariffs” in 2019" && prev("in 2020")?.phrase === "in 2020" && prev("in 2020")?.matched === 1,
  `${prev("tariffs in 2019")?.phrase} · ${prev("in 2020")?.phrase}`);
check("  …a form by its name", prev("10-K")?.phrase === "on “10-K”" && prev("10-K")?.best.id === "p4", prev("10-K")?.phrase);
check("  …and a focus that narrows nothing, or says nothing searchable, makes none", prev("zorblax") === null && prev("the") === null && focusPreview(page, null) === null);

const meta = (focus: string | null) =>
  focusedMetadata({ label: "Best Buy (BBY)", path: "/company/BBY", events: page, focus, priced: true, ogType: "website" });
const mTariffs = meta("tariffs scandal");
const og = (mTariffs?.openGraph ?? {}) as { title?: string; description?: string; url?: string };
check("a focused page's title and description say what it shows",
  mTariffs?.title === "Best Buy (BBY) timeline: 1 event on “tariffs”" &&
    mTariffs.description === "1 event of 5 on the Best Buy (BBY) timeline on “tariffs”, against the price. Best match, 2019-05-13: “Tariffs on Chinese goods lift Best Buy's costs”",
  `${mTariffs?.title} · ${mTariffs?.description}`);
check("  …the address's word no record holds is in none of them",
  ![mTariffs?.title, mTariffs?.description, og.title, og.description, (mTariffs?.twitter as { title?: string } | undefined)?.title].some((t) => /scandal/i.test(String(t))));
check("  …its canonical address is the page's own, and its shared address the focused one",
  (mTariffs?.alternates as { canonical?: string } | undefined)?.canonical === absolute("/company/BBY") && og.url === absolute("/company/BBY?focus=tariffs%20scandal"), og.url);
check("  …and a focus that narrows nothing leaves the page's plain metadata", meta("zorblax") === null && meta(null) === null);

// The explorers render on the server here as Next renders them: their chart library ships only an ES
// module this loader cannot require, and every call to it is in an effect, which a server render never
// runs, so a stand-in is resolved in its place (scripts/fixtures/lightweight-charts-stub.cjs).
const loader = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const resolveFilename = loader._resolveFilename;
loader._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
  return request === "lightweight-charts" ? join(__dirname, "fixtures", "lightweight-charts-stub.cjs") : resolveFilename.call(this, request, ...rest);
};
/* eslint-disable @typescript-eslint/no-require-imports -- required after the loader learns the stand-in */
const CompanyExplorer = require("../components/CompanyExplorer").default;
const TopicExplorer = require("../components/TopicExplorer").default;
/* eslint-enable @typescript-eslint/no-require-imports */
const prices = [{ time: "2019-01-02", value: 50 }, { time: "2022-12-30", value: 70 }];
const focusedHtml = renderToStaticMarkup(createElement(CompanyExplorer, { prices, events: page, subject: "Best Buy", initialFocus: "covid" }));
const plainHtml = renderToStaticMarkup(createElement(CompanyExplorer, { prices, events: page, subject: "Best Buy" }));
check("a company page arrives focused: the server's render has the focus bar and the best matches, and leaves the other rows out",
  /data-focus-bar/.test(focusedHtml) && /data-best-matches/.test(focusedHtml) && /Showing the <strong>1<\/strong> of 5 events/.test(focusedHtml) &&
    /pandemic spreads/.test(focusedHtml) && !/beats estimates/.test(focusedHtml));
check("  …and without a focus, as before, it arrives whole", !/data-focus-bar/.test(plainHtml) && /beats estimates/.test(plainHtml) && /pandemic spreads/.test(plainHtml));
const topicHtml = renderToStaticMarkup(createElement(TopicExplorer, { events: page, subject: "Retail", initialFocus: "tariffs" }));
check("  …a topic page too", /data-focus-bar/.test(topicHtml) && /data-best-matches/.test(topicHtml) && !/beats estimates/.test(topicHtml));

// the preview's count is the page's: a focus about the economy turns the Economy chip on, and both count its rows
const macro = [
  { id: "m1", date: "2020-03-15", type: "macro" as EventType, title: "Fed cuts interest rates to near zero", source: "Federal Reserve" },
  { id: "m2", date: "2021-06-10", type: "macro" as EventType, title: "CPI rises 5.0% over the year", source: "BLS" },
];
const ratesPage = [...page, bby("p6", "2022-06-16", "Best Buy says interest rates weigh on demand")];
const ratesHtml = renderToStaticMarkup(createElement(CompanyExplorer, { prices, events: ratesPage, macro, subject: "Best Buy", initialFocus: "interest rates" }));
const ratesMeta = focusedMetadata({ label: "Best Buy (BBY)", path: "/company/BBY", events: companyFocusPool(ratesPage, macro, "interest rates"), focus: "interest rates", priced: true, ogType: "website" });
const ratesShown = /Showing the <strong>(\d+)<\/strong> of (\d+) events/.exec(ratesHtml);
check("the preview counts what the focused page shows, the economy's rows included when the focus is the economy's",
  !!ratesShown && ratesMeta?.title === `Best Buy (BBY) timeline: ${ratesShown[1]} events on “interest rates”` && ratesShown[1] === "2" && ratesShown[2] === "8" && /near zero/.test(ratesHtml),
  `${ratesShown?.[0]} · ${ratesMeta?.title}`);

const src = (path: string) => readFileSync(join(__dirname, "..", path), "utf8");
const companyPage = src("app/company/[ticker]/page.tsx");
const topicPage = src("app/topic/[slug]/page.tsx");
check("both pages read the focus from the address and hand it to the explorer",
  [companyPage, topicPage].every((p) => /focusFromParam\(\(await searchParams\)\.focus\)/.test(p) && /initialFocus=\{focus\}/.test(p) && /focusedMetadata\(/.test(p)));
check("  …and keep it on the redirects to the page's one address: /company/Ford?focus=covid is F's page focused, not F's whole page",
  /redirect\(focusHref\(`\/company\/\$\{data\.ticker\}`, focus\)\)/.test(companyPage) && (topicPage.match(/redirect\(focusHref\(subjectPath\(/g) ?? []).length === 2);
check("  …and the explorers start from it, reading the address after mount as the server did, so the two renders agree",
  ["components/CompanyExplorer.tsx", "components/TopicExplorer.tsx"].map(src).every((c) => /useState<string \| null>\(initialFocus\)/.test(c) && /focusFromParam\(sp\.get\("focus"\)\)/.test(c) && !/sp\.get\("focus"\);/.test(c)));

console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) process.exit(1);
