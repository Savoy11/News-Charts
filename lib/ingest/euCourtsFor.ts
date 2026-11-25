import type { PoolClient } from "pg";
import { euCourts, euCourtsEvents } from "../euCourts";
import { isNotesRecord, releaseNamesOn } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The EU courts' judgments in the company's own cases (batch 183): every judgment in the committed file
 * (`data/eu-courts.json.gz`) naming the company as a party by name, under the names it had that year, its EDGAR former
 * names among them (`partyNamesFor`), or a unit the release map gives it that day, from its first price; one row a day,
 * with the court's operative part where its text was read. No request: `npm run sync:eu-courts` reads the lists and the
 * texts monthly. A fund's series and a bank's notes record take none. The file whole is a complete answer
 * (`FetchResult.complete`, batch 108).
 */
export async function euCourtsFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }): Promise<FetchResult> {
  if (plan.fundSeries) return FUND_SERIES();
  if (isNotesRecord(plan.cik)) return { events: [], outcome: "empty", detail: "a bank's notes record: its judgments are its group's page's" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return NO_PRICES();
  const events = euCourtsEvents(euCourts(), namesIn, { cik: plan.cik, from: listed, namesOn: (day) => releaseNamesOn(plan.cik, day) });
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, complete: {} };
}
