import type { PoolClient } from "pg";
import { companyActions, fedH2Actions, h2Line, type H2Action } from "../fedH2";
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
 * Board's own actions of a release's day on the company's deals, from its weekly H.2 release (lib/fedH2.ts, batch
 * 173), are a line on the release's row, and make no row of their own (`fed_h2`).
 */
export async function fedPressFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }): Promise<FetchResult> {
  if (plan.fundSeries) return FUND_SERIES();
  if (isNotesRecord(plan.cik)) return { events: [], outcome: "empty", detail: "a bank's notes record: its releases are its group's page's" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return NO_PRICES();
  const namesOn = (day: string) => releaseNamesOn(plan.cik, day);
  // the Board's own actions on the company's deals in its weekly H.2 release, a line on the release of their day (batch 173)
  const board = new Map<string, H2Action[]>();
  for (const { a } of companyActions(fedH2Actions(), namesIn, { cik: plan.cik, from: listed, namesOn })) if (a.board) (board.get(a.day) ?? board.set(a.day, []).get(a.day)!).push(a);
  return fetchFedPress(namesIn, { cik: plan.cik, from: listed, namesOn, h2: (day) => (board.has(day) ? h2Line(board.get(day)!) : undefined) });
}
