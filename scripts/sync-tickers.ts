import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parseSeriesPage, preferredClass, FundSeries } from "../lib/edgarSeries";

/**
 * Rebuild the local EDGAR ticker index.
 *
 *   npm run sync:tickers
 *
 * EDGAR's two ticker files are the last thing a *read* had to fetch. Every other read path was
 * moved behind the database years of commits ago; resolving a ticker still went to sec.gov the
 * first time anybody searched it, which is why a throttled EDGAR could make the site's front
 * door look dead (see the `network_timeout` rung and `NETWORK_BUDGET_MS`). The files are small,
 * public and change slowly — a new listing a day, on a good day — so the honest fix is to hold
 * a copy and refresh it deliberately rather than paying for it on a visitor's first search.
 *
 * This is the only script that writes `data/edgar-tickers.json`. Run it from the scheduler
 * alongside `npm run refresh`, or by hand; the file records when it was built so staleness is
 * visible in the data rather than remembered.
 *
 * The written file is COMPACT on purpose: the two upstream files are ~2MB of repeated key names,
 * and this keeps only cik/ticker/title plus a symbol→cik map for funds, which is everything the
 * resolver reads. Nothing here is a judgement about the data — no filtering, no ranking. The
 * SEC's own ordering (roughly by size) is preserved, because `resolveCompany`'s name-prefix rung
 * depends on it: "APPLE" finds Apple Inc rather than Apple Hospitality REIT only because the SEC
 * put them in that order.
 */

const UA = { "User-Agent": "News Charts Research marcusowens94@gmail.com" };
const OUT = "data/edgar-tickers.json";

const COMPANIES = "https://www.sec.gov/files/company_tickers.json";
const FUNDS = "https://www.sec.gov/files/company_tickers_mf.json";

interface TickerRow {
  cik_str: number;
  ticker: string;
  title: string;
}

interface MfFile {
  fields: string[];
  data: (string | number)[][];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

async function main(): Promise<void> {
  console.log("fetching EDGAR ticker files…");

  const companiesRaw = (await getJson(COMPANIES)) as Record<string, TickerRow>;
  const companies: [number, string, string][] = [];
  for (const row of Object.values(companiesRaw)) {
    if (!row?.ticker || !row?.title || row.cik_str == null) continue;
    companies.push([Number(row.cik_str), String(row.ticker), String(row.title)]);
  }

  const fundsRaw = (await getJson(FUNDS)) as MfFile;
  const symbolAt = fundsRaw.fields?.indexOf("symbol") ?? -1;
  const cikAt = fundsRaw.fields?.indexOf("cik") ?? -1;
  if (symbolAt < 0 || cikAt < 0) throw new Error(`fund file has no symbol/cik column: ${fundsRaw.fields}`);

  // Share classes repeat a symbol; the first row wins, exactly as the live path did.
  const funds: Record<string, number> = {};
  for (const row of fundsRaw.data ?? []) {
    const symbol = String(row[symbolAt] ?? "").toUpperCase();
    if (symbol && funds[symbol] === undefined) funds[symbol] = Number(row[cikAt]);
  }

  // Refuse to write a index that lost most of its rows. A partial upstream response is the
  // failure worth catching here: it would otherwise overwrite a good index with a broken one,
  // and every ticker it dropped would resolve as "not a listed security" rather than as an error.
  if (companies.length < 5000) throw new Error(`only ${companies.length} companies — refusing to overwrite`);
  if (Object.keys(funds).length < 5000) throw new Error(`only ${Object.keys(funds).length} funds — refusing to overwrite`);

  /**
   * Fund NAMES, which neither ticker file carries.
   *
   * One request per REGISTRANT (1,164) rather than per series (11,970) or per symbol (28,419):
   * `scd=series` returns a registrant's whole series/class tree in a single response, and the
   * largest registrant in the file — 145 series, 1,094 classes — comes back complete and
   * unpaginated, so there is no page-walking to get wrong.
   *
   * Names are stored once and referenced by index. Share classes of one fund all carry the same
   * series name, so writing it per symbol would repeat "Vanguard 500 Index Fund" five times and
   * roughly double the file for nothing.
   */
  const cikList = [...new Set(Object.values(funds))];
  console.log(`fetching fund names for ${cikList.length} registrants…`);

  const seriesNames: string[] = [];
  const seriesSymbols: string[] = [];
  /**
   * The registrant CIK per series, carried rather than looked up.
   *
   * The obvious shortcut — resolve a matched fund name to its symbol, then read that symbol's CIK
   * out of `funds` — silently loses **6,787 of 19,040 series (36%)**, measured. EDGAR's series
   * listing knows about share classes that `company_tickers_mf.json` does not, so those funds
   * would have a name we could match and no CIK to answer with, and `matchFundName` would return
   * null for a fund it had just found. The CIK is right here in the request; keeping it costs
   * ~150KB and removes the whole failure mode.
   */
  const seriesCiks: number[] = [];
  const symbolSeries: Record<string, number> = {};
  let failed = 0;

  /**
   * A small worker pool, not a loop and not `Promise.all`.
   *
   * `browse-edgar` is wildly uneven — measured 0.9s to 11.2s for the same query shape — so one
   * slow registrant stalls a sequential run behind it, and the whole pass takes over an hour.
   * `POOL` requests in flight puts the effective rate near 1–2/s even at the slow end, which is
   * comfortably inside the SEC's 10/s (enforced by User-Agent, and a throttled *ingest* is the
   * site's front door going quiet, so the ceiling is worth respecting with room to spare).
   */
  const POOL = 6;
  let next = 0;
  let done = 0;
  // Each registrant's series land in ITS slot, not in completion order. With a pool, appending as
  // responses arrive would order the index by which request happened to finish first — so the
  // same query could resolve to a different fund after a resync, purely from network timing.
  // `matchFundName` takes the first prefix hit, so that ordering is an answer, not a detail.
  const perCik: FundSeries[][] = Array.from({ length: cikList.length }, () => []);

  async function worker(): Promise<void> {
    while (next < cikList.length) {
      const i = next++;
      const cik = String(cikList[i]).padStart(10, "0");
      const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&scd=series&count=100`;
      try {
        const res = await fetch(url, { headers: UA });
        // Back off and retry once rather than dropping a registrant's whole catalogue on one 429.
        if (res.status === 429 || res.status === 503) {
          await sleep(2000);
          const retry = await fetch(url, { headers: UA });
          if (!retry.ok) throw new Error(`HTTP ${retry.status} after retry`);
          perCik[i] = parseSeriesPage(await retry.text());
        } else if (res.ok) {
          perCik[i] = parseSeriesPage(await res.text());
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (err) {
        failed++;
        if (failed <= 5) console.warn(`  ⚠ CIK ${cik}: ${(err as Error).message}`);
      }
      if (++done % 100 === 0) console.log(`  …${done}/${cikList.length}`);
    }
  }

  await Promise.all(Array.from({ length: POOL }, () => worker()));
  for (let i = 0; i < perCik.length; i++) for (const s of perCik[i]) collect(s, cikList[i]);

  function collect(s: FundSeries, cik: number): void {
    const preferred = preferredClass(s);
    if (!preferred) return;
    const idx = seriesNames.length;
    seriesNames.push(s.name);
    seriesSymbols.push(preferred.symbol);
    seriesCiks.push(cik);
    // Every class points at its fund's name, so resolving VFIAX can say "Vanguard 500 Index
    // Fund" instead of the registrant trust, and without a request to do it.
    for (const c of s.classes) if (symbolSeries[c.symbol] === undefined) symbolSeries[c.symbol] = idx;
  }

  console.log(`  ${seriesNames.length} fund series named, ${Object.keys(symbolSeries).length} symbols mapped, ${failed} registrant(s) failed`);
  // Same reasoning as the row floors above: a mostly-failed name pass must not quietly ship an
  // index that answers "no such fund" for everything it did not manage to fetch.
  if (seriesNames.length < 5000) throw new Error(`only ${seriesNames.length} fund series named — refusing to overwrite`);

  const payload = {
    // Not a formatting nicety: an undated index is indistinguishable from one nobody has
    // refreshed in a year, which is the same reasoning the SOURCES reviewed-on item records.
    syncedOn: new Date().toISOString().slice(0, 10),
    source: { companies: COMPANIES, funds: FUNDS },
    companies,
    funds,
    seriesNames,
    seriesSymbols,
    seriesCiks,
    symbolSeries,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload));
  const kb = Math.round(JSON.stringify(payload).length / 1024);
  console.log(
    `wrote ${OUT} — ${companies.length} companies, ${Object.keys(funds).length} fund symbols, ` +
      `${seriesNames.length} named fund series, ${kb}KB`
  );
}

main().catch((err) => {
  console.error(`sync:tickers failed — ${(err as Error).message}`);
  console.error("The existing index is left untouched; a stale index beats a broken one.");
  process.exit(1);
});
