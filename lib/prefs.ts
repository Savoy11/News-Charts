"use client";

/**
 * Visitor preferences. Held in this browser, never on a Chronolens server — the same
 * rule as the BYO-model key. The server stays stateless: pages send these values as
 * parameters and get a computation back, so one visitor's settings never alter what
 * anyone else sees, and nothing a visitor types can write to the shared corpus.
 */

export interface SignalPrefs {
  /** minimum events in a week before a spike counts at all */
  floor: number;
  /** robust deviations above baseline required */
  sigma: number;
  /** how far back to look */
  sinceMonths: number;
  /** percentage points of sector divergence worth reporting */
  divergencePct: number;
}

export interface SourcePrefs {
  /** extra Federal Register search terms, merged into sector timelines */
  federalRegisterTerms: string[];
}

export interface CustomGroup {
  name: string;
  tickers: string[];
}

export interface TimelinePrefs {
  /** collapse a period's events into one expandable stack, instead of a card each */
  stack: boolean;
  /** how a stack reveals its list */
  expand: "hover" | "click";
  /** starting zoom for a timeline you haven't visited before — 0 Compact, 1 Default, 2 Wide */
  defaultZoom: number;
}

export interface Prefs {
  signals: SignalPrefs;
  sources: SourcePrefs;
  groups: CustomGroup[];
  timeline: TimelinePrefs;
}

export const DEFAULT_PREFS: Prefs = {
  signals: { floor: 5, sigma: 2, sinceMonths: 30, divergencePct: 15 },
  sources: { federalRegisterTerms: [] },
  groups: [],
  timeline: { stack: true, expand: "hover", defaultZoom: 1 },
};

const STORAGE_KEY = "chronolens:prefs:v1";
export const PREFS_EVENT = "chronolens:prefs";

export function loadPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    // merge rather than replace, so a new field added later doesn't break saved prefs
    return {
      signals: { ...DEFAULT_PREFS.signals, ...(parsed.signals ?? {}) },
      sources: { ...DEFAULT_PREFS.sources, ...(parsed.sources ?? {}) },
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      timeline: { ...DEFAULT_PREFS.timeline, ...(parsed.timeline ?? {}) },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new Event(PREFS_EVENT));
}

export function resetPrefs(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(PREFS_EVENT));
}

export function openPrefs(): void {
  window.dispatchEvent(new Event("chronolens:open-settings"));
}

export function isDefault(prefs: Prefs): boolean {
  return JSON.stringify(prefs) === JSON.stringify(DEFAULT_PREFS);
}
