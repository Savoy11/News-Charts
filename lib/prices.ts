import { PricePoint } from "./types";

/** Daily closes from Yahoo Finance chart API (unofficial but stable, no key). */
export async function getDailyPrices(ticker: string): Promise<PricePoint[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?range=10y&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];
  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
  const points: PricePoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (c == null) continue;
    points.push({
      time: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
      value: Math.round(c * 100) / 100,
    });
  }
  return points;
}
