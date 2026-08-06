import type { Metadata } from "next";
import ComparePicker from "@/components/ComparePicker";
import CompareView from "@/components/CompareView";
import AdSlot from "@/components/AdSlot";
import FinanceNowPromo from "@/components/FinanceNowPromo";
import { loadCompareSubject } from "@/lib/compare";

export const revalidate = 900;

// A tool view over arbitrary ?a/?b combinations — not something to fan out into the index.
export const metadata: Metadata = {
  title: "Compare timelines",
  description:
    "Put two companies or topics on one axis — overlaid price performance and a combined event timeline.",
  robots: { index: false },
};

export default async function ComparePage({
  searchParams,
}: {
  searchParams: { a?: string; b?: string };
}) {
  const a = searchParams.a?.trim() ?? "";
  const b = searchParams.b?.trim() ?? "";
  const wants = Boolean(a && b);

  const [subA, subB] = wants
    ? await Promise.all([loadCompareSubject(a), loadCompareSubject(b)])
    : [null, null];

  const misses = [
    wants && !subA ? a : null,
    wants && !subB ? b : null,
  ].filter(Boolean) as string[];

  return (
    <div>
      <div className="mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-sky-400">Compare</p>
        <h1 className="text-2xl font-black leading-tight text-slate-100">Two subjects, one axis</h1>
        <p className="mt-1 text-sm text-slate-500">
          Overlay two companies or topics — relative price performance and a combined event
          timeline. Try <span className="text-slate-400">NVDA vs AMD</span>, or{" "}
          <span className="text-slate-400">bicycle vs automobile</span>.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
        <ComparePicker a={a} b={b} />
      </div>

      {misses.length > 0 && (
        <p className="mb-6 rounded-lg border border-amber-800/50 bg-amber-500/5 p-3 text-sm text-amber-300/90">
          Couldn’t find {misses.map((m) => `“${m}”`).join(" or ")}. Check the spelling, or try a
          ticker for a company.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div>
          {subA && subB ? (
            <CompareView a={subA} b={subB} />
          ) : (
            !wants && (
              <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">
                Enter two subjects above to compare their timelines.
              </div>
            )
          )}
        </div>
        <aside className="space-y-4">
          <AdSlot />
          <FinanceNowPromo />
        </aside>
      </div>
    </div>
  );
}
