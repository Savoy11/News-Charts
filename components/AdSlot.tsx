/**
 * Placeholder ad unit — a blank block standing in for a real advertisement.
 *
 * Sized to the IAB formats the layout actually has room for, so whatever ships later drops into
 * a space the page has already reserved. A placeholder that is shorter than the unit replacing
 * it is how a live ad ends up shoving the paragraph a reader is mid-sentence in.
 *
 * When the site is approved for AdSense, replace the inner block with the `<ins>` snippet for
 * the matching format and load the script in `layout.tsx`. Nothing else about the page changes.
 *
 * ⚠ Ads make the site commercial, which turns on the `COMMERCIAL_MODE` obligation in
 * `lib/ingest/store.ts` — several news sources are licensed for non-commercial use only. See the
 * open `P0` in docs/MASTER-CHECKLIST.md before any of these carry a real ad.
 */
export type AdFormat = "leaderboard" | "billboard" | "rectangle";

const FORMATS: Record<AdFormat, { className: string; nominal: string }> = {
  /** 728×90 — the wide, short unit beside a panel in a `2fr_1fr` grid. */
  leaderboard: { className: "h-24", nominal: "728 × 90" },
  /** 970×250 — the full-width block below the content. */
  billboard: { className: "h-[250px]", nominal: "970 × 250" },
  /** 300×250 — the sidebar unit. */
  rectangle: { className: "h-[250px]", nominal: "300 × 250" },
};

export default function AdSlot({
  label = "Advertisement",
  format = "leaderboard",
}: {
  label?: string;
  format?: AdFormat;
}) {
  const { className, nominal } = FORMATS[format];
  return (
    <div
      data-ad-slot={format}
      className={`flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-700 bg-slate-900/50 ${className}`}
    >
      <span className="text-xs uppercase tracking-widest text-slate-600">{label}</span>
      <span className="text-[10px] tracking-wider text-slate-700">{nominal}</span>
    </div>
  );
}
