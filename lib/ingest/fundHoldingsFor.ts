import type { PoolClient } from "pg";
import { fundHoldings, fundMoveEvents, fundReportEvents } from "../fundHoldings";
import { fundSeriesId } from "../sec";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * Mutual funds' and ETFs' N-PORT holdings changes (batch 180): on a fund's page, its own reports the committed files
 * (`data/nport/`) hold for its series, a row on each report's filing day naming its biggest purchases and sales of half a
 * percent of its net assets or more; on a company's page, each fund whose change between two reports equals 1% or more of
 * the company's shares, on the later report's filing day. From the first price. No request: `npm run sync:nport` reads
 * the SEC's data sets quarterly. The files whole are a complete answer (`FetchResult.complete`, batch 108).
 */
export async function fundHoldingsFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string; ticker: string }): Promise<FetchResult> {
  const { listed } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return NO_PRICES();
  const { funds, series, pages } = fundHoldings();
  const id = fundSeriesId(plan.ticker);
  const fund = id ? funds.get(id) : undefined;
  const own = id ? fundReportEvents(series.get(id) ?? [], { series: id, name: fund?.[0] ?? plan.edgarName, cik: fund?.[1] ?? String(plan.cik), from: listed }) : [];
  const moves = fundMoveEvents(pages.get(plan.ticker) ?? [], funds, { ticker: plan.ticker, name: plan.edgarName, from: listed });
  const events = [...own, ...moves].sort((a, b) => b.date.localeCompare(a.date));
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, complete: {} };
}
