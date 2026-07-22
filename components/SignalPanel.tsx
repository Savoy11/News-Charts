import type { Signal, SignalKind } from "@/lib/signals";

const STYLE: Record<SignalKind, { label: string; cls: string }> = {
  volume_spike: { label: "Volume spike", cls: "border-sky-700/50 bg-sky-500/10 text-sky-300" },
  regulatory_burst: {
    label: "Regulatory burst",
    cls: "border-rose-700/50 bg-rose-500/10 text-rose-300",
  },
  cross_peer_cluster: {
    label: "Cross-peer",
    cls: "border-emerald-700/50 bg-emerald-500/10 text-emerald-300",
  },
  price_divergence: {
    label: "Price divergence",
    cls: "border-amber-700/50 bg-amber-500/10 text-amber-300",
  },
};

/**
 * Computed, not generated. Every row is arithmetic over the event table and carries the
 * rows that produced it — which is what a later explanation step will have to cite.
 */
export default function SignalPanel({ signals }: { signals: Signal[] }) {
  if (!signals.length) return null;

  return (
    <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-slate-800 px-4 py-2.5">
        <h2 className="text-sm font-bold text-slate-100">Signals</h2>
        <span className="text-xs text-slate-500">
          {signals.length} detected · computed from the timeline, not generated
        </span>
      </div>
      <ul className="divide-y divide-slate-800/70">
        {signals.slice(0, 8).map((s, i) => (
          <li key={`${s.kind}-${s.windowStart}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
            <span
              className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STYLE[s.kind].cls}`}
            >
              {STYLE[s.kind].label}
            </span>
            <span className="text-sm font-medium text-slate-200">{s.headline}</span>
            <span className="text-xs text-slate-500">{s.detail}</span>
            <span className="ml-auto shrink-0 text-right text-[11px] text-slate-600">
              {s.windowStart === s.windowEnd ? s.windowStart : `${s.windowStart} → ${s.windowEnd}`}
              {s.eventIds.length > 0 && (
                <>
                  {" · "}
                  <span className="text-slate-500">{s.eventIds.length} events</span>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
