import type { PoolClient } from "pg";
import { APPROVALS, approvalEvents } from "../fdaApprovals";
import { fdaHistory, fdaHistoryEvents } from "../fdaHistory";
import { isNotesRecord } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The company's FDA press releases and talk papers of 1962–2014 (batch 169): every document in the committed
 * file (`data/fda-history.json.gz`) naming the company and at most one other listed company, not refused by hand,
 * from its first price; one row a day, never on a day the page holds one of its new-drug approvals, whose row
 * carries the release's sentence instead (the owner's call, `fdaApprovalsFor`). No request: `npm run
 * sync:fda-history` reads openFDA's file. A fund's series and a bank's notes record take none. The file whole is a
 * complete answer (`FetchResult.complete`, batch 108).
 */
export async function fdaHistoryFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }): Promise<FetchResult> {
  if (plan.fundSeries) return FUND_SERIES();
  if (isNotesRecord(plan.cik)) return { events: [], outcome: "empty", detail: "a bank's notes record: no release is its" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return NO_PRICES();
  const approvalDays = new Set(approvalEvents(APPROVALS, namesIn, { cik: plan.cik, from: listed }).map((e) => e.date));
  const events = fdaHistoryEvents(fdaHistory(), { cik: plan.cik, from: listed, approvalDays });
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, complete: {} };
}
