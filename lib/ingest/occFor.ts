import type { PoolClient } from "pg";
import { cachedOccList, occEvents, type OccList } from "../occActions";
import { OTS_ORDERS, otsActions } from "../otsOrders";
import { isNotesRecord, releaseNamesBefore, releaseNamesOn } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The OCC's enforcement actions against the company's banks (batch 153, lib/occActions.ts): the
 * OCC's whole list, read once a process for every company (`cachedOccList`), and the actions whose
 * bank is the company under the names it had that year, its legal names among them
 * (`partyNamesFor`), a bank the release map gives it that day, or one `OCC_BANKS` gives it by charter,
 * from its first price on, and the OTS archive's orders of 1989–2011 by the same rule
 * (lib/otsOrders.ts). A bank's notes record takes none, nor a fund's series. The answer is
 * complete when the list held every action the OCC's count gives, so a row the rules no longer give
 * comes off (`FetchResult.complete`, batch 108).
 */
export async function occFor(
  client: PoolClient,
  subjectId: number,
  plan: PressPlan & { cik: number | string },
  read: () => Promise<OccList> = () => cachedOccList(),
): Promise<FetchResult> {
  if (plan.fundSeries) return FUND_SERIES();
  if (isNotesRecord(plan.cik)) return { events: [], outcome: "empty", detail: "a bank's notes record: its actions are its group's page's" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return NO_PRICES();
  let list: OccList;
  try {
    list = await read();
  } catch (err) {
    const e = err as Error & { outcome?: "throttled" | "error"; httpStatus?: number };
    return { events: [], outcome: e.outcome ?? "error", ...(e.httpStatus ? { httpStatus: e.httpStatus } : {}), detail: String(e.message ?? err).slice(0, 200) };
  }
  // …with the OTS archive's orders of 1989–2011, the committed file, less those the OCC's list carries on (batch 154)
  const events = occEvents([...list.actions, ...otsActions(OTS_ORDERS, list.actions)], namesIn, {
    cik: plan.cik,
    from: listed,
    namesOn: (day) => releaseNamesOn(plan.cik, day),
    namesBefore: (day) => releaseNamesBefore(plan.cik, day),
  });
  // …and only when the reader kept the records it was given: an answer whose shape changed, every record
  // skipped, is not a list with nothing in it (the 2026-11-16 audit's set-aside 5)
  const whole = list.records >= list.total && list.actions.length >= list.records * 0.95;
  return {
    events,
    outcome: events.length ? "ok" : "empty",
    httpStatus: 200,
    ...(whole ? { complete: {} } : { detail: `the list held ${list.records} of the ${list.total} actions the OCC counts, ${list.actions.length} of them read: rows kept before stay` }),
  };
}
