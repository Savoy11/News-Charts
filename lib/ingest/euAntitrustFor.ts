import type { PoolClient } from "pg";
import { euAntitrust, euAntitrustEvents } from "../euAntitrust";
import { isNotesRecord, releaseNamesOn } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The European Commission's competition decisions naming the company (batch 177): every antitrust and cartel decision in
 * the committed file (`data/eu-antitrust.json.gz`) addressed to the company by name, under the names it had that year,
 * its EDGAR former names among them (`partyNamesFor`), or a unit the release map gives it that day, with the fines its
 * text states, and every State aid notice and decision whose title names it as the beneficiary, from its first price;
 * one row a day. No request: `npm run sync:eu-antitrust` reads the Official Journal's lists and texts monthly. A fund's
 * series and a bank's notes record take none. The file whole is a complete answer (`FetchResult.complete`, batch 108).
 */
export async function euAntitrustFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }): Promise<FetchResult> {
  if (plan.fundSeries) return FUND_SERIES();
  if (isNotesRecord(plan.cik)) return { events: [], outcome: "empty", detail: "a bank's notes record: its decisions are its group's page's" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return NO_PRICES();
  const { decisions, aid } = euAntitrust();
  const events = euAntitrustEvents(decisions, aid, namesIn, { cik: plan.cik, from: listed, namesOn: (day) => releaseNamesOn(plan.cik, day) });
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, complete: {} };
}
