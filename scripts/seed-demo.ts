/**
 * Seed a demo dataset straight into Postgres, with no network calls.
 *
 * The point is a *verifiable* environment. Every feature on a subject page is driven by
 * shapes of data, not by volume — year-only dates, runs of filings on consecutive days,
 * a crowded year, a pre-IPO era, a >2% single-day move with an after-close earnings the
 * day before — so this seeds those shapes deliberately rather than dumping rows. Where a
 * live ingest is impossible (no API keys, blocked egress, offline CI), this stands the
 * site up anyway.
 *
 *   npm run db:seed-demo
 *
 * Idempotent: it writes through the same upserts ingest uses, so re-running updates in
 * place instead of duplicating. It never deletes, and it only ever touches the four
 * subjects it owns.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getPool } from "../lib/db";
import {
  ensureSources,
  emptyStats,
  linkToIndustry,
  logFetch,
  upsertEvent,
  upsertSubject,
  upsertTopicSubject,
} from "../lib/ingest/store";
import type { SourceKey } from "../lib/types";
import type { PricePoint, TimelineEvent } from "../lib/types";

// Fixed seed: the same command twice gives the same chart, so a screenshot stays comparable.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Crypto trades every day, so its series has no weekend gaps to skip. */
function everyDay(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  const end = Date.parse(toISO);
  for (let t = Date.parse(fromISO); t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Weekdays only — a real close series has no weekend rows, and gap guards rely on that. */
function tradingDays(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  const end = Date.parse(toISO);
  for (let t = Date.parse(fromISO); t <= end; t += 86_400_000) {
    const d = new Date(t);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * A random walk with planted single-day moves. The planted ones are the reason this
 * exists: "Biggest moves" only has something to show above its 2% floor if the series
 * actually contains moves above it, on days we can point an event at.
 */
function priceSeries(
  days: string[],
  start: number,
  seed: number,
  planted: Record<string, number>,
  baseVolume: number
): PricePoint[] {
  const rand = mulberry32(seed);
  let value = start;
  return days.map((time) => {
    const shock = planted[time];
    const drift = shock ?? (rand() - 0.49) * 0.022;
    value = Math.max(1, value * (1 + drift));
    // Volume tracks the size of the move — a planted 8% day should visibly spike the bars,
    // which is the whole point of showing volume next to an event.
    const intensity = 1 + Math.abs(drift) * 18;
    const volume = Math.round(baseVolume * intensity * (0.75 + rand() * 0.5));
    return { time, value: Number(value.toFixed(2)), volume };
  });
}

type Seed = Omit<TimelineEvent, "id"> & { id?: string };

/**
 * Ingest identity is the dedup basis; keep it stable and unique per seeded event.
 *
 * `scope` is the subject the event belongs to, and leaving it out was a real bug: filing titles
 * are boilerplate, so Ford's and GM's identically-titled 10-K on one day hashed to the same key
 * and became a single database row owned by both. Every real adapter scopes its own basis —
 * EDGAR keys on the accession number — so a fixture that does not models the schema wrongly and
 * invents a shared event out of a filing calendar.
 */
function ev(e: Seed, scope = ""): TimelineEvent {
  const id = e.id ?? `seed-${scope ? `${scope}-` : ""}${e.sourceKey}-${e.date}-${e.title.slice(0, 40)}`;
  return { ...e, id, dedupBasis: e.dedupBasis ?? id };
}

// ------------------------------------------------------------------ Ford
// Founded 1903, listed 1956 — the gap is the "Before the ticker" run-up, and the
// 120-year continuity guard in lib/history.ts leaves it intact.
const FORD_HISTORY: Seed[] = [
  ["1903-06-16", "Ford Motor Company is incorporated in Detroit", "Twelve investors put up $28,000 to found the company in a converted wagon factory on Mack Avenue."],
  ["1908-10-01", "The Model T goes on sale", "Priced at $825, it is the first car the company positions at the general public rather than the wealthy."],
  ["1913-12-01", "The moving assembly line reaches Highland Park", "Chassis assembly falls from twelve and a half hours to about ninety minutes."],
  ["1914-01-05", "The $5 day is announced", "Ford roughly doubles pay and cuts the shift to eight hours, a decision widely covered as much for its economics as its novelty."],
  ["1927-05-26", "The fifteen-millionth Model T is built as production ends", "The line stops for six months while the Model A is tooled."],
  ["1932-01-01", "The flathead V8 is introduced", "The first low-priced eight-cylinder engine, cast in a single block."],
  ["1941-01-01", "Wartime production replaces civilian output", "Willow Run is built to assemble B-24 bombers."],
  ["1956-01-17", "Ford lists on the New York Stock Exchange", "The public offering of the Ford Foundation's non-voting stock is at the time the largest in history."],
  ["1964-04-17", "The Mustang is unveiled at the New York World's Fair", "Roughly 22,000 orders are taken on the first day."],
  ["1976-01-01", "Small-car competition reshapes the domestic lineup", "Imported compacts take a widening share of the US market through the decade."],
  ["1986-01-01", "The Taurus is launched", "Its aerodynamic shape is credited with reversing the company's mid-1980s slide."],
  ["2008-11-18", "Ford declines federal bailout funds", "Unlike its two domestic rivals, the company mortgages its assets in 2006 and enters the crisis with a cash cushion."],
  ["2021-05-19", "The F-150 Lightning is revealed", "An electric version of the best-selling vehicle in the United States."],
].map(([date, title, description]) => ({
  date,
  title,
  description,
  type: "history" as const,
  source: "Wikipedia: History of Ford Motor Company",
  url: "https://en.wikipedia.org/wiki/History_of_Ford_Motor_Company",
  sourceKey: "wikipedia" as const,
  externalId: "History of Ford Motor Company",
  // The three Jan-1 rows above are year-only in the source; EventList buckets them
  // under the year instead of inventing a January date.
  precision: date.endsWith("-01-01") ? ("year" as const) : ("day" as const),
}));

const FORD_PRESS: Seed[] = [
  ["1908-10-04", "NEW FORD CAR SHOWN TO DEALERS", "Detroit Free Press"],
  ["1914-01-06", "FORD TO PAY FIVE DOLLARS A DAY", "The New York Times"],
  ["1927-05-27", "LAST MODEL T LEAVES THE LINE", "Chicago Daily Tribune"],
  ["1941-09-12", "BOMBER PLANT NEARS COMPLETION", "Detroit Free Press"],
].map(([date, title, paper]) => ({
  date,
  title,
  description: `Period newspaper coverage digitised by the Library of Congress. ${paper}.`,
  type: "press" as const,
  source: `Chronicling America: ${paper}`,
  url: "https://chroniclingamerica.loc.gov/",
  sourceKey: "loc_chronam" as const,
  externalId: `chronam-ford-${date}`,
}));

// Runs of filings on consecutive days — the case condensed filing stacks exist for. A run
// only collapses at 3+ filing-only days in one month, and a day that also carries news or
// earnings is a mixed day that breaks the run, so the June run below is kept deliberately
// clean of anything else.
const FORD_FILINGS: Seed[] = [
  ["2025-10-21", "8-K — Regulation FD Disclosure"],
  ["2025-10-22", "8-K — Results of Operations and Financial Condition"],
  ["2025-10-23", "8-K — Departure of Directors or Certain Officers"],
  ["2025-10-24", "8-K — Entry into a Material Definitive Agreement"],
  ["2025-10-27", "10-Q — Quarterly report for the period ended September 30, 2025"],
  ["2026-02-04", "8-K — Results of Operations and Financial Condition"],
  ["2026-02-17", "10-K — Annual report for the fiscal year ended December 31, 2025"],
  ["2026-05-11", "8-K — Submission of Matters to a Vote of Security Holders"],
  ["2026-05-12", "8-K — Other Events"],
  ["2026-05-13", "10-Q — Quarterly report for the period ended March 31, 2026"],
  ["2026-06-15", "8-K — Regulation FD Disclosure"],
  ["2026-06-16", "8-K — Other Events"],
  ["2026-06-17", "8-K — Entry into a Material Definitive Agreement"],
  ["2026-06-18", "8-K — Amendments to Articles of Incorporation or Bylaws"],
].map(([date, title]) => ({
  date,
  title,
  description: "Filed with the U.S. Securities and Exchange Commission.",
  type: "filing" as const,
  source: "SEC EDGAR",
  url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000037996",
  sourceKey: "sec_edgar" as const,
  externalId: `edgar-ford-${date}`,
}));

// Dated the session *before* each planted move: an after-close release moves the next
// open, which is exactly the pairing rule Biggest moves encodes.
const FORD_EARNINGS: Seed[] = [
  ["2025-04-02", "Q1 2025 results miss on tariff-driven cost guidance"],
  ["2025-10-24", "Q3 2025 results beat, full-year outlook raised"],
  ["2026-02-04", "Q4 2025 results: EV unit losses widen, dividend held"],
  ["2026-07-07", "Q2 2026 results beat on truck mix"],
].map(([date, title]) => ({
  date,
  title,
  description: "Quarterly results released after the close.",
  type: "earnings" as const,
  source: "SEC EDGAR",
  url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000037996",
  sourceKey: "sec_edgar" as const,
  externalId: `earnings-ford-${date}`,
}));

const FORD_NEWS: Seed[] = [
  ["2025-04-03", "Automakers slide as new vehicle tariffs take effect", "Reuters"],
  ["2025-06-11", "Ford expands battery plant hiring in Michigan", "Detroit Free Press"],
  ["2025-10-27", "Ford raises full-year guidance after strong truck quarter", "Associated Press"],
  ["2026-02-05", "Ford shares fall as EV losses overshadow profitable trucks", "Bloomberg"],
  ["2026-02-05", "Analysts cut price targets on Ford after guidance", "MarketWatch"],
  ["2026-05-13", "Ford recalls SUVs over software defect", "Reuters"],
  ["2026-07-08", "Ford tops estimates as F-Series mix lifts margins", "CNBC"],
].map(([date, title, outlet]) => ({
  date,
  title,
  description: `${outlet} coverage of the day's developments.`,
  type: "news" as const,
  source: outlet,
  url: "https://example.com/ford-news",
  sourceKey: "gdelt" as const,
  externalId: `news-ford-${date}-${outlet}`,
}));

// Quarterly dividends plus one split. The split matters most: our series is split-adjusted,
// so the line does not step and the marker is the only thing that says it happened.
const FORD_ACTIONS: Seed[] = [
  ...["2025-02-12", "2025-05-14", "2025-08-13", "2025-11-12", "2026-02-11", "2026-05-13"].map(
    (date) => ({
      date,
      title: "Dividend of $0.15 per share",
      description: "Cash dividend with this ex-dividend date. A mechanical change, not news.",
      type: "corporate_action" as const,
      source: "Yahoo Finance",
      sourceKey: "yahoo_finance" as const,
      externalId: `div-F-${date}`,
    })
  ),
  {
    date: "2026-03-04",
    title: "2:1 stock split",
    description:
      "The share count changed on this date. Prices here are split-adjusted, so the line " +
      "does not step — this marker is the only thing that says it happened.",
    type: "corporate_action",
    source: "Yahoo Finance",
    sourceKey: "yahoo_finance",
    externalId: "split-F-2026-03-04",
  },
];

/**
 * A sector rule, attached to the *industry* rather than to a company — which is where
 * `scripts/ingest.ts` puts Federal Register results, and where `loadSectorEvents` looks for them.
 *
 * The seed used to hang this on Ford. It looked right on Ford's page and was wrong everywhere
 * else: GM never saw a rule that hit its whole sector, and /compare could not tell that one
 * regulation had landed on both. A fixture that models the schema loosely tests nothing.
 */
const SECTOR_REGULATION: Seed[] = [
  {
    date: "2026-03-18",
    title: "NHTSA proposes updated fuel economy standards for light trucks",
    description: "Proposed rule published in the Federal Register; comment period open for 60 days.",
    type: "regulation",
    source: "Federal Register",
    url: "https://www.federalregister.gov/",
    sourceKey: "federal_register",
    externalId: "fr-2026-lighttruck-cafe",
  },
];

// ------------------------------------------------------------------- GM
const GM_EVENTS: Seed[] = [
  { date: "1908-09-16", title: "General Motors is founded in Flint, Michigan", description: "Formed as a holding company for Buick.", type: "history", source: "Wikipedia: General Motors", url: "https://en.wikipedia.org/wiki/General_Motors", sourceKey: "wikipedia", externalId: "General Motors" },
  { date: "1953-01-01", title: "The Corvette enters production", description: "Chevrolet's two-seat sports car begins limited production in Flint.", type: "history", source: "Wikipedia: General Motors", url: "https://en.wikipedia.org/wiki/General_Motors", sourceKey: "wikipedia", externalId: "General Motors", precision: "year" },
  { date: "2009-06-01", title: "General Motors files for Chapter 11 reorganisation", description: "The company emerges the same year as a new entity.", type: "history", source: "Wikipedia: General Motors", url: "https://en.wikipedia.org/wiki/General_Motors", sourceKey: "wikipedia", externalId: "General Motors" },
  { date: "2010-11-18", title: "General Motors returns to public markets", description: "One of the largest initial public offerings on record at the time.", type: "history", source: "Wikipedia: General Motors", url: "https://en.wikipedia.org/wiki/General_Motors", sourceKey: "wikipedia", externalId: "General Motors" },
  { date: "2025-04-02", title: "Q1 2025 results and revised outlook", description: "Quarterly results released after the close.", type: "earnings", source: "SEC EDGAR", url: "https://www.sec.gov/", sourceKey: "sec_edgar", externalId: "earnings-gm-2025-04-02" },
  { date: "2025-10-24", title: "Q3 2025 results top expectations", description: "Quarterly results released after the close.", type: "earnings", source: "SEC EDGAR", url: "https://www.sec.gov/", sourceKey: "sec_edgar", externalId: "earnings-gm-2025-10-24" },
  { date: "2026-02-04", title: "Q4 2025 results: buyback expanded", description: "Quarterly results released after the close.", type: "earnings", source: "SEC EDGAR", url: "https://www.sec.gov/", sourceKey: "sec_edgar", externalId: "earnings-gm-2026-02-04" },
  { date: "2026-02-17", title: "10-K — Annual report for the fiscal year ended December 31, 2025", description: "Filed with the U.S. Securities and Exchange Commission.", type: "filing", source: "SEC EDGAR", url: "https://www.sec.gov/", sourceKey: "sec_edgar", externalId: "edgar-gm-2026-02-17" },
  { date: "2025-04-03", title: "Detroit automakers fall on tariff news", description: "Reuters coverage of the day's developments.", type: "news", source: "Reuters", url: "https://example.com/gm-news", sourceKey: "gdelt", externalId: "news-gm-2025-04-03" },
  { date: "2026-02-05", title: "GM outperforms rivals on truck demand", description: "Bloomberg coverage of the day's developments.", type: "news", source: "Bloomberg", url: "https://example.com/gm-news-2", sourceKey: "gdelt", externalId: "news-gm-2026-02-05" },
];

// ---------------------------------------------------------------- topic
// Deliberately crowded around 2008–2012 and 2017–2022 so the horizontal timeline has
// something to stack, and so the mini-map has an uneven distribution to show.
const EV_HISTORY: [string, string, string][] = [
  ["1832-01-01", "Robert Anderson demonstrates a crude electric carriage", "A non-rechargeable cell powers the earliest recorded electric vehicle."],
  ["1859-01-01", "The lead-acid battery is invented", "Gaston Planté's rechargeable cell makes a practical electric vehicle conceivable."],
  ["1897-01-01", "Electric taxis enter service in New York and London", "The Electrobat fleet and the London Electrical Cab Company operate briefly."],
  ["1912-01-01", "Electric vehicle production peaks before the electric starter", "Roughly a third of vehicles on US roads are electric before cheap petrol and the self-starter end the era."],
  ["1990-09-28", "California adopts the Zero Emission Vehicle mandate", "The rule obliges major manufacturers to sell zero-emission vehicles in the state."],
  ["1996-12-05", "General Motors leases the first EV1", "The purpose-built electric car is leased, never sold, and later recalled."],
  ["2003-07-01", "Tesla Motors is incorporated", "Founded to build an electric sports car on lithium-ion cells."],
  ["2008-02-01", "The Tesla Roadster begins customer deliveries", "The first highway-legal production car to use lithium-ion cells."],
  ["2008-06-01", "Battery pack costs begin a sustained decline", "Cell chemistry and scale drive a fall that continues for over a decade."],
  ["2008-12-15", "BYD launches the F3DM plug-in hybrid in China", "The first mass-produced plug-in hybrid sold to the public."],
  ["2010-12-11", "The Nissan Leaf goes on sale", "The first mass-market highway-capable electric car."],
  ["2010-12-15", "The Chevrolet Volt reaches dealers", "A range-extended electric car sold alongside the Leaf."],
  ["2012-06-22", "The Tesla Model S is delivered to its first customers", "A long-range electric sedan built on a dedicated platform."],
  ["2012-09-24", "Tesla opens its first Supercharger stations", "Fast-charging corridors address the range objection directly."],
  ["2017-07-28", "The Tesla Model 3 begins production", "Aimed at a mass-market price point."],
  ["2017-09-11", "China announces it is studying an end date for fuel-only cars", "The signal reshapes manufacturer planning worldwide."],
  ["2019-04-01", "European manufacturers commit to large electric line-ups", "Volkswagen, Daimler and BMW each announce multi-model programmes."],
  ["2020-09-22", "Battery Day sets out cell cost reduction targets", "Structural packs and larger cells are proposed to cut cost per kilowatt-hour."],
  ["2021-01-28", "General Motors sets a 2035 target for light-duty electric vehicles", "The commitment covers new light-duty sales."],
  ["2021-11-10", "Rivian's public listing values the maker above established rivals", "A listing at the height of investor enthusiasm for electric vehicles."],
  ["2022-08-16", "The Inflation Reduction Act restructures US purchase credits", "Credits are tied to assembly and battery sourcing requirements."],
  ["2023-06-08", "Major manufacturers adopt Tesla's North American charging connector", "Ford and GM agree to adopt the connector, and others follow."],
  ["2024-03-20", "US tailpipe rules are finalised with a slower early ramp", "The final rule softens near-term requirements relative to the proposal."],
  ["2025-05-14", "Battery pack prices fall below the $100/kWh threshold in several segments", "The level long treated as the point of price parity with combustion."],
];

const EV_CITATIONS: [string, string, string][] = [
  ["1897-04-11", "The Electric Cab in London", "The Times"],
  ["1912-05-19", "ELECTRIC VEHICLES IN CITY SERVICE", "Scientific American"],
  ["1996-12-06", "GM's Electric Car Is Here, but Only for Lease", "The New York Times"],
  ["2008-02-07", "Tesla Roadster Delivered to First Buyer", "Wired"],
  ["2010-12-12", "Nissan Leaf Arrives in Showrooms", "The Guardian"],
  ["2012-06-23", "Model S Deliveries Begin at Fremont", "Reuters"],
  ["2017-07-29", "Tesla Hands Over First Model 3 Cars", "Bloomberg"],
  ["2020-09-23", "What Tesla Promised at Battery Day", "Ars Technica"],
  ["2022-08-17", "How the New Climate Law Changes EV Tax Credits", "The Washington Post"],
  ["2024-03-21", "EPA Finalises Vehicle Emissions Rules", "Associated Press"],
];

/** `npm run db:seed-demo -- --stress` — the fixture `npm run profile:list` measures against. */
const STRESS = process.argv.includes("--stress");
const STRESS_EVENTS = 600;

async function main(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  const stats = emptyStats();

  /**
   * Record fetch history too, so the Sources panel has something to show and so the per-source
   * refresh windows have a starting point. A couple of deliberately unhappy outcomes are seeded
   * as well — a feed that returned nothing and one that was rate limited look identical on a
   * page without that panel, which is the whole reason it exists.
   */
  async function seedFetchLog(
    subjectId: number,
    entries: [SourceKey, "ok" | "empty" | "throttled" | "error", number][]
  ): Promise<void> {
    for (const [key, outcome, count] of entries) {
      await logFetch(client, key, subjectId, "seed-demo", outcome, count);
    }
  }

  try {
    await ensureSources(client);

    // ---------------------------------------------------------- Ford
    const fordId = await upsertSubject(client, {
      kind: "company",
      slug: "f",
      displayName: "Ford Motor Company",
      ticker: "F",
      cik: "0000037996",
      sic: "3711",
      wikipediaTitle: "Ford Motor Company",
      summary:
        "Ford Motor Company is an American automaker founded in Detroit in 1903 by Henry Ford. It " +
        "popularised the moving assembly line, sells the F-Series pickup line that has led the US " +
        "market for decades, and has listed on the New York Stock Exchange since 1956.",
      siteDomain: "ford.com",
      firstEventOn: "1903-06-16",
    });

    const fordEvents = [
      ...FORD_HISTORY,
      ...FORD_PRESS,
      ...FORD_FILINGS,
      ...FORD_EARNINGS,
      ...FORD_NEWS,
      ...FORD_ACTIONS,
    ];
    await client.query("BEGIN");
    for (const e of fordEvents) await upsertEvent(client, ev(e, "f"), fordId, stats);
    await client.query("COMMIT");

    // ------------------------------------------------------------ GM
    const gmId = await upsertSubject(client, {
      kind: "company",
      slug: "gm",
      displayName: "General Motors Company",
      ticker: "GM",
      cik: "0001467858",
      sic: "3711",
      wikipediaTitle: "General Motors",
      summary:
        "General Motors is an American automaker founded in Flint, Michigan in 1908. It " +
        "reorganised under Chapter 11 in 2009 and returned to public markets in 2010.",
      siteDomain: "gm.com",
      firstEventOn: "1908-09-16",
    });

    await client.query("BEGIN");
    for (const e of GM_EVENTS) await upsertEvent(client, ev(e, "gm"), gmId, stats);
    await client.query("COMMIT");

    await seedFetchLog(fordId, [
      ["wikipedia", "ok", 13],
      ["loc_chronam", "ok", 4],
      ["sec_edgar", "ok", 13],
      ["gdelt", "ok", 7],
      ["federal_register", "ok", 1],
      ["yahoo_finance", "ok", 7],
      // the two that a page cannot distinguish without the panel
      ["nyt", "empty", 0],
      ["gnews", "throttled", 0],
    ]);

    // ------------------------------------------------------ industry
    const SIC_3711 = { sic: "3711", description: "Motor Vehicles & Passenger Car Bodies" };
    const { slug: industrySlug, industryId } = await linkToIndustry(client, fordId, SIC_3711);
    await linkToIndustry(client, gmId, SIC_3711);

    // The rule lands on the industry, so both members read it off the same row — which is what
    // lets /compare say one regulation hit both rather than showing two coincidental markers.
    await client.query("BEGIN");
    for (const e of SECTOR_REGULATION) await upsertEvent(client, ev(e, "sic-3711"), industryId, stats);
    await client.query("COMMIT");

    // --------------------------------------------------------- topic
    const topicId = await upsertTopicSubject(client, {
      searchTerm: "electric cars",
      wikipediaTitle: "Electric car",
      displayName: "Electric car",
      summary:
        "An electric car is an automobile propelled by one or more electric motors drawing from a " +
        "rechargeable battery. Electric vehicles were common before the internal combustion engine " +
        "displaced them in the 1910s, and returned to volume production in the 2010s.",
      firstEventOn: "1832-01-01",
    });

    const topicEvents: Seed[] = [
      ...EV_HISTORY.map(([date, title, description]) => ({
        date,
        title,
        description,
        type: "history" as const,
        source: "Wikipedia: Electric car",
        url: "https://en.wikipedia.org/wiki/Electric_car",
        sourceKey: "wikipedia" as const,
        externalId: "Electric car",
        precision: date.endsWith("-01-01") ? ("year" as const) : ("day" as const),
      })),
      // Two citations whose source gave a month but no day. They must render under their month
  // without a day node — printing "Jun 1" would invent precision the source withheld.
  ...([
    ["2012-06-01", "Electric Car Sales Climb Through the First Half", "The Economist"],
    ["2021-03-01", "Charging Networks Expand Across Europe", "Financial Times"],
  ] as [string, string, string][]).map(([date, title, publication]) => ({
    date,
    title,
    description: `Cited by the Electric car article. ${publication}.`,
    type: "citation" as const,
    source: publication,
    url: `https://example.com/ev-month-${date}`,
    sourceKey: "wikipedia" as const,
    externalId: `citation-ev-month-${date}`,
    precision: "month" as const,
  })),
  ...EV_CITATIONS.map(([date, title, publication]) => ({
        date,
        title,
        description: `Cited by the Electric car article. ${publication}.`,
        type: "citation" as const,
        source: publication,
        url: "https://example.com/ev-citation",
        sourceKey: "wikipedia" as const,
        externalId: `citation-ev-${date}`,
      })),
    ];
    await client.query("BEGIN");
    for (const e of topicEvents) await upsertEvent(client, ev(e, "ev-cars"), topicId, stats);
    await client.query("COMMIT");

    // -------------------------------------------------------- prices
    const days = tradingDays("2025-01-02", "2026-07-24");
    const fordPrices = priceSeries(
      days,
      10.4,
      20260728,
      {
        "2025-04-03": -0.078,
        "2025-10-27": 0.061,
        "2026-02-05": -0.084,
        "2026-05-13": -0.042,
        "2026-07-08": 0.052,
      },
      62_000_000
    );
    const gmPrices = priceSeries(
      days,
      52.0,
      99001,
      { "2025-04-03": -0.055, "2026-02-05": 0.031, "2026-07-08": 0.024 },
      14_000_000
    );

    for (const [subjectId, series] of [
      [fordId, fordPrices],
      [gmId, gmPrices],
    ] as const) {
      await client.query(
        `INSERT INTO prices (subject_id, on_date, close, volume)
         SELECT $1, d, c, v FROM unnest($2::date[], $3::numeric[], $4::bigint[]) AS t(d, c, v)
         ON CONFLICT (subject_id, on_date) DO UPDATE
            SET close = EXCLUDED.close,
                volume = COALESCE(EXCLUDED.volume, prices.volume)`,
        [
          subjectId,
          series.map((p) => p.time),
          series.map((p) => p.value),
          series.map((p) => p.volume ?? null),
        ]
      );
    }

    // ------------------------------------------------- a deliberately huge subject
    // The checklist asks whether large lists need windowing, and that is a question about
    // measurement, not opinion. `--stress` seeds a subject big enough to answer it, for
    // `npm run profile:list`.
    //
    // Every event is a citation, because that is the kind with no ceiling on it. Wikipedia
    // history is already sampled down to 60 rows by `capHistory`, so seeding history would
    // measure that cap rather than the list; a subject cited a few hundred times is the case
    // that actually reaches EventList unthinned.
    //
    // Off by default: it is a fixture, not a demo. Left in, it would sit in /explore and in the
    // suggestion index as though it were something a reader might want to look at.
    if (STRESS) {
      const bigId = await upsertTopicSubject(client, {
        searchTerm: "stress test",
        wikipediaTitle: "Stress test (timeline rendering)",
        displayName: "Stress test",
        summary:
          "A deliberately oversized timeline, seeded to measure list rendering at scale. Not a " +
          "real subject — it exists so the question of whether large lists need windowing can " +
          "be answered with a number.",
        firstEventOn: "1900-01-01",
      });
      const bulk: Seed[] = [];
      for (let i = 0; i < STRESS_EVENTS; i++) {
        const d = new Date(Date.UTC(1900, 0, 1) + i * 55 * 86_400_000).toISOString().slice(0, 10);
        bulk.push({
          date: d,
          title: `Stress event ${i + 1} — a headline of roughly the length a real one runs to`,
          description: "Seeded to measure rendering at scale; carries no meaning.",
          type: "citation",
          source: "Sample publication",
          url: `https://example.com/stress/${i}`,
          sourceKey: "wikipedia" as const,
          externalId: `stress-${i}`,
        });
      }
      await client.query("BEGIN");
      for (const e of bulk) await upsertEvent(client, ev(e, "stress"), bigId, stats);
      await client.query("COMMIT");
    }

    // -------------------------------------------------------- crypto
    // Phase 0's demo: a Bitcoin halving read against the BTC price chart. Modelled as a topic
    // (no CIK or ticker to give it, and the schema is right to refuse a company without one),
    // and it renders a chart because it has price rows — which ordinary topics do not.
    const btcId = await upsertSubject(client, {
      kind: "topic",
      slug: "btc",
      displayName: "Bitcoin",
      summary:
        "Bitcoin is a peer-to-peer digital currency whose issuance schedule is fixed in its " +
        "protocol: the reward paid to miners halves every 210,000 blocks, roughly every four " +
        "years. Its on-chain history begins at the genesis block in 2009.",
      firstEventOn: "2009-01-03",
    });
    for (const alias of ["bitcoin", "btc-usd"]) {
      await client.query(
        `INSERT INTO subject_aliases (subject_id, alias) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [btcId, alias]
      );
    }

    const halvings: Seed[] = [
      ["2012-11-28", 210000, "25"],
      ["2016-07-09", 420000, "12.5"],
      ["2020-05-11", 630000, "6.25"],
      ["2024-04-20", 840000, "3.125"],
    ].map(([date, height, reward]) => ({
      date: date as string,
      title: `Bitcoin halving — block reward drops to ${reward} BTC`,
      description:
        `At block ${Number(height).toLocaleString("en-US")} the subsidy paid to miners fell to ` +
        `${reward} BTC, halving the rate of new issuance. Written into the protocol, not decided by anyone.`,
      type: "onchain" as const,
      source: `Bitcoin block ${Number(height).toLocaleString("en-US")} (mempool.space)`,
      url: `https://mempool.space/block/${height}`,
      sourceKey: "onchain" as const,
      externalId: `btc-block-${height}`,
      dedupBasis: `btc-block-${height}`,
    }));

    await client.query("BEGIN");
    for (const e of halvings) await upsertEvent(client, ev(e, "btc"), btcId, stats);
    await client.query("COMMIT");
    await seedFetchLog(btcId, [["onchain", "ok", 4]]);

    // Spans the 2024 halving, so the marker lands on the chart rather than before it.
    const btcDays = everyDay("2023-01-01", "2026-07-24");
    const btcPrices = priceSeries(btcDays, 16_500, 424242, { "2024-04-20": 0.043 }, 28_000_000_000);
    await client.query(
      `INSERT INTO prices (subject_id, on_date, close, volume)
       SELECT $1, d, c, v FROM unnest($2::date[], $3::numeric[], $4::bigint[]) AS t(d, c, v)
       ON CONFLICT (subject_id, on_date) DO UPDATE
          SET close = EXCLUDED.close, volume = COALESCE(EXCLUDED.volume, prices.volume)`,
      [
        btcId,
        btcPrices.map((p) => p.time),
        btcPrices.map((p) => p.value),
        btcPrices.map((p) => p.volume ?? null),
      ]
    );

    console.log(
      `\n  Seeded 5 subjects — /company/f, /company/gm, /topic/electric%20cars, /topic/btc, ` +
        `/industry/${industrySlug}\n` +
        (STRESS ? `  plus /topic/stress%20test — ${STRESS_EVENTS} events, for profiling\n` : "") +
        `  ${stats.events} events (${stats.newEvents} new), ${stats.attestations} attestations, ` +
        `${days.length} trading days of prices for two tickers.\n`
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
