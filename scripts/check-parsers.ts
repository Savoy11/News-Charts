import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * The deterministic parsers that decide *where an event lands in time*.
 *
 *   npm run check:parsers
 *
 * Every case here comes from a real failure or a real near-miss. A date parser that is wrong
 * does not throw — it plants an event in the Middle Ages, drags a timeline's whole range with
 * it, and leaves a page that looks fine to anyone not reading the axis. That is the failure
 * mode these guard.
 */
import { extractYear, parseCitations } from "../lib/wiki";
import { dividendTitle, exactClose, fetchDailyPrices, fullHistoryQuery, splitsIn } from "../lib/prices";
import { formatPrice } from "../lib/priceFormat";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dropCompanyPrehistory } from "../lib/history";
import { dropImplausiblePress, ABSOLUTE_FLOOR, fetchPressMentions } from "../lib/loc";
import { waybackCouldHave, waybackUrl } from "../lib/wikidata";
import type { TimelineEvent } from "../lib/types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const year = (sentence: string, expected: number | null) =>
  check(
    `${JSON.stringify(sentence.slice(0, 62))} → ${expected}`,
    extractYear(sentence) === expected,
    String(extractYear(sentence))
  );

console.log("\nYears that are really years");
year("The company was founded in 1903 in Detroit.", 1903);
year("In 2013, the service launched nationwide.", 2013);
year("Sales grew through the mid-1990s.", 1990);
year("By 1888 the safety bicycle had arrived.", 1888);

console.log("\nNumbers that only look like years");
// This is the bug that scattered Alibaba's early history across 1060 and 1688: a ticker and a
// domain name read as dates, and the timeline stretched back to the Middle Ages.
year("Alibaba Group Holding Limited (SEHK: 1060) reported results.", null);
year("The site 1688.com serves domestic wholesale buyers.", null);
year("Listed as HKG: 1688 on the Hong Kong exchange.", null);
year("Its stock code 1060 is quoted in Hong Kong.", null);
year("The display runs at 1280 x 720 pixels.", null);
year("A 3264 × 1836 sensor shipped in the model.", null);
year("Priced at $1,999 at launch.", null);
year("Recorded in 1080p.", null);
year("The engine is designated PW1500G.", null);
year("A 1200 mAh battery powers it.", null);

console.log("\nMeasurements vs. the preposition 'in'");
// "in" is both an abbreviation for inches and the commonest preposition in English. Masking it
// with a space allowed swallowed the year in "founded in 1903 in Detroit", and the sentence lost
// its place on the timeline with nothing to show it had been dropped.
year("The plant opened in 1957 in Chicago.", 1957);
year("Production began in 1913 in Highland Park.", 1913);
year("A 27in monitor shipped that year.", null);
year("Measuring 27 in. across.", null);
year("The 15 inch model followed.", null);

console.log("\nA real year still wins when noise sits beside it");
year("Founded in 1903, the company later listed as NYSE: 12345.", 1903);
year("The 1280 x 720 panel shipped in 2011.", 2011);

console.log("\nCompany prehistory guard");
{
  const ev = (date: string, type: TimelineEvent["type"] = "history"): TimelineEvent => ({
    id: date + type,
    date,
    type,
    title: `event ${date}`,
    source: "test",
  });

  // A company's history is roughly continuous. A lone event 600 years before everything else
  // is a parser artifact, not a founding date.
  const withArtifact = [ev("1060-01-01"), ev("1903-06-16"), ev("1908-10-01"), ev("2021-05-19")];
  const trimmed = dropCompanyPrehistory(withArtifact);
  check("a lone medieval outlier is dropped", trimmed.length === 3, `${trimmed.length} kept`);
  check("the real founding date survives", trimmed[0]?.date === "1903-06-16", trimmed[0]?.date);

  // The guard must not trim a genuinely old, continuous history.
  const continuous = [ev("1837-01-01"), ev("1903-06-16"), ev("1908-10-01")];
  check(
    "a continuous history is left alone",
    dropCompanyPrehistory(continuous).length === 3,
    `${dropCompanyPrehistory(continuous).length} kept`
  );

  // Only history/citation are considered — a filing carries its own exact date.
  const withFiling = [ev("1060-01-01", "filing"), ev("1903-06-16"), ev("1908-10-01")];
  check(
    "non-history events are never trimmed",
    dropCompanyPrehistory(withFiling).some((e) => e.date === "1060-01-01")
  );

  check("too few events to judge → unchanged", dropCompanyPrehistory([ev("1060-01-01")]).length === 1);
  check("empty input is safe", dropCompanyPrehistory([]).length === 0);
}

console.log("\nImplausible press guard");
{
  const press = (date: string): TimelineEvent => ({
    id: date,
    date,
    type: "press",
    title: `scan ${date}`,
    source: "Chronicling America",
  });

  // OCR is noisy enough that a search for "bicycle" matches garbled text from before it existed.
  const scans = [press("1802-01-01"), press("1888-05-02"), press("1901-03-11")];
  const kept = dropImplausiblePress(scans, 1885);
  check("scans older than the subject are dropped", kept.length === 2, `${kept.length} kept`);
  check("the floor is inclusive", dropImplausiblePress(scans, 1888).length === 2);
  check("a limit caps the result", dropImplausiblePress(scans, 1800, 1).length === 1);
  check("no floor year → nothing survives an impossible bar", dropImplausiblePress(scans, 3000).length === 0);

  /**
   * The floor of last resort, for a subject whose own history we do not know.
   *
   * Two ingest branches passed `0` here, or no floor at all, which filters nothing — so every
   * Internet Archive cataloguing error shipped. Measured live 2026-08-12: a `"Ford Motor"` query
   * returned five 1914–29 sheet-music covers stamped `year: 1770`, plus items dated 1292 and
   * year 1, for a company founded in 1903.
   */
  const junk = [press("0001-01-01"), press("1292-01-01"), press("1770-01-01"), press("1926-06-01")];
  const companyKept = dropImplausiblePress(junk, ABSOLUTE_FLOOR.company);
  check("the company floor drops the archive's mis-catalogued rows", companyKept.length === 1, `${companyKept.length} kept`);
  check("  …and keeps the real one", companyKept[0]?.date === "1926-06-01", companyKept[0]?.date);
  // 1780 is chosen because the oldest surviving US public companies date from that decade, so it
  // is a bound on IMPOSSIBILITY. A tighter one would drop real pre-listing history.
  check("the company floor predates the oldest US public company", ABSOLUTE_FLOOR.company <= 1784);
  // Deliberately a no-op: a topic can legitimately be ancient, and inventing a tighter bound
  // would drop real history to tidy up someone else's cataloguing.
  check("the topic floor claims nothing the archive does not", ABSOLUTE_FLOOR.topic === 1500);
  check("  …so an old topic keeps its old material", dropImplausiblePress([press("1650-01-01")], ABSOLUTE_FLOOR.topic).length === 1);

  /**
   * The Wayback link's honesty rule. Nothing was archived before 1996, so for an earlier event
   * there is no capture to be near — the link was not imprecise, it was a claim about a page that
   * never existed. A 1926 Ford event resolved to a capture from December 1998.
   */
  check("a pre-web event gets no snapshot link", !waybackCouldHave("1926-06-01"));
  check("the epoch itself is offered", waybackCouldHave("1996-01-01"));
  check("a modern event is offered", waybackCouldHave("2019-04-02"));
  check("the link still points at the date asked for", waybackUrl("ford.com", "2019-04-02").includes("/20190402/"), waybackUrl("ford.com", "2019-04-02"));
}

console.log("\nOne broken citation must not cost the next article its citations");
{
  // NC-150: the cite regex was a module-level /g regex, and the unbalanced-tail break left its
  // lastIndex mid-string. History and Timeline companion articles are parsed back to back, so the
  // second started part-way in and silently yielded nothing.
  const cite = (n: number) =>
    `{{cite news |title=A real headline number ${n} |url=https://example.com/${n} |date=2019-04-02 |work=Reuters}}`;
  const broken = `Intro ${cite(1)} more {{cite web |title=Unterminated citation here |url=https://x.com |date=2020-01-01 `;
  check("the broken article keeps what parsed before the break", parseCitations(broken).length === 1);
  const next = parseCitations(`${cite(2)} and ${cite(3)}`);
  check("the next article parsed still yields both citations", next.length === 2, `${next.length}`);
}

console.log("\nDividends print as declared, not rounded to cents");
// NC-155: toFixed(2) showed $0.2775 as $0.28 and a $0.004 distribution as $0.00.
for (const [amount, shown] of [
  [0.2775, "$0.2775"],
  [0.004, "$0.004"],
  [0.5, "$0.50"],
  [0.24, "$0.24"],
  [1.0, "$1.00"],
  [0.27749999, "$0.2775"],
  [1250, "$1,250.00"],
] as const) {
  check(`${amount} → ${shown}`, dividendTitle(amount) === `Dividend of ${shown} per share`, dividendTitle(amount));
}

// NC-140: the title baked in the search term ("“Ford” in the Detroit Free Press") while the
// identity is the page link, so a page matched by "Ford" and by "automobile" took whichever term
// was ingested last — and flipped, with its content hash, on every refresh.
async function newspaperTitles(): Promise<void> {
  console.log("\nOne newspaper page reads the same on every subject that matched it");
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      results: [{ date: "1903-06-17", partof_title: ["Detroit free press"], location_state: ["michigan"], id: "https://www.loc.gov/resource/x/1903-06-17/ed-1/?sp=4" }],
    }),
  })) as unknown as typeof fetch;
  try {
    const [ford] = (await fetchPressMentions("Ford")).events;
    const [auto] = (await fetchPressMentions("automobile")).events;
    check("the same page gets the same title whichever subject asked", ford?.title === auto?.title, `${ford?.title} / ${auto?.title}`);
    check("  …and the title names no search term", !/Ford|automobile/.test(ford?.title ?? ""), ford?.title);
    check("  …while the identity is still the page", ford?.dedupBasis === auto?.dedupBasis);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// NC-103: a refused chart fetch came back as an empty series and was never logged, so "Yahoo had
// nothing" and "Yahoo said no" looked the same — and a company page needing prices said "not
// indexed" over a timeline we held. NC-156: a new split left closes older than the 10-year window
// on the old adjustment.
async function priceFetch(): Promise<void> {
  console.log("\nA price fetch says what happened");
  const realFetch = globalThis.fetch;
  let asked = "";
  const answer = (status: number, body: unknown) => {
    globalThis.fetch = (async (input: unknown) => {
      asked = String(input);
      return { ok: status < 400, status, json: async () => body } as unknown as Response;
    }) as typeof fetch;
  };
  const chart = {
    chart: {
      result: [{
        timestamp: [1709510400, 1709596800],
        indicators: { quote: [{ close: [12.34, 12.5], volume: [100, 200] }] },
        events: { splits: { "1709510400": { date: 1709510400, numerator: 2, denominator: 1 } } },
      }],
    },
  };
  try {
    answer(200, chart);
    const ok = await fetchDailyPrices("F");
    check("closes come back as ok", ok.outcome === "ok" && ok.points.length === 2, ok.outcome);
    check("  …with the 10-year range by default", /range=10y/.test(asked), asked);
    await fetchDailyPrices("F", "full");
    // NC-077: `range=max` is answered with quarterly closes; a full history is asked for by date
    check("a full history is asked for by date, from before any listing to now",
      /period1=-2208988800&period2=\d{10}&interval=1d/.test(asked) && !/range=/.test(asked), asked);
    answer(200, { chart: { result: [{ ...chart.chart.result[0], meta: { dataGranularity: "1mo" } }] } });
    const monthly = await fetchDailyPrices("F", "full");
    check("an answer of monthly closes is refused, never stored as the daily series",
      monthly.outcome === "error" && monthly.points.length === 0 && /1mo/.test(monthly.detail ?? ""), `${monthly.outcome} ${monthly.points.length} ${monthly.detail}`);
    answer(200, { chart: { result: [{ ...chart.chart.result[0], meta: { dataGranularity: "1d" } }] } });
    check("  …while a daily answer that says so is kept", (await fetchDailyPrices("F", "full")).points.length === 2);
    check("the split marker is picked out of the actions", splitsIn(ok.actions).length === 1 && splitsIn(ok.actions)[0].title === "2:1 stock split");
    answer(429, {});
    check("a 429 is throttled, not empty", (await fetchDailyPrices("F")).outcome === "throttled");
    answer(404, { chart: { result: null, error: { code: "Not Found", description: "No data found, symbol may be delisted" } } });
    const refused = await fetchDailyPrices("NOPE");
    check("a refusal is an error that says why", refused.outcome === "error" && /delisted/.test(refused.detail ?? ""), `${refused.outcome}: ${refused.detail}`);
    answer(200, { chart: { result: [{ timestamp: [], indicators: { quote: [{}] } }] } });
    check("an answer with no closes is honestly empty", (await fetchDailyPrices("F")).outcome === "empty");
    globalThis.fetch = (async () => {
      throw new Error("socket hang up");
    }) as unknown as typeof fetch;
    const down = await fetchDailyPrices("F");
    check("an unreachable host is an error, not a throw", down.outcome === "error" && /socket/.test(down.detail ?? ""));

    // Audit 2026-10-21 #1: every close was rounded to cents. Split-adjusted closes from the
    // 1970s–90s are fractions of a cent to a few cents, where a rounded cent is a 25–100% "move".
    // NVDA's real 1999-06-02/03 closes, and a sub-cent MNST-scale close that was stored as $0.00.
    answer(200, { chart: { result: [{
      timestamp: [928330200, 928416600, 928503000],
      indicators: { quote: [{ close: [0.034375, 0.035286, 0.0039062] }] },
    }] } });
    const old = await fetchDailyPrices("NVDA", "full");
    const [a, b, c] = old.points.map((p) => p.value);
    check("a close is stored to the six places the column holds, not rounded to cents",
      a === 0.034375 && b === 0.035286 && c === 0.003906, old.points.map((p) => p.value).join(", "));
    check("  …so a +2.6% day stays +2.6%, not the +33.3% that 0.03 → 0.04 made it",
      Math.abs((b / a - 1) * 100 - 2.65) < 0.05, `${((b / a - 1) * 100).toFixed(2)}%`);
    check("  …and no real close is stored as $0.00", old.points.every((p) => p.value > 0));
    check("  …while float noise past six places is dropped", exactClose(12.430000305175781) === 12.43);
    check("a close reads at the places it needs: cents from a dollar up, more below",
      formatPrice(230.1) === "230.10" && formatPrice(0.034375) === "0.0344" && formatPrice(0.003906) === "0.003906" && formatPrice(0) === "0.00",
      [formatPrice(230.1), formatPrice(0.034375), formatPrice(0.003906)].join(" "));

    // End-of-day only: while a session trades, Yahoo's daily series already carries today's bar
    // at the latest trade (measured 2026-10-21 on London, Mumbai and bitcoin). A US session:
    // 2026-10-20 13:30Z closed; 2026-10-21 13:30Z–20:00Z, with the exchange at UTC-4.
    const usSession = (now: number) => {
      answer(200, { chart: { result: [{
        meta: { dataGranularity: "1d", gmtoffset: -14400, currentTradingPeriod: { regular: { start: 1792589400, end: 1792612800, gmtoffset: -14400 } } },
        timestamp: [1792503000, 1792589400],
        indicators: { quote: [{ close: [12.15, 12.31] }] },
      }] } });
      return fetchDailyPrices("F", "10y", now * 1000);
    };
    const open = await usSession(1792594800); // 15:00Z, mid-session
    check("a session still trading is left out — its bar is an intraday price, not a close",
      open.points.length === 1 && open.points[0].time === "2026-10-20", open.points.map((p) => p.time).join(", "));
    const bell = await usSession(1792613400); // 20:10Z, ten minutes after the bell
    check("  …until the close has settled, half an hour after the bell", bell.points.length === 1, `${bell.points.length}`);
    const settled = await usSession(1792615500); // 20:45Z
    check("  …and then the day's close is kept", settled.points.length === 2 && settled.points[1].value === 12.31, `${settled.points.length}`);
    check("  …and before the bell yesterday's close is the last one, untouched",
      (await usSession(1792580400)).points.length === 1); // 11:00Z, pre-market: the session has not begun
    answer(200, { chart: { result: [{
      meta: { dataGranularity: "1d", gmtoffset: 0, currentTradingPeriod: { regular: { start: 1792540800, end: 1792627140, gmtoffset: 0 } } },
      timestamp: [1792454400, 1792540800],
      indicators: { quote: [{ close: [82941, 83008.76] }] },
    }] } });
    const btc = await fetchDailyPrices("BTC-USD", "10y", 1792570665 * 1000); // 2026-10-21 08:17Z
    check("  …and a 24-hour market's day is unfinished until midnight UTC", btc.points.length === 1 && btc.points[0].time === "2026-10-20", btc.points.map((p) => p.time).join(", "));
  } finally {
    globalThis.fetch = realFetch;
  }

  const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
  const ingest = read("scripts/ingest.ts");
  check("company prices are windowed, backed off and logged under their own key", /due\.has\("yahoo_prices"\)/.test(ingest) && /shouldBackOff\(client, "yahoo_prices"/.test(ingest) && /"yahoo_prices",\s+subjectId,[\s\S]{0,160}?company\.ticker,\s+daily\.outcome/.test(ingest));
  check("a new split re-reads the whole history, daily, and replaces it", /splitNeedsFullHistory\(client, subjectId, daily\.points, splitsIn\(daily\.actions\)\)/.test(ingest) && /fetchDailyPrices\(company\.ticker, "full"\)/.test(ingest) && /writePrices\(client, subjectId, daily\.points, \{ replace, dropBefore \}\)/.test(ingest));
  check("nothing asks Yahoo for range=max any more", !/"max"|range=max/.test(ingest) && !/range=max"|\?range=\$\{range\}/.test(read("lib/prices.ts")));
  // NC-077: a chart began ten years before the company's first ingest and never earlier.
  check("a company's whole daily history is read once, then ten years keep it current",
    /const complete = await hasFullPriceHistory\(client, subjectId, company\.ticker\);/.test(ingest) &&
      /fetchDailyPrices\(company\.ticker, complete \? "10y" : "full"\)/.test(ingest) &&
      /replace \? fullHistoryQuery\(company\.ticker\) : company\.ticker/.test(ingest));
  check("  …crypto prices too", /fetchDailyPrices\(asset\.yahooSymbol, complete \? "10y" : "full"\)/.test(ingest) && /whole \? fullHistoryQuery\(asset\.yahooSymbol\)/.test(ingest));
  check("  …and the marker is a successful full read in the fetch log, one per symbol",
    fullHistoryQuery("F") === "F full history (exact)" &&
      /f\.query = \$2 AND f\.outcome = 'ok'/.test(read("lib/ingest/store.ts")) && /s\.key = 'yahoo_prices'/.test(read("lib/ingest/store.ts")));
  // Audit 2026-10-21 #1: the first full reads (batch 22) stored cent-rounded closes and are
  // logged as "<sym> full history". That marker must not count, or those histories stay wrong.
  check("a full read logged before closes were exact does not count, so it is read once more",
    fullHistoryQuery("F") !== "F full history" && /fullHistoryQuery\(symbol\)/.test(read("lib/ingest/store.ts")));
  check("the chart and the page header format prices for display; nothing rounds what is stored",
    /priceFormat: \{ type: "custom", formatter: formatPrice/.test(read("components/PriceTimeline.tsx")) &&
      /\$\{formatPrice\(last\.value\)\}/.test(read("app/company/[ticker]/page.tsx")) &&
      !/Math\.round\(c \* 100\)/.test(read("lib/prices.ts")) && !/Math\.round\(\(sum \/ period\) \* 100\)/.test(read("components/PriceTimeline.tsx")));
  check("a company page needs events, not prices", /if \(!events\.length\) return null;/.test(read("lib/page-data.ts")));
  check("  …and says the chart is missing where it would be", /No price data for this security yet/.test(read("components/CompanyExplorer.tsx")));
  check("a first visit no longer counts a Yahoo refusal against a real company", /if \(!filings\.length\) \{/.test(read("lib/ingest/firstPass.ts")) && !/!daily\.points\.length/.test(read("lib/ingest/firstPass.ts")));
}

newspaperTitles().then(priceFetch).then(() => {
  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
});
