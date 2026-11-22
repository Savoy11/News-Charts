import type { PoolClient } from "pg";
import { APPROVALS, approvalIsCompany } from "../fdaApprovals";
import { fdaHistory, fdaHistoryEvents, joinedReleases, releasesByDay } from "../fdaHistory";
import { isNotesRecord } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The company's FDA press releases and talk papers of 1962–2014 (batch 169): every document in the committed
 * file (`data/fda-history.json.gz`) naming the company and at most one other listed company, not refused by hand,
 * from its first price; one row a day, a document about one of its new-drug approvals that day left to that
 * approval's row, which carries its sentence instead (the owner's call, `fdaApprovalsFor`; by drug, batch 170). No request: `npm run
 * sync:fda-history` reads openFDA's file. A fund's series and a bank's notes record take none. The file whole is a
 * complete answer (`FetchResult.complete`, batch 108).
 */
export async function fdaHistoryFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }): Promise<FetchResult> {
  if (plan.fundSeries) return FUND_SERIES();
  if (isNotesRecord(plan.cik)) return { events: [], outcome: "empty", detail: "a bank's notes record: no release is its" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return NO_PRICES();
  const docs = fdaHistory();
  const approvals = APPROVALS.filter((a) => a.day >= listed && approvalIsCompany(a, Number(plan.cik), namesIn));
  const joined = joinedReleases(approvals, releasesByDay(docs, plan.cik));
  const events = fdaHistoryEvents(docs, { cik: plan.cik, from: listed, joined });
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, complete: {} };
}
