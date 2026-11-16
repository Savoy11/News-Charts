import type { PoolClient } from "pg";
import { cachedOccList, occEvents, type OccList } from "../occActions";
import { isNotesRecord, releaseNamesBefore, releaseNamesOn } from "../releaseNames";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The OCC's enforcement actions against the company's banks (batch 153, lib/occActions.ts): the
 * OCC's whole list, read once a process for every company (`cachedOccList`), and the actions whose
 * bank is the company under the names it had that year, its legal names among them
 * (`partyNamesFor`), a bank the release map gives it that day, or one `OCC_BANKS` gives it by charter,
 * from its first price on. A bank's notes record takes none, nor a fund's series. The answer is
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
  const events = occEvents(list.actions, namesIn, {
    cik: plan.cik,
    from: listed,
    namesOn: (day) => releaseNamesOn(plan.cik, day),
    namesBefore: (day) => releaseNamesBefore(plan.cik, day),
  });
  const whole = list.records >= list.total;
  return {
    events,
    outcome: events.length ? "ok" : "empty",
    httpStatus: 200,
    ...(whole ? { complete: {} } : { detail: `the list held ${list.records} of the ${list.total} actions the OCC counts: rows kept before stay` }),
  };
}
