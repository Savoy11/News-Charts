import { PricePoint, TimelineEvent } from "./types";

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

const day = (epochSeconds: number): string =>
  new Date(epochSeconds * 1000).toISOString().slice(0, 10);

/**
 * Daily closes from the Yahoo Finance chart API (unofficial but stable, no key).
 *
 * One request carries three things we want: closes, volume, and corporate actions
 * (`events=div,splits`) — so volume bars and dividend/split markers cost no extra fetch,
 * no extra key, and no extra rate-limit budget.
 */
export async function getDailyPrices(ticker: string): Promise<DailyPrices> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?range=10y&interval=1d&events=div%2Csplits`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return { points: [], actions: [] };
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return { points: [], actions: [] };

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

  return { points, actions: corporateActions(result?.events, ticker) };
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
      title: `Dividend of $${d.amount.toFixed(2)} per share`,
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
