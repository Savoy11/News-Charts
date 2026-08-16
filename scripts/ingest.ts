import { config } from "dotenv";
config({ path: ".env.local" });

import type { PoolClient } from "pg";
import { getPool, closePool, configProblem } from "../lib/db";
import {
  SOURCES,
  ensureSources,
  assertCommercialOk,
  shouldBackOff,
  logFetch,
  upsertEvent,
  upsertSubject,
  linkToIndustry,
  linkToSector,
  emptyStats,
  loadLastFetched,
  type UpsertStats,
  type ScoringContext,
} from "../lib/ingest/store";
import { aliasesFor } from "../lib/enrich/relevance";
import { selectStaleSources, ttlFor } from "../lib/ingest/refresh";
import { collapseNearDuplicates } from "../lib/newsQuality";
import type { FetchResult, SourceKey, TimelineEvent } from "../lib/types";
import { getTopicTimeline, articleAnswersSlug } from "../lib/wiki";
import { fetchPressMentions, dropImplausiblePress, ABSOLUTE_FLOOR } from "../lib/loc";
import { fetchNews } from "../lib/news";
import { getArchiveItems } from "../lib/archive";
import { getYahooFinanceNews } from "../lib/newsExtra";
import { resolveCompany, getFilingsDeep, getIndustry, commonName } from "../lib/sec";
import { getDailyPrices } from "../lib/prices";
import { getOfficialDomain } from "../lib/wikidata";
import { fetchRegulations, regulationQueryFor } from "../lib/federalregister";
import { CRYPTO_SUBJECTS, ingestOnchainFor } from "../lib/onchain";
import { sectorsFor } from "../lib/onchain/sectors";

const BACKOFF_MINUTES = 10;

/**
 * Every source a topic draws from, and every source a company draws from.
 *
 * Declared as lists rather than left implicit in the call order below, because these are what
 * the per-source refresh windows are computed over and what `scripts/check-wiring.ts` asserts
 * against the registry — a source added to `SOURCES` and never added here would otherwise be a
 * feed that reports healthy in `check:feeds` and contributes nothing to a page.
 *
 * The non-commercial keyed aggregators (NYT, Guardian, Newsdata, GNews, Currents, Marketaux,
 * EODHD, Finnhub) are deliberately absent. Ingesting is republishing, and their terms bar it;
 * `assertCommercialOk` refuses them outright. Their home is the visitor's own key in
 * `lib/feeds/browser.ts`, which renders under the visitor's licence and never persists.
 */
export const TOPIC_SOURCES = [
  "wikipedia",
  "loc_chronam",
  "gdelt",
  "internet_archive",
] as const satisfies readonly SourceKey[];

export const COMPANY_SOURCES = [
  "wikipedia",
  "sec_edgar",
  "gdelt",
  "yahoo_finance",
  "loc_chronam",
  "internet_archive",
] as const satisfies readonly SourceKey[];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function line(label: string, detail: string) {
  console.log(`  ${label.padEnd(12)} ${detail}`);
}

function report(source: string, outcome: string, s: UpsertStats) {
  line(
    source,
    `${outcome.padEnd(9)} events ${s.events} (${s.newEvents} new)  ` +
      `attestations ${s.attestations} (${s.newAttestations} new)  links +${s.links}`
  );
}

/**
 * Which of these sources are outside their refresh window for this subject.
 *
 * The windows in `lib/ingest/refresh.ts` were written for the page path and went with it: the
 * only caller left after the scheduler cut-over was their own test, so an hourly run re-asked
 * Wikipedia and 1800s newspaper scans every hour — sources whose declared windows are a day and
 * a week. This is what puts `selectStaleSources` back on the path it was written for.
 *
 * Fails open, deliberately: if the bookkeeping query itself fails, everything counts as stale.
 * A subject must never lose a feed because a freshness lookup had a bad day.
 */
async function dueSources(
  client: PoolClient,
  subjectId: number | null,
  keys: readonly SourceKey[]
): Promise<Set<SourceKey>> {
  if (subjectId === null) return new Set(keys); // never ingested — nothing is fresh
  try {
    return new Set(selectStaleSources(keys, await loadLastFetched(client, subjectId)));
  } catch {
    return new Set(keys);
  }
}

/** What we already hold for a slug, so a refresh can skip what is still inside its window. */
async function storedSubject(
  client: PoolClient,
  slug: string
): Promise<{ id: number; displayName: string; firstEventOn: string | null } | null> {
  const { rows } = await client.query<{ id: string; display_name: string; first_event_on: Date | string | null }>(
    `SELECT s.id, s.display_name, s.first_event_on
       FROM subjects s
       LEFT JOIN subject_aliases a ON a.subject_id = s.id
      WHERE s.slug = $1 OR lower(a.alias) = $1
      ORDER BY (s.slug = $1) DESC
      LIMIT 1`,
    [slug.toLowerCase()]
  );
  if (!rows[0]) return null;
  const on = rows[0].first_event_on;
  return {
    id: Number(rows[0].id),
    displayName: rows[0].display_name,
    firstEventOn: on instanceof Date ? on.toISOString().slice(0, 10) : on ? String(on).slice(0, 10) : null,
  };
}

/**
 * Record that this subject was worked, without changing anything about it.
 *
 * `upsertSubject` stamps `refreshed_at`, and every path used to call it because every path
 * re-fetched Wikipedia. A run that finds every source inside its window now writes nothing — and
 * `scripts/refresh.ts` orders by `refreshed_at NULLS FIRST`, so a subject that is never stamped
 * stays at the head of the queue for ever and, under `--limit`, starves everything behind it.
 */
async function touchSubject(client: PoolClient, subjectId: number): Promise<void> {
  await client.query("UPDATE subjects SET refreshed_at = now() WHERE id = $1", [subjectId]);
}

/** Adapters that return events rather than a `FetchResult`, adapted to what `runSource` logs. */
function asResult(fetch: () => Promise<TimelineEvent[]>): () => Promise<FetchResult> {
  return async () => {
    const events = await fetch();
    return { events, outcome: events.length ? "ok" : "empty" };
  };
}

/** Fetch → store → log, with a back-off check so we don't hammer a throttled source. */
async function runSource(
  client: PoolClient,
  sourceKey: SourceKey,
  subjectId: number,
  query: string,
  fetcher: () => Promise<FetchResult>,
  transform: (events: TimelineEvent[]) => TimelineEvent[] = (e) => e,
  scoring?: ScoringContext
): Promise<TimelineEvent[]> {
  await assertCommercialOk(client, sourceKey);

  const backoff = await shouldBackOff(client, sourceKey, subjectId, BACKOFF_MINUTES);
  if (backoff) {
    line(sourceKey, `skipped   last attempt ${backoff}, within ${BACKOFF_MINUTES} min backoff`);
    return [];
  }

  let result: FetchResult;
  try {
    result = await fetcher();
  } catch (err) {
    // A source that throws costs its own events and nothing else. Before, the rejection travelled
    // out of the whole ingest and took every source after it with it — one unreachable host and
    // the subject lost its filings too.
    await logFetch(client, sourceKey, subjectId, query, "error", 0, undefined, String(err).slice(0, 200));
    line(sourceKey, `FAILED    ${(err as Error).message}`);
    return [];
  }
  const events = transform(result.events);
  const stats = emptyStats();

  await client.query("BEGIN");
  try {
    for (const ev of events) await upsertEvent(client, ev, subjectId, stats, scoring);
    await logFetch(
      client,
      sourceKey,
      subjectId,
      query,
      result.outcome,
      events.length,
      result.httpStatus,
      result.detail
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    // still record the attempt, outside the failed transaction
    await logFetch(client, sourceKey, subjectId, query, "error", 0, undefined, String(err).slice(0, 200));
    line(sourceKey, `FAILED    ${(err as Error).message}`);
    return [];
  }
  report(sourceKey, result.outcome, stats);
  return events;
}

/**
 * A `runSource` bound to one subject and one due-set: sources still inside their window are
 * reported and skipped rather than asked.
 */
function runnerFor(
  client: PoolClient,
  subjectId: number,
  due: ReadonlySet<SourceKey>,
  scoring?: ScoringContext
) {
  return async (
    sourceKey: SourceKey,
    query: string,
    fetcher: () => Promise<FetchResult>,
    transform?: (events: TimelineEvent[]) => TimelineEvent[]
  ): Promise<TimelineEvent[]> => {
    if (!due.has(sourceKey)) {
      line(sourceKey, `fresh     inside its ${ttlFor(sourceKey)} min window`);
      return [];
    }
    return runSource(client, sourceKey, subjectId, query, fetcher, transform, scoring);
  };
}

export async function ingestTopic(client: PoolClient, topic: string) {
  console.log(`\ntopic: ${topic}`);

  // What we already have decides which sources are worth asking. A subject we have never seen
  // has nothing fresh, so everything is due — including Wikipedia, which is what establishes
  // that the subject exists at all.
  const existing = await storedSubject(client, topic);
  const due = await dueSources(client, existing?.id ?? null, TOPIC_SOURCES);

  let subjectId: number;
  let title: string;
  let firstEventOn: string | null;

  if (existing && !due.has("wikipedia")) {
    ({ id: subjectId, displayName: title, firstEventOn } = existing);
    line("subject", `#${subjectId} ${title}`);
    line("wikipedia", `fresh     inside its ${ttlFor("wikipedia")} min window`);
    await touchSubject(client, subjectId);
  } else {
    const wiki = await getTopicTimeline(topic);
    if (!wiki) {
      console.log("  no Wikipedia article found — nothing to ingest");
      return;
    }
    /**
     * The same guard the first pass applies, for the same reason: Wikipedia's search always
     * answers, so "found an article" is not "found the right article". Asked for
     * `best buy earnings q3` it returns TaxAct with 21 events.
     *
     * This path is the scheduler's, so a junk slug that reached the request queue would be
     * minted here on a timer rather than by a visitor — quieter, and no less wrong.
     */
    if (!articleAnswersSlug(topic, wiki.title)) {
      console.log(`  Wikipedia returned "${wiki.title}", which is not about "${topic}" — not minting`);
      return;
    }
    title = wiki.title;
    firstEventOn = wiki.events[0]?.date ?? null;
    subjectId = await upsertSubject(client, {
      kind: "topic",
      slug: topic.toLowerCase(),
      displayName: wiki.title,
      wikipediaTitle: wiki.title,
      summary: wiki.summary,
      firstEventOn,
    });
    line("subject", `#${subjectId} ${wiki.title}  (articles: ${wiki.articles.join(", ")})`);

    // Wikipedia is already fetched; store it without a second round trip.
    const stats = emptyStats();
    const wikiCtx = { kind: "topic" as const, displayName: wiki.title };
    const wikiScoring: ScoringContext = { subject: wikiCtx, aliases: aliasesFor(wikiCtx, [topic]) };
    await client.query("BEGIN");
    try {
      for (const ev of wiki.events) await upsertEvent(client, ev, subjectId, stats, wikiScoring);
      await logFetch(client, "wikipedia", subjectId, topic, wiki.events.length ? "ok" : "empty", wiki.events.length, 200);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    report("wikipedia", wiki.events.length ? "ok" : "empty", stats);
  }

  // A floor of 0 filters nothing, which is what this was for any subject Wikipedia gave no dated
  // first event for — every archive cataloguing error shipped. `ABSOLUTE_FLOOR.topic` is the
  // honest fallback: weak on purpose, because a topic can legitimately be ancient.
  const floor = firstEventOn ? Number(firstEventOn.slice(0, 4)) : ABSOLUTE_FLOOR.topic;
  // Score at link time: the typed phrasing rides along as an alias, so "EV" news for a
  // subject titled "Electric vehicle" still settles deterministically where it can.
  const topicCtx = { kind: "topic" as const, displayName: title };
  const scoring: ScoringContext = { subject: topicCtx, aliases: aliasesFor(topicCtx, [topic]) };
  const run = runnerFor(client, subjectId, due, scoring);

  await run("loc_chronam", topic, () => fetchPressMentions(topic), (evts) =>
    dropImplausiblePress(evts, floor)
  );
  // collapseNearDuplicates before storing: one wire story carried by several outlets is one
  // happening, and the richest copy is the one worth keeping — collapsed BEFORE the cap, so
  // syndication doesn't spend cap slots on copies of a story we already hold.
  await run("gdelt", topic, () => fetchNews(topic), (e) => collapseNearDuplicates(e).slice(0, 75));
  // Keyless, and the only historical source not exposed to a key expiry or a licence change.
  // Same plausibility floor as the newspaper scans: an archive item predating the subject is a
  // keyword collision, not early coverage.
  await run("internet_archive", topic, asResult(() => getArchiveItems(topic)), (evts) =>
    dropImplausiblePress(evts, floor)
  );
}

export async function ingestCompany(client: PoolClient, ticker: string) {
  console.log(`\ncompany: ${ticker}`);
  const company = await resolveCompany(ticker);
  if (!company) {
    console.log("  ticker not found in the SEC ticker index");
    return;
  }

  const [siteDomain, industry] = await Promise.all([
    getOfficialDomain(company.name),
    getIndustry(company),
  ]);
  const subjectId = await upsertSubject(client, {
    kind: "company",
    slug: company.ticker.toLowerCase(),
    displayName: company.name,
    ticker: company.ticker,
    cik: company.cik,
    sic: industry?.sic ?? null,
    siteDomain,
  });
  line("subject", `#${subjectId} ${company.name} (${company.ticker}, CIK ${company.cik})`);
  line("site", siteDomain ?? "not resolved");

  const due = await dueSources(client, subjectId, COMPANY_SOURCES);
  // Headlines say "Ford", not "Ford Motor Company" — every keyword-searched feed gets the
  // common name, and only EDGAR and the price endpoint get the ticker.
  const name = commonName(company.name);
  // Score at link time, with the common name as an extra whole-phrase alias — the same name
  // the feeds were queried under is the name their headlines will use.
  const companyCtx = { kind: "company" as const, displayName: company.name, ticker: company.ticker };
  const scoring: ScoringContext = { subject: companyCtx, aliases: aliasesFor(companyCtx, [name]) };
  const run = runnerFor(client, subjectId, due, scoring);

  if (industry) {
    const { industryId, slug } = await linkToIndustry(client, subjectId, industry);
    const { rows } = await client.query<{ n: string }>(
      "SELECT count(*) AS n FROM subject_members WHERE industry_id = $1",
      [industryId]
    );
    line("industry", `SIC ${industry.sic} ${industry.description} → /${slug} (${rows[0].n} members)`);
  } else {
    line("industry", "no SIC code from EDGAR");
  }

  await run("sec_edgar", company.ticker, async () => {
    /**
     * The scheduler takes the WHOLE history, not just EDGAR's recent block.
     *
     * `filings.recent` stops at roughly a thousand filings, which for an active filer is only
     * the last few years — measured, Ford's recent block reaches 2019 and Apple's 2015, while
     * the older shards carry both back to 1994. That is 209 -> 937 filings for Ford and
     * 161 -> 393 for Apple, and it is exactly the "depth of coverage for listed securities"
     * this project's scope is about.
     *
     * Deep here and shallow in the first pass, deliberately: this path has no deadline and runs
     * on a refresh window, while the first pass runs with a visitor waiting on an 8s budget.
     */
    const events = await getFilingsDeep(company, true);
    return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
  });

  // GDELT phrase-quotes the query, so the full SEC legal title ("Ford Motor Co") matches no
  // headline that says "Ford" — the common name is the query, exactly as the comment above
  // promised and the historical sources below already do.
  await run("gdelt", name, () => fetchNews(name), (e) =>
    // dedupe BEFORE capping: syndicated copies of one wire story must not burn cap slots
    collapseNearDuplicates(e).slice(0, 75)
  );

  /**
   * The company's story predates its ticker.
   *
   * Wikipedia history and its cited articles cover the run-up to going public, which filings and
   * news feeds cannot reach — it is what fills the "Before the ticker" section. The page path
   * fetched this on every company render and the scheduler cut-over dropped it, so a company
   * ingested since has had no history at all.
   *
   * It doubles as the plausibility floor for the two historical sources below: "Apple" in an
   * 1890 newspaper is the fruit, and without a founding year there is no way to tell.
   */
  const story = due.has("wikipedia") ? await getTopicTimeline(name).catch(() => null) : null;
  if (!due.has("wikipedia")) {
    line("wikipedia", `fresh     inside its ${ttlFor("wikipedia")} min window`);
  } else if (story) {
    line("wikipedia", `resolved  “${story.title}” (${story.events.length} events)`);
    await run("wikipedia", name, asResult(async () => story.events));
  } else {
    line("wikipedia", "no article resolved for this company");
  }

  /**
   * The two historical sources, both floored on the company's first recorded year.
   *
   * No founding year means no floor, and without one the newspaper scans are OCR noise — "Apple"
   * in an 1890 paper is the fruit. The floor rides on the Wikipedia story, so these run in the
   * same pass it does; their own windows (a week, a day) are longer than Wikipedia's, so a run
   * that finds Wikipedia fresh would have found these fresh too.
   */
  const firstStoryYear = story?.events[0]?.date ? Number(story.events[0].date.slice(0, 4)) : null;
  if (firstStoryYear) {
    await run("loc_chronam", name, () => fetchPressMentions(name), (evts) =>
      dropImplausiblePress(evts, firstStoryYear)
    );
    // Archived material about the company itself — annual reports, catalogues, advertising.
    await run("internet_archive", name, asResult(() => getArchiveItems(name)), (evts) =>
      dropImplausiblePress(evts, firstStoryYear)
    );
  } else if (story) {
    /**
     * No founding year, so no subject-derived floor — but "no floor" is not the answer either.
     *
     * This branch used to pass the items straight through with only a cap, on the stated grounds
     * that "archive metadata is catalogued rather than OCR-guessed, so a wrong date is a rarity
     * there". Measured against the live archive on 2026-08-12, it is not a rarity: 12 of 48
     * `"Ford Motor"` items were pre-1900 for a company founded in 1903, five of them stamped
     * 1770. The same `dropImplausiblePress` the branch above uses now applies here, against the
     * weakest floor that is still true of every company.
     */
    await run("internet_archive", name, asResult(() => getArchiveItems(name)), (evts) =>
      dropImplausiblePress(evts, ABSOLUTE_FLOOR.company)
    );
  }

  // Headline/link/date under the ticker's own feed. Licensed for the ad-supported path (the
  // registry's `commercialOk: true`), unlike the keyed aggregators, which is why it is here and
  // they are not.
  await run("yahoo_finance", company.ticker, asResult(() => getYahooFinanceNews(company.ticker)), (e) =>
    collapseNearDuplicates(e)
  );

  // Prices come off the same host and the same licence as the RSS feed above, so they share its
  // window: closes are daily bars, and re-asking for them twice an hour buys nothing.
  if (!due.has("yahoo_finance")) {
    line("prices", `fresh     inside its ${ttlFor("yahoo_finance")} min window`);
    return;
  }

  const { points, actions } = await getDailyPrices(company.ticker);
  if (points.length) {
    await client.query(
      `INSERT INTO prices (subject_id, on_date, close, volume)
       SELECT $1, d, c, v FROM unnest($2::date[], $3::numeric[], $4::bigint[]) AS t(d, c, v)
       ON CONFLICT (subject_id, on_date) DO UPDATE
          SET close = EXCLUDED.close,
              volume = COALESCE(EXCLUDED.volume, prices.volume)`,
      [
        subjectId,
        points.map((p) => p.time),
        points.map((p) => p.value),
        points.map((p) => p.volume ?? null),
      ]
    );
  }
  const withVolume = points.filter((p) => p.volume != null).length;
  line("prices", `${points.length} daily closes (${withVolume} with volume)`);

  // Dividends and splits ride the same chart response, so they cost no extra request.
  if (actions.length) {
    const stats = emptyStats();
    await client.query("BEGIN");
    try {
      for (const ev of actions) await upsertEvent(client, ev, subjectId, stats, scoring);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    line("yahoo_finance", `${actions.length} corporate actions (dividends + splits)`);
  }
}

/**
 * Regulatory events for a whole sector. These link to the industry subject, not to any
 * member company — an export-control rule is a semiconductor event that happens to
 * matter to Nvidia, not an Nvidia event.
 */
export async function ingestIndustry(client: PoolClient, slug: string) {
  console.log(`\nindustry: ${slug}`);
  const { rows } = await client.query(
    `SELECT id, display_name, sic FROM subjects WHERE slug = $1 AND kind = 'industry'`,
    [slug.toLowerCase()]
  );
  if (!rows[0]) {
    console.log("  no such industry — ingest a member company first to create it");
    return;
  }
  const subjectId = Number(rows[0].id);
  const { rows: aliasRows } = await client.query(
    "SELECT alias FROM subject_aliases WHERE subject_id = $1",
    [subjectId]
  );
  const query = regulationQueryFor(
    rows[0].display_name,
    aliasRows.map((a) => a.alias)
  );

  const { rows: memberRows } = await client.query(
    `SELECT count(*) AS n FROM subject_members WHERE industry_id = $1`,
    [subjectId]
  );
  line("subject", `#${subjectId} ${rows[0].display_name} (SIC ${rows[0].sic}, ${memberRows[0].n} members)`);
  line("query", `"${query}"`);

  await runSource(client, "federal_register", subjectId, query, () => fetchRegulations(query));
}

/**
 * On-chain ingest. Crypto assets are `topic` subjects (they have no CIK or ticker, so the
 * company kind is barred by the schema and would be a lie anyway) that happen to carry a price
 * series — which is what lets a halving be read against the BTC chart.
 */
/**
 * Record which sectors a crypto subject belongs to.
 *
 * Runs after the subject exists, because membership needs its id — and silently does nothing for
 * a subject no sector claims, which is most of them.
 */
async function linkCryptoSectors(client: PoolClient, slug: string): Promise<void> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM subjects WHERE slug = $1`,
    [slug]
  );
  if (!rows[0]) return;
  for (const sector of sectorsFor(slug)) {
    await linkToSector(client, Number(rows[0].id), {
      slug: sector.slug,
      displayName: sector.displayName,
      summary: sector.summary,
    });
  }
}

export async function ingestOnchain(client: PoolClient, which: string) {
  const targets = which === "all" ? CRYPTO_SUBJECTS : CRYPTO_SUBJECTS.filter((c) => c.slug === which);
  if (!targets.length) {
    console.error(`unknown on-chain subject "${which}"`);
    process.exit(2);
  }

  await assertCommercialOk(client, "onchain");

  for (const asset of targets) {
    console.log(`\n${asset.displayName} (${asset.slug})`);
    const subjectId = await upsertSubject(client, {
      kind: "topic",
      slug: asset.slug,
      displayName: asset.displayName,
      summary: asset.summary,
      firstEventOn: asset.firstEventOn,
    });
    for (const alias of asset.aliases) {
      await client.query(
        `INSERT INTO subject_aliases (subject_id, alias) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [subjectId, alias.toLowerCase()]
      );
    }

    const events = await ingestOnchainFor(asset.slug);
    const stats = emptyStats();
    const assetCtx = { kind: "topic" as const, displayName: asset.displayName };
    const assetScoring: ScoringContext = {
      subject: assetCtx,
      aliases: aliasesFor(assetCtx, asset.aliases),
    };
    await client.query("BEGIN");
    try {
      for (const ev of events) await upsertEvent(client, ev, subjectId, stats, assetScoring);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    await logFetch(client, "onchain", subjectId, asset.slug, events.length ? "ok" : "empty", events.length);
    report("onchain", events.length ? "ok" : "empty", stats);

    // Sector membership, so /industry/sector-stablecoins aggregates every issuer's supply moves.
    await linkCryptoSectors(client, asset.slug);

    // Yahoo quotes crypto under `BTC-USD` — the same chart endpoint companies use, so the
    // price series and its overlays come for free.
    if (asset.yahooSymbol) {
      const { points } = await getDailyPrices(asset.yahooSymbol);
      if (points.length) {
        await client.query(
          `INSERT INTO prices (subject_id, on_date, close, volume)
           SELECT $1, d, c, v FROM unnest($2::date[], $3::numeric[], $4::bigint[]) AS t(d, c, v)
           ON CONFLICT (subject_id, on_date) DO UPDATE
              SET close = EXCLUDED.close,
                  volume = COALESCE(EXCLUDED.volume, prices.volume)`,
          [subjectId, points.map((p) => p.time), points.map((p) => p.value), points.map((p) => p.volume ?? null)]
        );
      }
      line("prices", `${points.length} daily closes for ${asset.yahooSymbol}`);
    }
  }
}

async function main() {
  const topic = arg("topic");
  const ticker = arg("ticker");
  const industry = arg("industry");
  const onchain = arg("onchain");
  if (!topic && !ticker && !industry && !onchain) {
    console.error(
      "usage: npm run ingest -- --topic <name> | --ticker <SYMBOL> | --industry <sic-slug>\n" +
        `                       | --onchain <${CRYPTO_SUBJECTS.map((c) => c.slug).join("|")}|all>`
    );
    process.exit(2);
  }

  const client = await getPool().connect();
  try {
    await ensureSources(client);
    if (topic) await ingestTopic(client, topic);
    if (ticker) await ingestCompany(client, ticker.toUpperCase());
    if (industry) await ingestIndustry(client, industry);
    if (onchain) await ingestOnchain(client, onchain.toLowerCase());
  } finally {
    client.release();
    await closePool();
  }
  console.log("\ndone.");
}

// Guarded so `scripts/refresh.ts` can import the per-subject ingesters without the CLI running
// as a side effect of the import.
if (require.main === module) {
  main().catch((err) => {
    // A configuration problem is a sentence, not a stack; anything else keeps its stack,
  // because hiding a real fault to look tidy is how it becomes hard to diagnose.
  const known = configProblem(err);
  console.error(known ? `
ingest failed: ${known}` : err);
    process.exit(1);
  });
}
