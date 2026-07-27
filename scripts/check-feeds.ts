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
import type { TimelineEvent } from "../lib/types";

const KEYS: Record<string, string | undefined> = {
  "NYT": process.env.NYT_API_KEY,
  "Guardian": process.env.GUARDIAN_API_KEY,
  "Newsdata": process.env.NEWSDATA_API_KEY,
  "GNews": process.env.GNEWS_API_KEY,
  "Currents": process.env.CURRENTS_API_KEY,
  "Marketaux": process.env.MARKETAUX_API_KEY,
  "EODHD": process.env.EODHD_API_KEY,
  "Finnhub": process.env.FINNHUB_API_KEY,
};

function report(name: string, events: TimelineEvent[], note = "") {
  const keyed = name in KEYS;
  if (keyed && !KEYS[name]) {
    console.log(`  ${name.padEnd(22)} — no key (set in .env.local to enable)`);
    return;
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
