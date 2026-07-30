import { config } from "dotenv";
config({ path: ".env.local" });

import type { PoolClient } from "pg";
import { getPool, closePool } from "../lib/db";
import {
  SOURCES,
  ensureSources,
  assertCommercialOk,
  shouldBackOff,
  logFetch,
  upsertEvent,
  upsertSubject,
  linkToIndustry,
  emptyStats,
  type UpsertStats,
} from "../lib/ingest/store";
import type { FetchResult, SourceKey, TimelineEvent } from "../lib/types";
import { getTopicTimeline } from "../lib/wiki";
import { fetchPressMentions, dropImplausiblePress } from "../lib/loc";
import { fetchNews } from "../lib/news";
import { resolveCompany, getFilings, getIndustry } from "../lib/sec";
import { getDailyPrices } from "../lib/prices";
import { getOfficialDomain } from "../lib/wikidata";
import { fetchRegulations, regulationQueryFor } from "../lib/federalregister";
import { CRYPTO_SUBJECTS, ingestOnchainFor } from "../lib/onchain";

const BACKOFF_MINUTES = 10;

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

/** Fetch → store → log, with a back-off check so we don't hammer a throttled source. */
async function runSource(
  client: PoolClient,
  sourceKey: SourceKey,
  subjectId: number,
  query: string,
  fetcher: () => Promise<FetchResult>,
  transform: (events: TimelineEvent[]) => TimelineEvent[] = (e) => e
): Promise<void> {
  await assertCommercialOk(client, sourceKey);

  const backoff = await shouldBackOff(client, sourceKey, subjectId, BACKOFF_MINUTES);
  if (backoff) {
    line(sourceKey, `skipped   last attempt ${backoff}, within ${BACKOFF_MINUTES} min backoff`);
    return;
  }

  const result = await fetcher();
  const events = transform(result.events);
  const stats = emptyStats();

  await client.query("BEGIN");
  try {
    for (const ev of events) await upsertEvent(client, ev, subjectId, stats);
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
    return;
  }
  report(sourceKey, result.outcome, stats);
}

async function ingestTopic(client: PoolClient, topic: string) {
  console.log(`\ntopic: ${topic}`);
  const wiki = await getTopicTimeline(topic);
  if (!wiki) {
    console.log("  no Wikipedia article found — nothing to ingest");
    return;
  }

  const firstEventOn = wiki.events[0]?.date ?? null;
  const subjectId = await upsertSubject(client, {
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
  await client.query("BEGIN");
  try {
    for (const ev of wiki.events) await upsertEvent(client, ev, subjectId, stats);
    await logFetch(client, "wikipedia", subjectId, topic, wiki.events.length ? "ok" : "empty", wiki.events.length, 200);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  report("wikipedia", wiki.events.length ? "ok" : "empty", stats);

  const floor = firstEventOn ? Number(firstEventOn.slice(0, 4)) : 0;
  await runSource(client, "loc_chronam", subjectId, topic, () => fetchPressMentions(topic), (evts) =>
    dropImplausiblePress(evts, floor)
  );
  await runSource(client, "gdelt", subjectId, topic, () => fetchNews(topic), (e) => e.slice(0, 30));
}

async function ingestCompany(client: PoolClient, ticker: string) {
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

  await runSource(client, "sec_edgar", subjectId, company.ticker, async () => {
    const events = await getFilings(company);
    return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
  });

  await runSource(client, "gdelt", subjectId, company.name, () => fetchNews(company.name), (e) =>
    e.slice(0, 30)
  );

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
      for (const ev of actions) await upsertEvent(client, ev, subjectId, stats);
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
async function ingestIndustry(client: PoolClient, slug: string) {
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
async function ingestOnchain(client: PoolClient, which: string) {
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
    await client.query("BEGIN");
    try {
      for (const ev of events) await upsertEvent(client, ev, subjectId, stats);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    await logFetch(client, "onchain", subjectId, asset.slug, events.length ? "ok" : "empty", events.length);
    report("onchain", events.length ? "ok" : "empty", stats);

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

main().catch((err) => {
  console.error("\ningest failed:", err.message);
  process.exit(1);
});
