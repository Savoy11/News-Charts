import { CompanyInfo, TimelineEvent } from "./types";

const UA = { "User-Agent": "News Charts Research marcusowens94@gmail.com" };

interface TickerRow {
  cik_str: number;
  ticker: string;
  title: string;
}

/**
 * The local EDGAR index — the read path's last network hop, taken off it.
 *
 * Built by `npm run sync:tickers` into `data/edgar-tickers.json` and committed. Every other read
 * path already answered from the database; resolving a ticker still went to sec.gov the first
 * time anybody searched it, so a throttled EDGAR — which a few `npm run refresh` runs are enough
 * to produce, since it rate-limits by User-Agent — made the site's front door look dead.
 *
 * Local first, network still second. The index is a snapshot, so a company that listed after the
 * last sync is not in it; those fall through to the live files exactly as before. What changes is
 * that the common case (every security EDGAR knew at sync time) now costs no request at all.
 */
import rawTickerIndex from "../data/edgar-tickers.json";

/**
 * The index's contract, declared rather than inferred.
 *
 * Importing the JSON gives TypeScript a literal type with 28,000-odd key names in it, which is
 * both slow to check and wrong to depend on: the code would stop compiling whenever the data file
 * was regenerated with a field the previous one lacked, which is exactly what a *data* file is
 * expected to do. Declaring the shape makes the dependency explicit and lets an older file be a
 * runtime question — every reader below tolerates a missing name index rather than assuming one.
 */
export interface TickerIndex {
  syncedOn: string;
  companies: [number, string, string][];
  funds: Record<string, number>;
  /** fund series names, written once and referenced by index; absent before the 2026-08-12 sync */
  seriesNames?: string[];
  /** the preferred (exchange-traded, where there is one) share-class symbol per series */
  seriesSymbols?: string[];
  /** the registrant CIK per series — carried, because 36% are not resolvable via `funds` */
  seriesCiks?: number[];
  /** every share-class symbol → its series' index in `seriesNames` */
  symbolSeries?: Record<string, number>;
}

const tickerIndex = rawTickerIndex as unknown as TickerIndex;

let localRows: TickerRow[] | null = null;
function localCompanies(): TickerRow[] {
  if (localRows) return localRows;
  // The SEC's own ordering is preserved by the sync script and load-bearing here: the
  // name-prefix rung below takes the FIRST prefix hit, which is only "the company a person
  // almost certainly means" because the file is ordered roughly by size.
  localRows = tickerIndex.companies.map(([cik_str, ticker, title]) => ({
    cik_str,
    ticker,
    title,
  }));
  return localRows;
}

/** When the committed index was built — surfaced so staleness is visible rather than assumed. */
export const TICKER_INDEX_SYNCED_ON: string = tickerIndex.syncedOn;

async function getTickerMap(): Promise<TickerRow[]> {
  const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: UA,
    next: { revalidate: 86400 },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as Record<string, TickerRow>;
  return Object.values(json);
}

/**
 * The fund half of EDGAR's ticker index: ETFs and mutual funds.
 *
 * `company_tickers.json` covers operating companies (plus some exchange-traded trusts);
 * `company_tickers_mf.json` covers registered funds — every ETF and mutual fund share class,
 * keyed by symbol. The split is not what the names suggest: **SPY resolves out of the *company*
 * file** (it is a unit investment trust) while VOO and VTI exist only here, so both are needed.
 *
 * Neither file carries a fund NAME. `npm run sync:tickers` fetches those separately from EDGAR's
 * series listing and writes them into the index, so `registrantName` below is now only a fallback
 * for a symbol the name pass missed — it answers with the trust ("VANGUARD INDEX FUNDS") rather
 * than the fund, which is why it was never good enough on its own.
 */
interface MfFile {
  fields: string[];
  data: (string | number)[][];
}

async function getFundTickerMap(): Promise<Map<string, string>> {
  const res = await fetch("https://www.sec.gov/files/company_tickers_mf.json", {
    headers: UA,
    next: { revalidate: 86400 },
  });
  if (!res.ok) return new Map();
  const json = (await res.json()) as MfFile;
  const symbolAt = json.fields.indexOf("symbol");
  const cikAt = json.fields.indexOf("cik");
  if (symbolAt < 0 || cikAt < 0) return new Map();
  const bySymbol = new Map<string, string>();
  for (const row of json.data) {
    const symbol = String(row[symbolAt]).toUpperCase();
    if (symbol && !bySymbol.has(symbol)) {
      bySymbol.set(symbol, String(row[cikAt]).padStart(10, "0"));
    }
  }
  return bySymbol;
}

async function registrantName(cik: string): Promise<string | null> {
  const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
    headers: UA,
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { name?: string };
  return json.name ?? null;
}

/**
 * The name-prefix rung: "ALIBABA" should find "ALIBABA GROUP HOLDING LIMITED", because nobody
 * types the full legal title.
 *
 * **Gated on ambiguity, not on length.** This used to require three characters, described as a
 * guard "against junk prefixes" — but length is a proxy for ambiguity, and a bad one. `"3M "`
 * matches **exactly one** row in the whole index, so the guard was declining an unambiguous
 * answer and telling a visitor that a Dow 30 component is not a listed security. Of the 140
 * distinct two-character title prefixes in the committed index, 94 are unique.
 *
 * So: one match is an answer whatever its length. Several matches still need enough of a query
 * to be meant, and the first is taken because the SEC orders its file roughly by size — which is
 * the only reason "APPLE" reaches Apple Inc rather than Apple Hospitality REIT, and why
 * `check:tickers` asserts that ordering survives every rebuild.
 */
function prefixHit(rows: TickerRow[], q: string): TickerRow | null {
  const matches = rows.filter((r) => r.title.toUpperCase().startsWith(q + " "));
  if (matches.length === 1) return matches[0];
  return matches.length > 1 && q.length >= 3 ? matches[0] : null;
}

/**
 * The company rungs, against whichever copy of the index the caller has.
 *
 * Split out so the local snapshot and the live file go through identical matching — two copies
 * of this laddering would drift, and the drift would be invisible: the local one answers almost
 * every query, so a divergence would only ever show up for a newly listed company.
 */
function matchCompany(rows: TickerRow[], q: string): CompanyInfo | null {
  const hit = rows.find((r) => r.ticker === q) ?? rows.find((r) => r.title.toUpperCase() === q) ?? prefixHit(rows, q);
  if (!hit) return null;
  return {
    ticker: hit.ticker,
    cik: String(hit.cik_str).padStart(10, "0"),
    name: hit.title,
  };
}

/** Symbols are short; anything else cannot be one, and asking about it wastes a request. */
const SYMBOL_SHAPE = (q: string) => q.length >= 2 && q.length <= 6 && /^[A-Z0-9.]+$/.test(q);

/** The fund series name behind a share-class symbol — "VFIAX" → "Vanguard 500 Index Fund". */
function fundNameFor(symbol: string): string | null {
  const idx = tickerIndex.symbolSeries?.[symbol];
  if (idx === undefined) return null;
  return tickerIndex.seriesNames?.[idx] ?? null;
}

/**
 * Funds by name — the rung "Vanguard 500" needed and could not have.
 *
 * Same shape as the company name rungs deliberately: exact name, then name prefix, taking the
 * first hit. What it resolves *to* is the fund's preferred share class, chosen at sync time —
 * "Vanguard 500" is honestly VFINX, VFIAX and VOO, and the ETF class is the one this product is
 * about (2026-08-08 scope refocus). A person who wants a specific class still types its symbol,
 * which rung 2 answers exactly.
 *
 * The minimum length is the same guard the company prefix rung uses: two characters of a fund
 * name match half the industry.
 */
function matchFundName(q: string): CompanyInfo | null {
  const names = tickerIndex.seriesNames ?? [];
  const symbols = tickerIndex.seriesSymbols ?? [];
  const ciks = tickerIndex.seriesCiks ?? [];
  if (!names.length || q.length < 3) return null;

  let hit = names.findIndex((n) => n.toUpperCase() === q);
  if (hit < 0) hit = names.findIndex((n) => n.toUpperCase().startsWith(q + " "));
  if (hit < 0) return null;

  const symbol = symbols[hit];
  // The CIK comes from the series index, NOT from a `funds[symbol]` lookup: EDGAR's series
  // listing knows share classes the fund ticker file omits, and 6,787 of 19,040 series (36%)
  // would otherwise be found by name and then answered with null.
  const cik = ciks[hit];
  if (!symbol || cik === undefined) return null;
  return { ticker: symbol, cik: String(cik).padStart(10, "0"), name: names[hit] };
}

/**
 * Resolve any exchange-traded security EDGAR knows: operating companies first, then ETFs and
 * mutual funds by symbol, then funds by name. One resolver on purpose — a fund is a subject
 * exactly the way a company is (a CIK with filings and a priced ticker), and two would drift.
 *
 * Rungs 1–3 are answered from the committed index and cost nothing; only rung 4 leaves the
 * machine, and only for a listing newer than the last `npm run sync:tickers`.
 */
export async function resolveCompany(query: string): Promise<CompanyInfo | null> {
  const q = query.trim().toUpperCase();

  // 1. The committed index — no request at all, which is the point of this rung.
  const local = matchCompany(localCompanies(), q);
  if (local) return local;

  // 2. Funds by SYMBOL, from the local index. The display name comes from the index too, when
  //    the series pass has named it — so "VOO" answers "Vanguard 500 Index Fund" with no
  //    request. Only a symbol the name pass missed falls back to the registrant lookup, which
  //    is an enrichment and degrades to the symbol itself.
  if (SYMBOL_SHAPE(q)) {
    const localCik = tickerIndex.funds[q];
    if (localCik !== undefined) {
      const cik = String(localCik).padStart(10, "0");
      const named = fundNameFor(q);
      if (named) return { ticker: q, cik, name: named };
      const name = await registrantName(cik).catch(() => null);
      return { ticker: q, cik, name: name ?? q };
    }
  }

  // 3. Funds by NAME — "Vanguard 500" → VOO. The rung company names already had, which funds
  //    could not have while the only fund source was a symbol list.
  const byName = matchFundName(q);
  if (byName) return byName;

  // 4. Only now the network, and only for what the snapshot could not know: anything listed
  //    since the last `npm run sync:tickers`. Everything above this line is free and offline.
  const rows = await getTickerMap();
  const live = matchCompany(rows, q);
  if (live) return live;

  if (SYMBOL_SHAPE(q)) {
    const funds = await getFundTickerMap().catch(() => new Map<string, string>());
    const cik = funds.get(q);
    if (cik) {
      const name = await registrantName(cik).catch(() => null);
      return { ticker: q, cik, name: name ?? q };
    }
  }
  return null;
}

// legal suffixes that Wikipedia titles don't carry — stripped iteratively, so
// "Alibaba Group Holding Limited" → "Alibaba Group", "Tesla, Inc." → "Tesla"
const LEGAL_SUFFIX =
  /\b(?:incorporated|inc|corporation|corp|company|co|limited|ltd|plc|holdings?|s\.a\.|n\.v\.|ag|se)\.?$/i;

/** The everyday name of a company, for looking it up outside SEC filings. */
export function commonName(title: string): string {
  let s = title.trim();
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(/[,.]\s*$/, "").replace(LEGAL_SUFFIX, "").trim();
  }
  return s || title;
}

export interface Industry {
  /** 4-digit SIC code, e.g. "3674" */
  sic: string;
  /** EDGAR's own label, e.g. "Semiconductors & Related Devices" */
  description: string;
}

/**
 * Every EDGAR submissions record carries an SIC code, so peer grouping is
 * authoritative rather than inferred — and free. Shares the fetch cache with
 * getFilings(), so asking for both costs one request.
 */
export async function getIndustry(company: CompanyInfo): Promise<Industry | null> {
  const res = await fetch(`https://data.sec.gov/submissions/CIK${company.cik}.json`, {
    headers: UA,
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const sic = String(json?.sic ?? "").trim();
  const description = String(json?.sicDescription ?? "").trim();
  if (!/^\d{3,4}$/.test(sic) || !description) return null;
  return { sic: sic.padStart(4, "0"), description };
}

/** Filings from EDGAR. 10-K/10-Q become "earnings" events; other material forms become "filing" events. */
/**
 * One block of EDGAR's parallel filing arrays — `filings.recent`, or an older shard, which carry
 * the same columns. Split out so both go through identical typing and labelling: two copies would
 * drift, and the drift would only ever show on filings old enough that nobody was looking.
 */
interface FilingBlock {
  form?: string[];
  filingDate?: string[];
  accessionNumber?: string[];
  primaryDocument?: string[];
  items?: string[];
}

function filingsFromBlock(block: FilingBlock, company: CompanyInfo): TimelineEvent[] {

  /**
   * Operating-company forms AND registered-fund forms. The set used to cover companies only,
   * so an ETF or mutual fund resolved perfectly, priced perfectly — and rendered a miss page,
   * because a trust like SPY files 497s, 485s and shareholder reports, never a 10-K, and every
   * one of them fell through the filter. Verified against SPY's own submissions: its recent
   * list is 497 ×80, N-30D ×48, 485BPOS ×27, NPORT-P ×27 … and not one form the old set knew.
   *
   * A fund's shareholder report (N-CSR, and N-30D in the older records) is its results
   * announcement — typed `earnings` so it sits on the same chip a company's 10-K does.
   */
  const wanted = new Set([
    // operating companies
    "8-K", "10-K", "10-Q", "S-1", "DEF 14A", "20-F", "6-K",
    // registered funds
    "N-CSR", "N-CSRS", "N-30D", "N-CEN", "NPORT-P", "485APOS", "485BPOS", "497", "497K", "N-1A",
  ]);
  const FUND_LABELS: Record<string, { label: string; earnings: boolean }> = {
    "N-CSR": { label: "Shareholder report (N-CSR)", earnings: true },
    "N-CSRS": { label: "Semi-annual shareholder report (N-CSRS)", earnings: true },
    "N-30D": { label: "Shareholder report (N-30D)", earnings: true },
    "N-CEN": { label: "Annual fund census (N-CEN)", earnings: false },
    "NPORT-P": { label: "Portfolio holdings (NPORT-P)", earnings: false },
    "485APOS": { label: "Registration amendment (485APOS)", earnings: false },
    "485BPOS": { label: "Registration amendment (485BPOS)", earnings: false },
    "497": { label: "Prospectus update (497)", earnings: false },
    "497K": { label: "Summary prospectus (497K)", earnings: false },
    "N-1A": { label: "Fund registration (N-1A)", earnings: false },
  };
  const events: TimelineEvent[] = [];
  const n = block.form?.length ?? 0;
  for (let i = 0; i < n; i++) {
    const form = block.form?.[i] ?? "";
    if (!wanted.has(form)) continue;
    const date = block.filingDate?.[i] ?? "";
    const accession = (block.accessionNumber?.[i] ?? "").replace(/-/g, "");
    // A shard row missing either is unusable: no date is nowhere to put it, and no accession is
    // no stable identity, so it would re-insert as a new event on every refresh.
    if (!date || !accession) continue;
    const doc = block.primaryDocument?.[i] ?? "";
    const items = block.items?.[i] ?? "";
    const fund = FUND_LABELS[form];
    const isEarnings =
      fund?.earnings ?? (form === "10-K" || form === "10-Q" || (form === "8-K" && items.includes("2.02")));
    const label =
      fund?.label ??
      (form === "10-K"
        ? "Annual report (10-K)"
        : form === "10-Q"
          ? "Quarterly report (10-Q)"
          : form === "8-K" && items.includes("2.02")
            ? "Earnings announcement (8-K)"
            : `${form} filing`);
    events.push({
      id: `sec-${accession}`,
      date,
      type: isEarnings ? "earnings" : "filing",
      title: `${company.name}: ${label}`,
      source: "SEC EDGAR",
      url: `https://www.sec.gov/Archives/edgar/data/${Number(company.cik)}/${accession}/${doc}`,
      description: form === "8-K" && items ? `Items: ${items}` : undefined,
      sourceKey: "sec_edgar",
      // the accession number is already globally unique, so document and event identity coincide
      externalId: accession,
      dedupBasis: `sec:${accession}`,
    });
  }
  return events;
}

/** The recent block only — what every read path wants, and what the first pass is bounded to. */
export async function getFilings(company: CompanyInfo): Promise<TimelineEvent[]> {
  return getFilingsDeep(company, false);
}

/**
 * A company's filings, and how far back to go.
 *
 * EDGAR's submissions record splits at roughly a thousand filings: `filings.recent` holds the
 * newest, and everything older lives in **separate shard files** listed under `filings.files`.
 * This only ever read `recent`, which for an active filer is nowhere near the whole history —
 * measured against Ford, `recent` reaches back to **2019-05-20**, while two shards hold **3,431
 * more filings going back to 1994-01-20**. Twenty-five years of a company's own primary
 * documents, sitting one request away and never asked for.
 *
 * `includeOlder` is off by default, and the default is what the **first pass** uses: that path
 * runs while a visitor waits, on an 8-second budget, and its job is to flip the page's render
 * gate rather than to be complete. Depth belongs to the scheduler, which has no deadline and
 * refreshes on a window — so `scripts/ingest.ts` opts in and nothing on the read path does.
 */
export async function getFilingsDeep(
  company: CompanyInfo,
  includeOlder: boolean
): Promise<TimelineEvent[]> {
  const res = await fetch(`https://data.sec.gov/submissions/CIK${company.cik}.json`, {
    headers: UA,
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];
  const json = await res.json();
  const recent = json?.filings?.recent;
  if (!recent) return [];

  const events = filingsFromBlock(recent, company);
  if (!includeOlder) return events;

  const shards: { name?: string }[] = json?.filings?.files ?? [];
  for (const shard of shards) {
    if (!shard?.name) continue;
    try {
      const r = await fetch(`https://data.sec.gov/submissions/${shard.name}`, {
        headers: UA,
        next: { revalidate: 86400 },
      });
      // A shard that will not load costs its own years and nothing else — the recent block is
      // already in hand, and half a history beats none.
      if (!r.ok) continue;
      events.push(...filingsFromBlock(await r.json(), company));
    } catch {
      continue;
    }
  }
  return events;
}
