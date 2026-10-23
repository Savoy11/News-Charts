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
import { commonName, TICKER_INDEX_COMPANIES } from "../lib/sec";
import { gdeltEverydayName } from "../lib/news";
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
// The owner's 2026-10-18 Federal Register count found 0 of 0 hits for Wells Fargo and Bank of
// America: the search phrase still carried EDGAR's state tag.
for (const [legal, everyday] of [
  ["WELLS FARGO & COMPANY/MN", "WELLS FARGO"],
  ["BANK OF AMERICA CORP /DE/", "BANK OF AMERICA"],
  ["COSTCO WHOLESALE CORP /NEW", "COSTCO WHOLESALE"],
  ["ELI LILLY & Co", "ELI LILLY"],
  ["AT&T INC.", "AT&T"],
  ["JOHNSON & JOHNSON", "JOHNSON & JOHNSON"],
  // batch 26: the marks and legal forms that still survived, measured across the whole index
  ["TOYOTA MOTOR CORP/", "TOYOTA MOTOR"],
  ["RUSH ENTERPRISES INC \\TX\\", "RUSH ENTERPRISES"],
  ["AMARIN CORP PLC\\UK", "AMARIN"],
  ["Blue Acquisition Corp/Cayman", "Blue Acquisition"],
  ["Alight, Inc. / Delaware", "Alight"],
  ["TRICO BANCSHARES /", "TRICO BANCSHARES"],
  ["Spotify Technology S.A.", "Spotify Technology"],
  ["Ferrari N.V.", "Ferrari"],
  ["Energy Transfer LP", "Energy Transfer"],
  ["GENMAB A/S", "GENMAB"],
  ["EQUINOR ASA", "EQUINOR"],
  ["AMERICA MOVIL SAB DE CV/", "AMERICA MOVIL"],
  ["Vista Energy, S.A.B. de C.V.", "Vista Energy"],
  ["XChange TEC.INC", "XChange TEC"],
  // …while a slash inside a name, a hyphenated word and a number stay
  ["CULLEN/FROST BANKERS, INC.", "CULLEN/FROST BANKERS"],
  ["DATA I/O CORP", "DATA I/O"],
  ["M/I HOMES, INC.", "M/I HOMES"],
  ["ASSOCIATED BANC-CORP", "ASSOCIATED BANC-CORP"],
  ["1847 Holdings LLC", "1847 Holdings"],
  // batch 28: legal forms written with spaced letters, a tag after the form, a bare "DE", a
  // dangling "and" and the public company's forms — each kept a word no headline carries
  ["US BANCORP DE", "US BANCORP"],
  ["ACUITY INC. (DE)", "ACUITY"],
  ["BROADWAY FINANCIAL CORP DE", "BROADWAY FINANCIAL"],
  ["TELEFONICA S A", "TELEFONICA"],
  ["HEINEKEN HOLDING N V", "HEINEKEN"],
  ["DEUTSCHE LUFTHANSA A G", "DEUTSCHE LUFTHANSA"],
  ["NATUZZI S P A", "NATUZZI"],
  ["FERRELLGAS PARTNERS L P", "FERRELLGAS PARTNERS"],
  ["Eli Lilly and Company", "Eli Lilly"],
  ["CRH PUBLIC LTD CO", "CRH"],
  ["Osotspa Public Co Limited/ADR", "Osotspa"],
  ["Medtronic Public Limited Company", "Medtronic"],
  // …while a bracket that is part of the name, a name that starts with "Public" and a name that
  // is nothing but a number stay
  ["Banco Santander (Brasil) S.A.", "Banco Santander (Brasil)"],
  ["Public Storage", "Public Storage"],
  ["111, Inc.", "111, Inc"],
]) {
  check(`  "${legal}" is "${everyday}"`, commonName(legal) === everyday, commonName(legal));
}
{
  // Every company the index lists, not only the cases above: on 2026-10-21, 302 everyday names
  // still ended in a mark or a legal form, so news and Federal Register searches asked for them —
  // and after that fix, 34 more in the spaced, tagged and public company forms (batch 28 audit).
  const LEFT_OVER =
    /[\\]|\/$|[\s,.](?:S\.?A|N\.?V|L\.?P|LLC|A\/S|ASA|AB|S\.?P\.?A|OYJ|TBK|S\.?A\.?B|DE C\.?V)\.?$|\s(?:S A|N V|A G|S P A|L P|S A B|DE|AND|PUBLIC)$|(?:INC|CORP|LTD|PLC|CO|N\.?V|S\.?A)\.?\s*\([^)]*\)$/i;
  const left = [...new Set(TICKER_INDEX_COMPANIES.map(([, title]) => commonName(title)))].filter((n) => LEFT_OVER.test(n));
  check("no everyday name in the committed index keeps a mark or a legal form", left.length === 0, `${left.length} — ${left.slice(0, 4).join(" | ")}`);
}

// Source-text assert, the check-wiring pattern: the fix is one identifier, and reverting it
// would compile fine and fail nothing else. GDELT must be queried under the common name, never
// under `company.name` (the SEC legal title) — with the company's own other names OR'd in since
// batch 25 ("goldman sachs" for Goldman Sachs Group; see check:aliases). Since batch 33 the query
// is `gdeltEverydayName`, which is that common name unless GDELT would refuse it as too short.
const ingestSrc = readFileSync(path.join(__dirname, "ingest.ts"), "utf8");
check(
  "ingest queries GDELT under the common name",
  /const \{ query: newsQuery, byRelevance \} = gdeltNewsPlan\(company\.name, possessive, alsoKnownAs\);\s*const asked = gdeltNames\(newsQuery, alsoKnownAs, byRelevance\)\.join\(" \| "\)[^;]*;\s*await run\("gdelt", asked, \(\) => fetchNews\(newsQuery, alsoKnownAs, \{ byRelevance \}\)/.test(ingestSrc) &&
    gdeltEverydayName("FORD MOTOR CO") === "FORD MOTOR" && gdeltEverydayName("Apple Inc.") === "Apple",
  'expected newsQuery from gdeltNewsPlan(company.name, possessive) and run("gdelt", asked, () => fetchNews(newsQuery, alsoKnownAs, { byRelevance })) in scripts/ingest.ts, the common name for "FORD MOTOR CO"'
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
