import type { PoolClient } from "pg";
import type { FetchResult, TimelineEvent } from "../types";
import { fetchNews, gdeltQuery, type NewsWindow } from "../news";
import { mentions } from "../enrich/relevance";
import { collapseNearDuplicates } from "../newsQuality";
import { MEASURED_WORD_NAMES, everydayWordName, namedWithCapital } from "../wordNames";
import { assertCommercialOk, emptyStats, logFetch, shouldBackOff, upsertEvent, type ScoringContext } from "./store";

/**
 * A company's older news, a month at a time (batch 57).
 *
 * The hourly ask (`fetchNews`, newest first) returns GDELT's newest hundred pages, which for a busy
 * company is its last few days, so a page's news began about when the company was first ingested.
 * The hourly ask's floor is 2017: each month since then is asked once more, by relevance, for the
 * hundred pages most about the company, and a story is kept only when its headline names the
 * company the way headline scoring counts naming. That leaves out the passing mentions a relevance
 * sort still lets in, and the other uses of a common word.
 *
 * A month, because a span's hundred are spread thinner the longer it is. Asked for all of 2021,
 * Ford's hundred all came from October to December; for the first quarter of 2021 they gave 55
 * stories naming Ford; for February 2021 alone, 52.
 *
 * Bounded three ways:
 * - Months start no earlier than the company's first price, so the years before it listed, when
 *   "Snowflake" was the weather, are not asked. A company with no prices is not asked at all.
 * - A process asks at most `WINDOWS_PER_RUN` months in all, each company's newest first and
 *   `GAP_MS` apart (GDELT allows one request every five seconds), so an hourly refresh spends at
 *   most four minutes on it and a company's 117 months since 2017 fill in over three of its runs.
 * - It stops at the first refusal or failure, logged as any GDELT failure is so the run-wide
 *   back-off sees it. A month is stored only when GDELT answered, so a refused one is asked again
 *   on a later run.
 * - A company asked under one everyday word ("Target", "Southern", "Crown") is held back until a
 *   month of its own is measured (`MEASURED_WORD_NAMES` in lib/wordNames.ts): "the headline names
 *   it" is true of the word. One month of Target kept "IMF urges retaining 5 % inflation target"
 *   (the 2026-10-26 audit).
 */
export const BACKFILL_FROM = "2017-01-01";
export const WINDOWS_PER_RUN = 40;
export const GAP_MS = 6_000;
/** ingest's back-off after a GDELT failure */
const BACKOFF_MINUTES = 10;

/** What a process may still ask, shared by every company it ingests. */
export const backfillBudget = { left: WINDOWS_PER_RUN };

const day = (d: Date) => d.toISOString().slice(0, 10);

/** The calendar months from the one holding `since` that are over by `today`, newest first. */
export function newsWindows(today: string, since = BACKFILL_FROM): NewsWindow[] {
  const start = since > BACKFILL_FROM ? since : BACKFILL_FROM;
  const windows: NewsWindow[] = [];
  for (let i = 0; ; i++) {
    const year = Number(start.slice(0, 4));
    const month = Number(start.slice(5, 7)) - 1 + i; // Date.UTC carries a 13th month into the next year
    const from = day(new Date(Date.UTC(year, month, 1)));
    const to = day(new Date(Date.UTC(year, month + 1, 0)));
    if (to >= today) break;
    windows.push({ from, to });
  }
  return windows.reverse();
}

/** Whether a GDELT headline names the company, by the names its headlines are scored with. */
export function namesCompany(title: string, aliases: string[]): boolean {
  // GDELT spaces punctuation off its word ("Rep . McDonald"), which would hide the "Rep." before it
  return mentions(title.replace(/\s+([.,:;!?])/g, "$1"), aliases) === "named";
}

export interface BackfillPlan {
  /** the company's GDELT query and names, as the hourly ask has them (`gdeltNewsPlan`) */
  query: string;
  alsoKnownAs: string[];
  byRelevance: boolean;
  scoring: ScoringContext;
}

export interface BackfillStats {
  /** months not yet asked under this query */
  due: number;
  read: number;
  /** stories kept from them */
  stories: number;
  left: number;
  /** why it stopped short of its budget, if it did */
  stopped?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Asks GDELT about the company's months not yet asked under today's query, newest first, and
 * stores the stories whose headline names it. `fetch`, `store` and `gapMs` are replaceable so the
 * check can run it offline.
 */
export async function backfillNews(
  client: PoolClient,
  subjectId: number,
  plan: BackfillPlan,
  {
    today = day(new Date()),
    budget = backfillBudget,
    gapMs = GAP_MS,
    fetch = (window) => fetchNews(plan.query, plan.alsoKnownAs, { byRelevance: plan.byRelevance, window }),
    store = async (events) => {
      const stats = emptyStats();
      for (const ev of events) await upsertEvent(client, ev, subjectId, stats, plan.scoring);
    },
  }: {
    today?: string;
    budget?: { left: number };
    gapMs?: number;
    fetch?: (window: NewsWindow) => Promise<FetchResult>;
    store?: (events: TimelineEvent[]) => Promise<void>;
  } = {}
): Promise<BackfillStats> {
  const asked = gdeltQuery(plan.query, plan.alsoKnownAs, plan.byRelevance);
  const { rows: first } = await client.query<{ listed: string | null }>(
    "SELECT min(on_date)::text AS listed FROM prices WHERE subject_id = $1",
    [subjectId]
  );
  const listed = first[0]?.listed;
  if (!listed) return { due: 0, read: 0, stories: 0, left: 0, stopped: "no prices to start from" };
  const { rows } = await client.query<{ starts_on: string; query: string }>(
    "SELECT starts_on::text AS starts_on, query FROM gdelt_windows WHERE subject_id = $1",
    [subjectId]
  );
  const stored = new Map(rows.map((r) => [r.starts_on, r.query]));
  const due = newsWindows(today, listed).filter((w) => stored.get(w.from) !== asked);
  const stats: BackfillStats = { due: due.length, read: 0, stories: 0, left: due.length };
  if (!due.length) return stats;
  const word = everydayWordName(plan.query);
  if (word && !MEASURED_WORD_NAMES[word]) return { ...stats, stopped: `"${word.toLowerCase()}" is an everyday word, not yet measured` };
  if (budget.left <= 0) return { ...stats, stopped: "this run's months are spent" };

  await assertCommercialOk(client, "gdelt");
  const backoff = await shouldBackOff(client, "gdelt", subjectId, BACKOFF_MINUTES);
  if (backoff) return { ...stats, stopped: `GDELT's last attempt ${backoff}` };

  for (const window of due) {
    if (budget.left <= 0) return { ...stats, stopped: "this run's months are spent" };
    budget.left--;
    if (gapMs) await sleep(gapMs);
    const label = `${asked} · ${window.from} to ${window.to}`;
    let result: FetchResult;
    try {
      result = await fetch(window);
    } catch (err) {
      result = { events: [], outcome: "error", detail: String(err).slice(0, 200) };
    }
    if (result.outcome === "throttled" || result.outcome === "error") {
      await logFetch(client, "gdelt", subjectId, label, result.outcome, 0, result.httpStatus, result.detail);
      return { ...stats, stopped: result.outcome };
    }
    // dedupe after the filter: syndicated copies of one story are one story
    const kept = collapseNearDuplicates(
      result.events.filter((e) => namesCompany(e.title, plan.scoring.aliases) && (!word || namedWithCapital(e.title, word)))
    );
    await client.query("BEGIN");
    try {
      await store(kept);
      await client.query(
        `INSERT INTO gdelt_windows (subject_id, starts_on, query, articles, kept) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (subject_id, starts_on) DO UPDATE
            SET query = EXCLUDED.query, articles = EXCLUDED.articles, kept = EXCLUDED.kept, read_at = now()`,
        [subjectId, window.from, asked, result.events.length, kept.length]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      await logFetch(client, "gdelt", subjectId, label, "error", 0, undefined, String(err).slice(0, 200));
      return { ...stats, stopped: "error" };
    }
    stats.read++;
    stats.stories += kept.length;
    stats.left--;
  }
  return stats;
}
