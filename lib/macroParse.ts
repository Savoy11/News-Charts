/**
 * Reading Federal Reserve policy statements and CPI releases out of the official pages (NC-080).
 *
 * Pure string work, no network — the fetching lives in lib/macro.ts, and `check:macro` runs these
 * on pages captured from federalreserve.gov and bls.gov. What each parser trusts was measured on
 * those pages (2026-10-20), and is the part a redesign is least likely to move:
 *
 *  - **FOMC statements are found by their label, dated by their address.** The address formats
 *    change by era — `/fomc/19940204default.htm`, `/boarddocs/press/general/2001/20010103/`,
 *    `/newsevents/press/monetary/20080122b.htm`, `/newsevents/pressreleases/monetary20200129a.htm`
 *    — and the suffix is not always "a" (the 22 January 2008 emergency cut is "b"). But every one
 *    carries its date, and every policy statement is labelled as one: "Statement" on a year page,
 *    the HTML link under "Statement:" on the current calendar. Going by the label is what keeps
 *    out the Fed's other releases on the same pages that are not decisions — the Statement on
 *    Longer-Run Goals and Monetary Policy Strategy (22 August 2025), swap-line and repo-facility
 *    press releases (March 2020), minutes, press conferences and implementation notes.
 *  - **CPI releases are dated by their archive address** (`cpi_MMDDYYYY.htm`) and named by their
 *    link text ("September 2026 Consumer Price Index").
 */

/** One decision or release, as a dated fact with its source document. */
export interface MacroDate {
  /** YYYY-MM-DD */
  date: string;
  /** the official document, absolute */
  url: string;
}

const FED = "https://www.federalreserve.gov";
const BLS = "https://www.bls.gov";

/** FOMC statements began in February 1994; before that the Committee announced nothing. */
export const FIRST_FOMC_STATEMENT = "1994-02-01";

/** A real calendar day, or null — "20240231" is not one, and must not become 2024-03-02. */
function isoDay(y: string, m: string, d: string): string | null {
  const iso = `${y}-${m}-${d}`;
  const t = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso ? iso : null;
}

function absolute(base: string, href: string): string {
  return href.startsWith("http") ? href : `${base}${href.startsWith("/") ? "" : "/"}${href}`;
}

/** One per date, earliest first: a page can link a statement twice, and pages overlap. */
function byDate<T extends MacroDate>(found: T[]): T[] {
  const seen = new Map<string, T>();
  for (const f of found) if (!seen.has(f.date)) seen.set(f.date, f);
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** The statement a link points at, dated by the first full date in its address. */
function statementAt(href: string): MacroDate | null {
  const m = href.match(/(19\d{2}|20\d{2})(\d{2})(\d{2})/);
  const date = m ? isoDay(m[1], m[2], m[3]) : null;
  return date && date >= FIRST_FOMC_STATEMENT ? { date, url: absolute(FED, href) } : null;
}

/**
 * FOMC policy statements on a Federal Reserve page — the current calendar
 * (`fomccalendars.htm`) or a year page (`fomchistorical2008.htm`). Each is a decision announced
 * that day, scheduled or not: the 15 March 2020 cut was a Sunday conference call.
 */
export function parseFomcStatements(html: string): MacroDate[] {
  const found: MacroDate[] = [];
  // Year pages: the link whose whole text is "Statement".
  for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>\s*Statement\s*<\/a>/gi)) {
    const s = statementAt(m[1]);
    if (s) found.push(s);
  }
  // The current calendar: "Statement:" then "PDF | HTML" — the HTML one, before the next label
  // or meeting row.
  for (const m of html.matchAll(/<strong>\s*Statement:\s*<\/strong>/gi)) {
    let block = html.slice(m.index! + m[0].length, m.index! + m[0].length + 800);
    const end = block.search(/<strong>|fomc-meeting__month/i);
    if (end >= 0) block = block.slice(0, end);
    const htm = block.match(/href="([^"]+?\.htm)"/i);
    const s = htm ? statementAt(htm[1]) : null;
    if (s) found.push(s);
  }
  return byDate(found);
}

/** The year pages the history index links (`fomchistorical2008.htm`), newest first. */
export function parseFomcHistoricalYears(html: string): number[] {
  const years = new Set<number>();
  for (const m of html.matchAll(/fomchistorical(\d{4})\.htm/gi)) years.add(Number(m[1]));
  return [...years].sort((a, b) => b - a);
}

/**
 * CPI news releases in the BLS archive: the publication date from the address, the month the
 * release covers from its link text. A link without a month in its text falls back to the month
 * before publication, which is when the CPI comes out — but the text is preferred, because a
 * release can slip (the September 2025 CPI came out on 24 October, after a shutdown).
 */
export function parseCpiReleases(html: string): (MacroDate & { referenceMonth: string })[] {
  const found: (MacroDate & { referenceMonth: string })[] = [];
  for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"]*?\/news\.release\/archives\/cpi_(\d{2})(\d{2})(\d{4})\.htm)"[^>]*>([^<]*)<\/a>/gi)) {
    const date = isoDay(m[4], m[2], m[3]);
    if (!date) continue;
    const named = m[5].match(/\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})\b/);
    found.push({ date, url: absolute(BLS, m[1]), referenceMonth: named ? `${named[1]} ${named[2]}` : previousMonth(date) });
  }
  return byDate(found);
}

/** "2024-02-13" → "January 2024" */
function previousMonth(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
