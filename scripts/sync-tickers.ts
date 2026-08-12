import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

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

  const payload = {
    // Not a formatting nicety: an undated index is indistinguishable from one nobody has
    // refreshed in a year, which is the same reasoning the SOURCES reviewed-on item records.
    syncedOn: new Date().toISOString().slice(0, 10),
    source: { companies: COMPANIES, funds: FUNDS },
    companies,
    funds,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload));
  const kb = Math.round(JSON.stringify(payload).length / 1024);
  console.log(`wrote ${OUT} — ${companies.length} companies, ${Object.keys(funds).length} fund symbols, ${kb}KB`);
}

main().catch((err) => {
  console.error(`sync:tickers failed — ${(err as Error).message}`);
  console.error("The existing index is left untouched; a stale index beats a broken one.");
  process.exit(1);
});
