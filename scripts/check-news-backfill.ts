import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PoolClient } from "pg";
import {
  BACKFILL_FROM,
  BACKFILL_WORD_NAMES,
  GAP_MS,
  WINDOWS_PER_RUN,
  backfillNews,
  everydayWordName,
  namedWithCapital,
  namesCompany,
  newsWindows,
  oneWordName,
} from "../lib/ingest/newsBackfill";
import { fetchNews, gdeltNewsPlan, gdeltQuery, type NewsWindow } from "../lib/news";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
import tickers from "../data/edgar-tickers.json";
import wordNames from "../data/english-word-names.json";
import { aliasesFor } from "../lib/enrich/relevance";
import type { FetchResult, TimelineEvent } from "../lib/types";

/**
 * A company's older GDELT news, a month at a time (batch 57).
 *
 *   npm run check:news-backfill
 *
 * The hourly ask returns GDELT's newest hundred pages, so a busy company's news began about when it
 * was first ingested. Offline by construction: GDELT and the database are stand-ins.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

interface Db {
  listed: string | null;
  windows: Map<string, { query: string; articles: number; kept: number }>;
  fetches: { outcome: string; query: string }[];
  latest: string | null;
  statements: string[];
}

/** Just enough of a pg client for the backfill's own statements. */
function fakeDb(db: Db): PoolClient {
  return {
    query: async (sql: string, params: unknown[] = []) => {
      db.statements.push(sql.trim().split(/\s+/).slice(0, 2).join(" "));
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [] };
      if (/FROM prices/.test(sql)) return { rows: [{ listed: db.listed }] };
      if (/^SELECT starts_on/.test(sql)) return { rows: [...db.windows].map(([starts_on, w]) => ({ starts_on, query: w.query })) };
      if (/^SELECT commercial_ok FROM sources/.test(sql)) return { rows: [{ commercial_ok: true }] };
      if (/FROM source_fetches/.test(sql)) return { rows: [{ mine: null, latest: db.latest }] };
      if (/^INSERT INTO source_fetches/.test(sql)) {
        db.fetches.push({ query: String(params.find((p) => typeof p === "string" && p.includes("·")) ?? ""), outcome: String(params.find((p) => ["throttled", "error", "ok", "empty"].includes(String(p)))) });
        return { rows: [] };
      }
      if (/^INSERT INTO gdelt_windows/.test(sql)) {
        const [, from, query, articles, kept] = params as [number, string, string, number, number];
        db.windows.set(from, { query, articles, kept });
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  } as unknown as PoolClient;
}
const freshDb = (listed: string | null = "1972-06-01"): Db => ({ listed, windows: new Map(), fetches: [], latest: null, statements: [] });

const FORD = { kind: "company" as const, displayName: "FORD MOTOR CO", ticker: "F" };
const plan = { query: "Ford Motor", alsoKnownAs: [], byRelevance: false, scoring: { subject: FORD, aliases: aliasesFor(FORD, ["Ford"]) } };
const story = (title: string, date: string): TimelineEvent => ({
  id: `news-${title}`,
  date,
  type: "news",
  title,
  source: "example.com",
  sourceKey: "gdelt",
  url: `https://example.com/${encodeURIComponent(title)}`,
  dedupBasis: `${title}|${date}`,
});
/** A stand-in GDELT: for each month, two headlines naming Ford and one naming someone else. */
function months(answer: (w: NewsWindow, n: number) => FetchResult | null = () => null) {
  const asked: NewsWindow[] = [];
  const fetch = async (w: NewsWindow): Promise<FetchResult> => {
    asked.push(w);
    return (
      answer(w, asked.length) ?? {
        outcome: "ok",
        events: [
          story(`Ford recalls trucks in ${w.from}`, w.from),
          story(`Ford profit beats forecasts in ${w.from}`, w.to),
          story(`Harrison Ford's new film opens in ${w.from}`, w.to),
        ],
      }
    );
  };
  return { asked, fetch };
}
function collector() {
  const stored: TimelineEvent[] = [];
  return { stored, store: async (events: TimelineEvent[]) => void stored.push(...events) };
}
const TODAY = "2026-10-26";

async function main(): Promise<void> {
  console.log("\nThe months asked");
  const all = newsWindows(TODAY);
  check("every month from 2017 that is over, newest first: September 2026 back to January 2017, 117 in all",
    all.length === 117 && all[0].from === "2026-09-01" && all[0].to === "2026-09-30" && all.at(-1)!.from === "2017-01-01" && all.at(-1)!.to === "2017-01-31",
    `${all.length}: ${all[0]?.from}…${all.at(-1)?.from}`);
  const lastDay = (from: string) => new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 0)).toISOString().slice(0, 10);
  check("  …each one whole, from its first day to its last: February 29 in 2020 and 2024, February 28 otherwise",
    all.every((w) => w.from.endsWith("-01") && w.to === lastDay(w.from)) && all.some((w) => w.to === "2020-02-29") && all.some((w) => w.to === "2023-02-28"));
  check("  …and the month still running is left to the hourly ask, until the day after it ends",
    newsWindows("2026-09-30")[0].from === "2026-08-01" && newsWindows("2026-10-01")[0].from === "2026-09-01");
  const snow = newsWindows(TODAY, "2020-09-16");
  check("a company listed mid-month starts at that month, so its years as a word are not asked (Snowflake, Sep 2020)",
    snow.at(-1)!.from === "2020-09-01" && snow.length === 73, `${snow.length}, oldest ${snow.at(-1)?.from}`);
  check(`  …and none before ${BACKFILL_FROM}, the hourly ask's floor`, newsWindows(TODAY, "1972-06-01").length === 117);

  console.log("\nGDELT asked by relevance, inside the month");
  const urls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ articles: [{ title: "Ford recalls trucks", url: "https://example.com/a", seendate: "20190214T120000Z", domain: "example.com" }] }));
  }) as typeof fetch;
  try {
    const got = await fetchNews("Ford Motor", [], { window: { from: "2019-02-01", to: "2019-02-28" } });
    await fetchNews("Ford Motor");
    check("a month's hundred pages most about the company, from its first second to its last",
      /sort=hybridrel&startdatetime=20190201000000&enddatetime=20190228235959/.test(urls[0]) && !/timespan|datedesc/.test(urls[0]), urls[0]?.split("&").slice(-3).join("&"));
    check("  …with the hourly ask's query, and the story dated by GDELT", urls[0].includes(encodeURIComponent(gdeltQuery("Ford Motor"))) && got.events[0]?.date === "2019-02-14");
    check("  …while the hourly ask still asks for the newest", /sort=datedesc&startdatetime=20170101000000/.test(urls[1]));
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log("\nWhat is kept");
  check("a headline naming the company is kept", namesCompany("Ford recalls 1.2 million trucks", plan.scoring.aliases));
  check("  …and one that names someone else by the same word is not: \"Harrison Ford's new film\"", !namesCompany("Harrison Ford's new film opens", plan.scoring.aliases));
  check("  …nor a page that names it nowhere in its headline", !namesCompany("Detroit carmakers brace for strike", plan.scoring.aliases));

  console.log("\nA run");
  const db = freshDb();
  const gd = months();
  const kept = collector();
  const budget = { left: 3 };
  const first = await backfillNews(fakeDb(db), 1, plan, { today: TODAY, budget, gapMs: 0, fetch: gd.fetch, store: kept.store });
  check("asks the newest months first, as many as the run allows",
    gd.asked.map((w) => w.from).join(",") === "2026-09-01,2026-08-01,2026-07-01" && first.read === 3 && first.left === 114 && first.due === 117,
    JSON.stringify(first));
  check("  …keeps the two headlines naming Ford in each and leaves the film", kept.stored.length === 6 && kept.stored.every((e) => !e.title.includes("Harrison")));
  check("  …and stores each month it asked, under the query asked", db.windows.size === 3 && [...db.windows.values()].every((w) => w.query === gdeltQuery("Ford Motor") && w.articles === 3 && w.kept === 2));
  check("  …each month's stories and its record in one transaction", db.statements.filter((s) => s === "BEGIN").length === 3 && db.statements.filter((s) => s === "COMMIT").length === 3);
  const second = await backfillNews(fakeDb(db), 2, plan, { today: TODAY, budget, gapMs: 0, fetch: gd.fetch, store: kept.store });
  check("the budget is the process's: a second company in the same run asks nothing once it is spent", gd.asked.length === 3 && second.read === 0 && !!second.stopped, JSON.stringify(second));
  const later = await backfillNews(fakeDb(db), 1, plan, { today: TODAY, budget: { left: 2 }, gapMs: 0, fetch: gd.fetch, store: kept.store });
  check("a later run asks the months after those, never one already asked",
    gd.asked.slice(3).map((w) => w.from).join(",") === "2026-06-01,2026-05-01" && later.due === 114, gd.asked.slice(3).map((w) => w.from).join(","));
  db.windows.set("2026-04-01", { query: '"FORD MOTOR CO" sourcelang:english', articles: 40, kept: 3 });
  const requery = await backfillNews(fakeDb(db), 1, plan, { today: TODAY, budget: { left: 1 }, gapMs: 0, fetch: gd.fetch, store: kept.store });
  check("a month asked under another query is asked again under today's", requery.due === 112 && gd.asked.at(-1)!.from === "2026-04-01");
  const whole = freshDb();
  const runs: number[] = [];
  for (let i = 0; i < 4; i++) {
    const r = await backfillNews(fakeDb(whole), 1, plan, { today: TODAY, budget: { left: WINDOWS_PER_RUN }, gapMs: 0, fetch: months().fetch, store: collector().store });
    runs.push(r.read);
  }
  check(`a whole history fills in over three runs of ${WINDOWS_PER_RUN} months, and a fourth asks nothing`,
    runs.join(",") === "40,40,37,0" && whole.windows.size === 117, runs.join(","));

  console.log("\nWhen GDELT refuses");
  const tdb = freshDb();
  const throttled = months((_w, n) => (n === 2 ? { events: [], outcome: "throttled", httpStatus: 429 } : null));
  const tb = { left: 10 };
  const t = await backfillNews(fakeDb(tdb), 1, plan, { today: TODAY, budget: tb, gapMs: 0, fetch: throttled.fetch, store: collector().store });
  check("it stops at the first refusal", throttled.asked.length === 2 && t.read === 1 && t.stopped === "throttled", JSON.stringify(t));
  check("  …logs it as a GDELT failure, naming the month, so the run-wide back-off sees it",
    tdb.fetches.length === 1 && tdb.fetches[0].outcome === "throttled" && tdb.fetches[0].query.endsWith("2026-08-01 to 2026-08-31"), JSON.stringify(tdb.fetches));
  check("  …and stores only the month that was answered, so the refused one is asked again", tdb.windows.size === 1 && tdb.windows.has("2026-09-01"));
  const bdb = freshDb();
  bdb.latest = "throttled";
  const banned = months();
  const b = await backfillNews(fakeDb(bdb), 1, plan, { today: TODAY, budget: { left: 10 }, gapMs: 0, fetch: banned.fetch, store: collector().store });
  check("inside a GDELT back-off it asks nothing", banned.asked.length === 0 && /throttled/.test(b.stopped ?? ""), JSON.stringify(b));
  const edb = freshDb();
  const e = await backfillNews(fakeDb(edb), 1, plan, {
    today: TODAY, budget: { left: 10 }, gapMs: 0, fetch: months().fetch,
    store: async () => { throw new Error("disk full"); },
  });
  check("a store that fails rolls the month back, records nothing for it and logs the error",
    e.stopped === "error" && edb.windows.size === 0 && edb.statements.includes("ROLLBACK") && edb.fetches[0]?.outcome === "error");
  const ndb = freshDb(null);
  const none = months();
  const n = await backfillNews(fakeDb(ndb), 1, plan, { today: TODAY, budget: { left: 10 }, gapMs: 0, fetch: none.fetch, store: collector().store });
  check("a company with no prices is not asked about, having no listing day to start from", none.asked.length === 0 && n.due === 0);

  console.log("\nA name that is an everyday word (batch 58, the 2026-10-26 audit)");
  // Real headlines GDELT gave for "TARGET" in September 2026, as the backfill asks: all kept by
  // `namesCompany`, the first five about Target, the rest not
  const targetMonth = [
    "Target expands price cuts ahead of the holiday season",
    "Target opening 8 new stores this fall across six states",
    "Jim Cramer Says Buy Walmart ( WMT ) as Target ( TGT ) Turnaround Gains Momentum",
    "Target Pokémon 30th Anniversary Event Leaves Parents Angry and Confused",
    "Racist Halloween costume shows Target still doesnt get it",
    "IMF urges retaining 5 % inflation target",
    "Spanish fighter jets scrambled AGAIN as  moving target  spotted after Russian onslaught",
    "Bihar urges Centre to raise paddy procurement target to 50 lakh MT",
    "Winnipeg surpasses federal target for housing funding ahead of deadline",
    "Only 14 driving test centres hitting wait - time target",
    "NSE stock gets thumbs up from Street ; here highest share price target",
    "India fiscal deficit widens to ₹7 . 1 lakh crore , hits 41 . 9 % of FY27 target by August",
    "Govt . to retain 5 % inflation target for next three years",
    "Top 5 Breakout stocks to buy : KPI Green , Crisil , Manyavar , Prudent , Go Digit by Sumeet Bagadia | Target , stop - loss",
    "45 % YTD rally ! Experts see up to 56 % upside in these 3 stocks on China export shift | Target , rationale",
  ];
  const TGT = { kind: "company" as const, displayName: "TARGET CORP", ticker: "TGT" };
  const tgtAliases = aliasesFor(TGT, ["TARGET"]);
  check("for \"Target\", \"the headline names it\" is true of the word: all fifteen of a real month pass it",
    targetMonth.every((t) => namesCompany(t, tgtAliases)));
  const capital = targetMonth.filter((t) => namedWithCapital(t, "TARGET"));
  check("  …with its capital, the five about Target pass and eight of the ten others do not",
    capital.length === 7 && targetMonth.slice(0, 5).every((t) => capital.includes(t)) && capital.filter((t) => targetMonth.indexOf(t) >= 5).length === 2,
    `${capital.length} with the capital`);
  check("  …so the two stock tips left keep Target off the measured list, and it is held back",
    BACKFILL_WORD_NAMES.TARGET === undefined && everydayWordName("TARGET") === "TARGET");
  const held = months();
  const heldRun = await backfillNews(fakeDb(freshDb()), 1, { ...plan, query: "TARGET", scoring: { subject: TGT, aliases: tgtAliases } },
    { today: TODAY, budget: { left: 10 }, gapMs: 0, fetch: held.fetch, store: collector().store });
  check("a company asked under an everyday word is not asked about at all, and says why",
    held.asked.length === 0 && heldRun.due === 117 && /everyday word/.test(heldRun.stopped ?? ""), JSON.stringify(heldRun));
  check("  …Southern, Crown and Progressive too, while Pfizer, Nvidia and \"Ford Motor\" are no words",
    ["SOUTHERN", "CROWN", "PROGRESSIVE"].every((w) => everydayWordName(w) === w) && ["Pfizer", "NVIDIA", "Ford Motor"].every((n) => everydayWordName(n) === null));
  check("  …and a one-word name the list does not hold counts as a word, held back until the list is rebuilt",
    everydayWordName("Zorbalux") === "ZORBALUX" && oneWordName("Life360") === null);
  const AAPL = { kind: "company" as const, displayName: "Apple Inc.", ticker: "AAPL" };
  const apple = months(() => ({
    outcome: "ok",
    events: [
      story("Apple inks multibillion - dollar deal with chipmaker Broadcom", "2023-05-23"),
      story("APPLE UNVEILS VISION PRO HEADSET", "2023-06-05"),
      story("Growers say the apple harvest will be the largest in a decade", "2023-05-10"),
    ],
  }));
  const appleKept = collector();
  await backfillNews(fakeDb(freshDb("1980-12-12")), 1, { ...plan, query: "Apple", scoring: { subject: AAPL, aliases: aliasesFor(AAPL, ["Apple"]) } },
    { today: TODAY, budget: { left: 1 }, gapMs: 0, fetch: apple.fetch, store: appleKept.store });
  check(`a measured word is asked, keeping only headlines that write it with its capital: Apple ("${BACKFILL_WORD_NAMES.APPLE?.slice(0, 40)}…")`,
    apple.asked.length === 1 && appleKept.stored.length === 2 && !appleKept.stored.some((e) => e.title.includes("harvest")),
    appleKept.stored.map((e) => e.title).join(" | "));
  const index = tickers as unknown as { syncedOn: string; companies: [number, string, string][] };
  const listed = new Set([...wordNames.words, ...wordNames.others]);
  const unlisted = index.companies.map(([cik, , title]) => oneWordName(gdeltNewsPlan(title, possessiveNameFor(cik), newsNamesFor(cik)).query)).filter((n): n is string => !!n && !listed.has(n));
  check(`every one-word GDELT name in the ticker index is in the word list, built from the index it ships with (${wordNames.words.length} words)`,
    unlisted.length === 0 && wordNames.index.endsWith(index.syncedOn) && /ENABLE/.test(wordNames.source), unlisted.slice(0, 5).join(", "));

  console.log("\nPacing and wiring");
  check(`requests are at least five seconds apart, GDELT's limit (${GAP_MS} ms)`, GAP_MS >= 5000);
  check(`  …so a run's ${WINDOWS_PER_RUN} months take at most five minutes of an hourly refresh`, (WINDOWS_PER_RUN * GAP_MS) / 60_000 <= 5);
  const ingest = read("scripts/ingest.ts");
  check("company ingest asks for the older months after the hourly ask, with the same query, names and scoring",
    /await run\("gdelt", asked,[\s\S]{0,700}backfillNews\(client, subjectId, \{ query: newsQuery, alsoKnownAs, byRelevance, scoring \}\)/.test(ingest));
  check("  …and a failure there costs the company nothing the hourly ask found", /try \{\s*const older = await backfillNews[\s\S]{0,400}\} catch \(err\) \{/.test(ingest));
  const migration = read("db/030_gdelt_windows.sql");
  check("each company's months are kept in their own table, one row per month",
    /CREATE TABLE IF NOT EXISTS gdelt_windows/.test(migration) && /PRIMARY KEY \(subject_id, starts_on\)/.test(migration) && /ON DELETE CASCADE/.test(migration));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
