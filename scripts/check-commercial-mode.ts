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

async function main(): Promise<void> {
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
