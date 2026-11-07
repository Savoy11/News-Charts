import type { PoolClient } from "pg";
import { APPROVALS, approvalEvents } from "../fdaApprovals";
import { isNotesRecord } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The company's new-drug approvals (batch 105): every approval in the committed compilation
 * (`data/fda-nme-approvals.json`) whose applicant is the company on its day, under the names it had
 * that year, a firm of the FDA recall map or a name only approvals use (lib/fdaApprovals.ts), from
 * its first price. No request: the file is read once a year by `npm run sync:fda-approvals`. A
 * fund's series and a bank's notes record take none.
 */
export async function fdaApprovalsFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }): Promise<FetchResult> {
  if (plan.fundSeries) return FUND_SERIES();
  if (isNotesRecord(plan.cik)) return { events: [], outcome: "empty", detail: "a bank's notes record: no approval is its" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return NO_PRICES();
  const events = approvalEvents(APPROVALS, namesIn, { cik: plan.cik, from: listed });
  // the committed file whole: a complete answer, so an approval the rules no longer give comes off (batch 108)
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, complete: {} };
}
