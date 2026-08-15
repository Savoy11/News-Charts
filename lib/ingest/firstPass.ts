import { Pool, type PoolClient } from "pg";
import { getTopicTimeline, articleAnswersSlug } from "../wiki";
import { resolveCompany, getFilings, commonName } from "../sec";
import { getDailyPrices } from "../prices";
import { aliasesFor } from "../enrich/relevance";
import { withTimeout, timedOut } from "../timeout";
import {
  ensureSources,
  upsertEvent,
  upsertSubject,
  upsertTopicSubject,
  logFetch,
  emptyStats,
  type ScoringContext,
} from "./store";

/**
 * The bounded first pass: what runs, once, when somebody searches a subject nobody holds.
 *
 * Commit 813d505 removed live fetching from the render path for four reasons, and this module
 * is a QUANTITATIVE, not categorical, partial return of it — each reason answered with a number
 * we choose rather than one traffic chooses:
 *
 *  - "the visitor waited on eleven feeds inline"  → tier 1 is ONLY what flips the page's own
 *    render gate: Wikipedia for a topic (`events.length`), EDGAR + the Yahoo chart for a
 *    company (`events.length && prices.length`). GDELT (sleeps 5.5s twice when throttled),
 *    Chronicling America (sleeps 4s), Internet Archive, and every keyed feed stay on the
 *    scheduler, which deepens the page on its next pass via the request queue.
 *  - "several arriving together each triggered their own fetch"  → the attempt ledger is
 *    claimed in ONE statement before any fetch (the loser's INSERT conflicts and its WHERE
 *    fails), an advisory lock excludes the scheduler from the same subject, and a dedicated
 *    `max: 2` pool with a 250ms connect timeout bounds concurrency across DIFFERENT subjects —
 *    the herd a per-slug claim cannot touch. The third simultaneous miss sheds load and
 *    renders today's notice, which is the product working, not failing.
 *  - "a database outage turned every page view into a live fetch"  → permission to fetch IS a
 *    database write. No claim, no fetch: an outage produces less traffic than a healthy day.
 *  - "cost became a function of traffic"  → cost is a function of DISTINCT NEW SUBJECTS per
 *    cooldown window, plus a bounded retry schedule for slugs that never resolve
 *    (30m → 2h → 8h → dead for a week). The deadline below bounds the visitor's wait;
 *    the ledger is what bounds spend — `withTimeout` abandons rather than cancels, so a
 *    fetch that misses the deadline still completes and still writes.
 */

/** Sources the first pass may reach. Asserted keyless/unmetered by scripts/check-ondemand.ts. */
export const FIRST_PASS_SOURCES = ["wikipedia", "sec_edgar", "yahoo_finance"] as const;

/** How long a visitor's first search may wait on the gather before we fall back to the notice. */
export const FIRST_PASS_BUDGET_MS = 8_000;

/** Minimum minutes between attempts for one slug — the only per-slug bound for unresolvable ones. */
export const ATTEMPT_COOLDOWN_MINUTES = 360;

/** Consecutive resolve failures → backoff. Indexed by failures-so-far, minutes. */
const FAILURE_BACKOFF_MINUTES = [30, 120, 480, 7 * 24 * 60];

export type FirstPassOutcome =
  | "ingested" //   tier 1 landed; the page can re-read and render
  | "already_attempted" // someone else holds or recently held the claim — re-read, don't fetch
  | "unresolvable" //   the sources say this names nothing we can chart
  | "unavailable"; //   no database, no budget, or the pool is saturated — today's notice path

/**
 * A dedicated two-connection pool for first-pass writes.
 *
 * Not the shared read pool (`max: 4` in lib/db.ts) on purpose: a slow gather must never
 * become a site-wide read outage. `connectionTimeoutMillis` is load-bearing — pg-pool's
 * default is NO timeout, so without it the third concurrent miss would queue forever,
 * pinning its HTTP request, instead of shedding to the notice.
 */
let ingestPool: Pool | null = null;
function getIngestPool(): Pool {
  if (!ingestPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    ingestPool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 250 });
  }
  return ingestPool;
}

/**
 * One statement, one claim. A row comes back iff this caller won the right to fetch: the
 * fresh insert wins, and a conflicting insert wins only when the cooldown has expired and
 * the slug is not dead. Losers read `already_attempted` and simply re-read the corpus —
 * by the time the winner commits, that read finds the events.
 */
async function claimAttempt(client: PoolClient, slug: string, kind: "topic" | "company"): Promise<boolean> {
  const { rows } = await client.query(
    `INSERT INTO first_pass_attempts (slug, kind) VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE
        SET attempted_at = now()
      WHERE first_pass_attempts.attempted_at < now() - ($3 || ' minutes')::interval
        AND (first_pass_attempts.dead_until IS NULL OR first_pass_attempts.dead_until < now())
     RETURNING slug`,
    [slug, kind, String(ATTEMPT_COOLDOWN_MINUTES)]
  );
  return rows.length > 0;
}

/** A resolve failure: bump the count and push `dead_until` out exponentially. */
async function recordFailure(client: PoolClient, slug: string): Promise<void> {
  await client.query(
    `UPDATE first_pass_attempts
        SET failures = failures + 1,
            dead_until = now() + (
              ($2::text[])[LEAST(failures + 1, $3)] || ' minutes'
            )::interval
      WHERE slug = $1`,
    [slug, FAILURE_BACKOFF_MINUTES.map(String), FAILURE_BACKOFF_MINUTES.length]
  );
}

async function recordSuccess(client: PoolClient, slug: string): Promise<void> {
  await client.query(
    `UPDATE first_pass_attempts SET failures = 0, dead_until = NULL WHERE slug = $1`,
    [slug]
  );
}

/**
 * The same lock the scheduler takes around a subject's refresh (scripts/refresh.ts), so the
 * two writers exclude each other. Advisory, session-scoped, and held on ONE client from
 * `connect()` — pg-pool releases a client back to the idle pool without DISCARD ALL, so a
 * lock taken through `pool.query()` would ride back into the pool still held.
 */
export function subjectLockKey(slug: string): [number, number] {
  // Two int32s from a stable string hash — the classspace 42 keeps us clear of other users.
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (Math.imul(h, 31) + slug.charCodeAt(i)) | 0;
  return [42, h];
}

/**
 * First pass for a topic: Wikipedia is both the existence test and the whole tier — its
 * timeline alone flips the topic page's render gate.
 */
export async function firstPassTopic(rawSlug: string): Promise<FirstPassOutcome> {
  const slug = rawSlug.trim().toLowerCase();
  if (!slug) return "unresolvable";

  let client: PoolClient;
  try {
    client = await getIngestPool().connect();
  } catch {
    // Saturated or unreachable: no claim, no fetch. Less traffic than a healthy day.
    return "unavailable";
  }

  try {
    if (!(await claimAttempt(client, slug, "topic"))) return "already_attempted";

    const [k1, k2] = subjectLockKey(slug);
    const { rows: lock } = await client.query<{ ok: boolean }>(
      "SELECT pg_try_advisory_lock($1, $2) AS ok",
      [k1, k2]
    );
    if (!lock[0]?.ok) return "already_attempted";

    try {
      const wiki = await withTimeout(getTopicTimeline(slug), FIRST_PASS_BUDGET_MS);
      if (timedOut(wiki) || !wiki) {
        // Timed out is not "names nothing" — but for the visitor's purposes both mean the
        // notice today; the distinction lives in the ledger (a timeout retries sooner
        // than a dead slug because failures only accrue toward death on a real miss).
        if (!timedOut(wiki)) await recordFailure(client, slug);
        return "unresolvable";
      }

      /**
       * Wikipedia always answers. That is the whole problem.
       *
       * Search stopped minting topics in the 2026-08-08 scope refocus, but a slug typed straight
       * into the URL bar still arrives here — and asked for `best-buy-earnings-q3`, Wikipedia's
       * search returns **TaxAct**, with 21 events (verified live 2026-08-12). Minting that would
       * give a visitor a complete, confident timeline for a company they never asked about, which
       * is worse than the notice they get for a miss: a page that is honestly empty says so, and
       * this one would not.
       *
       * Recorded as a real failure rather than a timeout, because it is one: this slug names
       * nothing we can chart, and the retry ladder should treat it that way.
       */
      if (!articleAnswersSlug(slug, wiki.title)) {
        await recordFailure(client, slug);
        return "unresolvable";
      }

      await ensureSources(client);
      const subjectId = await upsertTopicSubject(client, {
        searchTerm: slug,
        wikipediaTitle: wiki.title,
        displayName: wiki.title,
        summary: wiki.summary,
        firstEventOn: wiki.events[0]?.date ?? null,
      });

      const ctx = { kind: "topic" as const, displayName: wiki.title };
      const scoring: ScoringContext = { subject: ctx, aliases: aliasesFor(ctx, [slug]) };
      const stats = emptyStats();
      await client.query("BEGIN");
      try {
        for (const ev of wiki.events) await upsertEvent(client, ev, subjectId, stats, scoring);
        await logFetch(client, "wikipedia", subjectId, slug, wiki.events.length ? "ok" : "empty", wiki.events.length, 200);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
      await recordSuccess(client, slug);
      return "ingested";
    } finally {
      await client.query("SELECT pg_advisory_unlock($1, $2)", [k1, k2]).catch(() => {});
    }
  } catch {
    return "unavailable";
  } finally {
    client.release();
  }
}

/**
 * First pass for a company: EDGAR filings and the Yahoo chart — the two sources whose
 * conjunction flips the company page's render gate. Industry linking, the official domain,
 * the Wikipedia backstory and every news feed stay on the scheduler: they enrich a page
 * that already renders, so they are not worth a visitor's seconds.
 */
export async function firstPassCompany(rawQuery: string): Promise<FirstPassOutcome> {
  const query = rawQuery.trim();
  if (!query) return "unresolvable";
  const ledgerSlug = `co:${query.toLowerCase()}`;

  let client: PoolClient;
  try {
    client = await getIngestPool().connect();
  } catch {
    return "unavailable";
  }

  try {
    if (!(await claimAttempt(client, ledgerSlug, "company"))) return "already_attempted";

    const resolved = await withTimeout(resolveCompany(query), FIRST_PASS_BUDGET_MS / 2);
    if (timedOut(resolved) || !resolved) {
      if (!timedOut(resolved)) await recordFailure(client, ledgerSlug);
      return "unresolvable";
    }

    const [k1, k2] = subjectLockKey(resolved.ticker.toLowerCase());
    const { rows: lock } = await client.query<{ ok: boolean }>(
      "SELECT pg_try_advisory_lock($1, $2) AS ok",
      [k1, k2]
    );
    if (!lock[0]?.ok) return "already_attempted";

    try {
      const gathered = await withTimeout(
        Promise.all([getFilings(resolved), getDailyPrices(resolved.ticker)]),
        FIRST_PASS_BUDGET_MS
      );
      if (timedOut(gathered)) return "unresolvable";
      const [filings, daily] = gathered;
      if (!filings.length || !daily.points.length) {
        // A real company with no reachable filings or prices cannot clear the render gate;
        // count it toward the backoff so a delisted shell doesn't retry every cooldown.
        await recordFailure(client, ledgerSlug);
        return "unresolvable";
      }

      await ensureSources(client);
      const subjectId = await upsertSubject(client, {
        kind: "company",
        slug: resolved.ticker.toLowerCase(),
        displayName: resolved.name,
        ticker: resolved.ticker,
        cik: resolved.cik,
      });

      const ctx = { kind: "company" as const, displayName: resolved.name, ticker: resolved.ticker };
      const scoring: ScoringContext = {
        subject: ctx,
        aliases: aliasesFor(ctx, [commonName(resolved.name)]),
      };
      const stats = emptyStats();
      await client.query("BEGIN");
      try {
        for (const ev of filings) await upsertEvent(client, ev, subjectId, stats, scoring);
        for (const ev of daily.actions) await upsertEvent(client, ev, subjectId, stats, scoring);
        await logFetch(client, "sec_edgar", subjectId, resolved.ticker, "ok", filings.length, 200);
        await client.query(
          `INSERT INTO prices (subject_id, on_date, close, volume)
           SELECT $1, d, c, v FROM unnest($2::date[], $3::numeric[], $4::bigint[]) AS t(d, c, v)
           ON CONFLICT (subject_id, on_date) DO UPDATE
              SET close = EXCLUDED.close,
                  volume = COALESCE(EXCLUDED.volume, prices.volume)`,
          [
            subjectId,
            daily.points.map((p) => p.time),
            daily.points.map((p) => p.value),
            daily.points.map((p) => p.volume ?? null),
          ]
        );
        await logFetch(client, "yahoo_finance", subjectId, resolved.ticker, "ok", daily.actions.length, 200);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
      await recordSuccess(client, ledgerSlug);
      return "ingested";
    } finally {
      await client.query("SELECT pg_advisory_unlock($1, $2)", [k1, k2]).catch(() => {});
    }
  } catch {
    return "unavailable";
  } finally {
    client.release();
  }
}
