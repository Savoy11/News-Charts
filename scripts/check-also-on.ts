import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import EventList from "../components/EventList";
import { ALSO_ON_SHOWN, ALSO_ON_SOURCES, ALSO_ON_SOURCE_IDS, alsoOnMore, alsoOnSql, groupAlsoOn } from "../lib/alsoOn";
import { GROUPED_ROW_SOURCES, GROUPED_ROW_SOURCE_IDS, corroborations } from "../lib/corroboration";
import { readdirSync } from "node:fs";
import { SOURCES } from "../lib/ingest/store";
import type { TimelineEvent } from "../lib/types";

/**
 * "Also on": a case's other listed companies, linked from its row (batch 106, the 2026-11-06
 * proposal 3, approved by the owner on 2026-11-06).
 *
 *   npm run check:also-on
 *
 * The query, its grouping, the index it is written for and the line the list renders. The query
 * itself was run against a local Postgres 16 when built (batch 106's ledger section). Offline.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 500)}`}`);
}
const read = (file: string) => readFileSync(join(__dirname, "..", file), "utf8");

console.log("\nThe sources and the index");
const ids = ALSO_ON_SOURCES.map((k) => SOURCES.find((s) => s.key === k)?.id);
check("the multi-party sources are the Justice Department's, the SEC's two, the Board's, the CFPB's, EPA's, the CPSC's and the CFTC's",
  JSON.stringify([...ALSO_ON_SOURCES].sort()) === JSON.stringify(["cfpb", "cftc", "cpsc_recalls", "doj_press", "epa_cases", "fed_press", "sec_cases", "sec_press"]));
check("  …their ids are the sources' own, as `SOURCES` registers them", JSON.stringify(ids) === JSON.stringify(ALSO_ON_SOURCE_IDS), { ids, ALSO_ON_SOURCE_IDS });
const migration = read("db/041_also_on.sql");
const indexed = /WHERE source_id IN \(([\d, ]+)\)/.exec(migration)?.[1].split(",").map((n) => Number(n.trim()));
check("db/041's partial index covers exactly those sources, on the case numbers as a set",
  JSON.stringify(indexed) === JSON.stringify(ALSO_ON_SOURCE_IDS) && /USING gin \(string_to_array\(external_id, ','\)\)/.test(migration), indexed);

console.log("\nThe query");
const sql = alsoOnSql(ALSO_ON_SOURCE_IDS);
check("it writes the index's source list as literals, so the planner can use the partial index", sql.includes(`b.source_id IN (${ALSO_ON_SOURCE_IDS.join(", ")})`));
check("  …matches the same source and overlapping case numbers, a grouped row's numbers compared as a set",
  /b\.source_id = a\.source_id/.test(sql) && /string_to_array\(b\.external_id, ','\) && string_to_array\(a\.external_id, ','\)/.test(sql));
check("  …the row's own event among them: a Justice Department, SEC or Board release is one event on every page it names",
  !/b\.event_id <> a\.event_id/.test(sql) && /JOIN event_subjects es2 ON es2\.event_id = b\.event_id/.test(sql));
check("  …names other held company pages only: never the page itself, nor another ticker of its own record, nor a row its relevance floor hides",
  /es2\.subject_id <> \$1/.test(sql) && /o\.kind = 'company'/.test(sql) && /o\.cik IS DISTINCT FROM \(SELECT cik FROM subjects WHERE id = \$1\)/.test(sql) && /es2\.relevance IS NULL OR es2\.relevance >= \$3/.test(sql));
let refused = "";
try {
  alsoOnSql([]);
} catch (err) {
  refused = String(err);
}
check("  …and refuses to run without source ids", /no source ids/.test(refused));

console.log("\nGrouping");
const grouped = groupAlsoOn([
  { event_id: "7", ticker: "GM", display_name: "General Motors" },
  { event_id: "7", ticker: "F", display_name: "Ford Motor" },
  { event_id: "7", ticker: "F", display_name: "Ford Motor" },
  { event_id: "7", ticker: "CAT", display_name: "Caterpillar" },
  { event_id: "7", ticker: "DE", display_name: "Deere" },
  { event_id: "7", ticker: null, display_name: "a topic" },
  { event_id: "9", ticker: "XOM", display_name: "ExxonMobil" },
]);
check("one company once an event, however many of its cases overlap; ordered by name, the first three shown",
  grouped.get(7)?.total === 4 && grouped.get(7)?.shown.map((c) => c.ticker).join() === "CAT,DE,F" && ALSO_ON_SHOWN === 3 && alsoOnMore(grouped.get(7)!) === "and 1 more" &&
    grouped.get(9)?.total === 1 && alsoOnMore(grouped.get(9)!) === "",
  [...grouped]);

console.log("\nThe line under a row");
const ev = (id: string, alsoOn?: TimelineEvent["alsoOn"]): TimelineEvent => ({
  id,
  date: "2020-01-02",
  type: "regulation",
  title: "EPA consent decree with 28 parties (Superfund law (CERCLA))",
  source: "EPA",
  url: "https://echo.epa.gov/enforcement-case-report?id=05-2013-1012",
  ...(alsoOn ? { alsoOn } : {}),
});
const many = renderToStaticMarkup(
  createElement(EventList, {
    events: [ev("a", { shown: [{ ticker: "F", name: "Ford Motor" }, { ticker: "GM", name: "General Motors" }, { ticker: "BRK-B", name: "Berkshire & Co" }], total: 27 })],
  }),
);
const line = /<p[^>]*data-also-on[^>]*>([\s\S]*?)<\/p>/.exec(many)?.[1] ?? "";
check("\"Also on Ford Motor, General Motors, Berkshire & Co and 24 more\", each a link to its page",
  line.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&") === "Also on Ford Motor, General Motors, Berkshire & Co and 24 more" &&
    /href="\/company\/F"/.test(line) && /href="\/company\/GM"/.test(line) && /href="\/company\/BRK-B"/.test(line),
  line);
check("  …under the row, not in it: the row is one big link, and links do not nest", /<\/a><p[^>]*data-also-on/.test(many), many.slice(0, 400));
const two = renderToStaticMarkup(createElement(EventList, { events: [ev("b", { shown: [{ ticker: "F", name: "Ford Motor" }, { ticker: "GM", name: "General Motors" }], total: 2 })] }));
check("  …two companies read \"Ford Motor and General Motors\"", (/<p[^>]*data-also-on[^>]*>([\s\S]*?)<\/p>/.exec(two)?.[1] ?? "").replace(/<[^>]+>/g, "") === "Also on Ford Motor and General Motors");
const none = renderToStaticMarkup(createElement(EventList, { events: [ev("c")] }));
check("  …and a row whose case no other held page has says nothing", !none.includes("data-also-on"));

console.log("\nWired");
const store = read("lib/store/read.ts");
check("a page's events load their other companies with them, and a failed query leaves the rows without the line",
  /const \[\{ rows \}, alsoOn\] = await Promise\.all\(\[getPool\(\)\.query\(/.test(store) && /loadAlsoOn\(subjectId\)\]\);/.test(store) &&
    /alsoOn\.has\(Number\(r\.id\)\) \? \{ alsoOn: alsoOn\.get\(Number\(r\.id\)\) \} : \{\}/.test(store) && /catch \(err\) \{\s*console\.error\(`also-on/.test(store));
check("  …and both list layouts render the line", (read("components/EventList.tsx").match(/<EventRow ev=\{ev\} \/>\s*<AlsoOnLine ev=\{ev\} \/>/g) ?? []).length === 2);

console.log("\nThe sources a row counts (batch 107, the 2026-11-07 audit's finding 1)");
const groupedIds = GROUPED_ROW_SOURCES.map((k) => SOURCES.find((s) => s.key === k)?.id);
check("the sources whose one row carries several cases' numbers are EPA's, the CPSC's, the CFTC's, the SEC's litigation releases, the CFPB's and the Digest's, by their own ids",
  JSON.stringify(groupedIds) === JSON.stringify(GROUPED_ROW_SOURCE_IDS) && JSON.stringify([...GROUPED_ROW_SOURCES].sort()) === JSON.stringify(["cfpb", "cftc", "cpsc_recalls", "epa_cases", "sec_cases", "sec_digest"]),
  { groupedIds, GROUPED_ROW_SOURCE_IDS });
// every builder that joins numbers into one row's id, and the source it writes
const joining = readdirSync(join(__dirname, "..", "lib"))
  .filter((f) => f.endsWith(".ts"))
  .flatMap((f) => {
    const text = read(`lib/${f}`);
    if (!/externalId:[^\n]*\.join\(","\)/.test(text)) return [];
    return [{ file: f, keys: [...new Set([...text.matchAll(/sourceKey: "([a-z_]+)"/g)].map((m) => m[1]))] }];
  });
check("  …and every source file that joins case numbers into a row's id writes one of them, so no grouped row is counted as several sources",
  joining.length >= 6 && joining.every((j) => j.keys.length > 0 && j.keys.every((k) => (GROUPED_ROW_SOURCES as readonly string[]).includes(k))),
  joining);
const gdelt = SOURCES.find((s) => s.key === "gdelt")?.id ?? -1;
check("a row whose list grew counts once: an SEC day row stored under two lists, a CPSC month under five, is one source",
  corroborations([28, 28]) === 1 && corroborations(["32", "32", "32", "32", "32"]) === 1 && corroborations([30, 30, 23]) === 2);
check("  …but a story twelve papers carried is still twelve, and a row with no attestation none",
  gdelt > 0 && corroborations(Array(12).fill(gdelt)) === 12 && corroborations(null) === 0 && corroborations([]) === 0, gdelt);
check("  …and a page's rows are counted that way: their attestations' sources, not their number",
  /array_agg\(x\.source_id\) FROM event_attestations x WHERE x\.event_id = e\.id\) AS attestation_sources/.test(store) &&
    /const attestations = corroborations\(r\.attestation_sources\);/.test(store) && !/count\(\*\) FROM event_attestations x/.test(store));

console.log(`\n${pass}/${pass + fail} checks passed\n`);
process.exit(fail ? 1 : 0);
