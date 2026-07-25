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

/** A labelled on/off switch. */
function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-xs font-medium text-slate-400">{label}</span>
        <span className="text-[11px] text-slate-600">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors ${
          checked ? "border-sky-600 bg-sky-600/40" : "border-slate-700 bg-slate-800"
        }`}
      >
        <span
          className={`block h-4 w-4 rounded-full bg-slate-200 transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

/** A segmented single-choice control, styled like the timeline's zoom switch. */
function Segmented<T extends string | number>({
  label,
  hint,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  hint: string;
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <div className={disabled ? "opacity-40" : undefined}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-slate-400">{label}</span>
      </div>
      <div className="mt-1 flex rounded-md border border-slate-700" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            disabled={disabled}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`flex-1 px-2.5 py-1 text-xs font-semibold first:rounded-l-md last:rounded-r-md disabled:cursor-not-allowed ${
              value === o.value ? "bg-sky-600/25 text-sky-300" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <span className="mt-1 block text-[11px] text-slate-600">{hint}</span>
    </div>
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
      {/* -------------------------------------------------------- timeline */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-200">Timeline display</h3>
          <p className="text-xs text-slate-500">
            How the horizontal timeline lays out events. These are display-only and take effect the
            next time a timeline renders.
          </p>
        </div>
        <Toggle
          label="Stack busy periods"
          hint="collapse a period's events into one card you expand — off shows every event on the track"
          checked={prefs.timeline.stack}
          onChange={(stack) => set({ timeline: { ...prefs.timeline, stack } })}
        />
        <Segmented
          label="Open a stack on"
          hint={
            prefs.timeline.stack
              ? "hover to peek as you scan, or click for a deliberate open (better on touch)"
              : "only applies while stacking is on"
          }
          value={prefs.timeline.expand}
          disabled={!prefs.timeline.stack}
          options={[
            { value: "hover", label: "Hover" },
            { value: "click", label: "Click" },
          ]}
          onChange={(expand) => set({ timeline: { ...prefs.timeline, expand } })}
        />
        <Segmented
          label="Default zoom"
          hint="starting spacing for a timeline you open for the first time"
          value={prefs.timeline.defaultZoom}
          options={[
            { value: 0, label: "Compact" },
            { value: 1, label: "Default" },
            { value: 2, label: "Wide" },
          ]}
          onChange={(defaultZoom) => set({ timeline: { ...prefs.timeline, defaultZoom } })}
        />
      </section>

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
