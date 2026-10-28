import type { PoolClient } from "pg";
import type { TimelineEvent } from "../types";
import { commonName } from "../edgarName";
import { FR_COMPANY_FROM, fetchCompanyYear, frSearchTerm, type YearResult } from "../frCompany";
import { assertCommercialOk, emptyStats, logFetch, shouldBackOff, upsertEvent, type ScoringContext } from "./store";

/**
 * A company's older Federal Register documents, a year at a time (batch 63, 2026-10-26 proposal 1).
 *
 * The daily ask (`fetchCompanyRegulations`) read from 2015, newest first, and kept forty, so every
 * run read the same forty: GM's 51 documents since 2015 reached its page as 40, Duke Energy's 184
 * as 40, and nothing before 2015 at all, though the API answers from 1994. Now the daily ask reads
 * the current year, and each year from 1994 to last year is read once, every page of it, and every
 * document whose title names the company is stored. A year that is over never changes, so it is
 * not asked again: `fr_windows` keeps what was asked (db/031).
 *
 * A year is searched under the names the company had then: its everyday and other names, and each
 * EDGAR former name until the day it stopped (`namesForYear`). "Walmart" finds one document before
 * 2015; "Wal-Mart Stores", its name until 2018, five — among them the FTC's 1999 consent order.
 *
 * Bounded as the GDELT month walk is (`newsBackfill.ts`): years start no earlier than the company's
 * first price, and a company with no prices is not asked (batch 71: asked from 1994, Dow Inc.,
 * listed 2019, kept 2010's "Dow Jones & Company" and "Dow Corning Corporation" notices, and News
 * Corp, whose record begins 2012, the old News Corporation's 2001 antitrust case). A process asks
 * at most `YEARS_PER_RUN` years in all, `GAP_MS` apart, each company's newest first, and stops at
 * the first refusal or failure, logged as any Federal Register failure is so the run-wide back-off
 * sees it. A year is stored only when the Federal Register answered, so a refused one is asked
 * again later.
 */
export const YEARS_PER_RUN = 40;
export const GAP_MS = 1_000;
/** ingest's back-off after a failure */
const BACKOFF_MINUTES = 10;

/** What a process may still ask, shared by every company it ingests. */
export const regulationBudget = { left: YEARS_PER_RUN };

/** A name the company filed under before its current one, and the last day it did (batch 15). */
export interface FormerName {
  name: string;
  until: string;
}

/** The years from `from` to the last one that is over by `today`, newest first. */
export function closedYears(today: string, from = FR_COMPANY_FROM): number[] {
  const years: number[] = [];
  for (let y = Number(today.slice(0, 4)) - 1; y >= Number(from.slice(0, 4)); y--) years.push(y);
  return years;
}

/**
 * The other names a year's documents are searched and matched under: the company's own other
 * names, and each EDGAR former name in use at some point in the year. "Wal-Mart Stores" names
 * Walmart's documents until 2018, the year it stopped, and not after.
 */
export function namesForYear(year: number, alsoKnownAs: readonly string[], former: readonly FormerName[]): string[] {
  const inUse = former.filter((f) => f.until >= `${year}-01-01`).map((f) => commonName(f.name));
  return [...new Set([...alsoKnownAs, ...inUse])];
}

const FORMER = /^EDGAR's company record lists (.+) as a former name of this filer, in use until this day\.$/;

/**
 * The company's EDGAR former names, from the rename events its filings step stores
 * (`renameEvents`, lib/sec.ts): read from the database, so a run on which the filings were not due
 * still searches a year under the names it was searched under before, and is not asked again.
 */
export async function storedFormerNames(client: PoolClient, subjectId: number): Promise<FormerName[]> {
  const { rows } = await client.query<{ until: string; body: string | null }>(
    `SELECT e.occurred_on::text AS until, e.body
       FROM events e
       JOIN event_subjects es ON es.event_id = e.id AND es.subject_id = $1
       JOIN event_attestations a ON a.event_id = e.id
      WHERE a.external_id LIKE 'sec:%:rename:%'`,
    [subjectId]
  );
  return rows
    .map((r) => ({ name: FORMER.exec(r.body ?? "")?.[1] ?? "", until: r.until }))
    .filter((f) => f.name)
    .sort((a, b) => a.until.localeCompare(b.until));
}

/**
 * A document stored before batch 63 carries its department's label ("Federal Register ·
 * Transportation Department"). A label is set when the document is first stored, and the issuing
 * board's is the one routine grouping reads (`pageRegulations`), so a re-read year corrects it.
 */
export async function relabelAgencies(client: PoolClient, events: TimelineEvent[]): Promise<void> {
  if (!events.length) return;
  await client.query(
    `UPDATE event_attestations a SET source_label = v.label
       FROM unnest($1::text[], $2::text[]) AS v(external_id, label), sources s
      WHERE s.key = 'federal_register' AND a.source_id = s.id AND a.external_id = v.external_id
        AND a.source_label IS DISTINCT FROM v.label`,
    [events.map((e) => e.externalId), events.map((e) => e.source)]
  );
}

export interface RegulationPlan {
  /** the company's EDGAR name and its other names, as the daily ask has them */
  edgarName: string;
  alsoKnownAs: string[];
  scoring: ScoringContext;
}

export interface RegulationStats {
  /** years not yet asked under their names */
  due: number;
  read: number;
  /** documents stored from them */
  documents: number;
  left: number;
  /** documents from before the company's first price taken off it, stored before batch 71 */
  unlinked?: number;
  /** why it stopped short, if it did */
  stopped?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Takes the company's Federal Register documents dated before `day` off it; the rows stay. */
async function unlinkBefore(client: PoolClient, subjectId: number, day: string): Promise<number> {
  const { rowCount } = await client.query(
    `DELETE FROM event_subjects es
       USING events e, event_attestations a, sources s
      WHERE es.subject_id = $1 AND e.id = es.event_id AND e.occurred_on < $2::date
        AND a.event_id = es.event_id AND s.id = a.source_id AND s.key = 'federal_register'`,
    [subjectId, day]
  );
  return rowCount ?? 0;
}

/**
 * Asks the Federal Register about the company's years not yet asked under their names, newest
 * first, and stores every document whose title names it. `fetch`, `store`, `former` and `gapMs`
 * are replaceable so the check can run it offline.
 */
export async function backfillRegulations(
  client: PoolClient,
  subjectId: number,
  plan: RegulationPlan,
  {
    today = new Date().toISOString().slice(0, 10),
    budget = regulationBudget,
    gapMs = GAP_MS,
    former,
    fetch = (year, names) => fetchCompanyYear(plan.edgarName, year, names),
    store = async (events) => {
      const stats = emptyStats();
      for (const ev of events) await upsertEvent(client, ev, subjectId, stats, plan.scoring);
      await relabelAgencies(client, events);
    },
  }: {
    today?: string;
    budget?: { left: number };
    gapMs?: number;
    former?: FormerName[];
    fetch?: (year: number, names: string[]) => Promise<YearResult>;
    store?: (events: TimelineEvent[]) => Promise<void>;
  } = {}
): Promise<RegulationStats> {
  const { rows: first } = await client.query<{ listed: string | null }>(
    "SELECT min(on_date)::text AS listed FROM prices WHERE subject_id = $1",
    [subjectId]
  );
  const listed = first[0]?.listed;
  if (!listed) return { due: 0, read: 0, documents: 0, left: 0, stopped: "no prices to start from" };
  // a walk before batch 71 read every company from 1994, and a year once read is not read again,
  // so what it kept from before the company's first price comes off the company here
  const unlinked = listed > FR_COMPANY_FROM ? await unlinkBefore(client, subjectId, listed) : 0;
  const formerNames = former ?? (await storedFormerNames(client, subjectId));
  const { rows } = await client.query<{ starts_on: string; query: string }>(
    "SELECT starts_on::text AS starts_on, query FROM fr_windows WHERE subject_id = $1",
    [subjectId]
  );
  const stored = new Map(rows.map((r) => [r.starts_on, r.query]));
  const due = closedYears(today, listed > FR_COMPANY_FROM ? listed : FR_COMPANY_FROM)
    .map((year) => {
      const names = namesForYear(year, plan.alsoKnownAs, formerNames);
      return { year, names, query: frSearchTerm(plan.edgarName, names) };
    })
    .filter((w) => stored.get(`${w.year}-01-01`) !== w.query);
  const stats: RegulationStats = { due: due.length, read: 0, documents: 0, left: due.length, ...(unlinked ? { unlinked } : {}) };
  if (!due.length) return stats;
  if (budget.left <= 0) return { ...stats, stopped: "this run's years are spent" };

  await assertCommercialOk(client, "federal_register");
  const backoff = await shouldBackOff(client, "federal_register", subjectId, BACKOFF_MINUTES);
  if (backoff) return { ...stats, stopped: `the Federal Register's last attempt ${backoff}` };

  for (const w of due) {
    if (budget.left <= 0) return { ...stats, stopped: "this run's years are spent" };
    budget.left--;
    if (gapMs) await sleep(gapMs);
    const label = `${w.query} · ${w.year}`;
    let result: YearResult;
    try {
      result = await fetch(w.year, w.names);
    } catch (err) {
      result = { events: [], documents: 0, outcome: "error", detail: String(err).slice(0, 200) };
    }
    if (result.outcome === "throttled" || result.outcome === "error") {
      await logFetch(client, "federal_register", subjectId, label, result.outcome, 0, result.httpStatus, result.detail);
      return { ...stats, stopped: result.outcome };
    }
    await client.query("BEGIN");
    try {
      await store(result.events);
      await client.query(
        `INSERT INTO fr_windows (subject_id, starts_on, query, documents, kept) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (subject_id, starts_on) DO UPDATE
            SET query = EXCLUDED.query, documents = EXCLUDED.documents, kept = EXCLUDED.kept, read_at = now()`,
        [subjectId, `${w.year}-01-01`, w.query, result.documents, result.events.length]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      await logFetch(client, "federal_register", subjectId, label, "error", 0, undefined, String(err).slice(0, 200));
      return { ...stats, stopped: "error" };
    }
    stats.read++;
    stats.documents += result.events.length;
    stats.left--;
  }
  return stats;
}
