"use client";

/**
 * Small localStorage helpers for remembering a reader's per-subject view (which
 * sections are collapsed, which filter chips are on) across visits — not just the
 * current tab. Same privacy rule as prefs: held in this browser, never on a server.
 * All access is guarded so SSR and a disabled/again-full storage never throw.
 */

export function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable or full — the view just won't be remembered */
  }
}
