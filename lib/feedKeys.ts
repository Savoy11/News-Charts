"use client";

import type { SourceKey } from "./types";

/**
 * Bring-your-own-key for the licensed news feeds.
 *
 * This is the same bargain as the AI panel, and it exists for a licensing reason rather than a
 * privacy one. NYT's public API terms are non-commercial with no self-serve commercial tier, and
 * the Guardian's free developer key is non-commercial too. Read through a *server* key, as the
 * shipped adapters do, the operator is the licensee — which is exactly the thing an ad-supported
 * site is not allowed to be.
 *
 * Read through the visitor's own key, the visitor is the licensee, and their own terms are the
 * ones that apply. That only holds if the key and everything fetched with it stay on their
 * machine, so:
 *
 *   - the key lives in localStorage and is never sent to a News Charts origin;
 *   - the fetch goes browser → publisher, with no proxy of ours in between;
 *   - **nothing fetched this way is ever persisted.** Writing those articles into the shared
 *     database would make us the redistributor and undo the whole argument, so the results are
 *     merged into the rendered timeline for that visitor and are gone on reload.
 *
 * The last point is the one worth guarding. The first two are visible in this file; the third is
 * an absence, and an absence is easy to break by accident later.
 */

export interface FeedKeys {
  nyt?: string;
  guardian?: string;
}

/** Which feeds can be read this way, and where a visitor gets a key. */
export const BYO_FEEDS: {
  id: keyof FeedKeys;
  source: SourceKey;
  label: string;
  where: string;
  hint: string;
}[] = [
  {
    id: "nyt",
    source: "nyt",
    label: "The New York Times",
    where: "developer.nytimes.com",
    hint: "Article Search reaches back to 1851 — the deepest archive here after the newspaper scans.",
  },
  {
    id: "guardian",
    source: "guardian",
    label: "The Guardian",
    where: "open-platform.theguardian.com",
    hint: "Open Platform covers 1999 onward, full text, generous limits.",
  },
];

const STORAGE_KEY = "news-charts:feed-keys:v1";

/** Fired whenever the stored keys change, so an open timeline re-reads them. */
export const FEED_KEYS_EVENT = "news-charts:feed-keys";

export function loadFeedKeys(): FeedKeys {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as FeedKeys;
    // Only known feeds, only non-empty strings — a malformed blob must not become a request.
    const out: FeedKeys = {};
    for (const f of BYO_FEEDS) {
      const v = parsed?.[f.id];
      if (typeof v === "string" && v.trim()) out[f.id] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

export function saveFeedKeys(keys: FeedKeys): void {
  const out: FeedKeys = {};
  for (const f of BYO_FEEDS) {
    const v = keys[f.id]?.trim();
    if (v) out[f.id] = v;
  }
  if (Object.keys(out).length === 0) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
  window.dispatchEvent(new Event(FEED_KEYS_EVENT));
}

export function clearFeedKeys(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(FEED_KEYS_EVENT));
}

export const hasAnyFeedKey = (keys: FeedKeys): boolean => BYO_FEEDS.some((f) => keys[f.id]);
