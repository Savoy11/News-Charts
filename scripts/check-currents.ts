/**
 * Currents' headlines, as built in batch 189 and held until Currents answers in writing.
 *
 *   npm run check:currents
 *
 * The owner's call of 2026-11-26 was "Bring back Currents". Its pricing page allows commercial use on
 * every plan; its terms bar building a database of its data, which is what this corpus is. So the reader
 * and its place in ingest are built and tested here, and the registry keeps the source off until the
 * written answer the proposal asked for. This check holds three things:
 *
 *  - what the reader asks (the company's names, quoted; the free plan's page and span; the key in a
 *    header, never the address) and what it keeps (a headline, its day and its link, and nothing of the
 *    article's text, image or author);
 *  - what it reports when Currents refuses, so a spent day is not read as a company with no news;
 *  - that the source is off, and that switching it on is the registry's flag and nothing else: the
 *    ingest list, the request and the footer's credit all follow it.
 *
 * Offline: fetch is replaced, the database is a stub, and no key is real.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CURRENTS_PAGE_SIZE, CURRENTS_SPAN_DAYS, currentsQuery, fetchCurrentsNews } from "../lib/newsExtra";
import { INGESTABLE_SOURCES, SOURCES } from "../lib/ingest/store";
import { QUOTAS, dailyBudgetLeft, subjectCapacity } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { CURRENTS_CLEARED, CURRENTS_CREDIT, CURRENTS_SOURCE_ID, NON_COMMERCIAL_SOURCE_IDS } from "../lib/licenceGate";
import { LOOSE_SOURCES } from "../lib/newsQuality";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail: unknown = ""): void {
  if (ok) pass++;
  else fail++;
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${d ? ` — ${d.slice(0, 400)}` : ""}`);
}

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

interface Asked {
  url: string;
  headers: Record<string, string>;
  cache?: string;
}
const asked: Asked[] = [];
const realFetch = globalThis.fetch;

/** Answers every request with one canned reply and records what was asked. */
function answer(status: number, body: unknown, headers: Record<string, string> = {}): void {
  globalThis.fetch = (async (input: unknown, init?: { headers?: Record<string, string>; cache?: string }) => {
    asked.push({ url: String(input), headers: { ...(init?.headers ?? {}) }, cache: init?.cache });
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(headers),
      json: async () => {
        if (body === undefined) throw new Error("not JSON");
        return body;
      },
      text: async () => JSON.stringify(body ?? ""),
    } as unknown as Response;
  }) as typeof fetch;
}

/** One article as the API's documentation shows it. */
const article = (title: string, url: string, published = "2026-11-25 12:05:00 +0000") => ({
  id: "61f50bbd-20ad-47a3-9d77-9f8e0a08f0ad",
  title,
  description: "Vendors reported stronger-than-expected demand, a preview of the article's own text that is not ours to keep.",
  url,
  author: "Market Desk",
  image: "https://example.com/images/lead.jpg",
  language: "en",
  category: ["economy_business_finance"],
  published,
});

async function main(): Promise<void> {
  const NOW = new Date("2026-11-26T09:30:15.250Z");
  process.env.COMMERCIAL_MODE = "false";
  process.env.CURRENTS_API_KEY = "test-key-not-real";
  // a build contact, were one set, must not ride a keyed request
  process.env.NEWS_CHARTS_CONTACT = "owner@example.com";

  console.log("What Currents is asked");
  check("each name in quotation marks, joined by OR, as its documentation asks for a company's name",
    currentsQuery(["Ford Motor", "Ford"]) === '"Ford Motor" OR "Ford"');
  check("  …a name once whatever its case, a name of under three letters never, quotation marks and brackets out, five names at most",
    currentsQuery(["Alphabet", "ALPHABET", "GM", 'The "Google" (search)', "a", "b3c", "d4e", "f5g", "h6i"]) === '"Alphabet" OR "The Google search" OR "b3c" OR "d4e" OR "f5g"' &&
      currentsQuery(["GM", ""]) === "");

  answer(200, { status: "ok", news: [], page: 1 });
  asked.length = 0;
  const none = await fetchCurrentsNews(["Ford Motor", "Ford"], undefined, NOW);
  const one = asked[0];
  const q = one ? new URL(one.url) : null;
  check("one request, to the search endpoint, in English, the free plan's page of twenty",
    asked.length === 1 && q?.origin + (q?.pathname ?? "") === "https://api.currentsapi.services/v1/search" && q?.searchParams.get("query") === '"Ford Motor" OR "Ford"' &&
      q?.searchParams.get("language") === "en" && q?.searchParams.get("page_size") === String(CURRENTS_PAGE_SIZE) && CURRENTS_PAGE_SIZE === 20, one?.url);
  const from = Date.parse(q?.searchParams.get("start_date") ?? "");
  const to = Date.parse(q?.searchParams.get("end_date") ?? "");
  check("  …for the last seven days less an hour, the plan's span, in the strict form its documentation gives",
    CURRENTS_SPAN_DAYS === 7 && q?.searchParams.get("end_date") === "2026-11-26T09:30:15Z" && q?.searchParams.get("start_date") === "2026-11-19T10:30:15Z" &&
      to - from === (7 * 24 - 1) * 3_600_000, `${q?.searchParams.get("start_date")} to ${q?.searchParams.get("end_date")}`);
  check("  …the key in the Authorization header and nowhere in the address, no contact address sent with it, and no answer kept from an earlier request",
    one?.headers.Authorization === "Bearer test-key-not-real" && !/test-key-not-real|apiKey/i.test(one?.url ?? "") &&
      one?.headers["User-Agent"] === "News Charts Research" && !/@/.test(JSON.stringify(one?.headers)) && one?.cache === "no-store", one?.headers);
  check("  …and an answer with no article is empty, not an error", none.outcome === "empty" && none.events.length === 0 && none.httpStatus === 200);

  console.log("\nWhat is kept of an answer");
  answer(200, {
    status: "ok",
    page: 1,
    news: [
      article("Ford raises guidance after strong truck sales", "https://www.reuters.com/business/autos/ford-raises-guidance"),
      // the same article again: "merge on url before you count articles"
      article("Ford raises guidance after strong truck sales", "https://www.reuters.com/business/autos/ford-raises-guidance"),
      // the search matches the start of an article's text too: a headline that does not name the company
      article("Automakers slide as tariffs bite", "https://example.com/markets/automakers-slide"),
      // a person's name is no naming of the company
      article("Harrison Ford returns in a new film", "https://example.com/film/harrison-ford"),
      article("  Ford   Motor recalls 30,000 trucks ", "https://apnews.com/article/ford-recall", "2026-11-24 23:59:59 +0000"),
      // nothing to link to, no day, or no headline: no row
      article("Ford opens a plant", "javascript:alert(1)"),
      article("Ford names a new finance chief", "https://example.com/a", "not a date"),
      { ...article("", "https://example.com/b") },
    ],
  });
  const got = await fetchCurrentsNews(["Ford Motor", "Ford"], undefined, NOW);
  check("an article whose headline names the company is a row, once; a passing mention, a person's name, and one with no link, day or headline are none",
    got.outcome === "ok" && got.events.map((e) => e.title).join(" | ") === "Ford raises guidance after strong truck sales | Ford Motor recalls 30,000 trucks", got.events.map((e) => e.title));
  const [first, second] = got.events;
  check("  …its day the article's, its link the article's own, its outlet the link's domain and how it was found",
    first?.date === "2026-11-25" && second?.date === "2026-11-24" && first?.url === "https://www.reuters.com/business/autos/ford-raises-guidance" &&
      first?.externalId === first?.url && first?.source === "reuters.com · via Currents" && second?.source === "apnews.com · via Currents" &&
      first?.type === "news" && first?.sourceKey === "currents", first);
  check("  …and nothing of the article's text, image or author: \"republication of article text need separate terms\"",
    got.events.every((e) => e.description === undefined && e.imageUrl === undefined && !/Market Desk|Vendors reported|lead\.jpg/.test(JSON.stringify(e))));
  check("  …one story from two outlets is one story's key, so the corpus keeps one row with two attestations",
    Boolean(first?.dedupBasis) && first?.dedupBasis !== second?.dedupBasis);
  answer(200, { status: "ok", news: [article("Fed holds its inflation target", "https://example.com/fed"), article("Target cuts prices before the holidays", "https://example.com/target")] });
  const word = await fetchCurrentsNews(["Target"], ["Target"], NOW);
  check("a name that is an everyday word names a headline only with its capital, by the names headlines are scored by",
    word.events.map((e) => e.title).join() === "Target cuts prices before the holidays", word.events.map((e) => e.title));

  console.log("\nWhat a refusal is reported as");
  answer(429, { status: "error" }, { "retry-after": "5400" });
  const spent = await fetchCurrentsNews(["Ford Motor"], undefined, NOW);
  check("a 429 is the day's requests spent: throttled, with the wait Currents gives", spent.outcome === "throttled" && spent.httpStatus === 429 && spent.detail === "the day's requests are spent; retry after 5400" && spent.events.length === 0, spent);
  answer(503, { code: "SEARCH_BACKEND_TIMEOUT" });
  const slow = await fetchCurrentsNews(["Ford Motor"], undefined, NOW);
  check("a 503 is its search timing out: throttled, never a search that found nothing", slow.outcome === "throttled" && slow.httpStatus === 503 && slow.detail === "the search timed out");
  answer(401, { status: "error", msg: "Invalid token" });
  const refused = await fetchCurrentsNews(["Ford Motor"], undefined, NOW);
  answer(400, { status: "error", code: "INVALID_QUERY", msg: "Invalid parameters" });
  const bad = await fetchCurrentsNews(["Ford Motor"], undefined, NOW);
  check("a refused key or query is an error with the API's own words", refused.outcome === "error" && refused.httpStatus === 401 && refused.detail === "Invalid token" &&
    bad.outcome === "error" && bad.httpStatus === 400 && bad.detail === "INVALID_QUERY: Invalid parameters", [refused, bad]);
  answer(200, { status: "error", news: null });
  const odd = await fetchCurrentsNews(["Ford Motor"], undefined, NOW);
  answer(500, undefined);
  const broken = await fetchCurrentsNews(["Ford Motor"], undefined, NOW);
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  const down = await fetchCurrentsNews(["Ford Motor"], undefined, NOW);
  check("  …as is an answer that is not the documented one, a failure with no body, and a request that never arrived",
    odd.outcome === "error" && odd.detail === "not the documented answer" && broken.outcome === "error" && broken.httpStatus === 500 && down.outcome === "error" && down.detail === "network down");

  console.log("\nWhen nothing is asked");
  answer(200, { status: "ok", news: [] });
  asked.length = 0;
  delete process.env.CURRENTS_API_KEY;
  const keyless = await fetchCurrentsNews(["Ford Motor"], undefined, NOW);
  process.env.CURRENTS_API_KEY = "test-key-not-real";
  const nameless = await fetchCurrentsNews(["GM"], undefined, NOW);
  process.env.COMMERCIAL_MODE = "true";
  const publicBuild = await fetchCurrentsNews(["Ford Motor"], undefined, NOW);
  process.env.COMMERCIAL_MODE = "false";
  check("with no key, with no name long enough to ask for, and on a public build while the source is held, no request is made",
    asked.length === 0 && keyless.events.length === 0 && nameless.detail === "no name to ask for" && publicBuild.outcome === "empty", asked.map((a) => a.url));
  globalThis.fetch = realFetch;

  console.log("\nThe day's requests");
  const db = (askedToday: number, refused = 0) => ({
    sql: "",
    params: [] as unknown[],
    async query(sql: string, params: unknown[]) {
      this.sql = sql;
      this.params = params;
      return { rows: [{ asked: askedToday, refused }] };
    },
  });
  const fresh = db(0);
  check("the free plan's 250 a day, less every request the fetch log holds for the source since 00:00 UTC, whichever company asked",
    QUOTAS.currents.perDay === 250 && (await dailyBudgetLeft(fresh, "currents")) === 250 && (await dailyBudgetLeft(db(249), "currents")) === 1 &&
      /s\.key = \$1/.test(fresh.sql) && /date_trunc\('day', now\(\) AT TIME ZONE 'UTC'\) AT TIME ZONE 'UTC'/.test(fresh.sql) && !/subject_id/.test(fresh.sql) && fresh.params[0] === "currents");
  check("  …none left at the cap or past it, and none once Currents has answered 429 today", (await dailyBudgetLeft(db(250), "currents")) === 0 &&
    (await dailyBudgetLeft(db(400), "currents")) === 0 && (await dailyBudgetLeft(db(3, 1), "currents")) === 0);
  const unmetered = db(9);
  check("  …and a source with no published daily cap is not counted at all", (await dailyBudgetLeft(unmetered, "gdelt")) === null && unmetered.sql === "");
  check("one request a company a day, so the plan carries 250 companies a day", SOURCE_TTL_MINUTES.currents === 1440 && subjectCapacity("currents") === 250);

  console.log("\nHeld until Currents answers in writing");
  const row = SOURCES.find((s) => s.key === "currents");
  check("the registry holds the source off, dated the day its two pages were read, and says why in its licence line",
    row?.commercialOk === false && row?.reviewedOn === "2026-11-26" && row?.id === CURRENTS_SOURCE_ID && /pricing page allows commercial use/.test(row?.license ?? "") &&
      /bar building a database/.test(row?.license ?? "") && /Held until Currents answers in writing/.test(row?.license ?? "") && row?.attribution === CURRENTS_CREDIT.text, row);
  // the registry's comment as one line of prose
  const store = read("lib/ingest/store.ts").replace(/\n\s*\/\/ /g, " ");
  check("  …quoting both pages beside it, and what switches it on",
    store.includes("every self-service plan, including Free, allows commercial use with attribution and a link to the original article") &&
      store.includes("Create permanent copies of, scrape, build databases of such data") &&
      store.includes("record the answer in docs/decisions/, set `commercialOk: true` here, take 11 out of `NON_COMMERCIAL_SOURCE_IDS` (lib/licenceGate.ts) and `currents` out of check:wiring's `NOT_INGESTED_BY_LICENCE`, and set CURRENTS_API_KEY on the host"));
  check("  …so ingest may not read it, a stored row of it is withheld on a public build, and the footer gives no credit for data the pages do not hold",
    !INGESTABLE_SOURCES.has("currents") && NON_COMMERCIAL_SOURCE_IDS.includes(CURRENTS_SOURCE_ID) && CURRENTS_CLEARED === false);
  const ingest = read("scripts/ingest.ts");
  check("ingest's list of a company's sources and its request both follow the registry: on the list only once cleared, asked only then",
    /\.\.\.\(INGESTABLE_SOURCES\.has\("currents"\) \? \(\["currents"\] as const\) : \[\]\),/.test(ingest) &&
      /if \(INGESTABLE_SOURCES\.has\("currents"\)\) \{\s+const asked = \[name, \.\.\.alsoKnownAs\];/.test(ingest));
  check("  …with a key on the host, inside the day's requests, under the company's names, kept by the names its headlines are scored by",
    /const keyed = licensedKey\("CURRENTS_API_KEY", "currents"\) !== null;/.test(ingest) &&
      /const left = keyed && due\.has\("currents"\) \? await dailyBudgetLeft\(client, "currents"\) : null;/.test(ingest) &&
      /if \(!keyed\) line\("currents", "skipped   no CURRENTS_API_KEY set"\);\s+else if \(left !== null && left <= 0\) line\("currents", `skipped   the day's/.test(ingest) &&
      /else await run\("currents", asked\.join\(" \| "\), \(\) => fetchCurrentsNews\(asked, scoring\.aliases\), \(e\) => collapseNearDuplicates\(e\)\);/.test(ingest));
  const layout = read("app/layout.tsx");
  check("the footer's credit is the link Currents' terms ask for, shown only while its headlines are on the pages",
    CURRENTS_CREDIT.text === "Powered by Currents News API" && CURRENTS_CREDIT.href === "https://currentsapi.services/" &&
      /\{CURRENTS_CLEARED && \(\s*<>[\s\S]{0,200}<a href=\{CURRENTS_CREDIT\.href\}[\s\S]{0,200}\{CURRENTS_CREDIT\.text\}/.test(layout) &&
      /export const CURRENTS_CLEARED: boolean = !NON_COMMERCIAL_SOURCE_IDS\.includes\(CURRENTS_SOURCE_ID\);/.test(read("lib/licenceGate.ts")));
  check("it stays a loosely searched feed, and the questions put to Currents are written down for the owner to send",
    LOOSE_SOURCES.has("currents") && /### The email to Currents/.test(read("docs/OWNER-ACTIONS.md")) &&
      /B3[\s\S]{0,400}\*\*Status:\*\* APPROVED 2026-11-26, built in batch 189, held/.test(read("docs/proposals/2026-11-26-prices-and-news-licensing.md")));

  console.log("\nWired");
  const pkg = read("package.json");
  check("check:currents is in the check chain", /"check:currents": "tsx scripts\/check-currents\.ts"/.test(pkg) && /"check": "[^"]*npm run check:currents/.test(pkg));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

main().catch((err) => {
  globalThis.fetch = realFetch;
  console.error(err);
  process.exit(1);
});
