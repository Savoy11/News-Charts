import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Per-source refresh windows.
 *
 *   npm run check:refresh
 *
 * The decision this covers — whether a request is made at all — is the one that spends quota,
 * and it is otherwise only observable by watching a provider's dashboard drain. Pure function,
 * so it is checkable without a database or a network.
 *
 * It also asserts the quota arithmetic behind the windows, so the table can be argued with
 * rather than trusted: if someone shortens GNews to an hour, the budget check fails loudly
 * instead of quietly burning 24 requests a day per subject against a cap of 100.
 */
import {
  SOURCE_TTL_MINUTES,
  dailyRequestsPerSubject,
  selectStaleSources,
  ttlFor,
} from "../lib/ingest/refresh";
import type { SourceKey } from "../lib/types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const NOW = new Date("2026-07-28T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

console.log("\nStaleness selection");
{
  const keys: SourceKey[] = ["gdelt", "wikipedia", "gnews", "loc_chronam"];

  // never fetched → always due. Treating "never asked" as fresh would make a subject's first
  // page view silently skip half its feeds.
  check(
    "a source never fetched is stale",
    selectStaleSources(keys, new Map()).length === keys.length
  );

  const recent = new Map<SourceKey, Date>([
    ["gdelt", minutesAgo(10)], // window 60 → fresh
    ["wikipedia", minutesAgo(200)], // window 1440 → fresh
    ["gnews", minutesAgo(400)], // window 360 → stale
    ["loc_chronam", minutesAgo(20_000)], // window 10080 → stale
  ]);
  const stale = selectStaleSources(keys, recent, NOW);
  check("respects each source's own window", stale.join(",") === "gnews,loc_chronam", stale.join(",") || "(none)");

  check(
    "exactly at the window is due",
    selectStaleSources(["gdelt"], new Map([["gdelt", minutesAgo(60)]]), NOW).length === 1
  );
  check(
    "one minute short of the window is not",
    selectStaleSources(["gdelt"], new Map([["gdelt", minutesAgo(59)]]), NOW).length === 0
  );

  // a clock skew must not pin a source as fresh indefinitely
  const future = new Map<SourceKey, Date>([["gdelt", new Date(NOW.getTime() + 86_400_000)]]);
  check("a future timestamp is treated as stale", selectStaleSources(["gdelt"], future, NOW).length === 1);
}

console.log("\nQuota budgets (requests/day for one continuously-viewed subject)");
{
  // Provider caps as recorded in SOURCES notes and the pre-release feed gate.
  const CAPS: Partial<Record<SourceKey, number>> = {
    gnews: 100,
    newsdata: 200,
    eodhd: 20,
  };
  for (const [key, cap] of Object.entries(CAPS) as [SourceKey, number][]) {
    const perSubject = dailyRequestsPerSubject(key);
    // headroom for at least 5 subjects is the bar: fewer than that and a single afternoon of
    // testing several companies drains the day's budget.
    const subjectsAffordable = Math.floor(cap / perSubject);
    check(
      `${key}: ${perSubject}/day per subject fits ${subjectsAffordable} subjects in a ${cap}/day cap`,
      subjectsAffordable >= 5,
      `window ${ttlFor(key)}min`
    );
  }

  // The old behaviour, for contrast: one shared 60-minute subject TTL meant every source was
  // asked 24 times a day per subject, which is a quarter of the GNews cap for a single company.
  check(
    "the keyed feeds are all slower than the old shared 60-minute window",
    (["gnews", "newsdata", "currents", "marketaux", "eodhd", "finnhub", "nyt", "guardian"] as SourceKey[]).every(
      (k) => ttlFor(k) > 60
    )
  );
}

console.log("\nTable sanity");
{
  check(
    "reference sources are slower than news sources",
    ttlFor("wikipedia") > ttlFor("gdelt") && ttlFor("loc_chronam") > ttlFor("wikipedia")
  );
  check("every source has an explicit window", Object.keys(SOURCE_TTL_MINUTES).length >= 14,
    `${Object.keys(SOURCE_TTL_MINUTES).length} sources`);
  check(
    "no window is zero or negative",
    Object.values(SOURCE_TTL_MINUTES).every((m) => m > 0)
  );
}

console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) process.exit(1);
