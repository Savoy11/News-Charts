"use client";

import { useState } from "react";
import {
  DEFAULT_PREFS,
  isDefault,
  resetPrefs,
  savePrefs,
  type Prefs,
} from "@/lib/prefs";

function Num({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block text-xs font-medium text-slate-400">
      <span className="flex items-baseline justify-between">
        {label}
        <span className="font-mono text-slate-300">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-sky-500"
      />
      <span className="text-[11px] font-normal text-slate-600">{hint}</span>
    </label>
  );
}

/** Chip list editor used for both extra source terms and group tickers. */
function Chips({
  values,
  placeholder,
  transform = (s) => s,
  onChange,
}: {
  values: string[];
  placeholder: string;
  transform?: (s: string) => string;
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const v = transform(draft.trim());
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
    setDraft("");
  }
  return (
    <div>
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:border-sky-600 focus:outline-none"
        />
        <button
          onClick={add}
          className="rounded border border-slate-700 px-2.5 text-xs font-semibold text-slate-300 hover:border-sky-600"
        >
          Add
        </button>
      </div>
      {values.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <button
              key={v}
              onClick={() => onChange(values.filter((x) => x !== v))}
              title="Remove"
              className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:border-red-800 hover:text-red-400"
            >
              {v} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PrefsSettings({
  prefs,
  onChange,
}: {
  prefs: Prefs;
  onChange: (p: Prefs) => void;
}) {
  const [groupName, setGroupName] = useState("");

  function set(patch: Partial<Prefs>) {
    const next = { ...prefs, ...patch };
    savePrefs(next);
    onChange(next);
  }

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------- signals */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-200">Signal sensitivity</h3>
          <p className="text-xs text-slate-500">
            How strict the Signals panel is. Lower thresholds surface more, and more noise.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Num
            label="Minimum events per week"
            hint="absolute floor before a spike counts at all"
            value={prefs.signals.floor}
            min={2}
            max={20}
            onChange={(floor) => set({ signals: { ...prefs.signals, floor } })}
          />
          <Num
            label="Deviations above baseline"
            hint="robust spreads over the median week"
            value={prefs.signals.sigma}
            min={0}
            max={5}
            step={0.5}
            onChange={(sigma) => set({ signals: { ...prefs.signals, sigma } })}
          />
          <Num
            label="Lookback (months)"
            hint="how far back signals are computed"
            value={prefs.signals.sinceMonths}
            min={3}
            max={120}
            step={3}
            onChange={(sinceMonths) => set({ signals: { ...prefs.signals, sinceMonths } })}
          />
          <Num
            label="Price divergence (points)"
            hint="gap from the sector median worth reporting"
            value={prefs.signals.divergencePct}
            min={5}
            max={200}
            step={5}
            onChange={(divergencePct) => set({ signals: { ...prefs.signals, divergencePct } })}
          />
        </div>
      </section>

      {/* ---------------------------------------------------------- sources */}
      <section className="space-y-2">
        <div>
          <h3 className="text-sm font-bold text-slate-200">Your own sources</h3>
          <p className="text-xs text-slate-500">
            Extra Federal Register searches merged into sector timelines. Terms are queried
            against sources Chronolens already trusts — arbitrary URLs are deliberately not
            accepted, so nothing here can be pointed at an internal address.
          </p>
        </div>
        <Chips
          values={prefs.sources.federalRegisterTerms}
          placeholder="e.g. export controls, tariffs, rare earth"
          onChange={(federalRegisterTerms) => set({ sources: { federalRegisterTerms } })}
        />
      </section>

      {/* ----------------------------------------------------------- groups */}
      <section className="space-y-2">
        <div>
          <h3 className="text-sm font-bold text-slate-200">Custom peer groups</h3>
          <p className="text-xs text-slate-500">
            Your own sets, which can span SIC codes — an “AI chip makers” group that SIC would
            never put together. Each gets a timeline and its own signals.
          </p>
        </div>

        {prefs.groups.map((g, gi) => (
          <div key={gi} className="rounded-md border border-slate-800 p-2.5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <a
                href={`/group/${encodeURIComponent(g.name)}`}
                className="text-sm font-semibold text-emerald-400 hover:text-emerald-300"
              >
                {g.name}
              </a>
              <button
                onClick={() => set({ groups: prefs.groups.filter((_, i) => i !== gi) })}
                className="text-xs font-semibold text-slate-600 hover:text-red-400"
              >
                delete group
              </button>
            </div>
            <Chips
              values={g.tickers}
              placeholder="add a ticker"
              transform={(s) => s.toUpperCase()}
              onChange={(tickers) =>
                set({ groups: prefs.groups.map((x, i) => (i === gi ? { ...x, tickers } : x)) })
              }
            />
          </div>
        ))}

        <div className="flex gap-1.5">
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="new group name"
            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:border-emerald-600 focus:outline-none"
          />
          <button
            onClick={() => {
              const name = groupName.trim();
              if (!name || prefs.groups.some((g) => g.name === name)) return;
              set({ groups: [...prefs.groups, { name, tickers: [] }] });
              setGroupName("");
            }}
            className="rounded border border-slate-700 px-2.5 text-xs font-semibold text-slate-300 hover:border-emerald-600"
          >
            Create
          </button>
        </div>
      </section>

      {!isDefault(prefs) && (
        <button
          onClick={() => {
            resetPrefs();
            onChange(DEFAULT_PREFS);
          }}
          className="text-xs font-semibold text-slate-500 hover:text-red-400"
        >
          Reset all preferences
        </button>
      )}
    </div>
  );
}
