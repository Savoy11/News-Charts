import { UA } from "./contact";
import { plainText, type DojRelease } from "./doj";

/**
 * The Justice Department's press releases of 2001–2008, from its own archive (batch 94, the
 * 2026-11-02 proposal 2).
 *
 * The API `lib/doj.ts` reads holds releases from 2009 on. The Department keeps the earlier ones on
 * month pages, `www.justice.gov/archive/opa/pr/YYYY/Month/`, linked from its "Index of Pre-January
 * 2009 Press Releases". The archive is closed, so each month is read once and kept (db/036,
 * `lib/ingest/dojArchiveWalk.ts`); each company's ingest then matches the kept titles through the
 * rule the API's already pass (`releaseNamesParty`). It is the same source, `doj_press`, under the
 * same terms: "Unless otherwise indicated, information on Department of Justice websites is in the
 * public domain and may be copied and distributed without permission" (justice.gov/legalpolicies).
 *
 * Two layouts, measured on all 96 months (2026-11-05):
 *
 * - 2001–2004, a list: `<li><a href="04_civ_807.htm">#807: 12-30-04 HEALTHSOUTH TO PAY …</a>`,
 *   the link relative to the month page, the day in the title, titles mostly in capitals.
 * - 2005–2008, day headings: `<h2>Monday, February 28, 2005</h2>` (January 2005's carry no
 *   weekday), then each release's title `<h3>Title&nbsp;<span class="small">(05-082)</span></h3>`
 *   and a paragraph ending in its link, `(Read more)`. From mid-2005 that paragraph opens with the
 *   release's first lines, kept as its teaser.
 */
export const ARCHIVE_FIRST_YEAR = 2001;
export const ARCHIVE_LAST_YEAR = 2008;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** One release as the archive lists it. */
export interface ArchiveRelease {
  /** YYYY-MM-DD */
  day: string;
  /** the site's path, the release's key: "/archive/opa/pr/2005/January/05_crm_039.htm" */
  path: string;
  /** the Department's number, "05-039" or "#807" as the page writes it, when it gives one */
  number: string | null;
  title: string;
  /** the first lines the page gives under the title, from mid-2005 */
  teaser: string | null;
}

/** "2005-01" for the month page of January 2005. */
export const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

/** The month page's address. */
export const archiveMonthUrl = (year: number, month: number) => `https://www.justice.gov/archive/opa/pr/${year}/${MONTHS[month - 1]}/`;

/** Every month the archive holds, oldest first: 96, from January 2001 to December 2008. */
export function archiveMonths(): { year: number; month: number; key: string }[] {
  const out: { year: number; month: number; key: string }[] = [];
  for (let year = ARCHIVE_FIRST_YEAR; year <= ARCHIVE_LAST_YEAR; year++)
    for (let month = 1; month <= 12; month++) out.push({ year, month, key: monthKey(year, month) });
  return out;
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const realDay = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

/** A link on the month page as a path on the site: relative ones against the month's folder. */
function pathOf(href: string, year: number, month: number): string | null {
  let url: URL;
  try {
    // a few links carry stray spaces, "05_enrd_680  .html" and "/ 05_crm_670.html": no file name has one
    url = new URL(href.replace(/\s+/g, ""), archiveMonthUrl(year, month));
  } catch {
    return null;
  }
  // most are releases on the archive; a few 2004 rows link the Civil Rights Division's own copy
  // ("/crt/housing/documents/torinopr.php"), which is the release still
  if (url.protocol !== "https:" || url.hostname !== "www.justice.gov" || !/\/[^/]+\.(?:html?|php)$/i.test(url.pathname)) return null;
  return url.pathname;
}

export interface ParsedMonth {
  releases: ArchiveRelease[];
  /** rows the page lists that the parser could not read, with what was wrong — a layout change shows here */
  unread: string[];
}

/**
 * The releases a month page lists. A row is read only when its day falls in the page's own month
 * and its link is a release on the archive; any other row the page lists goes to `unread`, so a
 * page that changed its layout reads as broken, not as a quiet month.
 */
export function parseArchiveMonth(html: string, year: number, month: number): ParsedMonth {
  const releases: ArchiveRelease[] = [];
  const unread: string[] = [];
  const seen = new Set<string>();
  const keep = (r: ArchiveRelease) => {
    if (seen.has(r.path)) return;
    seen.add(r.path);
    releases.push(r);
  };
  const inMonth = (day: string) => day.slice(0, 7) === monthKey(year, month);

  if (/<h1[^>]*>\s*Press Releases for/i.test(html)) {
    // 2005–2008: a day heading, then each release's title and the paragraph holding its link
    const token = /<h2[^>]*>([\s\S]*?)<\/h2>|<h3[^>]*>([\s\S]*?)<\/h3>|<p[^>]*>([\s\S]*?)<\/p>/gi;
    let day: string | null = null;
    let open: { title: string; number: string | null } | null = null;
    const close = (why: string) => {
      if (open) unread.push(`${why}: ${open.title.slice(0, 80)}`);
      open = null;
    };
    for (const m of html.matchAll(token)) {
      if (m[1] !== undefined) {
        close("no link before the next day");
        const text = plainText(m[1]);
        const d = new RegExp(String.raw`^(?:[A-Za-z]+,\s+)?(${MONTHS.join("|")})\s+(\d{1,2}),\s+(\d{4})$`, "i").exec(text);
        if (!d) {
          if (/\d{4}/.test(text)) unread.push(`a day heading not read: ${text.slice(0, 80)}`);
          day = null;
          continue;
        }
        const [mo, dd, yy] = [MONTHS.findIndex((x) => x.toLowerCase() === d[1].toLowerCase()) + 1, Number(d[2]), Number(d[3])];
        day = realDay(yy, mo, dd) ? iso(yy, mo, dd) : null;
        if (!day || !inMonth(day)) {
          unread.push(`a day outside the page's month: ${text}`);
          day = null;
        }
      } else if (m[2] !== undefined) {
        close("no link before the next title");
        // the number is the page's, and not always given: "( 05-67)", "(000000)", "()", "(08--928)",
        // or no span at all (the Civil Rights Division's housing cases, Kinder Morgan's of 2007)
        const number = /<span class="small">\s*\(\s*(\d\d)-+(\d+)\s*\)/i.exec(m[2]);
        const title = plainText(m[2].replace(/<span class="small">[\s\S]*?<\/span>/gi, "")).replace(/\s*:$/, "");
        if (title) open = { title, number: number && Number(number[2]) ? `${number[1]}-${number[2]}` : null };
      } else if (m[3] !== undefined && open) {
        const href = /<a\s[^>]*href="([^"]+)"[^>]*>\s*\(?\s*Read more/i.exec(m[3])?.[1];
        if (!href) continue;
        const path = pathOf(href, year, month);
        const title: string = open.title;
        if (!path || !day) {
          close(!path ? `a link not on the archive (${href})` : "a title under no day");
          continue;
        }
        const teaser = plainText(m[3].replace(/<a\s[^>]*>[\s\S]*?<\/a>/gi, "")).replace(/^\(\s*\)$|\s*\(\s*\)$/g, "").trim();
        keep({ day, path, number: open.number, title, teaser: teaser.length > 20 ? teaser : null });
        open = null;
      }
    }
    close("no link before the page ends");
    return { releases, unread };
  }

  // 2001–2004: a list, the day in the title
  for (const m of html.matchAll(/<li>\s*<a\s+href="([^"]+)"\s*>([\s\S]*?)<\/a>/gi)) {
    const text = plainText(m[2]);
    // "#301: 06-29-01 TITLE", and as typed now and then: "527: 10-12-01", "#389 08-09-01",
    // "#235A: 05-25-01", "#503: 09-27-01: TITLE"
    const row = /^(?:#\s*(\d+[A-Z]?)\s*:?\s*|(\d+)\s*:\s*)?(\d{1,2})[-/](\d{1,2})[-/](\d{2}):?\s+(.+)$/.exec(text);
    if (!row) {
      unread.push(`a row not read: ${text.slice(0, 80)}`);
      continue;
    }
    const [mo, dd, yy] = [Number(row[3]), Number(row[4]), 2000 + Number(row[5])];
    const day = realDay(yy, mo, dd) ? iso(yy, mo, dd) : null;
    const path = pathOf(m[1], year, month);
    // a day that is no day ("02-30-02") or not the page's month ("02-14-01" on August 2001's) is a
    // typing slip whose day the page cannot settle: the row is left unread, not guessed
    if (!day || !inMonth(day) || !path) {
      unread.push(`${!path ? `a link not on the archive (${m[1]})` : `a day outside the page's month (${row[3]}-${row[4]}-${row[5]})`}: ${row[6].slice(0, 80)}`);
      continue;
    }
    const number = row[1] ?? row[2];
    keep({ day, path, number: number ? `#${number}` : null, title: row[6].trim(), teaser: null });
  }
  return { releases, unread };
}

/**
 * A kept row in the API's shape, so one rule (`dojEvents`) reads both: the day at noon UTC in
 * seconds, as the API gives it, and the path as the release's key.
 */
export const asDojRelease = (r: ArchiveRelease): DojRelease => ({
  title: r.title,
  date: Date.parse(`${r.day}T12:00:00Z`) / 1000,
  url: `https://www.justice.gov${r.path}`,
  teaser: r.teaser ?? undefined,
});

export interface MonthAnswer {
  releases: ArchiveRelease[];
  /** the rows the page lists that could not be read */
  unread?: string[];
  outcome: "ok" | "throttled" | "error";
  httpStatus?: number;
  detail?: string;
}

const TIMEOUT_MS = 20_000;

/**
 * A month page's text. The pages of 2001–2004 declare iso-8859-1 and write Windows-1252's quotes,
 * 0x92 for "’" ("DEPARTMENT OF JUSTICE’S"), in 28 of their 48 months; `Response.text()` reads
 * every page as UTF-8 and would make each "�". A page that is not UTF-8 is read as Windows-1252,
 * which is what an iso-8859-1 label means on the web.
 */
export function decodePage(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * One month page. A page that lists no release it can read is an error, not an empty month: every
 * month of 2001–2008 listed 29 or more (measured), and the archive's index answered once with a
 * bot check, which a month page could too.
 */
export async function fetchArchiveMonth(year: number, month: number): Promise<MonthAnswer> {
  const res = await fetch(archiveMonthUrl(year, month), { headers: { ...UA, Accept: "text/html" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 429 || res.status === 503) return { releases: [], outcome: "throttled", httpStatus: res.status };
  if (!res.ok) return { releases: [], outcome: "error", httpStatus: res.status };
  const { releases, unread } = parseArchiveMonth(decodePage(new Uint8Array(await res.arrayBuffer())), year, month);
  if (!releases.length) return { releases, outcome: "error", httpStatus: res.status, detail: `no release read on the page${unread.length ? ` (${unread[0]})` : ""}` };
  return { releases, unread, outcome: "ok", httpStatus: res.status };
}
