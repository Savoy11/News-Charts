"use client";

import { adsLoadedHere, turnAdsOffAndReload } from "@/lib/adGate";

/**
 * Wraps the key forms. Where an ad script is already running, a key typed here could be read as it
 * is typed, so the form is replaced by a way to reload without ads first (NC-164).
 */
export default function AdFreeKeyEntry({ children }: { children: React.ReactNode }) {
  if (!adsLoadedHere()) return <>{children}</>;
  return (
    <div data-ad-free-key-entry className="rounded-md border border-amber-900/60 bg-amber-950/30 p-3 text-xs leading-relaxed text-amber-200/90">
      <p>
        Ads are running on this page, and an ad script could read a key typed beside it. Reload
        without ads to enter one; a browser that holds a key never loads ads on News Charts.
      </p>
      <button
        type="button"
        onClick={turnAdsOffAndReload}
        className="mt-2 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500"
      >
        Reload without ads
      </button>
    </div>
  );
}
