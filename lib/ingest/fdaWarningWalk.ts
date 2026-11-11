import type { PoolClient } from "pg";
import { fetchLetters, warningLetterEvents, type LettersAnswer, type WarningLetter } from "../fdaWarningLetters";
import { isNotesRecord } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The FDA's warning-letter list, read whole for every company at once (batch 140): once a week, at
 * most one read a process. Every letter is kept, whoever it went to; a read updates the letters it
 * gives and never removes one, since a letter once posted stays the FDA's record.
 */
export const READ_EVERY_DAYS = 7;

/** What a process may still ask, shared by every company it ingests: one read of the list. */
export const warningBudget = { left: 1 };

export interface WarningWalk {
  due: boolean;
  read?: "stored";
  pages: number;
  letters: number;
  stopped?: string;
  failure?: { outcome: "throttled" | "error"; httpStatus?: number; detail?: string };
}

/** Reads the list when the last read is `READ_EVERY_DAYS` old or there is none. `fetchList` is replaceable so the check can run it offline. */
export async function walkWarningLetters(
  client: PoolClient,
  { budget = warningBudget, fetchList = fetchLetters }: { budget?: { left: number }; fetchList?: () => Promise<LettersAnswer> } = {},
): Promise<WarningWalk> {
  const { rows } = await client.query<{ stale: boolean }>(
    `SELECT read_at < now() - make_interval(days => ${READ_EVERY_DAYS}) AS stale FROM fda_warning_reads WHERE id = 1`,
  );
  if (rows.length && !rows[0].stale) return { due: false, pages: 0, letters: 0 };
  if (budget.left <= 0) return { due: true, pages: 0, letters: 0, stopped: "this run's read is spent" };
  budget.left--;
  let got: LettersAnswer;
  try {
    got = await fetchList();
  } catch (err) {
    got = { letters: [], total: -1, pages: 0, outcome: "error", detail: String(err).slice(0, 200) };
  }
  if (got.outcome !== "ok") {
    return { due: true, pages: got.pages, letters: 0, stopped: got.outcome, failure: { outcome: got.outcome, httpStatus: got.httpStatus, detail: got.detail } };
  }
  await store(client, got);
  return { due: true, read: "stored", pages: got.pages, letters: got.letters.length };
}

async function store(client: PoolClient, got: LettersAnswer): Promise<void> {
  const letters = [...new Map(got.letters.map((l) => [l.path, l])).values()];
  const col = <K extends keyof WarningLetter>(k: K) => letters.map((l) => l[k]);
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO fda_warning_letters (path, company, issued, posted, office, subject, response, closeout)
       SELECT * FROM unnest($1::text[], $2::text[], $3::date[], $4::date[], $5::text[], $6::text[], $7::date[], $8::date[])
       ON CONFLICT (path) DO UPDATE SET company = EXCLUDED.company, issued = EXCLUDED.issued, posted = EXCLUDED.posted, office = EXCLUDED.office,
              subject = EXCLUDED.subject, response = EXCLUDED.response, closeout = EXCLUDED.closeout, read_at = now()
        WHERE (fda_warning_letters.company, fda_warning_letters.issued, fda_warning_letters.posted, fda_warning_letters.office,
               fda_warning_letters.subject, fda_warning_letters.response, fda_warning_letters.closeout)
              IS DISTINCT FROM (EXCLUDED.company, EXCLUDED.issued, EXCLUDED.posted, EXCLUDED.office, EXCLUDED.subject, EXCLUDED.response, EXCLUDED.closeout)`,
      [col("path"), col("company"), col("issued"), letters.map((l) => l.posted || null), col("office"), col("subject"), col("response"), col("closeout")],
    );
    await client.query(
      `INSERT INTO fda_warning_reads (id, pages, letters) VALUES (1, $1, $2)
       ON CONFLICT (id) DO UPDATE SET pages = EXCLUDED.pages, letters = EXCLUDED.letters, read_at = now()`,
      [got.pages, got.total],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

export async function storedWarningLetters(client: PoolClient): Promise<WarningLetter[]> {
  const { rows } = await client.query<WarningLetter>(
    `SELECT path, company, issued::text AS issued, coalesce(posted::text, '') AS posted, office, subject, response::text AS response, closeout::text AS closeout
       FROM fda_warning_letters ORDER BY issued, path`,
  );
  return rows;
}

/**
 * The company's warning letters: the walk first, then every kept letter whose addressee is the company
 * on its issue day, under the names it had that year, the FDA's firms and applicant names, and the
 * letters' own hand list, from its first price on. A fund's series and a bank's notes record take none.
 */
export async function warningLettersFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }, walked: WarningWalk): Promise<FetchResult> {
  const failure = walked.failure;
  const failed = failure ? { outcome: failure.outcome, httpStatus: failure.httpStatus, detail: failure.detail } : null;
  if (plan.fundSeries) return failed ? { events: [], ...failed } : FUND_SERIES();
  if (isNotesRecord(plan.cik)) return failed ? { events: [], ...failed } : { events: [], outcome: "empty", detail: "a bank's notes record: no warning letter is its" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return failed ? { events: [], ...failed } : NO_PRICES();
  const { rows } = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM fda_warning_reads");
  const everRead = (rows[0]?.n ?? 0) > 0;
  const events = warningLetterEvents(await storedWarningLetters(client), namesIn, { cik: plan.cik, from: listed });
  // every kept letter the rules give it, from a list kept whole: a complete answer once it was ever read (batch 108)
  if (failed) return everRead ? { events, ...failed, complete: {} } : { events, ...failed };
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, ...(everRead ? { complete: {} } : {}) };
}
