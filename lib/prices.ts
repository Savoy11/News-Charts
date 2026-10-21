import { FetchOutcome, PricePoint, TimelineEvent } from "./types";

export interface DailyPrices {
  points: PricePoint[];
  /** dividends and splits reported alongside the series, as timeline events */
  actions: TimelineEvent[];
}

/** `2:1`, or a numerator/denominator pair when Yahoo omits the formatted string. */
function splitRatio(raw: { splitRatio?: string; numerator?: number; denominator?: number }): string {
  if (raw.splitRatio) return raw.splitRatio.replace(/\s+/g, "");
  if (raw.numerator && raw.denominator) return `${raw.numerator}:${raw.denominator}`;
  return "";
}

/**
 * "Dividend of $0.2775 per share": the amount as declared, to the four places dividends are
 * actually declared in, never fewer than cents. `toFixed(2)` printed $0.2775 as $0.28 and a
 * $0.004 distribution as $0.00 (NC-155).
 */
export function dividendTitle(amount: number): string {
  const shown = amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return `Dividend of $${shown} per share`;
}

const day = (epochSeconds: number): string =>
  new Date(epochSeconds * 1000).toISOString().slice(0, 10);

export interface FetchedPrices extends DailyPrices {
  outcome: FetchOutcome;
  httpStatus?: number;
  detail?: string;
}

/** What a fetch asks for: the last ten years, or every daily close since the security listed. */
export type PriceSpan = "10y" | "full";

/**
 * The fetch-log query a full-history read is recorded under. Ingest reads it back to know a
 * series is complete, so routine refreshes can go back to ten years (NC-077).
 */
export const fullHistoryQuery = (symbol: string): string => `${symbol} full history`;

/** 1900-01-01: before any listing Yahoo carries, so "from here" means "from the first close". */
const BEFORE_ANY_LISTING = -2208988800;

/**
 * Daily closes from the Yahoo Finance chart API (unofficial but stable, no key), with what
 * happened kept.
 *
 * One request carries three things we want: closes, volume, and corporate actions
 * (`events=div,splits`) — so volume bars and dividend/split markers cost no extra fetch,
 * no extra key, and no extra rate-limit budget.
 *
 * A refusal used to come back as an empty series, so ingest could not tell "Yahoo had nothing"
 * from "Yahoo said no" — and logged neither (NC-103).
 *
 * **Full history is asked for by date, never as `range=max`.** Yahoo answers `range=max` with one
 * close a *month* whatever interval is requested — measured 2026-10-21: Ford's "max" was 169
 * points from 1984, IBM's 261 from 1962 — while the same request by date returns every daily
 * close (13,710 for Ford since June 1972). The split re-read (NC-156) asked for `max`, so a split
 * replaced a company's daily chart with a monthly one. An answer that is not daily is now an
 * error rather than a series.
 */
export async function fetchDailyPrices(ticker: string, span: PriceSpan = "10y"): Promise<FetchedPrices> {
  const window = span === "full" ? `period1=${BEFORE_ANY_LISTING}&period2=${Math.floor(Date.now() / 1000)}` : "range=10y";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?${window}&interval=1d&events=div%2Csplits`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      next: { revalidate: 3600 },
    });
  } catch (err) {
    return { points: [], actions: [], outcome: "error", detail: String(err).slice(0, 200) };
  }
  if (res.status === 429 || res.status === 503) {
    return { points: [], actions: [], outcome: "throttled", httpStatus: res.status };
  }
  const json = await res.json().catch(() => null);
  const result = json?.chart?.result?.[0];
  if (!res.ok || !result) {
    // Yahoo explains a refusal in chart.error ("No data found, symbol may be delisted").
    const said: string | undefined = json?.chart?.error?.description;
    return {
      points: [],
      actions: [],
      outcome: res.ok && !said ? "empty" : "error",
      httpStatus: res.status,
      detail: (said ?? (res.ok ? undefined : `HTTP ${res.status}`))?.slice(0, 200),
    };
  }

  const granularity: string | undefined = result.meta?.dataGranularity;
  if (granularity && granularity !== "1d") {
    return {
      points: [],
      actions: [],
      outcome: "error",
      httpStatus: res.status,
      detail: `Yahoo answered with ${granularity} closes, not daily — not stored`,
    };
  }

  const timestamps: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const closes: (number | null)[] = quote.close ?? [];
  const volumes: (number | null)[] = quote.volume ?? [];

  const points: PricePoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (c == null) continue;
    const v = volumes[i];
    points.push({
      time: day(timestamps[i]),
      value: Math.round(c * 100) / 100,
      ...(v == null ? {} : { volume: Math.round(v) }),
    });
  }

  return {
    points,
    actions: corporateActions(result?.events, ticker),
    outcome: points.length ? "ok" : "empty",
    httpStatus: res.status,
  };
}

/** Just the series and the actions, for callers that do not log the fetch. */
export async function getDailyPrices(ticker: string): Promise<DailyPrices> {
  const { points, actions } = await fetchDailyPrices(ticker);
  return { points, actions };
}

/** The split markers in a set of corporate actions — the ones that re-adjust a whole history. */
export function splitsIn(actions: TimelineEvent[]): TimelineEvent[] {
  return actions.filter((a) => a.dedupBasis?.includes(" split "));
}

/**
 * Yahoo keys both maps by epoch second, so the values carry their own `date` — read that
 * rather than the key, which is not always the same instant.
 */
function corporateActions(events: unknown, ticker: string): TimelineEvent[] {
  const ev = (events ?? {}) as {
    dividends?: Record<string, { amount?: number; date?: number }>;
    splits?: Record<string, { date?: number; splitRatio?: string; numerator?: number; denominator?: number }>;
  };
  const out: TimelineEvent[] = [];

  for (const d of Object.values(ev.dividends ?? {})) {
    if (!d?.date || d.amount == null) continue;
    const date = day(d.date);
    out.push({
      id: `yahoo-div-${ticker}-${date}`,
      date,
      type: "corporate_action",
      title: dividendTitle(d.amount),
      description: "Cash dividend with this ex-dividend date. A mechanical change, not news.",
      source: "Yahoo Finance",
      sourceKey: "yahoo_finance",
      externalId: `div-${ticker}-${date}`,
      dedupBasis: `${ticker} dividend ${date}`,
    });
  }

  for (const s of Object.values(ev.splits ?? {})) {
    if (!s?.date) continue;
    const date = day(s.date);
    const ratio = splitRatio(s);
    out.push({
      id: `yahoo-split-${ticker}-${date}`,
      date,
      type: "corporate_action",
      title: ratio ? `${ratio} stock split` : "Stock split",
      description:
        "The share count changed on this date. Prices here are split-adjusted, so the line " +
        "does not step — this marker is the only thing that says it happened.",
      source: "Yahoo Finance",
      sourceKey: "yahoo_finance",
      externalId: `split-${ticker}-${date}`,
      dedupBasis: `${ticker} split ${date}`,
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}
