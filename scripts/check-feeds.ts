import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Feed health check — asks every news repository for one subject and reports what
 * came back, so "are the feeds actually pulling articles?" has a 10-second answer
 * that doesn't involve loading pages or waiting out caches.
 *
 *   npx tsx scripts/check-feeds.ts           # defaults to BABA
 *   npx tsx scripts/check-feeds.ts NVDA
 *   npx tsx scripts/check-feeds.ts bicycle   # non-ticker → topic-style checks
 *
 * Run it on a machine with normal internet (several sources block datacenter IPs)
 * and with your keys in .env.local — keyed feeds report "no key" when unset.
 */

import { companyScoringAliases, fetchNews, gdeltNames, gdeltNewsPlan } from "../lib/news";
import { GAP_MS, namesCompany, newsWindows } from "../lib/ingest/newsBackfill";
import { MEASURED_WORD_NAMES, everydayWordName, namedWithCapital } from "../lib/wordNames";
import { fetchPressMentions } from "../lib/loc";
import { fetchArchiveItems } from "../lib/archive";
import { GOVERNANCE_SPACES, getGovernanceFor, assertSpacesResolve } from "../lib/onchain/governance";
import { EXPLOIT_TARGETS, getExploitsFor } from "../lib/onchain/exploits";
import { getUsdtSupplyMoves } from "../lib/onchain/usdt";
import { getBitcoinHalvings } from "../lib/onchain/bitcoin";
import { getEthereumMilestones } from "../lib/onchain/ethereum";
import { fetchRegulations, regulationQueryFor } from "../lib/federalregister";
import { getDailyPrices } from "../lib/prices";
import { getTopicTimeline } from "../lib/wiki";
import { resolveCompany, commonName, getFilings, newsNamesFor, possessiveNameFor } from "../lib/sec";
import { companyNames, fetchCompanyRegulations, fetchCompanyYear, frDailySince, frSearchTerm } from "../lib/frCompany";
import { fetchRecalls, recallMakersFor } from "../lib/recalls";
import { fdaFirmsFor, fetchFdaRecalls } from "../lib/fdaRecalls";
import { dojPossessive, dojQueryNames, fetchJusticeReleases } from "../lib/doj";
import { mayCarryRelease, readFilingHeadline } from "../lib/secHeadlines";
import {
  fetchYahooFinanceNews,
  getNytNews,
  getGuardianNews,
  getNewsdataNews,
  getGnewsNews,
  getCurrentsNews,
  getMarketauxNews,
  getEodhdNews,
  getFinnhubNews,
} from "../lib/newsExtra";
import { commercialMode, skipReason } from "../lib/ingest/store";
import { COMPANY_SOURCES, TOPIC_SOURCES } from "./ingest";
import type { FetchResult, SourceKey, TimelineEvent } from "../lib/types";

// Each keyed feed with the source key its licence is recorded under, so this report can say
// *why* a feed sat out. A silently-empty feed and a deliberately-withheld one look identical
// on a page, and telling them apart is the whole point of running this.
const KEYED: Record<string, { env: string; source: SourceKey }> = {
  "NYT": { env: "NYT_API_KEY", source: "nyt" },
  "Guardian": { env: "GUARDIAN_API_KEY", source: "guardian" },
  "Newsdata": { env: "NEWSDATA_API_KEY", source: "newsdata" },
  "GNews": { env: "GNEWS_API_KEY", source: "gnews" },
  "Currents": { env: "CURRENTS_API_KEY", source: "currents" },
  "Marketaux": { env: "MARKETAUX_API_KEY", source: "marketaux" },
  "EODHD": { env: "EODHD_API_KEY", source: "eodhd" },
  "Finnhub": { env: "FINNHUB_API_KEY", source: "finnhub" },
};

/**
 * Which registered source each line here is checking, so the report can say whether a working
 * feed actually reaches the corpus.
 *
 * This check calls the adapters directly. That is the right way to answer "does this feed
 * work?", and it is also how a feed can pass here while contributing nothing to a page — which
 * is exactly what happened to eight of these after the scheduler cut-over. A green line and an
 * ingested article are two different claims, and this report used to make only the first while
 * looking like both.
 */
const SOURCE_OF: Record<string, SourceKey> = {
  GDELT: "gdelt",
  "Yahoo Finance RSS": "yahoo_finance",
  NYT: "nyt",
  Guardian: "guardian",
  Newsdata: "newsdata",
  GNews: "gnews",
  Currents: "currents",
  Marketaux: "marketaux",
  EODHD: "eodhd",
  Finnhub: "finnhub",
  "LoC press (pre-1963)": "loc_chronam",
  "Internet Archive": "internet_archive",
  "Federal Register (co.)": "federal_register",
  "NHTSA recalls": "nhtsa_recalls",
  "FDA enforcement": "fda_enforcement",
  "Justice Department": "doj_press",
};

const INGESTED: ReadonlySet<SourceKey> = new Set([...TOPIC_SOURCES, ...COMPANY_SOURCES]);

/** Marks a feed that answers here but never reaches the database. */
function pathNote(name: string): string {
  const key = SOURCE_OF[name];
  if (!key || INGESTED.has(key)) return "";
  return KEYED[name]
    ? "  ⚠ not ingested — licence bars it; visitor-key path only"
    : "  ⚠ not ingested — no call site on the ingest path";
}

function report(name: string, events: TimelineEvent[], note = "") {
  const keyed = KEYED[name];
  if (keyed) {
    const skip = skipReason(keyed.env, keyed.source);
    if (skip) {
      console.log(`  ${name.padEnd(22)} — ${skip}${pathNote(name)}`);
      return;
    }
  }
  if (events.length === 0) {
    console.log(`  ${name.padEnd(22)} ⚠ 0 articles ${note}${pathNote(name)}`);
    return;
  }
  const dates = events.map((e) => e.date).sort();
  const sample = events[0].title.slice(0, 60);
  console.log(
    `  ${name.padEnd(22)} ✓ ${String(events.length).padStart(3)} articles  ${dates[0]} → ${dates[dates.length - 1]}  e.g. “${sample}”${pathNote(name)}`
  );
}

/** A fetch as ingest makes it: a refusal or a failure says so, rather than reading as 0 articles. */
function reportFetch(name: string, res: FetchResult | null, note = "") {
  if (res && res.outcome !== "ok" && res.outcome !== "empty") {
    const why = res.httpStatus ? ` (HTTP ${res.httpStatus})` : res.detail ? ` (${res.detail.slice(0, 80)})` : "";
    console.log(`  ${name.padEnd(22)} ⚠ ${res.outcome}${why} ${note}${pathNote(name)}`);
    return;
  }
  report(name, res?.events ?? [], note);
}

async function main() {
  const arg = process.argv[2] ?? "BABA";
  const company = await resolveCompany(arg).catch(() => null);
  const name = company ? commonName(company.name) : arg;
  const ticker = company?.ticker ?? null;
  if (commercialMode()) {
    console.log(
      "\n  COMMERCIAL_MODE=true — sources not licensed for commercial use are withheld below."
    );
  }
  console.log(
    company
      ? `\nChecking feeds for ${company.name} (${company.ticker}) — query "${name}"\n`
      : `\nChecking feeds for topic "${name}" (no ticker resolved)\n`
  );

  const safe = (p: Promise<TimelineEvent[]>) => p.catch((e) => (console.log(`    (${e})`), []));
  const tried = (p: Promise<FetchResult>) => p.catch((e) => (console.log(`    (${e})`), null));

  /**
   * Each company feed is asked exactly as `ingestCompany` asks it — the same call, the same names
   * (`check:wiring` holds the two to it). This report once sent GDELT "VISA", which GDELT refuses
   * as too short, where ingest sends "VISA Inc", and asked none of the recall, FDA or Justice
   * Department feeds (the 2026-10-25 audit's finding 4).
   */
  if (company) {
    const alsoKnownAs = newsNamesFor(company.cik);
    const possessive = possessiveNameFor(company.cik);
    const { query: newsQuery, byRelevance } = gdeltNewsPlan(company.name, possessive, alsoKnownAs);
    const asked = gdeltNames(newsQuery, alsoKnownAs, byRelevance).join(" | ") + (byRelevance ? " by relevance" : "");
    reportFetch("GDELT", await tried(fetchNews(newsQuery, alsoKnownAs, { byRelevance })), `(asked ${asked}; throttles ~1 req/5s)`);
    // …and the newest month the backfill asks, as `backfillNews` asks it and keeps it (batches 57, 58)
    const word = everydayWordName(newsQuery);
    if (word && !MEASURED_WORD_NAMES[word]) {
      console.log(`  ${"GDELT, a past month".padEnd(22)} — held back: "${word.toLowerCase()}" is an everyday word, not yet measured`);
    } else {
      const month = newsWindows(new Date().toISOString().slice(0, 10))[0];
      await new Promise((r) => setTimeout(r, GAP_MS));
      const got = await tried(fetchNews(newsQuery, alsoKnownAs, { byRelevance, window: month }));
      const aliases = companyScoringAliases(company);
      const kept = (got?.events ?? []).filter((e) => namesCompany(e.title, aliases) && (!word || namedWithCapital(e.title, word)));
      reportFetch("GDELT, a past month", got && { ...got, events: kept },
        `(${month.from} to ${month.to} by relevance: the ${kept.length} of ${got?.events.length ?? 0} it would keep)`);
    }
    reportFetch("Yahoo Finance RSS", await tried(fetchYahooFinanceNews(company.ticker)));
    reportFetch("Federal Register (co.)", await tried(fetchCompanyRegulations(company.name, frDailySince(), alsoKnownAs)),
      `(asked ${frSearchTerm(company.name, alsoKnownAs)}, this year)`);
    reportFetch("Federal Register, 2008", await tried(fetchCompanyYear(company.name, 2008, alsoKnownAs)),
      "(a past year, as the year walk reads it: every page; former names are not read here)");
    if (recallMakersFor(company.cik)) reportFetch("NHTSA recalls", await tried(fetchRecalls(company.cik)), "(mapped makers only)");
    else console.log(`  ${"NHTSA recalls".padEnd(22)} — not a mapped vehicle maker`);
    if (fdaFirmsFor(company.cik)) reportFetch("FDA enforcement", await tried(fetchFdaRecalls(company.cik)), "(mapped firms only)");
    else console.log(`  ${"FDA enforcement".padEnd(22)} — not a mapped FDA firm`);
    reportFetch("Justice Department", await tried(fetchJusticeReleases(company.name, alsoKnownAs, possessive)),
      `(asked ${dojQueryNames(companyNames(company.name, alsoKnownAs), dojPossessive(company.name, possessive)).join(" | ")})`);
  } else {
    reportFetch("GDELT", await tried(fetchNews(name)), "(throttles ~1 req/5s; rerun if 0)");
  }
  report("NYT", await safe(getNytNews(name)));
  report("Guardian", await safe(getGuardianNews(name)));
  report("Newsdata", await safe(getNewsdataNews(name)));
  report("GNews", await safe(getGnewsNews(name)));
  report("Currents", await safe(getCurrentsNews(name)));
  if (ticker) {
    report("Marketaux", await safe(getMarketauxNews(name, ticker)));
    report("EODHD", await safe(getEodhdNews(ticker)), "(free plan may not include news)");
    report("Finnhub", await safe(getFinnhubNews(ticker)));
  }
  reportFetch("LoC press (pre-1963)", await tried(fetchPressMentions(name)), "(normal for modern subjects)");
  reportFetch("Internet Archive", await tried(fetchArchiveItems(name)), "(keyless; metadata index only)");
  /**
   * Per space — but the id is checked BEFORE the proposals, because the two failures look
   * identical in a proposal count and are not the same fact.
   *
   * This report already printed `Snapshot aave.eth ⚠ 0 articles (closed proposals only)` every
   * time it ran, for a fortnight, while `aave.eth` was not a Snapshot space at all. The zero was
   * visible and still unread, because the annotation beside it supplied a plausible reason to
   * skip past. An id that does not resolve now says so in its own words instead.
   */
  const spaceChecks = await assertSpacesResolve(GOVERNANCE_SPACES);
  for (const g of GOVERNANCE_SPACES) {
    const c = spaceChecks.find((x) => x.space === g.space);
    if (c?.resolves === false) {
      console.log(
        `  ${`Snapshot ${g.space}`.padEnd(22)} ✖ NOT A SNAPSHOT SPACE — this id does not ` +
          `exist, so its timeline can never fill. Fix the id in GOVERNANCE_SPACES.`
      );
      continue;
    }
    if (c?.resolves === null) {
      console.log(`  ${`Snapshot ${g.space}`.padEnd(22)} — could not verify the space id (${c.detail ?? "unknown"})`);
    }
    const known = c?.proposalsCount != null ? ` (space holds ${c.proposalsCount} proposals)` : "";
    report(`Snapshot ${g.space}`, await safe(getGovernanceFor(g.slug)), `(closed proposals only)${known}`);
  }
  // DefiLlama reports exploit amounts in plain dollars (Ronin ≈ 624,000,000, pinned by
  // check:live). Read as millions they were once published 10^6 too high; "$624m" is right, and
  // "$624000000m" or "$0m" is the unit error back — obvious on screen, invisible offline.
  report("USDT supply (Issue/Redeem)", await safe(getUsdtSupplyMoves()), "(needs ETHERSCAN_API_KEY)");
  for (const t of EXPLOIT_TARGETS) {
    report(`Exploits (${t.slug})`, await safe(getExploitsFor(t.slug)), "(attributed, not confirmed on-chain)");
  }

  /**
   * The three sources the ⛔ release gate names and this report never asked.
   *
   * The gate lists "SEC filings, Federal Register, prices" among what must be checked before the
   * site ships, and sign-off depends on this script — which called none of them. They are the
   * feeds behind the price series, the filings timeline and the sector regulation rows: the most
   * load-bearing in the product. A clean run was being read as evidence about them.
   *
   * The closing note below already warns against over-reading a green line. It said nothing about
   * absent ones, and absence is the harder thing to notice.
   */
  if (ticker) {
    const filings = await safe(getFilings(company!));
    report("SEC filings", filings, "(keyless; the filings timeline)");
    // the newest 8-K or 6-K the headline reader would title, read as ingest reads it
    const release = filings.find((e) => e.externalId && mayCarryRelease(e));
    const read = release ? await readFilingHeadline(company!.cik, release.externalId!).catch(() => null) : null;
    console.log(
      !release
        ? `  ${"SEC headlines".padEnd(22)} — no 8-K or 6-K among the recent filings`
        : read?.headline
          ? `  ${"SEC headlines".padEnd(22)} ✓ ${release.date} “${read.headline.slice(0, 70)}”`
          : `  ${"SEC headlines".padEnd(22)} ${read ? "— no press-release headline in" : "⚠ EDGAR did not answer for"} ${release.date} ${release.title.slice(0, 50)}`
    );
    const prices = await getDailyPrices(ticker).catch(() => null);
    console.log(
      prices?.points.length
        ? `  ${"Prices (Yahoo chart)".padEnd(22)} ✓ ${String(prices.points.length).padStart(3)} closes    ` +
            `${prices.points[0].time} → ${prices.points[prices.points.length - 1].time}  ` +
            `+${prices.actions.length} corporate actions`
        : `  ${"Prices (Yahoo chart)".padEnd(22)} ⚠ no price series — the chart would be empty`
    );
  }
  const reg = await fetchRegulations(regulationQueryFor(name, [])).catch(() => null);
  report("Federal Register", reg?.events ?? [], "(keyless; sector regulation)");
  report("Bitcoin halvings", await safe(getBitcoinHalvings()), "(keyless; public explorer)");
  report("Ethereum milestones", await safe(getEthereumMilestones()), "(keyless; public explorer)");

  const story = await getTopicTimeline(name).catch(() => null);
  const hist = story?.events.filter((e) => e.type === "history") ?? [];
  const cites = story?.events.filter((e) => e.type === "citation") ?? [];
  console.log(
    story
      ? `  ${"Wikipedia story".padEnd(22)} ✓ ${hist.length} history + ${cites.length} cited articles (“${story.title}”)`
      : `  ${"Wikipedia story".padEnd(22)} ⚠ no article resolved`
  );

  console.log("\nKeyless feeds showing ⚠ 0 usually mean the source is unreachable from this network.");
  console.log("Keyed feeds showing ⚠ 0 with a key set usually mean the key or plan is wrong — test the key with curl.");
  console.log(
    "Lines marked “not ingested” answer here but never reach the database: ingesting is\n" +
      "republishing, and their terms bar it (`assertCommercialOk` refuses them). Do not price a\n" +
      "licence off a green line alone — `npm run check:wiring` is what says a source is connected.\n"
  );
}

main();
