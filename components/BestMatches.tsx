"use client";

import type { TimelineEvent } from "@/lib/types";
import type { FocusResult } from "@/lib/focus";
import { focusScore } from "@/lib/focus";

/**
 * The most relevant events for what the visitor actually typed, above the chronology.
 *
 * Until now the only most-relevant-first surface required a visitor-configured model key and a
 * manual click (the AI panel's ranking). This strip is the keyless answer: the focus grade
 * (lib/focus.ts) orders the matches, the top few render with their match evidence, and each row
 * jumps to its place in the chronological list below — which stays complete and chronological.
 * The timeline is the product's spine; this is a reading aid on top, never a reorder of it.
 *
 * Renders nothing unless the focus is actually narrowing, so pages without a search qualifier
 * are untouched.
 */
export default function BestMatches({
  result,
  activeTypes,
  onJump,
  limit = 8,
}: {
  result: FocusResult;
  activeTypes: ReadonlySet<string>;
  onJump: (date: string) => void;
  limit?: number;
}) {
  if (!result.active || result.ranked.length === 0) return null;
  const rows = result.ranked.filter((e) => activeTypes.has(e.type)).slice(0, limit);
  if (rows.length === 0) return null;

  const evidence = (ev: TimelineEvent): string => {
    const inTitle = result.terms.filter((t) => ev.title.toLowerCase().includes(t));
    if (inTitle.length) return `“${inTitle.join("”, “")}” in the headline`;
    return `matches ${result.terms.slice(0, 3).join(", ")}`;
  };

  return (
    <div className="mb-4 rounded-xl border border-sky-900/60 bg-sky-950/20 p-3" data-best-matches>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-sky-400">
        Best matches for your search
      </p>
      <ol className="space-y-1.5">
        {rows.map((ev) => (
          <li key={ev.id}>
            <button
              type="button"
              onClick={() => onJump(ev.date)}
              className="group flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left hover:bg-sky-900/20"
              title={`Jump to ${ev.date} in the timeline`}
            >
              <span className="shrink-0 font-mono text-xs text-slate-500">{ev.date}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-200 group-hover:text-sky-200">
                {ev.title}
              </span>
              <span className="hidden shrink-0 text-[11px] text-slate-500 sm:inline">
                {evidence(ev)}
              </span>
              {/* the grade, visible so the ordering is inspectable rather than mysterious */}
              <span className="shrink-0 font-mono text-[11px] text-sky-500/80">
                {focusScore(ev, result.terms).toFixed(2)}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
