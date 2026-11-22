import type { PoolClient } from "pg";
import { fedH2Actions, fedH2Events } from "../fedH2";
import { isNotesRecord, releaseNamesOn } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/** The days the company's page holds one of the Board's own releases or orders (lib/fedPress.ts), which a Board action of the day joins. */
export async function boardReleaseDays(client: PoolClient, subjectId: number): Promise<Set<string>> {
  const { rows } = await client.query<{ day: string }>(
    `SELECT DISTINCT e.occurred_on::text AS day
       FROM events e
       JOIN event_subjects es ON es.event_id = e.id AND es.subject_id = $1
       JOIN event_attestations a ON a.event_id = e.id
       JOIN sources s ON s.id = a.source_id AND s.key = 'fed_press'`,
    [subjectId],
  );
  return new Set(rows.map((r) => r.day));
}

/**
 * The company's deals the Federal Reserve acted on (batch 173): every action in the committed file
 * (`data/fed-h2.json.gz`) on a deal naming the company as the applicant or the company acquired, under the names it
 * had that year, its EDGAR former names among them (`partyNamesFor`), or a unit the release map gives it that day,
 * from its first price, its namesakes refused by city; one row a day. A Board action on a day the page holds the
 * Board's own release or order is a line on that row (`fed_press`, which ingest reads first) and makes none here.
 * No request: `npm run sync:fed-h2` reads the weekly releases. A fund's series and a bank's notes record take none.
 * The file whole is a complete answer (`FetchResult.complete`, batch 108).
 */
export async function fedH2For(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }): Promise<FetchResult> {
  if (plan.fundSeries) return FUND_SERIES();
  if (isNotesRecord(plan.cik)) return { events: [], outcome: "empty", detail: "a bank's notes record: its applications are its group's page's" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return NO_PRICES();
  const joined = await boardReleaseDays(client, subjectId);
  const events = fedH2Events(fedH2Actions(), namesIn, { cik: plan.cik, from: listed, namesOn: (day) => releaseNamesOn(plan.cik, day), joined });
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, complete: {} };
}
