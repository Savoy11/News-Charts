"use client";

import { useEffect, useState } from "react";
import type { Signal, SignalKind } from "@/lib/signals";
import { DEFAULT_PREFS, loadPrefs, openPrefs, PREFS_EVENT, type Prefs } from "@/lib/prefs";
import type { TimelineEvent } from "@/lib/types";

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

interface Props {
  industrySlug?: string;
  tickers?: string[];
  /** extra Federal Register hits pulled for the visitor's own search terms */
  onExtraEvents?: (events: TimelineEvent[]) => void;
}

/**
 * Computed, not generated — every row is arithmetic over the event table and carries the
 * rows that produced it. Thresholds come from the visitor's own settings, so the panel is
 * fetched client-side rather than rendered on the server.
 */
export default function SignalPanel({ industrySlug, tickers, onExtraEvents }: Props) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setPrefs(loadPrefs());
    refresh();
    window.addEventListener(PREFS_EVENT, refresh);
    return () => window.removeEventListener(PREFS_EVENT, refresh);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({
      floor: String(prefs.signals.floor),
      sigma: String(prefs.signals.sigma),
      sinceMonths: String(prefs.signals.sinceMonths),
      divergencePct: String(prefs.signals.divergencePct),
    });
    if (industrySlug) params.set("industry", industrySlug);
    if (tickers?.length) params.set("tickers", tickers.join(","));
    if (prefs.sources.federalRegisterTerms.length) {
      params.set("frTerms", prefs.sources.federalRegisterTerms.join(","));
    }

    let cancelled = false;
    fetch(`/api/signals?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setSignals(json.signals ?? []);
        setError(json.error ?? null);
        if (json.extraEvents?.length) onExtraEvents?.(json.extraEvents);
      })
      .catch((err) => !cancelled && setError(String(err)));
    return () => {
      cancelled = true;
    };
    // onExtraEvents is intentionally excluded: an inline callback would refetch every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [industrySlug, tickers?.join(","), JSON.stringify(prefs.signals), prefs.sources.federalRegisterTerms.join(",")]);

  const terms = prefs.sources.federalRegisterTerms;

  return (
    <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-slate-800 px-4 py-2.5">
        <h2 className="text-sm font-bold text-slate-100">Signals</h2>
        <span className="text-xs text-slate-500">
          {signals === null
            ? "computing…"
            : `${signals.length} detected · computed from the timeline, not generated`}
        </span>
        <button
          onClick={openPrefs}
          className="ml-auto text-xs font-semibold text-slate-500 hover:text-sky-300"
          title="Adjust sensitivity, sources and groups"
        >
          floor {prefs.signals.floor} · {prefs.signals.sigma}σ · {prefs.signals.sinceMonths}mo
          {terms.length > 0 && ` · +${terms.length} source${terms.length > 1 ? "s" : ""}`}
        </button>
      </div>

      {error && <p className="px-4 py-2 text-xs text-red-400">{error}</p>}

      {signals !== null && signals.length === 0 && !error && (
        <p className="px-4 py-3 text-xs text-slate-500">
          Nothing above your thresholds.{" "}
          <button onClick={openPrefs} className="font-semibold text-sky-400 hover:text-sky-300">
            Loosen them in settings
          </button>{" "}
          to surface more.
        </p>
      )}

      <ul className="divide-y divide-slate-800/70">
        {(signals ?? []).slice(0, 10).map((s, i) => (
          <li
            key={`${s.kind}-${s.windowStart}-${i}`}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5"
          >
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
