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
import tickerIndex from "../data/edgar-tickers.json";

let localRows: TickerRow[] | null = null;
function localCompanies(): TickerRow[] {
  if (localRows) return localRows;
  // The SEC's own ordering is preserved by the sync script and load-bearing here: the
  // name-prefix rung below takes the FIRST prefix hit, which is only "the company a person
  // almost certainly means" because the file is ordered roughly by size.
  localRows = (tickerIndex.companies as [number, string, string][]).map(([cik_str, ticker, title]) => ({
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
 * keyed by symbol. It carries **no names**, only cik/series/class/symbol, so a fund resolved
 * here gets its display name from the registrant's own submissions record — one extra request,
 * paid only on an actual fund hit.
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
 * Resolve any exchange-traded security EDGAR knows: operating companies first, then ETFs and
 * mutual funds by symbol. One resolver on purpose — a fund is a subject exactly the way a
 * company is (a CIK with filings and a priced ticker), and two resolvers would drift.
 */
/**
 * The company rungs, against whichever copy of the index the caller has.
 *
 * Split out so the local snapshot and the live file go through identical matching — two copies
 * of this laddering would drift, and the drift would be invisible: the local one answers almost
 * every query, so a divergence would only ever show up for a newly listed company.
 */
function matchCompany(rows: TickerRow[], q: string): CompanyInfo | null {
  // name-prefix rung: "ALIBABA" should find "ALIBABA GROUP HOLDING LIMITED" — nobody
  // types the full legal title. The SEC file is ordered roughly by market cap, so the
  // first prefix hit is the company a person almost certainly means ("APPLE" → Apple
  // Inc, not Apple Hospitality REIT). Minimum length guards against junk prefixes.
  const hit =
    rows.find((r) => r.ticker === q) ??
    rows.find((r) => r.title.toUpperCase() === q) ??
    (q.length >= 3
      ? rows.find((r) => r.title.toUpperCase().startsWith(q + " ")) ?? null
      : null);
  if (!hit) return null;
  return {
    ticker: hit.ticker,
    cik: String(hit.cik_str).padStart(10, "0"),
    name: hit.title,
  };
}

/** Symbols are short; anything else cannot be one, and asking about it wastes a request. */
const SYMBOL_SHAPE = (q: string) => q.length >= 2 && q.length <= 6 && /^[A-Z0-9.]+$/.test(q);

export async function resolveCompany(query: string): Promise<CompanyInfo | null> {
  const q = query.trim().toUpperCase();

  // 1. The committed index — no request at all, which is the point of this rung.
  const local = matchCompany(localCompanies(), q);
  if (local) return local;

  // 2. Funds, still from the local index. Symbol-keyed only (the file carries no names), so this
  //    answers "VTSAX" and "QQQ" but not "Vanguard 500" — a fund NAME index is a separate item.
  //    The registrant lookup for the display name is an enrichment: it degrades to the symbol.
  if (SYMBOL_SHAPE(q)) {
    const localCik = (tickerIndex.funds as Record<string, number>)[q];
    if (localCik !== undefined) {
      const cik = String(localCik).padStart(10, "0");
      const name = await registrantName(cik).catch(() => null);
      return { ticker: q, cik, name: name ?? q };
    }
  }

  // 3. Only now the network, and only for what the snapshot could not know: anything listed
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
export async function getFilings(company: CompanyInfo): Promise<TimelineEvent[]> {
  const res = await fetch(`https://data.sec.gov/submissions/CIK${company.cik}.json`, {
    headers: UA,
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];
  const json = await res.json();
  const recent = json?.filings?.recent;
  if (!recent) return [];

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
  const n = recent.form.length;
  for (let i = 0; i < n; i++) {
    const form: string = recent.form[i];
    if (!wanted.has(form)) continue;
    const date: string = recent.filingDate[i];
    const accession: string = recent.accessionNumber[i].replace(/-/g, "");
    const doc: string = recent.primaryDocument[i];
    const items: string = recent.items?.[i] ?? "";
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
