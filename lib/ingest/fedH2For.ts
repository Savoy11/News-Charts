import type { PoolClient } from "pg";
import { H2_LINE_MARK, fedH2Actions, fedH2Events, type H2Action, releaseNamesAction } from "../fedH2";
import { isNotesRecord, releaseNamesOn } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The Board's own releases and orders on the company's page (lib/fedPress.ts), by day, each as its title and the words
 * its row shows before its H.2 line: a Board action of the day they name is that line's (`releaseH2Line`), and makes
 * no row here (batch 175).
 */
export async function boardReleaseTexts(client: PoolClient, subjectId: number): Promise<Map<string, string[]>> {
  const { rows } = await client.query<{ day: string; title: string; body: string | null }>(
    `SELECT DISTINCT e.occurred_on::text AS day, e.title, e.body
       FROM events e
       JOIN event_subjects es ON es.event_id = e.id AND es.subject_id = $1
       JOIN event_attestations a ON a.event_id = e.id
       JOIN sources s ON s.id = a.source_id AND s.key = 'fed_press'`,
    [subjectId],
  );
  const out = new Map<string, string[]>();
  for (const r of rows) (out.get(r.day) ?? out.set(r.day, []).get(r.day)!).push(`${r.title} ${(r.body ?? "").split(` ${H2_LINE_MARK} `)[0]}`);
  return out;
}

/** Whether a Board release of the action's day on the page names it, as `boardReleaseTexts` gives them: the test `releaseH2Line` makes. */
export const listedBy = (texts: ReadonlyMap<string, readonly string[]>) => (a: H2Action) => (texts.get(a.day) ?? []).some((t) => releaseNamesAction(t, a));

/**
 * The company's deals the Federal Reserve acted on (batch 173): every action in the committed file
 * (`data/fed-h2.json.gz`) on a deal naming the company as the applicant or the company acquired, under the names it
 * had that year, its EDGAR former names among them (`partyNamesFor`), or a unit the release map gives it that day,
 * from its first price, its namesakes refused by city; one row a day. A Board action the Board's own release or order
 * of its day on the page names is a line on that row (`fed_press`, which ingest reads first) and makes none here.
 * No request: `npm run sync:fed-h2` reads the weekly releases. A fund's series and a bank's notes record take none.
 * The file whole is a complete answer (`FetchResult.complete`, batch 108).
 */
export async function fedH2For(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }): Promise<FetchResult> {
  if (plan.fundSeries) return FUND_SERIES();
  if (isNotesRecord(plan.cik)) return { events: [], outcome: "empty", detail: "a bank's notes record: its applications are its group's page's" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return NO_PRICES();
  const joined = listedBy(await boardReleaseTexts(client, subjectId));
  const events = fedH2Events(fedH2Actions(), namesIn, { cik: plan.cik, from: listed, namesOn: (day) => releaseNamesOn(plan.cik, day), joined });
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, complete: {} };
}
