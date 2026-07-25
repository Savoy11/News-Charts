import { CompanyInfo, TimelineEvent } from "./types";

const UA = { "User-Agent": "Chronolens Research marcusowens94@gmail.com" };

interface TickerRow {
  cik_str: number;
  ticker: string;
  title: string;
}

async function getTickerMap(): Promise<TickerRow[]> {
  const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: UA,
    next: { revalidate: 86400 },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as Record<string, TickerRow>;
  return Object.values(json);
}

export async function resolveCompany(query: string): Promise<CompanyInfo | null> {
  const rows = await getTickerMap();
  const q = query.trim().toUpperCase();
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

  const wanted = new Set(["8-K", "10-K", "10-Q", "S-1", "DEF 14A", "20-F", "6-K"]);
  const events: TimelineEvent[] = [];
  const n = recent.form.length;
  for (let i = 0; i < n; i++) {
    const form: string = recent.form[i];
    if (!wanted.has(form)) continue;
    const date: string = recent.filingDate[i];
    const accession: string = recent.accessionNumber[i].replace(/-/g, "");
    const doc: string = recent.primaryDocument[i];
    const items: string = recent.items?.[i] ?? "";
    const isEarnings =
      form === "10-K" || form === "10-Q" || (form === "8-K" && items.includes("2.02"));
    const label =
      form === "10-K"
        ? "Annual report (10-K)"
        : form === "10-Q"
          ? "Quarterly report (10-Q)"
          : form === "8-K" && items.includes("2.02")
            ? "Earnings announcement (8-K)"
            : `${form} filing`;
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
