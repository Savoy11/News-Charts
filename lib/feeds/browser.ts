import { storyKey } from "../newsQuality";
import type { TimelineEvent } from "../types";
import type { FeedKeys } from "../feedKeys";

/**
 * The licensed feeds, read from the visitor's browser with the visitor's own key.
 *
 * Parsing is deliberately kept identical to the server adapters in `lib/newsExtra.ts` — same
 * fields, same identity (`storyKey`), same `sourceKey` — so an article looks and dedups the same
 * whichever way it arrived. Two readers of one payload that disagree is how a "your key" article
 * ends up as a duplicate row next to an operator-key one.
 *
 * These are separate functions rather than a shared one because the server versions read
 * `process.env` and carry Next's `revalidate` cache hints. Both would be wrong here: there is no
 * env in a browser, and caching a response fetched under someone's personal key in a shared
 * layer is the mistake this whole feature exists to avoid.
 *
 * ⚠ **Unverified live, on two counts — and neither is egress.** These are the NYT and Guardian
 * endpoints, which need keys the build container does not hold; and browser-side use additionally
 * depends on each publisher sending permissive CORS headers, which no server-side check can test
 * whatever the network allows. (Egress itself is open as of 2026-08-12.) Both APIs are widely used from
 * browsers and document doing so, but a CORS failure is the most likely way this feature is
 * broken in the wild, and it will surface as "no articles" rather than as an error.
 */

const toDay = (d: Date): string | null =>
  Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

interface NytDoc {
  headline?: { main?: string };
  web_url?: string;
  pub_date?: string;
  abstract?: string;
  snippet?: string;
  byline?: { original?: string };
}

export async function fetchNytInBrowser(key: string, query: string): Promise<TimelineEvent[]> {
  if (!key.trim() || !query.trim()) return [];
  const url =
    `https://api.nytimes.com/svc/search/v2/articlesearch.json?q=${encodeURIComponent(`"${query}"`)}` +
    `&sort=newest&api-key=${encodeURIComponent(key.trim())}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    const docs: NytDoc[] = json?.response?.docs ?? [];
    const events: TimelineEvent[] = [];
    for (const doc of docs) {
      const title = doc.headline?.main?.trim();
      const day = doc.pub_date ? toDay(new Date(doc.pub_date)) : null;
      if (!title || !doc.web_url || !day) continue;
      const byline = doc.byline?.original?.trim();
      const summary = (doc.abstract ?? doc.snippet ?? "").trim();
      events.push({
        id: `byo-nyt-${events.length}`,
        date: day,
        type: "news",
        title,
        source: "The New York Times",
        url: doc.web_url,
        description: [byline, summary].filter(Boolean).join(" — ").slice(0, 240) || undefined,
        sourceKey: "nyt",
        externalId: doc.web_url,
        dedupBasis: storyKey(title, day),
      });
    }
    return events;
  } catch {
    // A missing key, a quota, a CORS rejection — all mean "no extra articles", never a broken
    // page. The visitor's own timeline must not depend on their key working.
    return [];
  }
}

interface GuardianResult {
  webTitle?: string;
  webUrl?: string;
  webPublicationDate?: string;
  fields?: { thumbnail?: string; trailText?: string; byline?: string };
}

export async function fetchGuardianInBrowser(key: string, query: string): Promise<TimelineEvent[]> {
  if (!key.trim() || !query.trim()) return [];
  const url =
    `https://content.guardianapis.com/search?q=${encodeURIComponent(`"${query}"`)}` +
    `&order-by=newest&page-size=25&show-fields=thumbnail,trailText,byline` +
    `&api-key=${encodeURIComponent(key.trim())}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    const results: GuardianResult[] = json?.response?.results ?? [];
    const events: TimelineEvent[] = [];
    for (const r of results) {
      const day = r.webPublicationDate ? toDay(new Date(r.webPublicationDate)) : null;
      if (!r.webTitle || !r.webUrl || !day) continue;
      const byline = r.fields?.byline?.trim();
      const trail = r.fields?.trailText ? stripHtml(r.fields.trailText) : "";
      const thumb = r.fields?.thumbnail;
      events.push({
        id: `byo-gdn-${events.length}`,
        date: day,
        type: "news",
        title: r.webTitle,
        source: "The Guardian",
        url: r.webUrl,
        description: [byline, trail].filter(Boolean).join(" — ").slice(0, 240) || undefined,
        imageUrl: thumb && /^https?:\/\//i.test(thumb) ? thumb : undefined,
        sourceKey: "guardian",
        externalId: r.webUrl,
        dedupBasis: storyKey(r.webTitle, day),
      });
    }
    return events;
  } catch {
    return [];
  }
}

/**
 * Everything the visitor's own keys can add for one subject.
 *
 * Failures are per-feed and silent by design: one publisher rejecting a key must not cost the
 * articles the other returned, and neither must cost the timeline that was already on screen.
 */
export async function fetchVisitorFeeds(keys: FeedKeys, query: string): Promise<TimelineEvent[]> {
  const jobs: Promise<TimelineEvent[]>[] = [];
  if (keys.nyt) jobs.push(fetchNytInBrowser(keys.nyt, query));
  if (keys.guardian) jobs.push(fetchGuardianInBrowser(keys.guardian, query));
  if (!jobs.length) return [];
  const settled = await Promise.allSettled(jobs);
  return settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}
