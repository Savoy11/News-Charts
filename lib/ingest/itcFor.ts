import type { PoolClient } from "pg";
import { itcCases, itcEvents } from "../itc337";
import { isNotesRecord, releaseNamesOn } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The company's Section 337 investigations (batch 167): every investigation in the committed file
 * (`data/itc-337.json.gz`) naming the company as a complainant or a respondent on the day it was instituted,
 * under the names it had that year, its legal and former names among them (`partyNamesFor`), or a unit the
 * release map gives it that day, from its first price; a row a day for those instituted, and one for those
 * decided on the merits. No request: `npm run sync:itc` reads the notices monthly. A fund's series and a
 * bank's notes record take none. The file whole is a complete answer (`FetchResult.complete`, batch 108).
 */
export async function itcFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }): Promise<FetchResult> {
  if (plan.fundSeries) return FUND_SERIES();
  if (isNotesRecord(plan.cik)) return { events: [], outcome: "empty", detail: "a bank's notes record: its cases are its group's page's" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return NO_PRICES();
  const events = itcEvents(itcCases(), namesIn, { cik: plan.cik, from: listed, namesOn: (day) => releaseNamesOn(plan.cik, day) });
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, complete: {} };
}
