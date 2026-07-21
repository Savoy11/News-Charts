"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CURATED, INITIAL, pickMix, type Suggestion } from "@/lib/suggestions";

const ROTATE_MS = 3800;
const FADE_MS = 260;

export default function SuggestionChips() {
  // must match the server render exactly, so the first paint is the fixed set
  const [items, setItems] = useState<Suggestion[]>(INITIAL);
  const [fading, setFading] = useState<number | null>(null);
  const pool = useRef<Suggestion[]>(CURATED);
  const lastSlot = useRef<number>(-1);
  const [ready, setReady] = useState(false);

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const reshuffle = useCallback(() => {
    setItems(pickMix(pool.current));
  }, []);

  // shuffle after mount (never during render — that would break hydration), and
  // pull in subjects people have actually looked at
  useEffect(() => {
    setReady(true);
    setItems(pickMix(pool.current));
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

  // swap one chip at a time — a full reshuffle on a timer is distracting
  useEffect(() => {
    if (!ready || reducedMotion) return;
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
  }, [ready, reducedMotion, items.length]);

  return (
    <div className="mt-4 flex min-h-[2rem] flex-wrap items-center justify-center gap-2">
      <span className="text-sm text-slate-500">Try:</span>
      {items.map((s, i) => (
        <Link
          key={`${i}-${s.label}`}
          href={s.href}
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
