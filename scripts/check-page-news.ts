import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NEXT_CACHE_LIMIT, PAGE_ENTRY_BUDGET, boundPageNews, cachedWeight } from "../lib/pageNews";
import NewsLeftOut from "../components/NewsLeftOut";
import type { PricePoint, TimelineEvent } from "../lib/types";

/**
 * A page's news, bounded under Next's 2 MB cache limit (batch 35).
 *
 *   npm run check:page-news
 *
 * Next caches no entry over 2 MB, and a company page is one entry for its timeline. The open item
 * from the 2026-10-21 audit: "the timeline entry still grows with stored news, and nothing bounds
 * it." Measured on 2026-10-22 with JPMorgan's real EDGAR, Yahoo and GDELT rows in a scratch
 * database, the entry weighed 1.48 MB as Next measures it with 90 stories, and 3.16 MB with 3,000
 * stand-in stories added; `boundPageNews` brought it to 1.80 MB, keeping 659 stories, every one
 * since June among them.
 *
 * The rows below are shaped the way `loadEvents` returns them, at JPMorgan's weights: about 380
 * bytes a filing row and 560 a story.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** The size Next compares with 2 MB for an `unstable_cache` entry holding `value`. */
function nextEntrySize(value: unknown): number {
  const entry = { kind: "FETCH", data: { headers: {}, body: JSON.stringify(value), status: 200, url: "" }, revalidate: 900 };
  return JSON.stringify(entry).length;
}

const day = (i: number) => new Date(Date.UTC(2017, 0, 1) + i * 86400000).toISOString().slice(0, 10);
const DAYS = 3580; // 2017-01-01 to 2026-10-19
const BIG_MOVE = "2019-03-15";
const NEWEST = day(DAYS - 1);

function filing(i: number): TimelineEvent {
  return {
    id: `db-${i}`,
    date: day(i % DAYS),
    type: "filing",
    title: `8-K: Results of Operations and Financial Condition; Financial Statements and Exhibits ${i}`,
    source: "SEC EDGAR",
    url: `https://www.sec.gov/Archives/edgar/data/19617/000001961726${String(i).padStart(6, "0")}/0000019617-26-${i}-index.htm`,
    externalId: `0000019617-26-${String(i).padStart(6, "0")}`,
    precision: "day",
  };
}
let nextId = 100000;
function story(date: string, scored: boolean): TimelineEvent {
  const i = nextId++;
  return {
    id: `db-${i}`,
    date,
    type: "news",
    title: `JPMorgan Chase raises its forecast for net interest income as deposit costs ease, story ${i}`,
    source: "reuters.com",
    url: `https://www.reuters.com/business/finance/jpmorgan-chase-raises-forecast-net-interest-income-${i}/`,
    imageUrl: `https://www.reuters.com/resizer/v2/${i}.jpg?auth=0f1e2d3c4b5a69788796a5b4c3d2e1f0&width=1200`,
    externalId: `https://www.reuters.com/business/finance/jpmorgan-chase-raises-forecast-net-interest-income-${i}/`,
    precision: "day",
    relevance: scored ? 0.9 : undefined,
  };
}

function main(): void {
  console.log("\nWhat Next weighs, and how");
  const sample = { title: 'He said "AT&T" — \\ café', n: [1, 2] };
  check("a value's weight is what it adds to the entry Next measures: its JSON, escaped again as a string",
    nextEntrySize(sample) - nextEntrySize(null) === cachedWeight(sample) - cachedWeight(null),
    `${nextEntrySize(sample) - nextEntrySize(null)} vs ${cachedWeight(sample) - cachedWeight(null)}`);
  const cacheSrc = read("node_modules/next/dist/server/lib/incremental-cache/index.js");
  const unstableSrc = read("node_modules/next/dist/server/web/spec-extension/unstable-cache.js");
  check("…and Next still measures an entry that way: the outer JSON's length against 2 * 1024 * 1024, the page inside as a string",
    cacheSrc.includes("const itemSize = JSON.stringify(data).length;") && cacheSrc.includes("itemSize > 2 * 1024 * 1024") &&
      unstableSrc.includes("body: JSON.stringify(result)") && NEXT_CACHE_LIMIT === 2 * 1024 * 1024);
  check("the page's budget leaves room under the limit for the entry's own fields", PAGE_ENTRY_BUDGET < NEXT_CACHE_LIMIT - 100_000);

  console.log("\nA page whose news fits is left as it is");
  const light = [filing(1), story("2026-10-20", true), filing(2)];
  const same = boundPageNews(light, [], 1000);
  check("every row kept, the same array, nothing left out", same.events === light && same.newsLeftOut === 0);

  console.log("\nA heavy page: 3,700 filing rows and 2,597 stories, as JPMorgan's would be after a few days of hourly runs");
  const filings = Array.from({ length: 3700 }, (_, i) => filing(i));
  const news: TimelineEvent[] = [];
  for (let i = 0; i < DAYS; i += 2) news.push(story(day(i), true));
  for (let i = 0; i < 5; i++) news.push(story(NEWEST, i % 2 === 0));
  const bigScored = story(BIG_MOVE, true);
  const bigUnscored = story(BIG_MOVE, false);
  news.push(bigUnscored, bigScored);
  for (let i = DAYS - 400; i < DAYS; i++) news.push(story(day(i), false), story(day(i), true));
  const events = [...filings, ...news].sort((a, b) => a.date.localeCompare(b.date));
  const prices: PricePoint[] = Array.from({ length: DAYS }, (_, i) => ({ time: day(i), value: day(i) === BIG_MOVE ? 112 : 100 }));
  const rest = { name: "JPMORGAN CHASE & CO", ticker: "JPM", summary: "JPMorgan Chase & Co. is an American multinational bank.".repeat(8), macro: [] };
  check("without a bound the entry is over Next's limit, so the page would never be cached",
    nextEntrySize({ ...rest, events }) > NEXT_CACHE_LIMIT, `${(nextEntrySize({ ...rest, events }) / 1e6).toFixed(2)} MB`);

  const bounded = boundPageNews(events, prices, cachedWeight(rest));
  const kept = bounded.events.filter((e) => e.type === "news");
  const has = (e: TimelineEvent) => bounded.events.includes(e);
  check("bounded, the entry is within the budget and so under the limit",
    cachedWeight({ ...rest, events: bounded.events }) <= PAGE_ENTRY_BUDGET && nextEntrySize({ ...rest, events: bounded.events }) < NEXT_CACHE_LIMIT,
    `${(nextEntrySize({ ...rest, events: bounded.events }) / 1e6).toFixed(3)} MB, ${kept.length} of ${news.length} stories`);
  check("…and close to it: the room is used, not wasted",
    cachedWeight({ ...rest, events: bounded.events }) > PAGE_ENTRY_BUDGET - 2000);
  check("every filing row stays, in the order it came", JSON.stringify(bounded.events.filter((e) => e.type !== "news")) === JSON.stringify(filings.slice().sort((a, b) => a.date.localeCompare(b.date))));
  check("the rows kept keep their order", bounded.events.every((e, i) => i === 0 || bounded.events[i - 1].date <= e.date));
  check("the count of stories left out is what was dropped", bounded.newsLeftOut === news.length - kept.length && bounded.newsLeftOut > 0,
    String(bounded.newsLeftOut));
  check("the newest day's stories are all kept: a page read today carries today's news",
    news.filter((e) => e.date === NEWEST).every(has));
  check("the day the price moved 12% keeps its story while the oldest quiet days lose theirs",
    has(bigScored) && !news.filter((e) => e.date < "2017-03-01").some(has),
    `${news.filter((e) => e.date < "2017-03-01").filter(has).length} kept before March 2017`);
  check("on that day, the story scoring named the company is kept and the unscored one is not", has(bigScored) && !has(bigUnscored));
  const keptDays = new Set(kept.map((e) => e.date));
  const pastDays = new Set(news.filter((e) => e.date < day(DAYS - 400)).map((e) => e.date));
  const recentLeft = news.filter((e) => e.date >= day(DAYS - 400) && !has(e));
  check("the past half goes a round at a time: the recent days the newest half missed, then one story on each earlier day",
    [...keptDays].filter((d) => pastDays.has(d)).length > 100 &&
      [...keptDays].filter((d) => pastDays.has(d)).every((d) => kept.filter((e) => e.date === d).length === 1) &&
      recentLeft.every((e) => kept.some((k) => k.date === e.date)),
    `${[...keptDays].filter((d) => pastDays.has(d)).length} earlier days keep one story`);

  console.log("\nA topic with no prices: its past goes newest first");
  const topic = boundPageNews(events, [], cachedWeight(rest));
  check("no price to rank by, so the most recent of the earlier days are the ones kept",
    topic.events.filter((e) => e.type === "news").every((e) => e.date > "2018-01-01"));

  console.log("\nThe page says so");
  const note = renderToStaticMarkup(createElement(NewsLeftOut, { events: bounded.events, leftOut: bounded.newsLeftOut, priced: true }));
  check("a page that leaves stories out says how many it shows of how many, and which",
    note.includes(`Showing ${kept.length.toLocaleString("en-US")} of the ${news.length.toLocaleString("en-US")} news stories`) &&
      note.includes("the days the price moved most") && note.includes("Every filing and other record is here"), note.slice(0, 160));
  check("…and a page that leaves none out says nothing",
    renderToStaticMarkup(createElement(NewsLeftOut, { events: light, leftOut: 0, priced: true })) === "");

  console.log("\nWired");
  const pageData = read("lib/page-data.ts");
  check("a company page's events are bounded after its filings are trimmed, weighed with the rest of its entry",
    /boundPageNews\(\s*dropCompanyPrehistory\(pageRegulations\(pageFilings\(\[\.\.\.events, \.\.\.withoutSharedSectorRows\(events, sector\)\], subject\.cik\)\)\),\s*prices,\s*cachedWeight\(rest\)\s*\)/.test(pageData));
  check("a topic page's too, its prices counted since they share its entry",
    /const rest = \{\s*title: subject\.displayName,[^}]*\bprices,[^}]*\};\s*\/\/[^\n]*\n\s*const \{ events, newsLeftOut \} = boundPageNews\(stored, prices, cachedWeight\(rest\)\);/.test(pageData));
  check("both page caches are re-keyed for the new shape", pageData.includes('["held-company-page", "v7"]') && pageData.includes('["held-topic-page", "v3"]'));
  check("company and topic pages show the note",
    ["app/company/[ticker]/page.tsx", "app/topic/[slug]/page.tsx"].every((p) =>
      read(p).includes("<NewsLeftOut events={data.events} leftOut={data.newsLeftOut} priced={data.prices.length > 1} />")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

main();
