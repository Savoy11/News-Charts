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
import { getTopicTimeline } from "../lib/wiki";
import { resolveCompany, commonName } from "../lib/sec";
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

function report(name: string, events: TimelineEvent[], note = "") {
  const keyed = KEYED[name];
  if (keyed) {
    const skip = skipReason(keyed.env, keyed.source);
    if (skip) {
      console.log(`  ${name.padEnd(22)} — ${skip}`);
      return;
    }
  }
  if (events.length === 0) {
    console.log(`  ${name.padEnd(22)} ⚠ 0 articles ${note}`);
    return;
  }
  const dates = events.map((e) => e.date).sort();
  const sample = events[0].title.slice(0, 60);
  console.log(
    `  ${name.padEnd(22)} ✓ ${String(events.length).padStart(3)} articles  ${dates[0]} → ${dates[dates.length - 1]}  e.g. “${sample}”`
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

  const story = await getTopicTimeline(name).catch(() => null);
  const hist = story?.events.filter((e) => e.type === "history") ?? [];
  const cites = story?.events.filter((e) => e.type === "citation") ?? [];
  console.log(
    story
      ? `  ${"Wikipedia story".padEnd(22)} ✓ ${hist.length} history + ${cites.length} cited articles (“${story.title}”)`
      : `  ${"Wikipedia story".padEnd(22)} ⚠ no article resolved`
  );

  console.log("\nKeyless feeds showing ⚠ 0 usually mean the source is unreachable from this network.");
  console.log("Keyed feeds showing ⚠ 0 with a key set usually mean the key or plan is wrong — test the key with curl.\n");
}

main();
