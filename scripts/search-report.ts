import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * What the search box is actually doing.
 *
 *   npm run search-report              # last 7 days
 *   npm run search-report 30           # last 30 days
 *   npm run search-report -- --purge   # apply the 90-day retention now
 *
 * Search accuracy has been judged by typing a phrase and looking at where it landed. That finds
 * the bug you thought of and nothing else, and it cannot say whether a change made things better
 * overall — which is the question every item on the search backlog turns on.
 *
 * The number to read first is **landed**: the share of searches that reached a subject with
 * something on it. Everything below it explains that number rather than decorating it.
 */
import { getPool, closePool } from "../lib/db";
import {
  fromCorpus,
  percentile,
  purgeOldResolutions,
  summarise,
  topQueries,
  type LoggedRow,
  type ResolutionRung,
} from "../lib/searchLog";

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

/** What each rung means, so a report someone reads once is legible without the schema. */
const MEANING: Record<ResolutionRung, string> = {
  known_company: "a company already in the corpus",
  known_subject: "a subject slug or recorded alias",
  edgar: "a real company nobody has ingested — over the network, on the visitor's request",
  salvaged_prefix:
    "the whole query matched nothing, but a head-prefix did — the tail rode along as focus." +
    " Accuracy here is worth watching: it is a real answer for the prefix, not for the query",
  assumed_topic: "nothing matched; the typed string was assumed to name a topic (retired 2026-08-08)",
  unresolved:
    "nothing matched and the visitor was told so. A query recurring here is a resolver miss" +
    " (bug) or off-scope demand (product signal) — read this rung, it is the scope's report card",
  network_timeout:
    "the ticker index did not answer in time — a guess we may not have needed. Read this as a" +
    " statement about EDGAR, not about the query",
  empty: "nothing was typed",
};

async function main(): Promise<void> {
  const days = Number(process.argv[2]) || 7;

  if (process.argv.includes("--purge")) {
    const gone = await purgeOldResolutions(90);
    console.log(`\n  purged ${gone} row(s) older than 90 days\n`);
    await closePool();
    return;
  }

  const { rows } = await getPool().query<{
    query: string;
    subject: string;
    resolved_by: ResolutionRung;
    has_events: boolean | null;
    duration_ms: number | null;
  }>(
    `SELECT query, subject, resolved_by, has_events, duration_ms
       FROM search_resolutions
      WHERE asked_at > now() - ($1 || ' days')::interval
      ORDER BY asked_at DESC`,
    [String(days)]
  );

  const logged: LoggedRow[] = rows.map((r) => ({
    query: r.query,
    subject: r.subject,
    resolvedBy: r.resolved_by,
    hasEvents: r.has_events,
    durationMs: Number(r.duration_ms ?? 0),
  }));

  console.log(`\nSearch — last ${days} day${days === 1 ? "" : "s"}\n`);
  if (!logged.length) {
    console.log("  nothing logged in the window. Either nobody has searched, or db/015 has not");
    console.log("  been applied — run npm run db:migrate.\n");
    await closePool();
    return;
  }

  const s = summarise(logged);
  console.log(`  ${s.searches} search${s.searches === 1 ? "" : "es"}`);
  console.log(`  landed on a subject with events   ${pct(s.landed)}   ← the accuracy number`);
  if (s.unknown) {
    // Stated rather than folded in: a metric that counts its own failures as successes is worse
    // than no metric.
    console.log(`  outcome unknown (excluded above)  ${s.unknown} row(s)`);
  }
  console.log(`  the parser rewrote the query      ${pct(s.parserRewrote)}`);

  console.log(`\nWhich rung answered\n`);
  for (const r of s.byRung) {
    console.log(
      `  ${r.rung.padEnd(14)} ${String(r.searches).padStart(5)}  ${pct(r.share).padStart(6)} of searches` +
        `  ·  ${pct(r.landed).padStart(6)} landed${fromCorpus(r.rung) ? "" : "  ⚠ not from the corpus"}`
    );
    console.log(`  ${" ".repeat(14)} ${MEANING[r.rung]}`);
  }

  /**
   * The misses, deduplicated. This is the working list: every row here is a visitor who typed
   * something reasonable and got a page with nothing on it, and each one is either a subject
   * worth ingesting or a resolution worth fixing.
   */
  const misses = logged.filter((r) => r.hasEvents !== true);
  console.log(`\nMost-asked searches that landed on nothing (${misses.length} of ${logged.length})\n`);
  const top = topQueries(misses, 20);
  if (!top.length) console.log("  none — every search in the window landed on something.");
  for (const t of top) {
    // Elided for the column, not for the record: the stored row keeps the whole query, and a
    // 200-character paste would otherwise push the rung off the right of the terminal.
    const shown = t.query.length > 40 ? `${t.query.slice(0, 39)}…` : t.query;
    console.log(`  ${String(t.asked).padStart(4)}×  ${shown.padEnd(40)} ${t.rungs.join(", ")}`);
  }

  /**
   * Where the parser changed the query. Not a fault list — rewriting "show me the history of
   * Alibaba" to "Alibaba" is the parser working. It is the place to look when a natural-language
   * prompt lands somewhere strange, and the pairs are the raw material for `check:prompt` cases.
   */
  const rewritten = logged.filter(
    (r) => r.query.toLowerCase() !== r.subject.toLowerCase() && r.hasEvents !== true
  );
  if (rewritten.length) {
    console.log(`\nRewrites that then landed on nothing — candidate check:prompt cases\n`);
    for (const r of rewritten.slice(0, 15)) {
      console.log(`  “${r.query}”\n     → “${r.subject}”  (${r.resolvedBy})`);
    }
  }

  /**
   * Read-path latency. The `edgar` and `assumed_topic` rungs reach the SEC ticker index and
   * Wikipedia while a visitor waits, which is the one place the site still fetches on a request.
   */
  console.log(`\nHow long the ladder took\n`);
  for (const rung of [...new Set(logged.map((r) => r.resolvedBy))]) {
    const ds = logged.filter((r) => r.resolvedBy === rung).map((r) => r.durationMs);
    console.log(
      `  ${rung.padEnd(14)} p50 ${String(percentile(ds, 50)).padStart(5)}ms   p95 ${String(percentile(ds, 95)).padStart(5)}ms`
    );
  }

  console.log(
    `\n  Queries are stored for 90 days with nothing identifying attached, and the scheduled\n` +
      `  refresh purges past that. \`npm run search-report -- --purge\` applies it now.\n`
  );
  await closePool();
}

main().catch(async (err) => {
  console.error("\nsearch-report failed:", err.message);
  await closePool().catch(() => {});
  process.exit(1);
});
