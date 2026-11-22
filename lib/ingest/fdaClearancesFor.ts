import type { PoolClient } from "pg";
import { candidatesFor, clearanceEvents, fdaClearances } from "../fdaClearances";
import { isNotesRecord } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The company's 510(k) clearances and De Novo grants (batch 172): every decision in the committed file
 * (`data/fda-clearances.json.gz`) whose applicant is the company on its day by the approvals' rule, under the names it
 * had that year, its EDGAR former names among them (`partyNamesFor`), less the names read by hand, from its first
 * price; one row a company a month, a De Novo grant its own. No request: `npm run sync:fda-clearances` streams
 * openFDA's file monthly. A fund's series and a bank's notes record take none. The file whole is a complete answer
 * (`FetchResult.complete`, batch 108).
 */
export async function fdaClearancesFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }): Promise<FetchResult> {
  if (plan.fundSeries) return FUND_SERIES();
  if (isNotesRecord(plan.cik)) return { events: [], outcome: "empty", detail: "a bank's notes record: no clearance is its" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return NO_PRICES();
  // the company's candidates by the file's word index, the rule deciding among them
  const events = clearanceEvents(candidatesFor(fdaClearances(), Number(plan.cik), namesIn), namesIn, { cik: plan.cik, from: listed });
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, complete: {} };
}
