import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Aggregator noise controls.
 *
 *   npm run check:news-quality
 *
 * Both of these can fail silently in opposite directions, which is why they are tested rather
 * than eyeballed: too loose and a timeline carries three copies of one wire story plus a
 * listicle; too tight and a real story disappears with nothing to show it ever arrived. The
 * over-filtering cases below matter more than the passing ones.
 */
import {
  LOOSE_SOURCES,
  applyRelevanceFloor,
  collapseNearDuplicates,
  storyKey,
  titleNamesSubject,
} from "../lib/newsQuality";
import type { TimelineEvent } from "../lib/types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const news = (
  title: string,
  date: string,
  extra: Partial<TimelineEvent> = {}
): TimelineEvent => ({
  id: `${title}-${date}-${extra.source ?? "x"}`,
  date,
  type: "news",
  title,
  source: "Test",
  ...extra,
});

console.log("\nStory identity — the same headline on the same day");
{
  const a = storyKey("Ford recalls SUVs over software defect", "2026-05-13");
  check("case and punctuation do not matter", a === storyKey("FORD RECALLS SUVS, OVER SOFTWARE DEFECT!", "2026-05-13"));
  check("a trailing outlet name is stripped", a === storyKey("Ford recalls SUVs over software defect - Reuters", "2026-05-13"));
  check("a pipe-separated outlet is stripped", a === storyKey("Ford recalls SUVs over software defect | CNBC", "2026-05-13"));
  check("an EXCLUSIVE tag is stripped", a === storyKey("Exclusive: Ford recalls SUVs over software defect", "2026-05-13"));
  check(
    "smart quotes normalise",
    storyKey("Ford’s “big” day", "2026-01-01") === storyKey(`Ford's "big" day`, "2026-01-01")
  );

  // The line it must not cross: different stories stay different.
  check("a different day is a different story", a !== storyKey("Ford recalls SUVs over software defect", "2026-05-14"));
  check(
    "a genuinely different headline is a different story",
    a !== storyKey("Ford recalls trucks over brake defect", "2026-05-13")
  );
}

console.log("\nCollapsing near-duplicates across feeds");
{
  const merged = collapseNearDuplicates([
    news("Ford recalls SUVs over software defect", "2026-05-13", { source: "Newsdata", url: "https://a" }),
    news("Ford recalls SUVs over software defect - Reuters", "2026-05-13", {
      source: "GNews",
      url: "https://b",
      description: "Fuller writeup",
      imageUrl: "https://img",
    }),
    news("Ford recalls SUVs over software defect | CNBC", "2026-05-13", { source: "Currents", url: "https://c" }),
    news("Ford tops estimates as F-Series mix lifts margins", "2026-07-08", { source: "CNBC", url: "https://d" }),
  ]);
  check("three copies of one wire story collapse to one", merged.length === 2, `${merged.length} events`);
  check(
    "the richest copy survives, not merely the first",
    merged[0].description === "Fuller writeup" && merged[0].imageUrl === "https://img",
    merged[0].source
  );
  check("an unrelated story is untouched", merged[1]?.title.includes("F-Series"));
}

console.log("\nOnly news collapses");
{
  // A filing and a news story about that filing on the same day are two different things.
  const events = [
    news("Ford recalls SUVs", "2026-05-13", { url: "https://a" }),
    { ...news("Ford recalls SUVs", "2026-05-13", { url: "https://b" }), type: "filing" as const },
    { ...news("Ford recalls SUVs", "2026-05-13", { url: "https://c" }), type: "history" as const },
  ];
  check("filings and history are never collapsed away", collapseNearDuplicates(events).length === 3);
}

console.log("\nRelevance floor — does the headline name the subject");
{
  check("exact name", titleNamesSubject("Ford recalls SUVs", "Ford Motor Company"));
  check("distinctive token is enough", titleNamesSubject("Why Ford is betting on trucks", "Ford Motor Company"));
  check("tokens in any order", titleNamesSubject("Motor giant Ford posts results", "Ford Motor Company"));
  check("an alias counts", titleNamesSubject("F shares climb", "Ford Motor Company", ["F shares"]));

  // The bar is a *distinctive* token: matching on "motor" or "company" lets anything through.
  check("a weak token alone is not enough", !titleNamesSubject("Motor industry outlook for 2026", "Ford Motor Company"));
  check("a generic listicle is rejected", !titleNamesSubject("10 stocks to watch this week", "Ford Motor Company"));
  check("a different company is rejected", !titleNamesSubject("General Motors recalls SUVs", "Ford Motor Company"));
  check("empty title is rejected", !titleNamesSubject("", "Ford Motor Company"));
}

console.log("\nThe floor applies only where it was opted in");
{
  const events = [
    news("10 stocks to watch this week", "2026-05-13", { sourceKey: "gnews" }),
    news("10 stocks to watch this week", "2026-05-14", { sourceKey: "marketaux" }),
    news("10 stocks to watch this week", "2026-05-15", { sourceKey: "gdelt" }),
    news("10 stocks to watch this week", "2026-05-16", {}),
  ];
  const kept = applyRelevanceFloor(events, "Ford Motor Company", LOOSE_SOURCES);
  check("a loose aggregator's off-topic story is dropped", !kept.some((e) => e.sourceKey === "gnews"));
  check(
    "a ticker-tagged feed is exempt — its own tagging beats our guess",
    kept.some((e) => e.sourceKey === "marketaux")
  );
  check("GDELT is exempt", kept.some((e) => e.sourceKey === "gdelt"));
  check("an event with no source key is never filtered", kept.some((e) => !e.sourceKey));
}

console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) process.exit(1);
