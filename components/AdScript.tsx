"use client";

import { useEffect } from "react";
import { markAdsLoaded, mayLoadAds } from "@/lib/adGate";

/**
 * The ad network's loader, and the only way an ad script reaches a page (NC-164).
 *
 * Nothing loads until `NEXT_PUBLIC_AD_SCRIPT_URL` names the network's script — none is chosen yet
 * (NC-121) — and then only in a browser that holds no visitor key (`lib/adGate.ts`). The script is
 * injected after hydration, never written into the HTML, because the server cannot see
 * localStorage: only the browser knows whether a key is there. The URL's origin is the one
 * outside host the CSP lets scripts come from (next.config.mjs).
 */
const AD_SCRIPT_URL = process.env.NEXT_PUBLIC_AD_SCRIPT_URL ?? "";

export default function AdScript() {
  useEffect(() => {
    if (!/^https:\/\//.test(AD_SCRIPT_URL) || !mayLoadAds()) return;
    const s = document.createElement("script");
    s.src = AD_SCRIPT_URL;
    s.async = true;
    s.dataset.adScript = "";
    document.head.appendChild(s);
    markAdsLoaded();
  }, []);
  return null;
}
