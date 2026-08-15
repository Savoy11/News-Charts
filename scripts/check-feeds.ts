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

import { getNews } from "../lib/news";
import { getPressMentions } from "../lib/loc";
import { getArchiveItems } from "../lib/archive";
import { GOVERNANCE_SPACES, getGovernanceFor, assertSpacesResolve } from "../lib/onchain/governance";
import { EXPLOIT_TARGETS, getExploitsFor } from "../lib/onchain/exploits";
import { getUsdtSupplyMoves } from "../lib/onchain/usdt";
import { getBitcoinHalvings } from "../lib/onchain/bitcoin";
import { getEthereumMilestones } from "../lib/onchain/ethereum";
import { fetchRegulations, regulationQueryFor } from "../lib/federalregister";
import { getDailyPrices } from "../lib/prices";
import { getTopicTimeline } from "../lib/wiki";
import { resolveCompany, commonName, getFilings } from "../lib/sec";
import {
  getYahooFinanceNews,
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
import type { SourceKey, TimelineEvent } from "../lib/types";

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

  report("GDELT", await safe(getNews(name)), "(throttles ~1 req/5s; rerun if 0)");
  if (ticker) report("Yahoo Finance RSS", await safe(getYahooFinanceNews(ticker)));
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
  report("LoC press (pre-1963)", await safe(getPressMentions(name).then((r) => r)), "(normal for modern subjects)");
  report("Internet Archive", await safe(getArchiveItems(name)), "(keyless; metadata index only)");
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
  // ⚠ Check the amounts on the first real run: DefiLlama reports millions, and a unit error
  // shows here as "$600" where "$600m" belongs — obvious on screen, invisible offline.
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
