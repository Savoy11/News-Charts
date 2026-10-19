"use client";

/**
 * Whether this browser may load an ad network's script (NC-164).
 *
 * Visitors' own keys — an AI provider's, the NYT's, the Guardian's — live in localStorage on this
 * origin, and an ad script loaded on the same origin can read localStorage like any other script.
 * The settings copy promising that a key "never reaches a News Charts server" says nothing about a
 * third party running on our pages. The owner's call (2026-10-19): **a browser that holds a key
 * loads no ads at all.** Simpler and stronger than isolating the keys on a second origin, at the
 * cost of ad views from the few visitors who bring keys.
 *
 * Two more cases close the gaps around that rule:
 *  - a key typed into a page where an ad script is already running could be read as it is typed,
 *    so the key forms are replaced by a "reload without ads" button there (`adsLoadedHere`);
 *  - that reload turns ads off for the rest of the tab's session (`turnAdsOffAndReload`), so the
 *    page the key is typed into never had one.
 *
 * Every ad loader goes through `mayLoadAds`; `components/AdScript.tsx` is the only one.
 */

/** Where the key-holding features keep their keys: lib/ai/client.ts and lib/feedKeys.ts. */
export const KEY_STORAGE = { ai: "news-charts:ai:v1", feeds: "news-charts:feed-keys:v1" } as const;
/** Set for the tab's session by `turnAdsOffAndReload`. */
export const ADS_OFF_FLAG = "news-charts:ads-off";

type Readable = Pick<Storage, "getItem">;

/**
 * True when either feature holds a key. A stored entry that will not parse counts as a key —
 * the cautious reading — while an AI setup with no key (a local model) does not.
 */
export function holdsVisitorKeys(storage: Readable | null): boolean {
  if (!storage) return false;
  const ai = storage.getItem(KEY_STORAGE.ai);
  if (ai) {
    try {
      if (String(JSON.parse(ai)?.apiKey ?? "").trim()) return true;
    } catch {
      return true;
    }
  }
  const feeds = storage.getItem(KEY_STORAGE.feeds);
  if (feeds) {
    try {
      const parsed = JSON.parse(feeds) ?? {};
      if (Object.values(parsed).some((v) => typeof v === "string" && v.trim())) return true;
    } catch {
      return true;
    }
  }
  return false;
}

/** localStorage and sessionStorage throw in some private modes; then nothing can be stored either. */
function store(kind: "localStorage" | "sessionStorage"): Storage | null {
  try {
    return typeof window === "undefined" ? null : window[kind];
  } catch {
    return null;
  }
}

/** The one question every ad loader asks. */
export function mayLoadAds(local: Readable | null = store("localStorage"), session: Readable | null = store("sessionStorage")): boolean {
  try {
    if (session?.getItem(ADS_OFF_FLAG)) return false;
    return !holdsVisitorKeys(local);
  } catch {
    return false;
  }
}

let loadedHere = false;

/** Called by the ad loader once it has injected a script into this page. */
export function markAdsLoaded(): void {
  loadedHere = true;
}

/** Whether an ad script is running in this page — the key forms must not be filled in beside it. */
export function adsLoadedHere(): boolean {
  return loadedHere;
}

/** Turn ads off for this tab's session and reload, so the next page has never run one. */
export function turnAdsOffAndReload(): void {
  try {
    store("sessionStorage")?.setItem(ADS_OFF_FLAG, "1");
  } finally {
    window.location.reload();
  }
}
