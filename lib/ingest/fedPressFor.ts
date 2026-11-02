import type { PoolClient } from "pg";
import { fetchFedPress } from "../fedPress";
import { isNotesRecord, releaseNamesOn } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The company's Federal Reserve Board releases (batch 84): the feed read once a process for every
 * company (`cachedFedFeed`), and the releases that make it a party under the names it had that
 * year, its legal names among them, as the SEC's cases read a caption (`partyNamesFor`), and the
 * units it then owned, from its first price on. A bank's notes record takes none, nor a fund's
 * series (`FUND_SERIES`); a company with no prices yet is asked again next run (`NO_PRICES`).
 */
export async function fedPressFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }): Promise<FetchResult> {
  if (plan.fundSeries) return FUND_SERIES();
  if (isNotesRecord(plan.cik)) return { events: [], outcome: "empty", detail: "a bank's notes record: its releases are its group's page's" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return NO_PRICES();
  return fetchFedPress(namesIn, { cik: plan.cik, from: listed, namesOn: (day) => releaseNamesOn(plan.cik, day) });
}
