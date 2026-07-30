import { config } from "dotenv";
import { QUOTAS, TIGHT_AT, overBudget, project, subjectCapacity } from "../lib/ingest/quota";
import { SOURCES } from "../lib/ingest/store";
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

console.log("\nQuota headroom");
/**
 * The refresh windows were chosen against these limits, but nothing checked the arithmetic
 * afterwards — and a feed that spends its budget by lunchtime looks like a source with nothing
 * to say, not a rate-limited one. These assert the maths, not the published figures.
 */
// The projection has to be a floor, never a flattering estimate: it counts one request per
// source per window per subject, so anything it calls "tight" is probably already over.
check("projection scales with subjects", project("gnews", 10).projectedPerDay === project("gnews", 5).projectedPerDay * 2,
  `${project("gnews", 5).projectedPerDay} → ${project("gnews", 10).projectedPerDay}`);
check("zero subjects costs nothing", project("gnews", 0).projectedPerDay === 0);
check("a negative count cannot buy headroom", project("gnews", -5).projectedPerDay === 0);

// The number the buy-or-drop decision actually needs.
const gnewsCap = subjectCapacity("gnews");
check("a metered source reports its subject capacity", typeof gnewsCap === "number" && gnewsCap > 0, String(gnewsCap));
check("capacity matches the projection at that count", (project("gnews", gnewsCap!).utilisation ?? 0) <= 1, String(project("gnews", gnewsCap!).utilisation));
check("one subject past capacity goes over", project("gnews", gnewsCap! + 1).verdict === "over", project("gnews", gnewsCap! + 1).verdict);

check("an unmetered source has no capacity to report", subjectCapacity("wikipedia") === null);
check("and is verdicted unmetered, not ok", project("wikipedia", 1000).verdict === "unmetered");
// "unmetered" must not read as "free": a source with no published cap still has obligations,
// which is why the note is carried rather than the field left empty.
check("every source carries a quota note", (Object.keys(QUOTAS) as SourceKey[]).every((k) => QUOTAS[k].note.length > 10));
check("every source key has a quota entry", SOURCES.every((s) => s.key in QUOTAS));

check("80% of a cap counts as tight, not ok", TIGHT_AT === 0.8);
const tight = (Object.keys(QUOTAS) as SourceKey[]).map((k) => project(k, 5)).filter((p) => p.verdict === "tight" || p.verdict === "over");
check("overBudget agrees with the per-source verdicts", overBudget(5).length === tight.length, `${overBudget(5).length} vs ${tight.length}`);
check("overBudget is ordered tightest first", overBudget(200).every((p, i, a) => i === 0 || (a[i - 1].utilisation ?? 0) >= (p.utilisation ?? 0)));

console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) process.exit(1);
