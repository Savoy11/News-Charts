import type { PoolClient } from "pg";
import { euEvents, euMergers } from "../euMergers";
import { isNotesRecord, releaseNamesOn } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The company's deals notified to the European Commission (batch 174): every notification in the committed file
 * (`data/eu-mergers.json.gz`) whose first paragraph names the company in full as an acquirer, the undertaking acquired or
 * another party, under the names it had that year, its EDGAR former names among them (`partyNamesFor`), or a unit the
 * release map gives it that day, from its first price; one row a day, the first-phase clearance a line on it. No request:
 * `npm run sync:eu-mergers` reads the Official Journal's notices monthly. A fund's series and a bank's notes record take
 * none. The file whole is a complete answer (`FetchResult.complete`, batch 108).
 */
export async function euMergersFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }): Promise<FetchResult> {
  if (plan.fundSeries) return FUND_SERIES();
  if (isNotesRecord(plan.cik)) return { events: [], outcome: "empty", detail: "a bank's notes record: its deals are its group's page's" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return NO_PRICES();
  const { notifications, clearances } = euMergers();
  const events = euEvents(notifications, clearances, namesIn, { cik: plan.cik, from: listed, namesOn: (day) => releaseNamesOn(plan.cik, day) });
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, complete: {} };
}
