import type { PoolClient } from "pg";
import { instHoldings, instHoldingsEvents } from "../instHoldings";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * Big investors' 13F holdings changes in the page's own security (batch 179): every quarter the committed files
 * (`data/13f/`) hold for its ticker, from its first price, as a summary row on the quarter's 13F deadline naming the
 * biggest buyers and sellers, and a row for each manager whose change equals 1% or more of the company's shares, on the
 * day its report was filed. An ETF's ticker is a security like any other (its holders' 13F reports); a mutual fund,
 * which no exchange trades, has none. No request: `npm run sync:13f` reads the SEC's data sets monthly. The files whole
 * are a complete answer (`FetchResult.complete`, batch 108).
 */
export async function instHoldingsFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string; ticker: string }): Promise<FetchResult> {
  const { listed } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return NO_PRICES();
  const { filers, pages } = instHoldings();
  const events = instHoldingsEvents(pages.get(plan.ticker) ?? [], filers, { ticker: plan.ticker, from: listed, name: plan.edgarName });
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, complete: {} };
}
