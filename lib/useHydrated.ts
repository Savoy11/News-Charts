"use client";

import { useSyncExternalStore } from "react";

const noSubscription = () => () => {};

/**
 * False on the server and through hydration, true once the page is live in the browser.
 *
 * The components that need this used to keep a `mounted` flag set from an effect, which renders
 * everything twice and is what eslint-plugin-react-hooks 7 flags as setState in an effect.
 * `useSyncExternalStore` gives the same answer with the server snapshot during hydration and the
 * client one after, so nothing renders differently on the server and the first client pass.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false
  );
}
