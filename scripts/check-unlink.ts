import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PoolClient } from "pg";
import { fdaApprovalsFor } from "../lib/ingest/fdaApprovalsFor";
import { unlinkGone } from "../lib/ingest/store";
import { dedupKey } from "../lib/ingest/keys";
import { ARCHIVE_LAST_YEAR } from "../lib/dojArchive";
import type { TimelineEvent } from "../lib/types";

/**
 * A rule change that takes a case off a company takes its stored row off the page (batch 108, the
 * 2026-11-07 audit's set-aside): before it, only filings and the Federal Register ever unlinked, so
 * a refusal a later batch added (Sunoco, Inc.'s cases off Sunoco LP, Graco Children's strollers off
 * Graco, the old Waste Management's off WM) reached new runs and never the stored pages.
 *
 *   npm run check:unlink
 *
 * Which answers are complete, what the run does with one, and the two queries. The queries were run
 * against a local Postgres 16 when built (batch 108's ledger section). Offline.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 500)}`}`);
}
const read = (file: string) => readFileSync(join(__dirname, "..", file), "utf8");

async function main(): Promise<void> {
  console.log("\nWhich answers are complete");
  // every company step that reads data kept whole marks the answer it built from it, failed walk or not
  const walks = ["lib/ingest/secCasesWalk.ts", "lib/ingest/cfpbWalk.ts", "lib/ingest/epaWalk.ts", "lib/ingest/cpscWalk.ts", "lib/ingest/cftcWalk.ts", "lib/ingest/secDigestWalk.ts"];
  const marked = walks.filter((f) =>
    /if \(failed\) return \{ events, \.\.\.failed, complete: \{\} \};\n\s*return \{ events, outcome: events\.length \? "ok" : "empty", httpStatus: 200, complete: \{\} \};/.test(read(f)));
  check("the SEC's cases, the CFPB's, EPA's, the CPSC's, the CFTC's and the Digest's company steps mark their answer complete, built from the kept rows", marked.length === walks.length,
    walks.filter((f) => !marked.includes(f)));
  check("  …and the SEC's press releases", /detail: failure\.detail, complete: \{\} \};\n\s*return \{ events, outcome: events\.length \? "ok" : "empty", httpStatus: 200, complete: \{\} \};/.test(read("lib/ingest/secPressWalk.ts")));
  // only an answer built from the rows: none on a path that returns before the rules run
  const early = [...walks, "lib/ingest/secPressWalk.ts"].filter((f) => read(f).split("\n").some((l) => /(NO_PRICES|FUND_SERIES)\(\)/.test(l) && /complete/.test(l)));
  check("  …never one that stopped short of the rules: a company with no prices yet, a fund's series, a failure with no rows", early.length === 0, early);
  const fake = (listed: string | null) =>
    ({ query: async (sql: string) => (/min\(on_date\)/.test(sql) ? { rows: [{ listed }] } : { rows: [] }) }) as unknown as PoolClient;
  const lilly = await fdaApprovalsFor(fake("1972-06-01"), 1, { edgarName: "ELI LILLY & Co", alsoKnownAs: [], cik: 59478 });
  const unpriced = await fdaApprovalsFor(fake(null), 1, { edgarName: "ELI LILLY & Co", alsoKnownAs: [], cik: 59478 });
  check("the FDA's approvals, from the committed file, are complete; with no first price nothing is", !!lilly.complete && lilly.events.length > 20 && !unpriced.complete, { lilly: lilly.complete, n: lilly.events.length, unpriced: unpriced.complete });
  const ingest = read("scripts/ingest.ts");
  check("the Justice Department's answer is complete only before 2009, the archive's years read whole, and only when the archive part ran",
    ARCHIVE_LAST_YEAR === 2008 && /return archive \? \{ \.\.\.answer, complete: \{ before: `\$\{ARCHIVE_LAST_YEAR \+ 1\}-01-01` \} \} : answer;/.test(ingest));
  check("  …the Federal Reserve Board's, read from its live feed and never kept, is never complete", !/complete/.test(read("lib/ingest/fedPressFor.ts")) && !/complete/.test(read("lib/fedPress.ts")));

  console.log("\nWhat a run does with one");
  check("a complete answer, stored as it came, takes the subject off the rows it no longer holds, in the run's own transaction",
    /for \(const ev of events\) await upsertEvent\(client, ev, subjectId, stats, scoring\);\n(?:\s*\/\/[^\n]*\n)*\s*if \(result\.complete && events\.length === result\.events\.length\) \{\n\s*stats\.unlinked = await unlinkGone\(client, subjectId, sourceKey, events, result\.complete\);\n\s*\}\n\s*await logFetch\(/.test(ingest) &&
      ingest.indexOf("stats.unlinked = await unlinkGone(") < ingest.indexOf('await client.query("COMMIT");', ingest.indexOf("stats.unlinked = await unlinkGone(")),
  );
  check("  …and says how many", /unlinked \$\{s\.unlinked\} its rules no longer give/.test(ingest));

  console.log("\nThe query");
  const asked: { sql: string; args: unknown[] }[] = [];
  const recorder = { query: async (sql: string, args: unknown[]) => (asked.push({ sql, args }), { rowCount: 2, rows: [] }) } as unknown as PoolClient;
  const ev = (basis: string): TimelineEvent => ({ id: basis, date: "2000-01-01", type: "regulation", title: "t", source: "EPA", dedupBasis: basis });
  const n = await unlinkGone(recorder, 7, "epa_cases", [ev("epa:823768@1999-01-05")], { before: "2009-01-01" });
  const [q] = asked;
  check("it takes off this subject's links only, to this source's rows the answer does not hold, by identity, before the day given",
    n === 2 && /^\s*DELETE FROM event_subjects es/.test(q.sql) && /es\.subject_id = \$1/.test(q.sql) && /e\.dedup_key <> ALL \(\$3::bytea\[\]\)/.test(q.sql) &&
      /\(\$4::date IS NULL OR e\.occurred_on < \$4::date\)/.test(q.sql) && q.args[0] === 7 && q.args[1] === "epa_cases" && q.args[3] === "2009-01-01" &&
      Buffer.compare((q.args[2] as Buffer[])[0], dedupKey("epa:823768@1999-01-05")) === 0,
    q);
  check("  …a row another source also attests is kept: it is not this source's alone",
    /EXISTS \(SELECT 1 FROM event_attestations a JOIN sources s ON s\.id = a\.source_id WHERE a\.event_id = e\.id AND s\.key = \$2\)/.test(q.sql) &&
      /NOT EXISTS \(SELECT 1 FROM event_attestations a JOIN sources s ON s\.id = a\.source_id WHERE a\.event_id = e\.id AND s\.key <> \$2\)/.test(q.sql));
  check("  …and the events themselves stay: only the links go", !/DELETE FROM events\b/.test(q.sql));
  asked.length = 0;
  await unlinkGone(recorder, 7, "cfpb", []);
  check("  …with no day, every date", asked[0].args[3] === null && (asked[0].args[2] as unknown[]).length === 0);

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
