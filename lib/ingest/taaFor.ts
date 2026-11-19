import type { PoolClient } from "pg";
import { isNotesRecord, releaseNamesOn } from "../releaseNames";
import { taaCertifications, taaEvents } from "../taaPetitions";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { FUND_SERIES, NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * The company's trade adjustment certifications (batch 159): every certification in the committed file
 * (`data/taa-certifications.json.gz`) whose firm is the company on its day, under the names it had that
 * year, its legal and former names among them (`partyNamesFor`), a unit the release map gives it that
 * day or one of its own units (lib/taaPetitions.ts `TAA_UNITS`), from its first price, one event a day.
 * No request: the file is closed since 2022 and was read once by `npm run sync:taa`. A fund's series and
 * a bank's notes record take none. The file whole is a complete answer, so a row the rules no longer
 * give comes off (`FetchResult.complete`, batch 108).
 */
export async function taaFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string }): Promise<FetchResult> {
  if (plan.fundSeries) return FUND_SERIES();
  if (isNotesRecord(plan.cik)) return { events: [], outcome: "empty", detail: "a bank's notes record: its certifications are its group's page's" };
  const { listed, namesIn } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return NO_PRICES();
  const events = taaEvents(taaCertifications(), namesIn, { cik: plan.cik, from: listed, namesOn: (day) => releaseNamesOn(plan.cik, day) });
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, complete: {} };
}
