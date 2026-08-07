import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Recall — that a search yields as much as the sources honestly gave us.
 *
 *   npm run check:recall
 *
 * Two failure modes, one per direction. Query with the wrong name and a source returns nothing:
 * GDELT phrase-quotes its query, so the SEC legal title "Ford Motor Co" matches no headline that
 * says "Ford" — a silent, total recall loss on the highest-volume source. Cap before deduping
 * and syndication eats the cap: thirty slots filled with copies of one wire story is one story
 * stored, twenty-nine spent on nothing.
 *
 * Offline by construction — pure functions and source-text asserts, no network, no database.
 */

import { readFileSync } from "node:fs";
import * as path from "node:path";
import { collapseNearDuplicates } from "../lib/newsQuality";
import { commonName } from "../lib/sec";
import type { TimelineEvent } from "../lib/types";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

console.log("\nThe query is the common name, not the legal title");
check(`commonName strips the legal suffix`, commonName("Ford Motor Co") === "Ford Motor", commonName("Ford Motor Co"));
check(`  ...iteratively`, commonName("Alibaba Group Holding Limited") === "Alibaba Group", commonName("Alibaba Group Holding Limited"));

// Source-text assert, the check-wiring pattern: the fix is one identifier, and reverting it
// would compile fine and fail nothing else. GDELT must be queried under `name` (the computed
// commonName), never under `company.name` (the SEC legal title).
const ingestSrc = readFileSync(path.join(__dirname, "ingest.ts"), "utf8");
check(
  "ingest queries GDELT under the common name",
  /run\("gdelt",\s*name,\s*\(\)\s*=>\s*fetchNews\(name\)/.test(ingestSrc),
  'expected run("gdelt", name, () => fetchNews(name), …) in scripts/ingest.ts'
);
check(
  "  ...and never under the raw legal title",
  !/fetchNews\(company\.name\)/.test(ingestSrc)
);

console.log("\nDedupe before capping — syndication must not spend cap slots");
const story = (title: string, i: number): TimelineEvent => ({
  id: `t-${i}`,
  date: "2026-08-01",
  type: "news",
  title,
  source: `outlet-${i}`,
  url: `https://example.com/${i}`,
  sourceKey: "gdelt",
});
// Ten distinct stories, each syndicated in triplicate, arriving grouped — the shape a wire
// service actually produces. A cap of 12 applied before deduping keeps 4 unique stories;
// applied after, it keeps 10.
const wire: TimelineEvent[] = [];
for (let s = 0; s < 10; s++) {
  for (let copy = 0; copy < 3; copy++) wire.push(story(`Distinct story number ${s}`, s * 3 + copy));
}
const CAP = 12;
const capThenDedupe = collapseNearDuplicates(wire.slice(0, CAP));
const dedupeThenCap = collapseNearDuplicates(wire).slice(0, CAP);
check(
  "dedupe-then-cap keeps more unique stories than cap-then-dedupe",
  dedupeThenCap.length > capThenDedupe.length,
  `${dedupeThenCap.length} vs ${capThenDedupe.length}`
);
check("  ...and never exceeds the cap", dedupeThenCap.length <= CAP);
check(
  "ingest orders it dedupe-then-cap",
  /collapseNearDuplicates\(e\)\.slice\(/.test(ingestSrc) && !/collapseNearDuplicates\(e\.slice\(/.test(ingestSrc)
);

console.log("\nCaps only ever widen");
// The raise from 30 to 75 was deliberate; a quiet regression back would be a recall loss no
// page ever reports. GDELT is unmetered (quota.ts perDay: null), so the wider cap costs nothing.
const gdeltCaps = [...ingestSrc.matchAll(/collapseNearDuplicates\(e\)\.slice\(0,\s*(\d+)\)/g)].map((m) => Number(m[1]));
check("both GDELT call sites carry the widened cap", gdeltCaps.length >= 2 && gdeltCaps.every((c) => c >= 75), gdeltCaps.join(", "));

console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) process.exit(1);
