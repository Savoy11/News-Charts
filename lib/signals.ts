import { getPool } from "./db";
import { RELEVANCE_THRESHOLD } from "./enrich/relevance";

/**
 * Deterministic trend signals.
 *
 * Nothing here is a judgement — it is arithmetic over the event table. Statistics find
 * *where* something happened; explaining *what it means* is a separate, later step that
 * must cite these events. Keeping the two apart is what stops a model inventing a
 * confident narrative out of a pile of headlines.
 */

export type SignalKind =
  | "volume_spike"
  | "regulatory_burst"
  | "cross_peer_cluster"
  | "price_divergence";

export interface Signal {
  kind: SignalKind;
  windowStart: string;
  windowEnd: string;
  /** how far above normal, in robust deviations (or % for price) */
  magnitude: number;
  headline: string;
  detail: string;
  /** the evidence — every signal carries the rows that produced it */
  eventIds: number[];
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Median absolute deviation — robust to the very spikes we're hunting for. */
function mad(xs: number[]): number {
  if (!xs.length) return 0;
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}

/**
 * A week counts as a spike when it clears the robust baseline *and* an absolute floor.
 * The floor matters: without it, 2 events against a baseline of 0 looks infinitely
 * significant and every quiet sector produces noise.
 */
function isSpike(
  n: number,
  baseline: number,
  spread: number,
  floor: number,
  sigma: number
): boolean {
  if (n < floor) return false;
  const threshold = spread > 0 ? baseline + sigma * spread : baseline + sigma + 1;
  return n >= threshold;
}

/** Tunable per visitor; defaults match lib/prefs.ts. */
export interface SignalOptions {
  floor: number;
  sigma: number;
  divergencePct: number;
}

export const DEFAULT_SIGNAL_OPTIONS: SignalOptions = {
  floor: 5,
  sigma: 2,
  divergencePct: 15,
};

interface WeekRow {
  wk: string;
  kind: string;
  n: number;
  ids: number[];
}

async function weeklyCounts(scopeIds: number[], since: string): Promise<WeekRow[]> {
  const { rows } = await getPool().query(
    `WITH scope AS (SELECT unnest($1::bigint[]) AS id)
     SELECT to_char(date_trunc('week', e.occurred_on), 'YYYY-MM-DD') AS wk,
            e.kind::text AS kind,
            count(DISTINCT e.id)      AS n,
            array_agg(DISTINCT e.id)  AS ids
       FROM events e
       JOIN event_subjects es ON es.event_id = e.id
       JOIN scope sc ON sc.id = es.subject_id
      WHERE e.occurred_on >= $2
        -- the same display gate the timeline applies, from the same constant — a hardcoded
        -- copy here once let a threshold change desync signals from what the page shows
        AND (es.relevance IS NULL OR es.relevance >= ${RELEVANCE_THRESHOLD})
      GROUP BY 1, 2
      ORDER BY 1`,
    [scopeIds, since]
  );
  return rows.map((r) => ({
    wk: r.wk,
    kind: r.kind,
    n: Number(r.n),
    ids: (r.ids as string[]).map(Number),
  }));
}

/** Weeks where one event concerned several peers at once — the clearest sector signal. */
async function crossPeerWeeks(memberIds: number[], since: string) {
  const { rows } = await getPool().query(
    `SELECT to_char(date_trunc('week', e.occurred_on), 'YYYY-MM-DD') AS wk,
            count(*) AS shared,
            max(peers) AS widest,
            array_agg(id) AS ids
       FROM (
         SELECT e.id, e.occurred_on, count(DISTINCT m.id) AS peers
           FROM events e
           JOIN event_subjects es ON es.event_id = e.id
           JOIN subjects m ON m.id = es.subject_id AND m.kind = 'company'
                          AND m.id = ANY($1::bigint[])
          WHERE e.occurred_on >= $2
          GROUP BY e.id, e.occurred_on
         HAVING count(DISTINCT m.id) > 1
       ) e
      GROUP BY 1 ORDER BY 1`,
    [memberIds, since]
  );
  return rows.map((r) => ({
    wk: r.wk,
    shared: Number(r.shared),
    widest: Number(r.widest),
    ids: (r.ids as string[]).map(Number),
  }));
}

/**
 * The diverging company's own events in the window. Every other signal ships the rows
 * that produced it; without this, price divergence would be the one anomaly a model
 * could not explain with sources — and an uncited explanation is the failure mode the
 * whole statistics-first design exists to avoid.
 */
async function eventsForDivergence(subjectId: number, since: string): Promise<number[]> {
  const { rows } = await getPool().query(
    `SELECT e.id
       FROM events e
       JOIN event_subjects es ON es.event_id = e.id AND es.subject_id = $1
      WHERE e.occurred_on >= $2
        AND e.kind IN ('earnings','filing','news')
        -- the same display gate the timeline applies, from the same constant — a hardcoded
        -- copy here once let a threshold change desync signals from what the page shows
        AND (es.relevance IS NULL OR es.relevance >= ${RELEVANCE_THRESHOLD})
      ORDER BY e.occurred_on DESC
      LIMIT 25`,
    [subjectId, since]
  );
  return rows.map((r) => Number(r.id));
}

/** A member whose return over the window diverges most from its peers'. */
async function priceDivergence(memberIds: number[], since: string) {
  const { rows } = await getPool().query(
    `WITH members AS (
       SELECT id, ticker FROM subjects WHERE id = ANY($1::bigint[])
     ), bounds AS (
       SELECT p.subject_id,
              (array_agg(p.close ORDER BY p.on_date))[1]                      AS first_close,
              (array_agg(p.close ORDER BY p.on_date DESC))[1]                 AS last_close,
              min(p.on_date) AS d0, max(p.on_date) AS d1
         FROM prices p JOIN members m ON m.id = p.subject_id
        WHERE p.on_date >= $2
        GROUP BY p.subject_id
     )
     SELECT m.id, m.ticker,
            round(((b.last_close - b.first_close) / b.first_close * 100)::numeric, 1) AS pct,
            to_char(b.d0,'YYYY-MM-DD') AS d0, to_char(b.d1,'YYYY-MM-DD') AS d1
       FROM bounds b JOIN members m ON m.id = b.subject_id
      WHERE b.first_close > 0`,
    [memberIds, since]
  );
  return rows.map((r) => ({ id: Number(r.id), ticker: r.ticker, pct: Number(r.pct), d0: r.d0, d1: r.d1 }));
}

function weekEnd(wk: string): string {
  const d = new Date(`${wk}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

/**
 * `scopeIds` is everything whose events count (an industry subject plus its members, or
 * just a custom set of companies); `memberIds` is the companies among them, which is what
 * peer clustering and price divergence compare.
 */
export async function computeSignals(
  scopeIds: number[],
  memberIds: number[],
  since: string,
  opts: SignalOptions = DEFAULT_SIGNAL_OPTIONS
): Promise<Signal[]> {
  if (!scopeIds.length) return [];
  const [weeks, shared, prices] = await Promise.all([
    weeklyCounts(scopeIds, since),
    crossPeerWeeks(memberIds, since),
    priceDivergence(memberIds, since),
  ]);

  const signals: Signal[] = [];

  // --- volume spikes, computed per kind so a filing season doesn't mask a news burst
  const byKind = new Map<string, WeekRow[]>();
  for (const w of weeks) {
    byKind.set(w.kind, [...(byKind.get(w.kind) ?? []), w]);
  }
  for (const [kind, rows] of byKind) {
    const counts = rows.map((r) => r.n);
    const base = median(counts);
    const spread = mad(counts);
    // regulations arrive in a steadier stream than news, so they need a slightly lower bar
    const floor = kind === "regulation" ? Math.max(2, opts.floor - 1) : opts.floor;
    for (const r of rows) {
      if (!isSpike(r.n, base, spread, floor, opts.sigma)) continue;
      signals.push({
        kind: kind === "regulation" ? "regulatory_burst" : "volume_spike",
        windowStart: r.wk,
        windowEnd: weekEnd(r.wk),
        magnitude: spread > 0 ? Number(((r.n - base) / spread).toFixed(1)) : r.n - base,
        headline: `${r.n} ${kind} events in one week`,
        detail: `baseline ${base}/week (robust spread ${spread})`,
        eventIds: r.ids.slice(0, 40),
      });
    }
  }

  // --- weeks where the same event hit several peers
  for (const s of shared) {
    signals.push({
      kind: "cross_peer_cluster",
      windowStart: s.wk,
      windowEnd: weekEnd(s.wk),
      magnitude: s.widest,
      headline: `${s.shared} event${s.shared === 1 ? "" : "s"} touching up to ${s.widest} peers`,
      detail: "one story concerning several companies in the sector at once",
      eventIds: s.ids.slice(0, 40),
    });
  }

  // --- one member moving unlike the rest
  if (prices.length >= 2) {
    const med = median(prices.map((p) => p.pct));
    const worst = [...prices].sort(
      (a, b) => Math.abs(b.pct - med) - Math.abs(a.pct - med)
    )[0];
    const gap = Number((worst.pct - med).toFixed(1));
    if (Math.abs(gap) >= opts.divergencePct) {
      const cites = await eventsForDivergence(worst.id, since);
      signals.push({
        kind: "price_divergence",
        windowStart: worst.d0,
        windowEnd: worst.d1,
        magnitude: gap,
        headline: `${worst.ticker} ${gap > 0 ? "outran" : "lagged"} the sector by ${Math.abs(gap)} points`,
        detail: `${worst.ticker} ${worst.pct}% vs sector median ${med}%`,
        eventIds: cites,
      });
    }
  }

  return signals.sort(
    (a, b) => b.windowStart.localeCompare(a.windowStart) || Math.abs(b.magnitude) - Math.abs(a.magnitude)
  );
}
