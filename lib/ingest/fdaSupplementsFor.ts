import type { PoolClient } from "pg";
import { SUPPLEMENTED, supplementEvents } from "../fdaSupplements";
import { isNotesRecord } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The company's later drug approvals (batch 115): every efficacy supplement in the committed file
 * (`data/fda-supplements.json`) of a drug whose holder never left it, on a day its applicant was the
 * company, its firm or its unit, under the names it had that year (lib/fdaSupplements.ts), from its
 * first price. No request: the file is read monthly by `npm run sync:fda-supplements`. A fund's
 * series and a bank's notes record take none.
 */
export async function fdaSupplementsFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }): Promise<FetchResult> {
  if (plan.fundSeries) return FUND_SERIES();
  if (isNotesRecord(plan.cik)) return { events: [], outcome: "empty", detail: "a bank's notes record: no drug is its" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return NO_PRICES();
  const events = supplementEvents(SUPPLEMENTED, namesIn, { cik: plan.cik, from: listed });
  // the committed file whole: a complete answer, so a supplement the rules no longer give comes off
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, complete: {} };
}
