/**
 * Reading Federal Reserve rate decisions and CPI releases out of the official pages (NC-080).
 *
 * Pure string work, no network — the fetching lives in lib/macro.ts, and the checks run these on
 * fixtures. Both parsers read **the dates the publishers put in their own document addresses**,
 * not the layout around them, because a page redesign moves headings and tables but leaves a
 * document's address alone:
 *
 *  - an FOMC statement is `…/monetary20240131a.htm` (since the 2008-era site; older years link
 *    `/boarddocs/press/monetary/2001/20010103/`) — the date the decision was announced;
 *  - a CPI news release in the BLS archive is `…/news.release/archives/cpi_02132024.htm` — the
 *    date it was published, MMDDYYYY.
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

/** A real calendar day, or null — "20240231" is not one, and must not become 2024-03-02. */
function isoDay(y: string, m: string, d: string): string | null {
  const iso = `${y}-${m}-${d}`;
  const t = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso ? iso : null;
}

function absolute(base: string, href: string): string {
  return href.startsWith("http") ? href : `${base}${href.startsWith("/") ? "" : "/"}${href}`;
}

/** One per date, earliest first: a page links a statement more than once, and pages overlap. */
function byDate(found: MacroDate[]): MacroDate[] {
  const seen = new Map<string, MacroDate>();
  for (const f of found) if (!seen.has(f.date)) seen.set(f.date, f);
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * FOMC policy statements on a Federal Reserve calendar page — the current calendar or a
 * historical year. Each statement is a decision announced that day, scheduled or not (the
 * 15 March 2020 cut was a Sunday). Minutes, press conferences, projections and implementation
 * notes (`…a1.htm`) are other documents and are not read as decisions.
 *
 * FOMC statements began in February 1994; before that the Committee announced nothing, so a
 * date before 1994 is not taken even if a page links one.
 */
export function parseFomcStatements(html: string): MacroDate[] {
  const found: MacroDate[] = [];
  for (const m of html.matchAll(/href="([^"]*?monetary\/?(\d{4})(\d{2})(\d{2})a\.htm)"/gi)) {
    const date = isoDay(m[2], m[3], m[4]);
    if (date && date >= "1994-02-01") found.push({ date, url: absolute(FED, m[1]) });
  }
  for (const m of html.matchAll(/href="([^"]*?\/boarddocs\/press\/monetary\/\d{4}\/(\d{4})(\d{2})(\d{2})\/[^"]*)"/gi)) {
    const date = isoDay(m[2], m[3], m[4]);
    if (date && date >= "1994-02-01") found.push({ date, url: absolute(FED, m[1]) });
  }
  return byDate(found);
}

/** The historical-year pages a calendar page links ("fomchistorical2019.htm"), newest first. */
export function parseFomcHistoricalYears(html: string): number[] {
  const years = new Set<number>();
  for (const m of html.matchAll(/fomchistorical(\d{4})\.htm/gi)) years.add(Number(m[1]));
  return [...years].sort((a, b) => b - a);
}

/**
 * CPI news releases in the BLS archive. The address carries the publication date; the month the
 * release is *about* is the month before, which is how the CPI has been published since long
 * before the oldest archived release.
 */
export function parseCpiReleases(html: string): (MacroDate & { referenceMonth: string })[] {
  const found: MacroDate[] = [];
  for (const m of html.matchAll(/href="([^"]*?\/news\.release\/archives\/cpi_(\d{2})(\d{2})(\d{4})\.htm)"/gi)) {
    const date = isoDay(m[4], m[2], m[3]);
    if (date) found.push({ date, url: absolute(BLS, m[1]) });
  }
  return byDate(found).map((f) => ({ ...f, referenceMonth: previousMonth(f.date) }));
}

/** "2024-02-13" → "January 2024" */
function previousMonth(date: string): string {
  const [y, m] = date.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
