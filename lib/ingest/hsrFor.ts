import type { PoolClient } from "pg";
import { hsrEvents, hsrGrants } from "../hsrEarly";
import { isNotesRecord, releaseNamesOn } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The company's grants of early termination of the merger waiting period (batch 166): every grant in the
 * committed file (`data/hsr-early-terminations.json.gz`) naming the company as the acquiring person, the
 * acquired person or an acquired entity on its day, under the names it had that year, its legal and former
 * names among them (`partyNamesFor`), or a unit the release map gives it that day, from its first price, one
 * event a day. No request: `npm run sync:hsr` reads the notices monthly. A fund's series and a bank's notes
 * record take none. The file whole is a complete answer, so a row the rules no longer give comes off
 * (`FetchResult.complete`, batch 108).
 */
export async function hsrFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }): Promise<FetchResult> {
  if (plan.fundSeries) return FUND_SERIES();
  if (isNotesRecord(plan.cik)) return { events: [], outcome: "empty", detail: "a bank's notes record: its deals are its group's page's" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return NO_PRICES();
  const events = hsrEvents(hsrGrants(), namesIn, { cik: plan.cik, from: listed, namesOn: (day) => releaseNamesOn(plan.cik, day) });
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, complete: {} };
}
