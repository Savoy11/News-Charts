import type { PoolClient } from "pg";
import { isNotesRecord, releaseNamesOn } from "../releaseNames";
import { supremeCourtCases, supremeCourtEvents } from "../supremeCourt";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The Supreme Court's decisions in the company's own cases (batch 176): every case in the committed file
 * (`data/supreme-court.json.gz`) whose name gives the company as a party, with a legal word or a name of two words or
 * more, under the names it had that year, its EDGAR former names among them (`partyNamesFor`), or a unit the release map
 * gives it that day, from its first price; one row a day, the Court's disposition and the company's side on it. No
 * request: `npm run sync:supreme-court` reads govinfo's U.S. Reports and the Court's slip lists monthly. A fund's series
 * and a bank's notes record take none. The file whole is a complete answer (`FetchResult.complete`, batch 108).
 */
export async function supremeCourtFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }): Promise<FetchResult> {
  if (plan.fundSeries) return FUND_SERIES();
  if (isNotesRecord(plan.cik)) return { events: [], outcome: "empty", detail: "a bank's notes record: its cases are its group's page's" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return NO_PRICES();
  const events = supremeCourtEvents(supremeCourtCases(), namesIn, { cik: plan.cik, from: listed, namesOn: (day) => releaseNamesOn(plan.cik, day) });
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, complete: {} };
}
