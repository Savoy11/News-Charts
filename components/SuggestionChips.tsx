"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { INITIAL, pickMix, type Suggestion } from "@/lib/suggestions";

const ROTATE_MS = 3800;
const FADE_MS = 260;

/**
 * `initial` is picked on the server from what the corpus actually holds, so the first paint
 * offers subjects that exist. It falls back to the curated seed only when the caller has nothing
 * — the same fallback the API applies, kept here so this component is still usable on its own.
 */
export default function SuggestionChips({ initial = INITIAL }: { initial?: Suggestion[] }) {
  // must match the server render exactly, so the first paint is the set that was rendered
  const [items, setItems] = useState<Suggestion[]>(initial);
  const [fading, setFading] = useState<number | null>(null);
  const pool = useRef<Suggestion[]>(initial);
  const lastSlot = useRef<number>(-1);
  const [ready, setReady] = useState(false);

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const reshuffle = useCallback(() => {
    setItems(pickMix(pool.current));
  }, []);

  /**
   * Widen the pool after mount. The server sent five chips; the API sends the whole set the
   * rotation draws from, so the swap-one-chip-at-a-time effect below has somewhere to go.
   *
   * No reshuffle before that lands: the server already picked from the corpus, and re-picking
   * from a five-item pool would only churn the same five.
   */
  useEffect(() => {
    setReady(true);
    let cancelled = false;
    fetch("/api/suggestions")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json?.suggestions?.length) {
          pool.current = json.suggestions as Suggestion[];
          setItems(pickMix(pool.current));
        }
      })
      .catch(() => {
        /* seed pool is already loaded */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Whether a pointer is over the row, or a chip has keyboard focus.
   *
   * Rotation must stop while someone is aiming at a chip. A swap takes 260ms and fires every
   * 3.8s, so a click that lands during one goes to a different subject than the one read — the
   * reader gets a page they did not ask for and no way to know why.
   */
  const [engaged, setEngaged] = useState(false);

  // swap one chip at a time — a full reshuffle on a timer is distracting
  useEffect(() => {
    if (!ready || reducedMotion || engaged) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      // don't re-roll the slot we just changed — it reads as one twitchy chip
      let slot = Math.floor(Math.random() * items.length);
      if (items.length > 1 && slot === lastSlot.current) {
        slot = (slot + 1 + Math.floor(Math.random() * (items.length - 1))) % items.length;
      }
      lastSlot.current = slot;
      setFading(slot);
      setTimeout(() => {
        setItems((current) => {
          const shown = new Set(current.map((s) => s.label));
          const candidates = pool.current.filter(
            (s) => !shown.has(s.label) && s.kind === current[slot].kind
          );
          if (!candidates.length) return current;
          const next = [...current];
          next[slot] = candidates[Math.floor(Math.random() * candidates.length)];
          return next;
        });
        setFading(null);
      }, FADE_MS);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [ready, reducedMotion, engaged, items.length]);

  return (
    <div
      className="mt-4 flex min-h-[2rem] flex-wrap items-center justify-center gap-2"
      onMouseEnter={() => setEngaged(true)}
      onMouseLeave={() => setEngaged(false)}
      onFocusCapture={() => setEngaged(true)}
      onBlurCapture={() => setEngaged(false)}
    >
      <span className="text-sm text-slate-500">Try:</span>
      {items.map((s, i) => (
        <Link
          key={`${i}-${s.label}`}
          href={s.href}
          /* A decorative chip must not spend real work: prefetching a page for a subject the
             corpus lacks triggers a first-visit gather (lib/ingest/firstPass.ts) for a page
             nobody asked for yet, and five of them on every homepage load saturate the
             deliberately small ingest pool — measured queueing real searches behind them.
             The gather runs when someone actually clicks. */
          prefetch={false}
          style={{ transitionDuration: `${FADE_MS}ms` }}
          className={`rounded-full border px-3 py-1 text-sm transition-all ${
            fading === i ? "scale-95 opacity-0" : "scale-100 opacity-100"
          } ${
            s.kind === "company"
              ? "border-slate-700 text-slate-300 hover:border-sky-600 hover:text-sky-300"
              : "border-slate-700 text-slate-300 hover:border-violet-600 hover:text-violet-300"
          }`}
        >
          {s.label}
        </Link>
      ))}
      <button
        onClick={reshuffle}
        title="Show different suggestions"
        aria-label="Show different suggestions"
        className="ml-1 rounded-full border border-slate-800 px-2 py-1 text-sm text-slate-600 transition-colors hover:border-slate-600 hover:text-slate-300"
      >
        ↻
      </button>
    </div>
  );
}
