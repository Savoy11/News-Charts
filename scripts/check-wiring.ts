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

/**
 * Sources reached by an ingester other than the two subject paths, with the reason. Listing them
 * here rather than exempting them silently keeps the check honest: a source is either wired, or
 * it is written down as deliberately not.
 */
const OTHER_INGEST_PATHS: Partial<Record<SourceKey, string>> = {
  federal_register: "ingestIndustry — sector rules attach to the industry subject",
  onchain: "ingestOnchain — chain milestones and stablecoin supply moves",
  snapshot: "ingestOnchain via lib/onchain — governance votes",
  defillama: "ingestOnchain via lib/onchain — attributed incidents",
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

console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) {
  console.log("Failed:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("");
  process.exit(1);
}
