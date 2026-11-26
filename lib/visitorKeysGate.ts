/**
 * Whether the visitor's own NYT and Guardian keys are paused on this build (batch 186, NC-136).
 *
 * The bring-your-own-key path (lib/feedKeys.ts, lib/feeds/browser.ts) rests on a reading nobody has
 * made: that each publisher's developer terms let a key holder use a personal, non-commercial key
 * inside another party's ad-supported site. Both terms pages refused to be fetched on 2026-11-25, so
 * the reading is still unmade. The owner's call that day ("Pause visitor keys"): the feature is hidden
 * on the public site until the owner or a lawyer has read the two pages.
 *
 * "The public site" is `COMMERCIAL_MODE`, as everywhere else: on the owner's own machine the feature
 * stays, so the live check of the two feeds with real keys (NC-044) can still be made.
 *
 * To lift the pause, read https://developer.nytimes.com/terms and the Guardian Open Platform's terms,
 * record the reading in docs/decisions/, and set `VISITOR_KEYS_TERMS_READ` to true in the same change.
 * This module has no "use client": the layout reads it on the server and marks the page, and
 * lib/feedKeys.ts reads the mark in the browser.
 */
export const VISITOR_KEYS_TERMS_READ = false;

/** The attribute the layout sets on `<body>`, and its value while the keys are paused. */
export const VISITOR_KEYS_ATTR = "data-visitor-keys";
export const VISITOR_KEYS_PAUSED = "paused";

/** Whether this build hides the visitor-key feature: a public build whose terms reading is not made. */
export function visitorKeysPaused(env: Record<string, string | undefined> = process.env): boolean {
  return env.COMMERCIAL_MODE === "true" && !VISITOR_KEYS_TERMS_READ;
}
