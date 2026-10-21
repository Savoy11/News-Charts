import { FetchResult, TimelineEvent } from "./types";
import {
  FIRST_FOMC_STATEMENT,
  parseCpiReleases,
  parseFomcHistoricalYears,
  parseFomcStatements,
  type MacroDate,
} from "./macroParse";

/**
 * Federal Reserve policy decisions and CPI inflation releases — the economy-wide dates a stock's
 * move is most often read against (NC-080). Both publishers are U.S. government agencies: public
 * domain, no key. The parsing is in lib/macroParse.ts.
 *
 * They are held by one curated subject, the way the crypto assets are (lib/onchain/index.ts), and
 * shown on every company page behind an "Economy" switch that starts off (CompanyExplorer). They
 * are never linked to a company: a CPI release is not an Apple event, it is the backdrop to one.
 */
export const MACRO_SUBJECT = {
  slug: "us-economy",
  displayName: "U.S. economy: Fed decisions and inflation reports",
  summary:
    "Every Federal Open Market Committee policy statement since February 1994, when the Fed began announcing its decisions, and every Consumer Price Index release in the Bureau of Labor Statistics archive.",
} as const;

// The same contact the EDGAR requests carry; bls.gov refuses scripted requests without one.
const UA = { "User-Agent": "News Charts Research marcusowens94@gmail.com" };
const FED = "https://www.federalreserve.gov/monetarypolicy";
const CPI_ARCHIVE = "https://www.bls.gov/bls/news-release/cpi.htm";
const TIMEOUT_MS = 20_000;
/** Between year pages: a history backfill reads about 27 of them from one host. */
const PAGE_GAP_MS = 1_000;

type Page = { html: string } | { failed: FetchResult };

async function getPage(url: string): Promise<Page> {
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 429 || res.status === 503) return { failed: { events: [], outcome: "throttled", httpStatus: res.status } };
    if (!res.ok) return { failed: { events: [], outcome: "error", httpStatus: res.status, detail: url } };
    return { html: await res.text() };
  } catch (err) {
    return { failed: { events: [], outcome: "error", detail: `${url}: ${String(err).slice(0, 160)}` } };
  }
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function fomcEvent(s: MacroDate): TimelineEvent {
  return {
    id: `fomc-${s.date}`,
    date: s.date,
    type: "macro",
    // "Fed" and "FOMC" are what a headline says, and what a focus on interest rates matches
    // (lib/concepts.ts). It does not say "rate cut" or "hike": the address gives the date, not
    // the decision, and a statement can hold rates where they were.
    title: "Fed policy statement (FOMC)",
    source: "Federal Reserve",
    url: s.url,
    description: "The Federal Open Market Committee's monetary policy decision, announced that day.",
    sourceKey: "fed_fomc",
    externalId: s.date,
    dedupBasis: `fomc:${s.date}`,
  };
}

export function cpiEvent(r: MacroDate & { referenceMonth: string }): TimelineEvent {
  return {
    id: `cpi-${r.date}`,
    date: r.date,
    type: "macro",
    title: `CPI report: consumer prices for ${r.referenceMonth}`,
    source: "U.S. Bureau of Labor Statistics",
    url: r.url,
    description: "The monthly Consumer Price Index release, the main U.S. inflation reading.",
    sourceKey: "bls_cpi",
    externalId: r.date,
    dedupBasis: `cpi:${r.date}`,
  };
}

/**
 * FOMC policy statements. The current calendar covers the last few years; with `history`, every
 * year page back to 1994 is read too — a one-time backfill, since a past year's decisions do not
 * change. A year page that fails ends the backfill there and reports the failure, keeping what
 * was read: a partial history is real history, and the next run asks again.
 */
export async function fetchFomcStatements(opts: { history?: boolean; gapMs?: number } = {}): Promise<FetchResult> {
  const calendar = await getPage(`${FED}/fomccalendars.htm`);
  if ("failed" in calendar) return calendar.failed;
  const found = parseFomcStatements(calendar.html);
  let failure: FetchResult | null = null;

  if (opts.history) {
    const index = await getPage(`${FED}/fomc_historical_year.htm`);
    if ("failed" in index) failure = index.failed;
    else {
      const covered = found.length ? Number(found[0].date.slice(0, 4)) : new Date().getUTCFullYear() + 1;
      const first = Number(FIRST_FOMC_STATEMENT.slice(0, 4));
      for (const year of parseFomcHistoricalYears(index.html).filter((y) => y >= first && y < covered)) {
        await pause(opts.gapMs ?? PAGE_GAP_MS);
        const page = await getPage(`${FED}/fomchistorical${year}.htm`);
        if ("failed" in page) {
          failure = page.failed;
          break;
        }
        found.push(...parseFomcStatements(page.html));
      }
    }
  }

  const events = [...new Map(found.map((s) => [s.date, s])).values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(fomcEvent);
  if (failure) return { ...failure, events, detail: `history incomplete: ${failure.detail ?? failure.httpStatus ?? ""}`.trim() };
  // A calendar page with no statement on it is a page that changed shape, not a quiet year.
  if (!events.length) return { events, outcome: "error", httpStatus: 200, detail: "no FOMC statements found on the calendar page" };
  return { events, outcome: "ok", httpStatus: 200 };
}

/** Every CPI release in the BLS archive (February 2008 onward), one page. */
export async function fetchCpiReleases(): Promise<FetchResult> {
  const archive = await getPage(CPI_ARCHIVE);
  if ("failed" in archive) return archive.failed;
  const events = parseCpiReleases(archive.html).map(cpiEvent);
  if (!events.length) return { events, outcome: "error", httpStatus: 200, detail: "no CPI releases found in the archive page" };
  return { events, outcome: "ok", httpStatus: 200 };
}
