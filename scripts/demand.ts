import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * What visitors asked for and did not get.
 *
 *   npm run demand              # top 25 unfulfilled, plus every failure
 *   npm run demand 50           # a longer list
 *
 * `subject_requests` has recorded every miss since db/014 — `requests`, `first_asked`,
 * `last_asked`, `fulfilled_at` and `last_error`. **Nothing in `app/` reads that table, and
 * `last_error` is written by `markFailed()` and read by nobody**, so a subject failing every
 * hourly run is invisible outside psql. This is data already collected and already paid for.
 *
 * Read-only by construction: no new table, no new page, no writes. It answers three questions the
 * corpus cannot — what is most wanted, what keeps failing, and how long the queue's tail has been
 * waiting — and the second of those is the one that silently rots, because a request that fails
 * forever looks exactly like a request nobody has got to yet.
 */
import { getPool, closePool, configProblem } from "../lib/db";

interface Row {
  slug: string;
  kind: string;
  ticker: string | null;
  requests: number;
  first_asked: string;
  last_asked: string;
  last_error: string | null;
}

const day = (ts: string): string => String(ts).slice(0, 10);

/** Whole days between two timestamps — how long the queue has made this request wait. */
function waitingDays(first: string, last: string): number {
  const ms = new Date(last).getTime() - new Date(first).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

async function main(): Promise<void> {
  const limit = Number(process.argv[2] ?? 25);

  const { rows: pending } = await getPool().query<Row>(
    `SELECT slug, kind::text AS kind, ticker, requests,
            to_char(first_asked, 'YYYY-MM-DD') AS first_asked,
            to_char(last_asked,  'YYYY-MM-DD') AS last_asked,
            last_error
       FROM subject_requests
      WHERE fulfilled_at IS NULL
      ORDER BY requests DESC, last_asked DESC
      LIMIT $1`,
    [limit]
  );

  console.log(`\nMost-wanted subjects we do not have (top ${limit})\n`);
  if (!pending.length) {
    console.log("  nothing outstanding — every recorded request has been fulfilled.");
  } else {
    for (const r of pending) {
      const waited = waitingDays(r.first_asked, r.last_asked);
      const span = waited > 0 ? `asked over ${waited}d` : `asked ${r.first_asked}`;
      const failing = r.last_error ? "  ✗ failing" : "";
      console.log(
        `  ${String(r.requests).padStart(4)}×  ${r.slug.slice(0, 44).padEnd(44)} ` +
          `${r.kind.padEnd(8)} ${(r.ticker ?? "").padEnd(6)} ${span}${failing}`
      );
    }
  }

  /**
   * The half nothing has ever surfaced.
   *
   * A request with a `last_error` is not waiting its turn — it has been tried and it broke, and
   * it will break again on every run until someone looks. In the pending list above it is
   * indistinguishable from a request the runner simply has not reached yet, which is the
   * distinction this report exists to draw.
   */
  const { rows: failing } = await getPool().query<Row>(
    `SELECT slug, kind::text AS kind, ticker, requests,
            to_char(first_asked, 'YYYY-MM-DD') AS first_asked,
            to_char(last_asked,  'YYYY-MM-DD') AS last_asked,
            last_error
       FROM subject_requests
      WHERE fulfilled_at IS NULL AND last_error IS NOT NULL
      ORDER BY requests DESC`
  );

  console.log(`\nRequests that FAILED rather than waited (${failing.length})\n`);
  if (!failing.length) {
    console.log("  none — nothing in the queue has an error against it.");
  } else {
    for (const r of failing) {
      console.log(`  ${String(r.requests).padStart(4)}×  ${r.slug.slice(0, 44).padEnd(44)} ${r.last_error?.slice(0, 90)}`);
    }
    console.log(
      "\n  These do not clear on their own. Each was tried and broke, and will break again on\n" +
        "  every run until the cause is fixed or the request is removed."
    );
  }

  const { rows: totals } = await getPool().query<{ pending: string; fulfilled: string; failing: string; asks: string }>(
    `SELECT count(*) FILTER (WHERE fulfilled_at IS NULL)                            AS pending,
            count(*) FILTER (WHERE fulfilled_at IS NOT NULL)                        AS fulfilled,
            count(*) FILTER (WHERE fulfilled_at IS NULL AND last_error IS NOT NULL) AS failing,
            COALESCE(sum(requests), 0)                                              AS asks
       FROM subject_requests`
  );
  const t = totals[0];
  console.log(
    `\n  ${t.pending} pending · ${t.fulfilled} fulfilled · ${t.failing} failing · ` +
      `${t.asks} asks recorded in total\n`
  );

  // The queue only moves when something works it. Saying so here is cheaper than wondering why
  // a pending list never shrinks — see the P0 scheduler item in the checklist.
  if (Number(t.pending) > 0) {
    console.log("  The queue is worked by `npm run refresh`. If nothing runs it, this list only grows.\n");
  }

  await closePool();
}

main().catch(async (err) => {
  // A configuration problem is a sentence, not a stack; anything else keeps its stack,
  // because hiding a real fault to look tidy is how it becomes hard to diagnose.
  const known = configProblem(err);
  console.error(known ? `\ndemand failed: ${known}` : err);
  await closePool().catch(() => {});
  process.exit(1);
});
