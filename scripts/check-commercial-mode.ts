import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Proves the COMMERCIAL_MODE licence gate actually holds.
 *
 *   npm run check:commercial-mode
 *
 * Eight of the news repositories are on non-commercial free tiers, and the site calls them on
 * the page-render path — not through the ingest worker, so `assertCommercialOk` never sees
 * them. `COMMERCIAL_MODE=true` is what stops them, and "we set a flag" is not evidence: this
 * gives every adapter a valid-looking key, turns the flag on, and asserts that **no request is
 * attempted at all**. Then it turns the flag off and asserts they do fetch, so a gate that is
 * simply broken-on can't pass by accident.
 *
 * Offline by construction — fetch is replaced, so this needs no keys and no network and is
 * safe to run anywhere, including CI.
 */

import * as feeds from "../lib/newsExtra";
import type { TimelineEvent } from "../lib/types";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SOURCES } from "../lib/ingest/store";
import { NON_COMMERCIAL_SOURCE_IDS, withheldByLicence } from "../lib/licenceGate";
import { VISITOR_KEYS_ATTR, VISITOR_KEYS_PAUSED, VISITOR_KEYS_TERMS_READ, visitorKeysPaused } from "../lib/visitorKeysGate";

type Adapter = (query: string) => Promise<TimelineEvent[]>;

const ADAPTERS: { label: string; env: string; fn: Adapter }[] = [
  { label: "NYT", env: "NYT_API_KEY", fn: feeds.getNytNews },
  { label: "Guardian", env: "GUARDIAN_API_KEY", fn: feeds.getGuardianNews },
  { label: "Newsdata", env: "NEWSDATA_API_KEY", fn: feeds.getNewsdataNews },
  { label: "GNews", env: "GNEWS_API_KEY", fn: feeds.getGnewsNews },
  { label: "Currents", env: "CURRENTS_API_KEY", fn: feeds.getCurrentsNews },
  { label: "Marketaux", env: "MARKETAUX_API_KEY", fn: feeds.getMarketauxNews },
  { label: "EODHD", env: "EODHD_API_KEY", fn: feeds.getEodhdNews },
  { label: "Finnhub", env: "FINNHUB_API_KEY", fn: feeds.getFinnhubNews },
];

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

const attempted: string[] = [];
const realFetch = globalThis.fetch;

function mockFetch(): void {
  globalThis.fetch = (async (input: unknown) => {
    attempted.push(String(input));
    // shapes vary per adapter; every one is failure-isolated, so an unusable body is fine —
    // this test only cares whether the request happened at all.
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({}),
      text: async () => "",
    } as unknown as Response;
  }) as typeof fetch;
}

async function scenario(commercial: boolean): Promise<void> {
  process.env.COMMERCIAL_MODE = commercial ? "true" : "false";
  // Give every keyed source a key, so the flag is the only thing that can withhold one.
  for (const a of ADAPTERS) process.env[a.env] = "test-key-not-real";

  console.log(`\nCOMMERCIAL_MODE=${commercial}`);
  for (const a of ADAPTERS) {
    attempted.length = 0;
    const out = await a.fn("Ford Motor Company");
    if (commercial) {
      check(
        `${a.label.padEnd(10)} withheld, no request attempted`,
        attempted.length === 0 && out.length === 0,
        attempted.length ? `attempted ${attempted.length}: ${attempted[0].slice(0, 70)}` : ""
      );
    } else {
      check(
        `${a.label.padEnd(10)} runs normally`,
        attempted.length > 0,
        attempted.length ? "" : "no request attempted despite a key being set"
      );
    }
  }
}

/**
 * NC-026: an undated `commercialOk` flag is indistinguishable from one nobody has read in a year.
 * Structure only — a date going stale must not turn the build red on its own; the list below is
 * what the release gate's re-check reads.
 */
function reviewDates(): void {
  console.log("\nEvery licence judgement carries the date it was made");
  const today = new Date().toISOString().slice(0, 10);
  const undated = SOURCES.filter((s) => !/^\d{4}-\d{2}-\d{2}$/.test(s.reviewedOn ?? "") || Number.isNaN(Date.parse(s.reviewedOn)));
  check("every SOURCES entry has a reviewedOn date", undated.length === 0, undated.map((s) => s.key).join(", "));
  const future = SOURCES.filter((s) => s.reviewedOn > today);
  check("  …none of them in the future", future.length === 0, future.map((s) => s.key).join(", "));
  const old = SOURCES.filter((s) => s.commercialOk && Date.parse(today) - Date.parse(s.reviewedOn) > 180 * 86_400_000);
  if (old.length) console.log(`  note  commercial sources last reviewed over 180 days ago: ${old.map((s) => `${s.key} (${s.reviewedOn})`).join(", ")}`);
}

/** Batch 186: the terms reading of 2026-11-25 and the owner's calls of that day. */
function termsReading(): void {
  const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
  console.log("\nThe terms reading of 2026-11-25");
  const nonCommercial = SOURCES.filter((s) => !s.commercialOk).map((s) => s.id).sort((a, b) => a - b);
  check("the read path's non-commercial ids are the registry's commercialOk: false rows, DefiLlama's among them",
    JSON.stringify([...NON_COMMERCIAL_SOURCE_IDS].sort((a, b) => a - b)) === JSON.stringify(nonCommercial) && nonCommercial.includes(18), nonCommercial.join(","));
  const on = { COMMERCIAL_MODE: "true" };
  check("on a public build a stored row every attestation of which is a non-commercial source's is withheld; one another source attests too, or a cleared source's, is shown",
    withheldByLicence([18], on) && withheldByLicence(["18", 7], on) && !withheldByLicence([18, 3], on) && !withheldByLicence([4], on) && !withheldByLicence([], on) && !withheldByLicence(null, on));
  check("  …and off a public build nothing is withheld", !withheldByLicence([18], {}) && !withheldByLicence([18], { COMMERCIAL_MODE: "false" }));
  check("  …the page's hot read applies it", /if \(withheldByLicence\(r\.attestation_sources\)\) return \[\];/.test(read("lib/store/read.ts")));
  check("the visitor's own NYT and Guardian keys are paused on a public build until their terms are read (NC-136), and stay on the owner's own",
    VISITOR_KEYS_TERMS_READ === false && visitorKeysPaused(on) && !visitorKeysPaused({}) && !visitorKeysPaused({ COMMERCIAL_MODE: "false" }));
  const layout = read("app/layout.tsx");
  check("  …the layout marks the page, a paused page reads no stored key, and the settings panel shows no form",
    /visitorKeysPaused\(\) \? \{ \[VISITOR_KEYS_ATTR\]: VISITOR_KEYS_PAUSED \}/.test(layout) && VISITOR_KEYS_ATTR === "data-visitor-keys" && VISITOR_KEYS_PAUSED === "paused" &&
      /typeof window === "undefined" \|\| visitorKeysPausedHere\(\)\) return \{\};/.test(read("lib/feedKeys.ts")) && /\{!visitorKeysPausedHere\(\) && \(/.test(read("components/SettingsMenu.tsx")));
  const blockers = SOURCES.filter((s) => s.launchBlocker);
  const gate = /## ⛔ Pre-release gate[\s\S]*?\n## /.exec(read("docs/MASTER-CHECKLIST.md"))?.[0] ?? "";
  check("a source kept only while the site is private is named in the pre-release gate, unticked: Yahoo's headline feed and its chart",
    blockers.map((s) => s.key).sort().join(",") === "yahoo_finance,yahoo_prices" && blockers.every((s) => new RegExp(`- \\[ \\] \\*\\*${s.name}\\*\\*`).test(gate)),
    blockers.map((s) => s.name).join(", "));
  check("GDELT's terms ask for a citation and a link: the footer gives both", /href="https:\/\/www\.gdeltproject\.org\/"[\s\S]{0,200}the GDELT Project/.test(layout));
  const dated = SOURCES.filter((s) => ["wikipedia", "loc_chronam", "gdelt", "yahoo_finance", "yahoo_prices", "onchain", "defillama"].includes(s.key));
  check("each source whose terms were read that day says so", dated.length === 7 && dated.every((s) => s.reviewedOn === "2026-11-25"), dated.map((s) => `${s.key} ${s.reviewedOn}`).join(", "));
}

async function main(): Promise<void> {
  reviewDates();
  termsReading();
  mockFetch();
  try {
    await scenario(true);
    await scenario(false);
  } finally {
    globalThis.fetch = realFetch;
  }
  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
