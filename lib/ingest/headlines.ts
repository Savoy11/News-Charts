import type { PoolClient } from "pg";
import type { TimelineEvent } from "../types";
import { HEADLINE_VERSION, edgarFetch, mayCarryRelease, readFilingHeadline, withHeadline, type HeadlineRead } from "../secHeadlines";

/**
 * 8-K and 6-K headlines at ingest (batches 42 and 43): the ones already read are applied from
 * `sec_headlines`, and a run's worth of the rest are read from EDGAR and stored.
 *
 * Bounded twice. A run reads at most `HEADLINES_PER_RUN` filings, newest first, so a long history
 * fills in over a few runs rather than holding one run for minutes — Ford has 777 8-Ks. And it
 * stops at the first refusal or after a few failures in a row, so a throttled EDGAR costs one
 * request rather than hundreds; what it did not read waits for the next run. A filing that could
 * not be read is not stored, so it is asked again; one read and found to have no headline is
 * stored as such and never asked again.
 */
export const HEADLINES_PER_RUN = 150;
/** Between EDGAR requests: its fair-access limit is 10 a second, and this stays under 8. */
const REQUEST_GAP_MS = 130;
const MAX_FAILURES_IN_A_ROW = 3;

export interface HeadlineStats {
  /** 8-Ks and 6-Ks that can carry a release */
  eligible: number;
  /** read this run */
  read: number;
  /** of those, with a headline */
  found: number;
  failed: number;
  /** still to read, for a later run */
  left: number;
  /** events that went out with a headline title */
  titled: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A stored reading: the headline (null for none), the document it came from, the version read by. */
export interface StoredHeadline {
  headline: string | null;
  exhibit?: string | null;
  version: number;
}

/** What is stored for these accessions. */
export async function storedHeadlines(client: PoolClient, accessions: string[]): Promise<Map<string, StoredHeadline>> {
  const out = new Map<string, StoredHeadline>();
  if (!accessions.length) return out;
  const { rows } = await client.query<{ accession: string; headline: string | null; exhibit: string | null; version: number }>(
    "SELECT accession, headline, exhibit, version FROM sec_headlines WHERE accession = ANY($1::text[])",
    [accessions]
  );
  for (const r of rows) out.set(r.accession, { headline: r.headline, exhibit: r.exhibit, version: Number(r.version) });
  return out;
}

export async function storeHeadline(client: PoolClient, accession: string, read: HeadlineRead): Promise<void> {
  await client.query(
    `INSERT INTO sec_headlines (accession, headline, exhibit, version) VALUES ($1, $2, $3, $4)
     ON CONFLICT (accession) DO UPDATE
        SET headline = EXCLUDED.headline, exhibit = EXCLUDED.exhibit, version = EXCLUDED.version, read_at = now()`,
    [accession, read.headline, read.exhibit, HEADLINE_VERSION]
  );
}

/**
 * The events, each 8-K or 6-K with a stored headline retitled by it and linked to the document it
 * came from. Reads nothing from EDGAR.
 */
export function applyHeadlines(
  events: TimelineEvent[],
  stored: Map<string, { headline: string | null; exhibit?: string | null }>
): TimelineEvent[] {
  return events.map((ev) => {
    const read = ev.externalId ? stored.get(ev.externalId) : undefined;
    return read?.headline && mayCarryRelease(ev) ? withHeadline(ev, read.headline, read.exhibit) : ev;
  });
}

/**
 * EDGAR requests spaced `gapMs` apart, which also notes a refusal (403, 429) so the run can stop
 * at the first one instead of spending its budget on more.
 */
function pacedEdgar(gapMs: number) {
  let last = 0;
  const state = { refused: false };
  const get = async (url: string): Promise<Response> => {
    const wait = last + gapMs - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await edgarFetch(url);
    if (res.status === 403 || res.status === 429) state.refused = true;
    return res;
  };
  return { get, state };
}

type Reader = (cik: string, accession: string) => Promise<HeadlineRead | null>;

/**
 * The record a filing lives in, from its address: a predecessor's for a filing made before a new
 * parent took the ticker (`lib/predecessors.ts`). EDGAR serves a filing only under a CIK that
 * filed it, so read under the company's present CIK it would answer 404, and a 404 is stored as
 * "no headline" for good.
 */
const filerCik = (url: string | undefined): string | null => /\/Archives\/edgar\/data\/(\d+)\//.exec(url ?? "")?.[1] ?? null;

/**
 * A company's filings with their 8-K and 6-K headlines: those stored applied, and up to `limit`
 * more read from EDGAR first. `read` is replaceable so the check can run it offline.
 */
export async function withSecHeadlines(
  client: PoolClient,
  cik: string,
  events: TimelineEvent[],
  { limit = HEADLINES_PER_RUN, read }: { limit?: number; read?: Reader } = {}
): Promise<{ events: TimelineEvent[]; stats: HeadlineStats }> {
  const eligible = events.filter(mayCarryRelease);
  const stored = await storedHeadlines(client, eligible.map((e) => e.externalId!));
  const due = eligible
    .filter((e) => (stored.get(e.externalId!)?.version ?? 0) < HEADLINE_VERSION)
    .sort((a, b) => b.date.localeCompare(a.date));
  const stats: HeadlineStats = { eligible: eligible.length, read: 0, found: 0, failed: 0, left: 0, titled: 0 };
  const edgar = pacedEdgar(REQUEST_GAP_MS);
  const reader: Reader = read ?? ((c, a) => readFilingHeadline(c, a, edgar.get));
  let failuresInARow = 0;
  for (const ev of due.slice(0, limit)) {
    let got: HeadlineRead | null = null;
    try {
      got = await reader(filerCik(ev.url) ?? cik, ev.externalId!);
    } catch {
      got = null;
    }
    if (got) {
      await storeHeadline(client, ev.externalId!, got);
      stored.set(ev.externalId!, { headline: got.headline, exhibit: got.exhibit, version: HEADLINE_VERSION });
      stats.read++;
      if (got.headline) stats.found++;
      failuresInARow = 0;
    } else {
      stats.failed++;
      if (edgar.state.refused || ++failuresInARow >= MAX_FAILURES_IN_A_ROW) break;
    }
  }
  stats.left = due.length - stats.read;
  const titled = applyHeadlines(events, stored);
  stats.titled = titled.filter((e, i) => e !== events[i]).length;
  return { events: titled, stats };
}
