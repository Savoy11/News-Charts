import type { PricePoint } from "./types";

export interface GrowthOf100 {
  an: PricePoint[];
  bn: PricePoint[];
  /** the shared base day: both lines read exactly 100 here */
  start: string;
  end: string;
}

/**
 * Rebase both series to 100 on their first *shared* trading day, so the lines answer "$100 in
 * each on the same day — where are they now?" Comparing raw prices would just show that one stock
 * is pricier, not which performed better. Returns null if the two never share a day.
 *
 * The base day must be a day BOTH series have a row for. Taking each series' own first point in
 * the overlap rebased the two lines on different days whenever one had no row on the start day —
 * a crypto series beginning on a Saturday against a stock that first trades the Monday after, or
 * one listing's holiday — so "100" meant two different moments (NC-048).
 */
export function growthOf100(a: PricePoint[], b: PricePoint[]): GrowthOf100 | null {
  if (a.length === 0 || b.length === 0) return null;
  const end = a[a.length - 1].time < b[b.length - 1].time ? a[a.length - 1].time : b[b.length - 1].time;

  const bOn = new Map(b.map((p) => [p.time, p.value]));
  const base = a.find((p) => p.time <= end && p.value !== 0 && (bOn.get(p.time) ?? 0) !== 0);
  if (!base) return null;
  const start = base.time;
  const baseA = base.value;
  const baseB = bOn.get(start) as number;

  const rebase = (s: PricePoint[], by: number) =>
    s.filter((p) => p.time >= start && p.time <= end).map((p) => ({ time: p.time, value: (p.value / by) * 100 }));
  return { an: rebase(a, baseA), bn: rebase(b, baseB), start, end };
}
