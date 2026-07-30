"use client";

import { useEffect, useState } from "react";
import { FEED_KEYS_EVENT, hasAnyFeedKey, loadFeedKeys } from "./feedKeys";
import { fetchVisitorFeeds } from "./feeds/browser";
import { collapseNearDuplicates } from "./newsQuality";
import type { TimelineEvent } from "./types";

/**
 * Articles the visitor's own feed keys add to a subject, held in component state and nowhere
 * else.
 *
 * Not persisted, on purpose and load-bearingly: these were fetched under the visitor's licence,
 * and writing them into the shared database would make this site the redistributor — which is
 * the exact thing the BYO-key arrangement exists to avoid. They live for the life of the page.
 *
 * They are also deduped against what the server already had, because the operator's key and the
 * visitor's key can return the same article, and one story twice is worse than the story once.
 */
export function useVisitorFeeds(query: string, existing: TimelineEvent[]): TimelineEvent[] {
  const [extra, setExtra] = useState<TimelineEvent[]>([]);

  useEffect(() => {
    let live = true;
    const run = () => {
      const keys = loadFeedKeys();
      if (!hasAnyFeedKey(keys) || !query.trim()) {
        setExtra([]);
        return;
      }
      fetchVisitorFeeds(keys, query).then((events) => {
        if (live) setExtra(events);
      });
    };
    run();
    // re-run when the visitor adds or removes a key without reloading
    window.addEventListener(FEED_KEYS_EVENT, run);
    return () => {
      live = false;
      window.removeEventListener(FEED_KEYS_EVENT, run);
    };
  }, [query]);

  if (!extra.length) return [];
  // collapseNearDuplicates keeps the richest copy and preserves order, so passing the existing
  // events first means an article we already had wins and only genuinely new ones survive.
  const merged = collapseNearDuplicates([...existing, ...extra]);
  const had = new Set(existing.map((e) => e.id));
  return merged.filter((e) => !had.has(e.id));
}
