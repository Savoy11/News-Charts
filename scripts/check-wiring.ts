import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Is everything actually connected to something?
 *
 *   npm run check:wiring
 *
 * Every defect this was written for had one shape: an exported adapter carrying a registered
 * `SourceKey`, with a passing feed check, that no entry point ever called. Ten adapters in
 * `lib/newsExtra.ts` and `lib/archive.ts` were referenced only by diagnostics after the scheduler
 * cut-over; `selectStaleSources` was reached only by its own test, so an hourly run re-asked
 * Wikipedia inside a 24-hour window; `ingestOnchain` was never imported by `scripts/refresh.ts`,
 * so no halving or governance vote ever refreshed on the schedule; `governance` and `exploit`
 * events were ingested and then discarded unrendered because the topic explorer had no chip for
 * them.
 *
 * None of those is visible to `tsc` — an unused export is legal, and a `Set<EventType>` cannot be
 * exhaustiveness-checked — and none is visible to the nineteen behaviour suites either, because
 * every one of those pieces *worked*. What was missing was the wire, and a wire is exactly what
 * a check can see.
 *
 * Offline: it reads the registry, the ingest path's own source lists and a little source text.
 * No database, no network, no keys.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INGESTABLE_SOURCES, SOURCES } from "../lib/ingest/store";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { QUOTAS } from "../lib/ingest/quota";
import { COMPANY_SOURCES, TOPIC_SOURCES } from "./ingest";
import { CRYPTO_SUBJECTS } from "../lib/onchain";
import type { SourceKey } from "../lib/types";
import { countMismatches, sameDatabase } from "../lib/backupCounts";
import { companyLede } from "../lib/wiki";
import { OVERLAP_SQL, STRIP_MIN_SHARED, summariseOverlap } from "../lib/overlap";
import { FR_COMPANY_CAP, FR_COMPANY_SINCE, fetchCompanyMentions, fetchCompanyRegulations, frSearchTerm, tallyCompanyMentions, titleNamesCompany } from "../lib/frCompany";
import { withoutSharedSectorRows } from "../lib/eventMerge";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  }
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const root = join(__dirname, "..");
const read = (rel: string): string => readFileSync(join(root, rel), "utf8");
/** One exported function's source from scripts/ingest.ts, up to the next top-level declaration. */
const ingestSrcFor = (name: string): string =>
  read("scripts/ingest.ts").match(new RegExp(`export async function ${name}\\([\\s\\S]*?\\n}\\n`))?.[0] ?? "";

/**
 * Sources reached by an ingester other than the two subject paths, with the reason. Listing them
 * here rather than exempting them silently keeps the check honest: a source is either wired, or
 * it is written down as deliberately not.
 */
const OTHER_INGEST_PATHS: Partial<Record<SourceKey, string>> = {
  onchain: "ingestOnchain — chain milestones and stablecoin supply moves",
  snapshot: "ingestOnchain via lib/onchain — governance votes",
  defillama: "ingestOnchain via lib/onchain — attributed incidents",
  fed_fomc: "ingestMacro via lib/macro — FOMC policy statements on the economy subject",
  bls_cpi: "ingestMacro via lib/macro — CPI releases on the economy subject",
};

/**
 * Sources with no ingest call site *by decision*, with the decision.
 *
 * These are the eight keyed aggregators whose terms bar commercial use. Ingesting is
 * republishing, so `assertCommercialOk` refuses them outright — they are not "not wired yet",
 * they are wired somewhere else: `lib/feeds/browser.ts` fetches NYT and the Guardian under the
 * visitor's own key, in the visitor's browser, and never persists a row.
 */
const NOT_INGESTED_BY_LICENCE: Partial<Record<SourceKey, string>> = {
  nyt: "non-commercial terms; visitor-key path in lib/feeds/browser.ts",
  guardian: "non-commercial terms; visitor-key path in lib/feeds/browser.ts",
  newsdata: "non-commercial free tier; no visitor-key path yet",
  gnews: "non-commercial free tier; no visitor-key path yet",
  currents: "non-commercial free tier; no visitor-key path yet",
  marketaux: "non-commercial free tier; no visitor-key path yet",
  eodhd: "personal/evaluation free tier; no visitor-key path yet",
  finnhub: "non-commercial free tier; no visitor-key path yet",
};

console.log("\nEvery registered source has a home");
const ingested = new Set<SourceKey>([...TOPIC_SOURCES, ...COMPANY_SOURCES]);
for (const s of SOURCES) {
  const home =
    (ingested.has(s.key) && "ingestTopic/ingestCompany") ||
    OTHER_INGEST_PATHS[s.key] ||
    NOT_INGESTED_BY_LICENCE[s.key];
  check(`${s.key} is reachable or accounted for`, Boolean(home), home ?? "no call site, no recorded decision");
}

console.log("\nThe licence gate, as reachability rather than as a runtime throw");
// assertCommercialOk refuses a non-commercial source at ingest time. That refusal should never be
// the thing that discovers a wiring mistake: a source barred from the corpus must not be on the
// ingest path at all, and one that is allowed must not be sitting in the licence-exempt list.
for (const key of ingested) {
  check(
    `${key} is licensed for the corpus`,
    INGESTABLE_SOURCES.has(key),
    INGESTABLE_SOURCES.has(key) ? "" : "ingested but flagged commercialOk: false"
  );
}
// NC-148: the paths outside ingestTopic/ingestCompany write rows too. Snapshot and DefiLlama
// rows arrive through ingestOnchain, which used to check only `onchain` — so either could have
// been flagged commercialOk: false after a terms reading and still been written, unnoticed here.
for (const key of Object.keys(OTHER_INGEST_PATHS) as SourceKey[]) {
  check(
    `${key} is licensed for the corpus (${OTHER_INGEST_PATHS[key]?.split(" ")[0]})`,
    INGESTABLE_SOURCES.has(key),
    INGESTABLE_SOURCES.has(key) ? "" : "ingested but flagged commercialOk: false"
  );
}
const onchainFeeds = [...read("lib/onchain/index.ts").matchAll(/feeds\.push\(\[\s*"([a-z_]+)"/g)].map((m) => m[1] as SourceKey);
check("the on-chain feeds were found", onchainFeeds.length >= 3, onchainFeeds.join(", "));
for (const key of new Set(onchainFeeds)) {
  check(`on-chain feed ${key} is a recorded ingest path`, OTHER_INGEST_PATHS[key] !== undefined);
}
const onchainIngest = ingestSrcFor("ingestOnchain");
check(
  "ingestOnchain gates each feed under its own source key",
  /assertCommercialOk\(client, sourceKey\)/.test(onchainIngest) && !/assertCommercialOk\(client, "onchain"\)/.test(onchainIngest)
);

for (const key of Object.keys(NOT_INGESTED_BY_LICENCE) as SourceKey[]) {
  check(
    `${key} is held off the ingest path`,
    !ingested.has(key) && !INGESTABLE_SOURCES.has(key),
    ingested.has(key) ? "on the ingest path despite its licence" : ""
  );
}

console.log("\nEvery source is windowed and budgeted");
for (const s of SOURCES) {
  check(`${s.key} has a refresh window`, SOURCE_TTL_MINUTES[s.key] !== undefined);
  check(`${s.key} has a quota entry`, QUOTAS[s.key] !== undefined);
}

console.log("\nThe windows are consulted by the thing that fetches");
// The window logic existed and was tested while nothing on the fetch path called it. Assert the
// call, not the arithmetic — check:refresh already owns the arithmetic.
const ingestSrc = read("scripts/ingest.ts");
check(
  "ingest imports selectStaleSources",
  /import \{[^}]*selectStaleSources[^}]*\} from "\.\.\/lib\/ingest\/refresh"/.test(
    ingestSrc.replace(/\n/g, " ")
  )
);
check("and consults it before fetching", /selectStaleSources\(/.test(ingestSrc));
check("and reports what it skipped", /inside its \$\{ttlFor\(/.test(ingestSrc));

console.log("\nThe scheduler covers every subject kind an ingester exists for");
const refreshSrc = read("scripts/refresh.ts");
check("refresh ingests companies", /ingestCompany\(/.test(refreshSrc));
check("refresh ingests topics", /ingestTopic\(/.test(refreshSrc));
check("refresh ingests on-chain subjects", /ingestOnchain\(/.test(refreshSrc));
// Industries were ingested by the CLI alone, so sector rules never refreshed on the schedule.
check("refresh ingests industries",
  /ingestIndustry\(/.test(refreshSrc) && /kind IN \('company','topic','industry'\)/.test(refreshSrc));
check("…inside the Federal Register's window, as every other path is",
  /dueSources\(client, subjectId, \["federal_register"\]\)/.test(ingestSrcFor("ingestIndustry")));
// refresh.ts works oldest-first by refreshed_at; an unstamped sector would head the queue for ever.
check("…and stamps the sector as worked on both branches",
  (ingestSrcFor("ingestIndustry").match(/touchSubject\(client, subjectId\)/g) ?? []).length >= 2);
// Crypto assets are topics by design, so nothing about the row they are stored in says "send
// this one down the chain path" — the routing has to be explicit or they silently take the
// Wikipedia path, which fetches none of their history and resolves "dai" against an encyclopedia.
check(
  "and routes crypto slugs away from the Wikipedia path",
  /CRYPTO_SUBJECTS/.test(refreshSrc),
  `${CRYPTO_SUBJECTS.length} crypto subjects registered`
);
// The licence gate reads a table nothing on this path used to write.
check("refresh establishes the source registry before ingesting", /ensureSources\(/.test(refreshSrc));
// NC-144: every ingester returned normally for "no article", "not minting" and "ticker not found",
// and any normal return marked the request fulfilled — a request closed with no subject behind it.
check(
  "a request is fulfilled only when the ingester says it ingested",
  /if \(outcome\.ingested\) \{\s*await markFulfilled\(/.test(refreshSrc) &&
    /markFailed\(p\.id, outcome\.reason\)/.test(refreshSrc)
);
for (const name of ["ingestTopic", "ingestCompany", "ingestOnchain"]) {
  const src = ingestSrcFor(name);
  check(
    `${name} reports whether it ingested`,
    /Promise<IngestOutcome>/.test(src) && !/\n\s*return;\n/.test(src),
    /\n\s*return;\n/.test(src) ? "a bare return reads as neither" : ""
  );
}
// NC-099: the scheduler keyed a new topic on the typed slug while the first pass keys it on the
// Wikipedia article, so a second phrasing minted a second subject with identical events.
const topicIngest = ingestSrcFor("ingestTopic");
check(
  "the scheduler keys a topic on its Wikipedia article, as the first pass does",
  /upsertTopicSubject\(client, \{[\s\S]*?wikipediaTitle: wiki\.title/.test(topicIngest) && !/upsertSubject\(/.test(topicIngest)
);
// What a re-ingest may correct. Verified against Postgres on 2026-10-17; asserted here as text
// because this suite never reaches a database.
const storeSrc = read("lib/ingest/store.ts");
check(
  "the owning source can correct an event's date, precision and kind (NC-141)",
  /occurred_on = CASE WHEN \$9 THEN EXCLUDED\.occurred_on/.test(storeSrc) &&
    /kind = CASE WHEN \$9 THEN EXCLUDED\.kind/.test(storeSrc) &&
    /OR \(\$9 AND \(events\.occurred_on, events\.date_precision, events\.kind\)/.test(storeSrc)
);
check(
  "a deterministic score is re-scored on re-ingest, a model's never (NC-131)",
  /WHERE \$5 AND event_subjects\.scored_by = 'deterministic'/.test(storeSrc)
);
// NC-147: the on-chain path consulted neither windows nor back-off, so every crypto feed was
// re-fetched on every hourly run. NC-143: back-off was per subject, so a source that throttled
// the whole IP was asked again for every subject after it.
check(
  "on-chain ingest consults windows and back-off for each feed (NC-147)",
  /dueSources\(client, subjectId, ONCHAIN_SOURCES\)/.test(onchainIngest) &&
    /shouldBackOff\(client, key, subjectId, BACKOFF_MINUTES\)/.test(onchainIngest) &&
    /fetchOnchainFor\(asset\.slug, due\)/.test(onchainIngest)
);
check(
  "a throttle backs off the whole source, not one subject (NC-143)",
  /if \(rows\[0\]\?\.latest === "throttled"\) return "throttled";/.test(storeSrc)
);
// NC-151: pruning ran after a dump pg_restore could not even list.
const backupSrc = read("scripts/backup.ts");
check(
  "backup stops before pruning when the new dump could not be verified",
  /if \(entries < 0\) throw/.test(backupSrc) &&
    backupSrc.indexOf("if (entries < 0) throw") < backupSrc.indexOf("unlinkSync(join(outDir")
);
// NC-159: `revalidate = 900` did nothing — the subject routes were dynamic, so every view re-ran
// every query. Company and topic pages cannot take full-page caching (a miss must never be
// cached, and noStore() in a cached route is a 500 under Next 14), so their held reads are cached.
{
  const pageData = read("lib/page-data.ts");
  check(
    "held company and topic reads are cached for 15 minutes",
    /const PAGE_CACHE_SECONDS = 900;/.test(pageData) &&
      // a company page's prices are their own entry (audit 2026-10-21 #4), the rest one entry
      /unstable_cache\(\s*async \(key: string\) => \{\s*const page = await heldCompanyPage\(key\);/.test(pageData) &&
      /unstable_cache\(\(key: string\) => heldTopicPage\(key\)/.test(pageData)
  );
  check(
    "a cached 'not held' is re-checked live, so a new subject is never hidden",
    /return cached \? \{ \.\.\.revive\(cached\), prices: await cachedHeldPrices\(k\) \} : heldCompanyPage\(k\);/.test(pageData) &&
      /return cached \? revive\(cached\) : heldTopicPage\(k\);/.test(pageData)
  );
  check(
    "the read after a first-visit gather bypasses the cache",
    /const fresh = await heldCompanyPage\(ticker\);/.test(pageData) && /const fresh = await heldTopicPage\(topic\);/.test(pageData)
  );
  check("the cached Date is revived", /refreshedAt: page\.refreshedAt \? new Date\(page\.refreshedAt\) : null/.test(pageData));
  for (const route of ["app/company/[ticker]/page.tsx", "app/topic/[slug]/page.tsx"]) {
    const src = read(route);
    check(
      `${route.split("/")[1]} pages stay dynamic, so noStore() on a miss cannot become a 500`,
      !/export const revalidate/.test(src) && !/generateStaticParams/.test(src) && /noStore\(\);/.test(src)
    );
  }
  const industry = read("app/industry/[slug]/page.tsx");
  check(
    "sector pages are cached whole, and never call noStore()",
    /export const revalidate = 900;/.test(industry) && /export async function generateStaticParams\(\)/.test(industry) && !/noStore/.test(industry)
  );
}
// NC-152: the rehearsal replayed the dump inside BEGIN…ROLLBACK against DATABASE_URL — exclusive
// locks on every live table for the whole reload — and never compared what came back.
{
  const restoreSrc = read("scripts/verify-restore.ts");
  check("a restore rehearsal refuses the live database", /if \(live && sameDatabase\(live, target\)\)/.test(restoreSrc));
  check("  …and no longer wraps the dump in a rolled-back transaction", !/ROLLBACK/.test(restoreSrc) && !/BEGIN;/.test(restoreSrc));
  check("  …restores for real, without the original roles", /"--no-owner"/.test(restoreSrc) && /"--single-transaction"/.test(restoreSrc));
  check("  …and compares the restored counts with the backup's", /countMismatches\(captured, restored\)/.test(restoreSrc));
  check("the backup records its counts beside the dump", /writeFileSync\(countsFileFor\(outFile\)/.test(backupSrc));
  check("  …and leaves no empty dump behind when pg_dump fails", /discard\(\);\s+throw new Error\(`pg_dump failed/.test(backupSrc));
  const live = "postgresql://chronolens:pw@localhost:5432/chronolens";
  check("the live database is recognised under another spelling", sameDatabase(live, "postgresql://other:pw@127.0.0.1/chronolens"));
  check("  …and a scratch database is not mistaken for it", !sameDatabase(live, "postgresql://chronolens:pw@localhost:5432/news_charts_restore"));
  const backed = { subjects: 6, events: 101, attestations: 101, links: 100, scored: 0, prices: 2115 };
  check("a short restore is caught table by table", JSON.stringify(countMismatches(backed, { ...backed, events: 96 })) === '["events: backed up 101, restored 96"]');
  check("  …and a full one passes", countMismatches(backed, { ...backed }).length === 0);
}
check(
  "failed requests queue behind untried ones",
  /ORDER BY \(r\.last_error IS NOT NULL\), r\.requests DESC/.test(read("lib/ingest/queue.ts"))
);

console.log("\nEvery event kind a page can hold has a control that shows it");
/**
 * Read as text rather than imported: these are `"use client"` components, and importing one into
 * a node script drags in React and `next/navigation` for a list of five strings. What matters
 * here is the list, and the list is legible in the source.
 */
const eventTypes = (read("lib/types.ts").match(/export type EventType =([\s\S]*?);/)?.[1] ?? "")
  .split("|")
  .map((t) => t.match(/"([a-z_]+)"/)?.[1])
  .filter((t): t is string => Boolean(t));
check("EventType parsed from lib/types.ts", eventTypes.length > 5, `${eventTypes.length} kinds`);

const explorerFilters = (src: string): string[] =>
  [...(src.match(/const FILTERS[\s\S]*?\n\];/)?.[0] ?? "").matchAll(/key: "([a-z_]+)"/g)].map((m) => m[1]);
const topicFilters = explorerFilters(read("components/TopicExplorer.tsx"));
const companyFilters = explorerFilters(read("components/CompanyExplorer.tsx"));
check("TopicExplorer exposes filters", topicFilters.length > 0, topicFilters.join(", "));
check("CompanyExplorer exposes filters", companyFilters.length > 0, companyFilters.join(", "));

/**
 * A kind absent from *both* explorers is a kind that can be ingested and never seen. Annotations
 * are the one deliberate exception: they are the reader's own notes, held in their browser, and
 * they are rendered through their own panel rather than a filter chip.
 */
const RENDERED_ELSEWHERE: Record<string, string> = {
  annotation: "reader's own notes — rendered by components/Annotations.tsx, never ingested",
};
for (const kind of eventTypes) {
  const shown = topicFilters.includes(kind) || companyFilters.includes(kind) || RENDERED_ELSEWHERE[kind];
  check(`${kind} events can be shown`, Boolean(shown), shown ? "" : "no filter chip in either explorer");
}

// The two migrations that added these are the reason this check exists at all.
for (const kind of ["governance", "exploit"]) {
  check(`${kind} is on the topic explorer`, topicFilters.includes(kind), topicFilters.join(", "));
}

// 2026-10-17 proposal 5: ingestCompany fetched the company's Wikipedia lede with its story and
// kept only the events, so the site's most numerous page carried no prose at all.
console.log("\nA company's Wikipedia lede reaches its page");
const ford = { title: "History of Ford Motor Company", summary: "Ford Motor Company is an American automaker…" };
check("a lede from the company's own article is kept", companyLede("Ford Motor", ford)?.title === ford.title);
check("  …and one from an article about something else is not",
  companyLede("Best Buy", { title: "TaxAct", summary: "TaxAct is a tax preparation service…" }) === null);
check("  …nor an empty one", companyLede("Ford Motor", { title: "Ford Motor Company", summary: "  " }) === null);
const companyBody = ingestSrcFor("ingestCompany");
check("ingestCompany keeps the gated lede", /companyLede\(name, found\)/.test(companyBody) && /UPDATE subjects SET summary/.test(companyBody));
const pageData = read("lib/page-data.ts");
const heldCompanySrc = pageData.slice(pageData.indexOf("async function heldCompanyPage"));
check("the company page data carries it", /summary: subject\.summary/.test(heldCompanySrc) && /wikipediaTitle: subject\.wikipediaTitle/.test(heldCompanySrc));
const companyPage = read("app/company/[ticker]/page.tsx");
check("the company page renders it, credited", /<TopicSummary text=\{data\.summary\}/.test(companyPage));
check("  …and gives it to search engines", /description: clampDescription\(data\.summary/.test(companyPage));

// 2026-10-17 proposal 8: the index knew every fund's registrant and only resolution read it.
console.log("\nA fund page names its siblings");
check("the company page data carries them, held ones marked", /siblings,/.test(heldCompanySrc) && /heldTickers\(/.test(pageData));
check("the company page renders them", /<FundSiblings registrantCik=\{data\.siblings\.registrantCik\}/.test(companyPage));
const siblingsSrc = read("components/FundSiblings.tsx");
check("  …an unheld one is nofollow, a held one a plain link", /rel=\{f\.held \? undefined : "nofollow"\}/.test(siblingsSrc));

// 2026-10-17 proposal 7 waits on a production count; the count has to measure what the strip
// would show, or it decides nothing.
console.log("\nThe go/no-go count for topic ↔ security links");
{
  const sum = summariseOverlap(
    [
      { topic: "electric cars", ticker: "F", shared: 3 },
      { topic: "electric cars", ticker: "GM", shared: 1 },
      { topic: "btc", ticker: "COIN", shared: 2 },
    ],
    5
  );
  check(`a pair is listed at ${STRIP_MIN_SHARED} shared events, not 1`, sum.listed.length === 2 && !sum.listed.some((p) => p.ticker === "GM"));
  check("  …and topics and securities are counted once each", sum.topicsWithStrip === 2 && sum.securitiesWithStrip === 2 && sum.topicsHeld === 5);
  check("both links pass the timeline's display gate", /FROM gated t\s+JOIN gated c/.test(OVERLAP_SQL) && /es\.relevance >= /.test(OVERLAP_SQL));
  const pkg = JSON.parse(read("package.json"));
  check("the count is a report, outside the offline chain",
    Boolean(pkg.scripts["overlap-report"]) && !/overlap-report/.test(pkg.scripts.check));
}

// 2026-10-17 proposal 4: the owner chose numbers before Federal Register documents reach company
// pages (2026-10-18). The count has to use the rule a company feed would, or it measures nothing.
console.log("\nThe Federal Register count, before anything is ingested");
check("a title naming the company is its document",
  titleNamesCompany("Airworthiness Directives; The Boeing Company Airplanes", "BOEING CO") &&
    titleNamesCompany("Ford Motor Company, Denial of Petition for Decision of Inconsequential Noncompliance", "FORD MOTOR CO"));
check("  …under its everyday name, without EDGAR's marks or accents (batch 26)",
  titleNamesCompany("Toyota Motor Corporation, Grant of Petition for Decision of Inconsequential Noncompliance", "TOYOTA MOTOR CORP/") &&
    titleNamesCompany("Estée Lauder Companies Inc.; Order Granting Exemption", "ESTEE LAUDER COMPANIES INC"));
check("  …but not a namesake or a near word",
  !titleNamesCompany("Gerald R. Ford Presidential Library; Notice", "FORD MOTOR CO") &&
    !titleNamesCompany("Fresh Apples From Chile Into the Continental United States", "Apple Inc."));
const frHits = [
  { title: "Airworthiness Directives; The Boeing Company Airplanes", publication_date: "2026-05-01", agencies: [{ name: "Federal Aviation Administration" }] },
  { title: "Airworthiness Directives; The Boeing Company Airplanes", publication_date: "2025-03-01", agencies: [{ name: "Federal Aviation Administration" }] },
  { title: "The Boeing Company; Export Privileges Order", publication_date: "2024-07-09", agencies: [{ name: "Industry and Security Bureau" }] },
  { title: "Commercial Space Launch Requirements", publication_date: "2026-01-02", agencies: [{ name: "Federal Aviation Administration" }] },
];
const frTally = tallyCompanyMentions(frHits, "BOEING CO");
check("the tally counts title-naming documents, not every full-text hit", frTally.searched === 4 && frTally.named === 3);
check("  …airworthiness directives apart, agencies most first",
  frTally.airworthiness === 2 && frTally.byAgency[0][0] === "Federal Aviation Administration" && frTally.byAgency[0][1] === 2);
// The file is a top-level script (no async main), so this one async check finishes before the summary.
const frSearch = (async () => {
  const realFetch = globalThis.fetch;
  let asked = "";
  globalThis.fetch = (async (u: RequestInfo | URL) => {
    asked = String(u);
    return new Response(JSON.stringify({ count: 1, results: frHits.slice(0, 1) }), { status: 200 });
  }) as typeof fetch;
  try {
    const r = await fetchCompanyMentions("FORD MOTOR CO", "2015-01-01");
    check("the search asks for the everyday name as a phrase", /conditions%5Bterm%5D=%22FORD\+MOTOR%22/.test(asked) && "hits" in r, asked.slice(0, 160));
  } finally {
    globalThis.fetch = realFetch;
  }
})();
{
  const pkg = JSON.parse(read("package.json"));
  check("the count is a report, outside the offline chain",
    Boolean(pkg.scripts["fr-company-report"]) && !/fr-company-report/.test(pkg.scripts.check));
}

// 2026-10-18: the owner's count, read, set the rule — company pages get these documents, without
// airworthiness directives, once the match stops taking fruit and namesakes.
console.log("\nFederal Register documents on a company's page");
check("a one-word name needs a company word after it",
  titleNamesCompany("Certain Mobile Devices; Notice of Request for Comments; Apple Inc.", "Apple Inc.") &&
    !titleNamesCompany("Notice of Decision To Deregulate Light Brown Apple Moth for Fruit Imported From New Zealand", "Apple Inc.") &&
    !titleNamesCompany("Action Level for Inorganic Arsenic in Apple Juice: Guidance for Industry", "Apple Inc."));
check("a longer listed name owns the mention",
  !titleNamesCompany("Portland General Electric Company; Notice of Application", "GENERAL ELECTRIC CO") &&
    titleNamesCompany("Portland General Electric Company; Notice of Application", "PORTLAND GENERAL ELECTRIC CO /OR/") &&
    titleNamesCompany("Foreign-Trade Zone 46; Authorization of Production Activity; General Electric Company", "GENERAL ELECTRIC CO"));
check("  …and the two-word names the count got right still match",
  titleNamesCompany("Ford Motor Company, Receipt of Petition for Decision of Inconsequential Noncompliance", "FORD MOTOR CO") &&
    titleNamesCompany("General Motors and OnStar, LLC; Analysis of Proposed Consent Order To Aid Public Comment", "General Motors Co"));
// batch 27: a company's own other names (`newsNamesFor`), measured live on 15 companies: 50 → 87
check("a company's own other names count too: Google's FTC order says \"Google LLC\", never \"Alphabet\"",
  titleNamesCompany("iHeartMedia, Inc. and Google LLC; Analysis of Proposed Consent Order to Aid Public Comment", "Alphabet Inc.", ["google"]) &&
    !titleNamesCompany("iHeartMedia, Inc. and Google LLC; Analysis of Proposed Consent Order to Aid Public Comment", "Alphabet Inc.") &&
    titleNamesCompany("Petition for Exemption; Summary of Petition Received; American Airlines, Inc.", "American Airlines Group Inc.", ["american airlines"]));
check("  …but a one-word other name needs its company word straight after it, not a produce firm or a sister company",
  !titleNamesCompany("Coast Citrus Distributors d/b/a Olympic Fruit & Vegetable, Amazon Produce Network, LLC, Refin Tropical", "AMAZON COM INC", ["amazon"]) &&
    !titleNamesCompany("Foreign-Trade Zone (FTZ) 72; Authorization of Production Activity; Toyota Material Handling, Inc.", "TOYOTA MOTOR CORP/", ["toyota"]) &&
    titleNamesCompany("China United Lines, Ltd., Complainant v. Amazon.com Services LLC; Amazon Logistics Inc.", "AMAZON COM INC", ["amazon"]));
check("  …and every name goes in one search, OR'd with \"|\"",
  frSearchTerm("Alphabet Inc.", ["google"]) === '"Alphabet" | "google"' && frSearchTerm("FORD MOTOR CO") === '"FORD MOTOR"' &&
    frSearchTerm("FORD MOTOR CO", ["ford motor"]) === '"FORD MOTOR"', frSearchTerm("Alphabet Inc.", ["google"]));
const frDoc = (n: number, title: string) => ({
  document_number: `2026-${String(n).padStart(5, "0")}`, title, publication_date: "2026-05-01", type: "Notice",
  html_url: `https://www.federalregister.gov/d/${n}`, agencies: [{ name: "Transportation Department" }],
});
const frSearch2 = (async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ results: [
      frDoc(1, "Airworthiness Directives; The Boeing Company Airplanes"),
      frDoc(2, "The Boeing Company; Export Privileges Order"),
      frDoc(3, "Commercial Space Launch Requirements"),
      ...Array.from({ length: 60 }, (_, i) => frDoc(100 + i, `Petition for Exemption; The Boeing Company; Docket ${i}`)),
    ] }), { status: 200 })) as typeof fetch;
  try {
    const r = await fetchCompanyRegulations("BOEING CO");
    check("airworthiness directives never reach the company feed", !r.events.some((e) => /^Airworthiness/.test(e.title)));
    check("  …nor a document whose title does not name the company", !r.events.some((e) => /Space Launch/.test(e.title)));
    check(`  …and a run keeps at most ${FR_COMPANY_CAP}`, r.events.length === FR_COMPANY_CAP, String(r.events.length));
    check("  …each one the sector feed's identity, so a shared document is one event",
      r.events[0]?.dedupBasis === "fr:2026-00002" && r.events.every((e) => e.type === "regulation" && e.sourceKey === "federal_register"));
    let asked = "";
    globalThis.fetch = (async (u: RequestInfo | URL) => {
      asked = decodeURIComponent(String(u).replace(/\+/g, " "));
      return new Response(JSON.stringify({ results: [
        frDoc(200, "Google LLC and iHeartMedia, Inc.; Analysis of Proposed Consent Order To Aid Public Comment"),
        frDoc(201, "Google Maps Data Standards; Request for Information"),
      ] }), { status: 200 });
    }) as typeof fetch;
    const g = await fetchCompanyRegulations("Alphabet Inc.", FR_COMPANY_SINCE, ["google"]);
    check("  …and Alphabet's search carries \"google\", keeping Google LLC's order and not Google Maps",
      asked.includes('conditions[term]="Alphabet" | "google"') && g.events.length === 1 && /Google LLC/.test(g.events[0].title),
      `${g.events.length} — ${asked.slice(55, 140)}`);
  } finally {
    globalThis.fetch = realFetch;
  }
})();
check("the company sources include it, and ingestCompany asks for the company's own documents",
  (COMPANY_SOURCES as readonly string[]).includes("federal_register") &&
    /run\("federal_register", frSearchTerm\(company\.name, alsoKnownAs\), \(\) =>\s*fetchCompanyRegulations\(company\.name, FR_COMPANY_SINCE, alsoKnownAs\)/.test(ingestSrcFor("ingestCompany")));
check("  …under the company's other names, and the count report searches the same names",
  /fetchCompanyMentions\(c\.name, since, alsoKnownAs\)/.test(read("scripts/fr-company-report.ts")) &&
    /tallyCompanyMentions\(r\.hits, c\.name, alsoKnownAs\)/.test(read("scripts/fr-company-report.ts")) &&
    /const alsoKnownAs = c\.cik \? newsNamesFor\(c\.cik\) : \[\];/.test(read("scripts/fr-company-report.ts")));
const ownRows = [{ id: "db-7", date: "2026-01-01", type: "regulation" as const, title: "t", source: "s" }];
const sectorRows = [
  { id: "sector-7", date: "2026-01-01", type: "regulation" as const, title: "t", source: "s" },
  { id: "sector-8", date: "2026-01-02", type: "regulation" as const, title: "u", source: "s" },
];
check("a document on both the company and its sector is listed once",
  withoutSharedSectorRows(ownRows, sectorRows).map((e) => e.id).join() === "sector-8");
check("  …and the company page uses that", /withoutSharedSectorRows\(events, sector\)/.test(read("lib/page-data.ts")));

Promise.all([frSearch, frSearch2]).then(() => {
  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) {
    console.log("Failed:");
    for (const f of failures) console.log(`  - ${f}`);
    console.log("");
    process.exit(1);
  }
});
