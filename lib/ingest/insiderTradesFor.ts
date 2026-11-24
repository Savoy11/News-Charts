import type { PoolClient } from "pg";
import { insiderEvents, insiderTrades } from "../insiderTrades";
import { predecessorsOf } from "../predecessors";
import type { FetchResult } from "../types";
import { partyNamesFor } from "./secCasesWalk";
import { NO_PRICES, type PressPlan } from "./secPressWalk";

/**
 * Insiders' open-market purchases and sales of the company's own shares (batch 181): every filing day the committed files
 * (`data/insiders/`) hold for its CIK, and for a predecessor's record up to the day the page's company took over from it
 * (`lib/predecessors.ts`), from the first price; one row a day of $1 million or more (batch 182) naming each officer,
 * director and 10% owner who bought or
 * sold. A fund's series has no insiders of its own. No request: `npm run sync:insiders` reads the SEC's data sets
 * quarterly. The files whole are a complete answer (`FetchResult.complete`, batch 108).
 */
export async function insiderTradesFor(client: PoolClient, subjectId: number, plan: PressPlan & { cik: number | string; ticker: string }): Promise<FetchResult> {
  if (plan.fundSeries) return { events: [], outcome: "empty", detail: "a fund's series: no officers or directors of its own" };
  const { listed } = await partyNamesFor(client, subjectId, plan);
  if (!listed) return NO_PRICES();
  const pages = insiderTrades();
  const events = insiderEvents(pages.get(Number(plan.cik)) ?? [], { ticker: plan.ticker, cik: plan.cik, from: listed });
  for (const p of predecessorsOf(plan.cik)) {
    const own = (pages.get(p.cik) ?? []).filter((d) => d.day <= p.until && (!p.since || d.day >= p.since));
    events.push(...insiderEvents(own, { ticker: plan.ticker, cik: p.cik, from: listed }));
  }
  events.sort((a, b) => b.date.localeCompare(a.date));
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200, complete: {} };
}
