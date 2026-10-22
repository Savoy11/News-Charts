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
  upsertTopicSubject,
  linkToIndustry,
  linkToSector,
  writePrices,
  hasFullPriceHistory,
  splitNeedsFullHistory,
  emptyStats,
  loadLastFetched,
  type UpsertStats,
  type ScoringContext,
} from "../lib/ingest/store";
import { aliasesFor } from "../lib/enrich/relevance";
import { selectStaleSources, ttlFor } from "../lib/ingest/refresh";
import { collapseNearDuplicates } from "../lib/newsQuality";
import type { FetchResult, SourceKey, TimelineEvent } from "../lib/types";
import { getTopicTimeline, articleAnswersSlug, companyLede, articleCoversSlug, topicSlugFromTitle, WikipediaUnavailable, wikiOutcome } from "../lib/wiki";
import { fetchPressMentions, dropImplausiblePress, ABSOLUTE_FLOOR } from "../lib/loc";
import { fetchNews, gdeltNames } from "../lib/news";
import { fetchArchiveItems } from "../lib/archive";
import { fetchYahooFinanceNews } from "../lib/newsExtra";
import { resolveCompany, getFilingsDeep, getIndustry, commonName, formerNameAliases, newsNamesFor, type Rename } from "../lib/sec";
import { fetchDailyPrices, fullHistoryQuery, splitsIn } from "../lib/prices";
import { getOfficialDomain } from "../lib/wikidata";
import { fetchRegulations, regulationQueryFor } from "../lib/federalregister";
import { FR_COMPANY_SINCE, companyNames, fetchCompanyRegulations, frSearchTerm } from "../lib/frCompany";
import { RECALL_FLOOR, fetchRecalls, recallMakersFor } from "../lib/recalls";
import { dojQueryNames, fetchJusticeReleases } from "../lib/doj";
import { CRYPTO_SUBJECTS, fetchOnchainFor } from "../lib/onchain";
import { sectorsFor } from "../lib/onchain/sectors";
import { MACRO_SUBJECT, fetchCpiReleases, fetchFomcStatements } from "../lib/macro";

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
  // documents whose title names the company — not the sector's keyword rules (2026-10-17 proposal 4)
  "federal_register",
  // safety recalls, asked only for the vehicle makers lib/recalls.ts maps (batch 30)
  "nhtsa_recalls",
  // releases whose title makes the company a party: it pays, pleads, is sued (batch 32)
  "doj_press",
  "gdelt",
  "yahoo_finance",
  "yahoo_prices",
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

/**
 * What a run did for one subject, so the request queue closes only what was really served.
 *
 * Every ingester used to return normally for "no Wikipedia article", "not minting" and "ticker not
 * found", and `refresh.ts` marked the request fulfilled on any normal return — so `npm run demand`
 * reported subjects as served that were never created (NC-144).
 */
export type IngestOutcome = { ingested: true } | { ingested: false; reason: string };

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

export async function ingestTopic(client: PoolClient, topic: string): Promise<IngestOutcome> {
  console.log(`\ntopic: ${topic}`);

  // What we already have decides which sources are worth asking. A subject we have never seen
  // has nothing fresh, so everything is due — including Wikipedia, which is what establishes
  // that the subject exists at all.
  const existing = await storedSubject(client, topic);
  const due = await dueSources(client, existing?.id ?? null, TOPIC_SOURCES);

  let subjectId: number;
  let title: string;
  let firstEventOn: string | null;

  // Wikipedia establishes that the subject exists, so it is asked whenever it is due — and a
  // Wikipedia that could not answer is told apart from one that had no article (NC-146).
  let wiki: Awaited<ReturnType<typeof getTopicTimeline>> = null;
  let wikiDown: WikipediaUnavailable | null = null;
  if (!existing || due.has("wikipedia")) {
    try {
      wiki = await getTopicTimeline(topic);
    } catch (err) {
      if (!(err instanceof WikipediaUnavailable)) throw err;
      wikiDown = err;
    }
  }

  if (existing && (!due.has("wikipedia") || wikiDown)) {
    ({ id: subjectId, displayName: title, firstEventOn } = existing);
    line("subject", `#${subjectId} ${title}`);
    if (wikiDown) {
      // A subject we already hold keeps its stored article, and the other sources still run:
      // one throttled host is no reason to skip three that may well answer.
      await logFetch(client, "wikipedia", subjectId, topic, wikiOutcome(wikiDown), 0, wikiDown.status, wikiDown.message);
      line("wikipedia", `${wikiOutcome(wikiDown).padEnd(9)} ${wikiDown.message} — keeping the stored article`);
    } else {
      line("wikipedia", `fresh     inside its ${ttlFor("wikipedia")} min window`);
    }
    await touchSubject(client, subjectId);
  } else {
    if (wikiDown) {
      console.log(`  ${wikiDown.message} — nothing to mint until it answers`);
      return { ingested: false, reason: wikiDown.message };
    }
    if (!wiki) {
      console.log("  no Wikipedia article found — nothing to ingest");
      return { ingested: false, reason: "no Wikipedia article found" };
    }
    /**
     * The same guard the first pass applies, for the same reason: Wikipedia's search always
     * answers, so "found an article" is not "found the right article". Asked for
     * `best buy earnings q3` it returns TaxAct with 21 events.
     *
     * This path is the scheduler's, so a junk slug that reached the request queue would be
     * minted here on a timer rather than by a visitor — quieter, and no less wrong. Minting holds
     * the requested words to the stricter test, since they become an address (NC-157); a subject
     * already held keeps the looser one, so the change cannot stop it refreshing.
     */
    if (!(existing ? articleAnswersSlug : articleCoversSlug)(topic, wiki.title)) {
      console.log(`  Wikipedia returned "${wiki.title}", which is not about "${topic}" — not minting`);
      return { ingested: false, reason: `Wikipedia returned "${wiki.title}", which is not about "${topic}"` };
    }
    title = wiki.title;
    firstEventOn = wiki.events[0]?.date ?? null;
    // Keyed on the Wikipedia article, exactly as the first pass keys it: keyed on the typed
    // slug, a request under another phrasing ("electric car" after "electric cars") minted a
    // second subject with identical events — the shape db/005 exists to clean up (NC-099).
    subjectId = await upsertTopicSubject(client, {
      searchTerm: topic,
      // a requested slug is a visitor's words — the subject is named for its article (NC-157)
      canonicalSlug: topicSlugFromTitle(wiki.title),
      wikipediaTitle: wiki.title,
      displayName: wiki.title,
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
  await run("internet_archive", topic, () => fetchArchiveItems(topic), (evts) =>
    dropImplausiblePress(evts, floor)
  );
  return { ingested: true };
}

export async function ingestCompany(client: PoolClient, ticker: string): Promise<IngestOutcome> {
  console.log(`\ncompany: ${ticker}`);
  const company = await resolveCompany(ticker);
  if (!company) {
    console.log("  ticker not found in the SEC ticker index");
    return { ingested: false, reason: "ticker not found in the SEC ticker index" };
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
  // Its other names that news may use — "Google" for Alphabet, "Facebook" for Meta — never an
  // acquired company's (`newsNamesFor`, batch 25). Headlines use them, so the feed is asked for
  // them and a headline naming one counts as naming the company.
  const alsoKnownAs = newsNamesFor(company.cik);
  // Score at link time, with the common name as an extra whole-phrase alias — the same name
  // the feeds were queried under is the name their headlines will use.
  const companyCtx = { kind: "company" as const, displayName: company.name, ticker: company.ticker };
  const scoring: ScoringContext = { subject: companyCtx, aliases: aliasesFor(companyCtx, [name, ...alsoKnownAs]) };
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

  const renames: Rename[] = [];
  const othersStakes: string[] = [];
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
    const events = await getFilingsDeep(company, true, renames, othersStakes);
    return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
  });

  /**
   * The company's own stakes in other issuers are left out of its filings (`filingsFromBlock`),
   * but an ingest before 2026-10-21 linked them here, as stakes *in* it. Unlink those from this
   * company only: the same filing is, correctly, a stake in the issuer it names.
   */
  if (othersStakes.length) {
    const { rowCount } = await client.query(
      `DELETE FROM event_subjects es
         USING event_attestations a, sources s
        WHERE es.subject_id = $1 AND a.event_id = es.event_id
          AND s.id = a.source_id AND s.key = 'sec_edgar' AND a.external_id = ANY($2::text[])`,
      [subjectId, othersStakes]
    );
    if (rowCount) line("sec_edgar", `unlinked ${rowCount} of its own stakes in other issuers`);
  }

  /**
   * The names the company used to file under, as search aliases — so "Facebook" finds a held
   * Meta Platforms (2026-10-17 proposal 9). They come from the record the filings step just read,
   * and only on a run that read it; the rename itself is already on the timeline from that step.
   */
  for (const alias of formerNameAliases(renames, company.name)) {
    await client.query(
      `INSERT INTO subject_aliases (subject_id, alias) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [subjectId, alias]
    );
  }

  /**
   * Federal Register documents that name the company in their title — an FTC order, an NHTSA
   * petition, a trade-zone or export notice — and never airworthiness directives (the owner's rule
   * from the 2026-10-18 count). A sector's keyword rules stay the industry's; these are the
   * company's own. Scored at link time: the title names the subject, so no model is needed.
   */
  await run("federal_register", frSearchTerm(company.name, alsoKnownAs), () =>
    fetchCompanyRegulations(company.name, FR_COMPANY_SINCE, alsoKnownAs)
  );

  /**
   * Vehicle safety recalls the company filed with NHTSA, back to 1966 — the one source that reaches
   * into the years between the old newspapers and GDELT (batch 30). Only for the makers
   * lib/recalls.ts maps by hand: the dataset names a maker, never a listed company, and a name
   * match would hand Chrysler's 1970s recalls to Stellantis.
   */
  const makers = recallMakersFor(company.cik);
  if (makers) {
    await run("nhtsa_recalls", `${makers.map((m) => m.name).join(" | ")} ≥${RECALL_FLOOR} vehicles`, () => fetchRecalls(company.cik));
  }

  /**
   * Justice Department press releases in which the company is a party — a settlement, a plea, a
   * suit against it, an antitrust case over its merger — back to 2009 (batch 32). The API matches
   * a name anywhere in a title, so most hits are about someone else ("Wells Fargo Personal Banker
   * Indicted for Money Laundering"); `releaseNamesParty` keeps a release only when the title makes the company the one
   * acting or acted against. Scored without the model, as a filing is.
   */
  await run("doj_press", dojQueryNames(companyNames(company.name, alsoKnownAs)).join(" | "), () =>
    fetchJusticeReleases(company.name, alsoKnownAs)
  );

  // GDELT phrase-quotes the query, so the full SEC legal title ("Ford Motor Co") matches no
  // headline that says "Ford" — the common name is the query, exactly as the comment above
  // promised and the historical sources below already do.
  if (alsoKnownAs.length) line("names", `headlines also scored by ${alsoKnownAs.map((n) => `"${n}"`).join(", ")}`);
  await run("gdelt", gdeltNames(name, alsoKnownAs).join(" | "), () => fetchNews(name, alsoKnownAs), (e) =>
    // dedupe BEFORE capping: syndicated copies of one wire story must not burn cap slots
    collapseNearDuplicates(e).slice(0, 75)
  );

  /**
   * The company's story predates its ticker.
   *
   * Wikipedia history and its cited articles cover the run-up to going public, which filings and
   * news feeds cannot reach — it is what fills the "Before the chart" section. The page path
   * fetched this on every company render and the scheduler cut-over dropped it, so a company
   * ingested since has had no history at all.
   *
   * It doubles as the plausibility floor for the two historical sources below: "Apple" in an
   * 1890 newspaper is the fruit, and without a founding year there is no way to tell.
   */
  let story: Awaited<ReturnType<typeof getTopicTimeline>> = null;
  let storyDown: WikipediaUnavailable | null = null;
  if (due.has("wikipedia")) {
    try {
      story = await getTopicTimeline(name);
    } catch (err) {
      // An unanswered Wikipedia is logged and backed off like any throttled source (NC-146);
      // anything else stays what it always was here — an enrichment that did not arrive.
      if (err instanceof WikipediaUnavailable) storyDown = err;
    }
  }
  if (!due.has("wikipedia")) {
    line("wikipedia", `fresh     inside its ${ttlFor("wikipedia")} min window`);
  } else if (storyDown) {
    const down = storyDown;
    await run("wikipedia", name, async () => ({
      events: [],
      outcome: wikiOutcome(down),
      httpStatus: down.status,
      detail: down.message,
    }));
  } else if (story) {
    const found = story;
    line("wikipedia", `resolved  “${found.title}” (${found.events.length} events)`);
    await run("wikipedia", name, async () => ({
      events: found.events,
      outcome: found.events.length ? "ok" : "empty",
      httpStatus: 200,
    }));
    // The lede was fetched with the story and thrown away (2026-10-17 proposal 5).
    const lede = companyLede(name, found);
    if (lede) {
      await client.query("UPDATE subjects SET summary = $2, wikipedia_title = $3 WHERE id = $1", [
        subjectId,
        lede.summary,
        lede.title,
      ]);
    }
    line(
      "lede",
      lede
        ? `kept from “${lede.title}”`
        : found.summary.trim()
          ? `not kept — “${found.title}” does not answer “${name}”`
          : "none in the article"
    );
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
    await run("internet_archive", name, () => fetchArchiveItems(name), (evts) =>
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
    await run("internet_archive", name, () => fetchArchiveItems(name), (evts) =>
      dropImplausiblePress(evts, ABSOLUTE_FLOOR.company)
    );
  }

  // Headline/link/date under the ticker's own feed. Licensed for the ad-supported path (the
  // registry's `commercialOk: true`), unlike the keyed aggregators, which is why it is here and
  // they are not.
  await run("yahoo_finance", company.ticker, () => fetchYahooFinanceNews(company.ticker), (e) =>
    collapseNearDuplicates(e)
  );

  /**
   * Prices under a key of their own (NC-103). They shared the RSS feed's window and were never
   * logged, so a refused or empty chart fetch left no trace: the Sources panel showed Yahoo as
   * fine, nothing backed off, and the company page — which leads with the chart — had nothing to
   * draw. Now the fetch is windowed, backed off and logged like every other source.
   */
  if (!due.has("yahoo_prices")) {
    line("yahoo_prices", `fresh     inside its ${ttlFor("yahoo_prices")} min window`);
    return { ingested: true };
  }
  await assertCommercialOk(client, "yahoo_prices");
  const priceBackoff = await shouldBackOff(client, "yahoo_prices", subjectId, BACKOFF_MINUTES);
  if (priceBackoff) {
    line("yahoo_prices", `skipped   last attempt ${priceBackoff}, within ${BACKOFF_MINUTES} min backoff`);
    return { ingested: true };
  }

  /**
   * Every daily close Yahoo holds, read once; routine refreshes then read ten years, which is
   * all a new close needs (NC-077). Yahoo's daily data begins in 1962, so for an older company
   * that is where the chart starts, not its listing. A chart used to begin ten years before the company's first
   * ingest and never earlier, so a 2001 filing or a 1994 Fed decision had no price under it.
   * Read whole, the history replaces what was stored, so every close carries one adjustment.
   */
  const complete = await hasFullPriceHistory(client, subjectId, company.ticker);
  let daily = await fetchDailyPrices(company.ticker, complete ? "10y" : "full");
  let replace = !complete && daily.outcome === "ok";
  let dropBefore: string | undefined;
  // A split we have not seen re-adjusts every earlier close; re-read the whole history so rows
  // older than the 10-year window do not keep the old adjustment (NC-156).
  if (complete && (await splitNeedsFullHistory(client, subjectId, daily.points, splitsIn(daily.actions)))) {
    const full = await fetchDailyPrices(company.ticker, "full");
    if (full.outcome === "ok") {
      daily = { ...full, actions: daily.actions };
      replace = true;
      line("yahoo_prices", `new split — re-read the full history (${full.points.length} closes)`);
    } else {
      dropBefore = daily.points[0].time;
      line("yahoo_prices", `new split — full history unavailable (${full.outcome}); dropping closes before ${dropBefore}`);
    }
  }

  const stats = emptyStats();
  await client.query("BEGIN");
  try {
    await writePrices(client, subjectId, daily.points, { replace, dropBefore });
    // Dividends and splits ride the same chart response, so they cost no extra request.
    for (const ev of daily.actions) await upsertEvent(client, ev, subjectId, stats, scoring);
    await logFetch(
      client,
      "yahoo_prices",
      subjectId,
      // a whole history is logged as one, which is how the next run knows it need not ask again
      replace ? fullHistoryQuery(company.ticker) : company.ticker,
      daily.outcome,
      daily.points.length,
      daily.httpStatus,
      daily.detail
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  const withVolume = daily.points.filter((p) => p.volume != null).length;
  line(
    "yahoo_prices",
    daily.outcome === "ok"
      ? `ok        ${daily.points.length} daily closes (${withVolume} with volume), ${daily.actions.length} corporate actions`
      : `${daily.outcome.padEnd(9)} ${daily.detail ?? "no closes"}`
  );
  return { ingested: true };
}

/**
 * Regulatory events for a whole sector. These link to the industry subject, not to any
 * member company — an export-control rule is a semiconductor event that happens to
 * matter to Nvidia, not an Nvidia event.
 *
 * Inside its window the Federal Register is not re-asked, as on every other path — this runs on
 * the hourly schedule now, and the source's window is a day. Either way the subject is stamped as
 * worked, or `refresh.ts`'s oldest-first order would keep every sector at the head of the queue.
 */
export async function ingestIndustry(client: PoolClient, slug: string): Promise<IngestOutcome> {
  console.log(`\nindustry: ${slug}`);
  const { rows } = await client.query(
    `SELECT id, display_name, sic FROM subjects WHERE slug = $1 AND kind = 'industry'`,
    [slug.toLowerCase()]
  );
  if (!rows[0]) {
    console.log("  no such industry — ingest a member company first to create it");
    return { ingested: false, reason: "no such industry" };
  }
  const subjectId = Number(rows[0].id);
  if (!(await dueSources(client, subjectId, ["federal_register"])).has("federal_register")) {
    line("federal_register", `fresh     inside its ${ttlFor("federal_register")} min window`);
    await touchSubject(client, subjectId);
    return { ingested: true };
  }
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
  await touchSubject(client, subjectId);
  return { ingested: true };
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

/** Every source an on-chain subject draws from, prices included. */
const ONCHAIN_SOURCES: readonly SourceKey[] = ["onchain", "snapshot", "defillama", "yahoo_prices"];

export async function ingestOnchain(client: PoolClient, which: string): Promise<IngestOutcome> {
  const targets = which === "all" ? CRYPTO_SUBJECTS : CRYPTO_SUBJECTS.filter((c) => c.slug === which);
  if (!targets.length) {
    console.error(`unknown on-chain subject "${which}"`);
    process.exit(2);
  }

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

    const assetCtx = { kind: "topic" as const, displayName: asset.displayName };
    const assetScoring: ScoringContext = {
      subject: assetCtx,
      aliases: aliasesFor(assetCtx, asset.aliases),
    };
    /**
     * Windows and back-off, as every other path has them. This path called neither, so every
     * crypto subject re-fetched mempool.space, Etherscan, Snapshot, the whole DefiLlama hacks file
     * and its Yahoo prices on every hourly run — about 24x the windows the quota report assumes
     * (NC-147). A feed is asked only when it is due and not backing off.
     */
    const due = await dueSources(client, subjectId, ONCHAIN_SOURCES);
    for (const key of ONCHAIN_SOURCES) {
      if (!due.has(key)) {
        line(key, `fresh     inside its ${ttlFor(key)} min window`);
        continue;
      }
      const backoff = await shouldBackOff(client, key, subjectId, BACKOFF_MINUTES);
      if (backoff) {
        due.delete(key);
        line(key, `skipped   last attempt ${backoff}, within ${BACKOFF_MINUTES} min backoff`);
      }
    }

    /**
     * Each feed under its own source key: licence-checked as the key its rows are stored under
     * (governance is `snapshot`, incidents `defillama` — only `onchain` was ever checked, NC-148),
     * and logged with its real outcome, so an explorer outage is an error rather than an empty
     * fetch (NC-142).
     */
    for (const { sourceKey, result } of await fetchOnchainFor(asset.slug, due)) {
      await assertCommercialOk(client, sourceKey);
      const stats = emptyStats();
      await client.query("BEGIN");
      try {
        for (const ev of result.events) await upsertEvent(client, ev, subjectId, stats, assetScoring);
        await logFetch(
          client,
          sourceKey,
          subjectId,
          asset.slug,
          result.outcome,
          result.events.length,
          result.httpStatus,
          result.detail
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
      report(sourceKey, result.outcome, stats);
    }

    // Sector membership, so /industry/sector-stablecoins aggregates every issuer's supply moves.
    await linkCryptoSectors(client, asset.slug);

    // Yahoo quotes crypto under `BTC-USD` — the same chart endpoint companies use, so the
    // price series and its overlays come for free. Windowed like a company's prices, and logged
    // so the window has something to read.
    if (asset.yahooSymbol && due.has("yahoo_prices")) {
      // the whole series once, then ten years — as companies do (NC-077); Bitcoin's starts in 2014
      const complete = await hasFullPriceHistory(client, subjectId, asset.yahooSymbol);
      const daily = await fetchDailyPrices(asset.yahooSymbol, complete ? "10y" : "full");
      const whole = !complete && daily.outcome === "ok";
      await client.query("BEGIN");
      try {
        await writePrices(client, subjectId, daily.points, { replace: whole });
        await logFetch(
          client,
          "yahoo_prices",
          subjectId,
          whole ? fullHistoryQuery(asset.yahooSymbol) : asset.yahooSymbol,
          daily.outcome,
          daily.points.length,
          daily.httpStatus,
          daily.detail
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
      line(
        "yahoo_prices",
        daily.outcome === "ok"
          ? `ok        ${daily.points.length} daily closes for ${asset.yahooSymbol}`
          : `${daily.outcome.padEnd(9)} ${daily.detail ?? "no closes"}`
      );
    }
  }
  return { ingested: true };
}

/** Both economy feeds, onto the one subject that holds them (lib/macro.ts). */
const MACRO_SOURCES: readonly SourceKey[] = ["fed_fomc", "bls_cpi"];

/**
 * Fed policy statements and CPI releases (NC-080). A scheduled run reads the current calendar and
 * the CPI archive inside their daily windows. The FOMC years before the calendar's — back to
 * 1994 — are read once: when the subject holds no statement from before 1995, or when asked
 * (`--macro history`), in which case the window is not waited on.
 */
export async function ingestMacro(client: PoolClient, opts: { history?: boolean } = {}): Promise<IngestOutcome> {
  console.log(`\n${MACRO_SUBJECT.displayName} (${MACRO_SUBJECT.slug})`);
  const subjectId = await upsertSubject(client, {
    kind: "topic",
    slug: MACRO_SUBJECT.slug,
    displayName: MACRO_SUBJECT.displayName,
    summary: MACRO_SUBJECT.summary,
  });
  const ctx = { kind: "topic" as const, displayName: MACRO_SUBJECT.displayName };
  const scoring: ScoringContext = { subject: ctx, aliases: aliasesFor(ctx, []) };

  const { rows } = await client.query<{ n: string }>(
    `SELECT count(*) AS n
       FROM events e
       JOIN event_subjects es ON es.event_id = e.id AND es.subject_id = $1
       JOIN event_attestations a ON a.event_id = e.id
       JOIN sources s ON s.id = a.source_id AND s.key = 'fed_fomc'
      WHERE e.occurred_on < '1995-01-01'`,
    [subjectId]
  );
  const history = Boolean(opts.history) || Number(rows[0]?.n ?? 0) === 0;

  const due = await dueSources(client, subjectId, MACRO_SOURCES);
  const run = runnerFor(client, subjectId, due, scoring);
  if (opts.history) {
    await runSource(client, "fed_fomc", subjectId, "FOMC calendar + history", () => fetchFomcStatements({ history: true }), undefined, scoring);
  } else {
    await run("fed_fomc", history ? "FOMC calendar + history" : "FOMC calendar", () => fetchFomcStatements({ history }));
  }
  await run("bls_cpi", "CPI release archive", fetchCpiReleases);
  await touchSubject(client, subjectId);
  return { ingested: true };
}

async function main() {
  const topic = arg("topic");
  const ticker = arg("ticker");
  const industry = arg("industry");
  const onchain = arg("onchain");
  // `--macro` alone reads what is due; `--macro history` re-reads every FOMC year since 1994
  const macroAt = process.argv.indexOf("--macro");
  const macro = macroAt >= 0 ? { history: process.argv[macroAt + 1] === "history" } : null;
  if (!topic && !ticker && !industry && !onchain && !macro) {
    console.error(
      "usage: npm run ingest -- --topic <name> | --ticker <SYMBOL> | --industry <sic-slug>\n" +
        `                       | --onchain <${CRYPTO_SUBJECTS.map((c) => c.slug).join("|")}|all>\n` +
        "                       | --macro [history]"
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
    if (macro) await ingestMacro(client, macro);
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
