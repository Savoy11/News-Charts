import type { PoolClient } from "pg";
import { fedH2Actions, releaseH2Line } from "../fedH2";
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
 * series (`FUND_SERIES`); a company with no prices yet is asked again next run (`NO_PRICES`). The
 * Board's own actions of a release's day that the release names, from its weekly H.2 release (lib/fedH2.ts, batch
 * 173), are a line on the release's row, the same on every page it is on (`releaseH2Line`, batch 175), and make no
 * row of their own (`fed_h2`).
 */
export async function fedPressFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }): Promise<FetchResult> {
  if (plan.fundSeries) return FUND_SERIES();
  if (isNotesRecord(plan.cik)) return { events: [], outcome: "empty", detail: "a bank's notes record: its releases are its group's page's" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return NO_PRICES();
  const namesOn = (day: string) => releaseNamesOn(plan.cik, day);
  // the Board's own actions of a release's day that it names, from its weekly H.2 release, a line on it (batches 173, 175)
  const actions = fedH2Actions();
  return fetchFedPress(namesIn, { cik: plan.cik, from: listed, namesOn, h2: (r) => releaseH2Line(r, actions) });
}
