/**
 * A price as a reader should see it: cents from a dollar up, and below that enough places for a
 * split-adjusted 1970s close to read as itself — $0.0344, not $0.03. Storage keeps six places
 * whatever this shows (audit 2026-10-21 #1); this is the only place cents are chosen.
 */
export function formatPrice(n: number): string {
  const a = Math.abs(n);
  return n.toFixed(a >= 1 || a === 0 ? 2 : a >= 0.01 ? 4 : 6);
}
