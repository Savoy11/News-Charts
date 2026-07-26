import { TimelineEvent } from "./types";

/**
 * Additional news repositories beyond GDELT, so a subject's coverage isn't one feed's
 * opinion. Each fetcher is failure-isolated (returns [] on any error) and the keyed ones
 * skip silently when their env key is absent — pages must never depend on an optional
 * source being up. Dedup across repositories happens at merge time, by article URL.
 *
 *   Yahoo Finance RSS  — keyless, per-ticker company headlines (recent)
 *   NYT Article Search — archive back to 1851, free key: NYT_API_KEY
 *   The Guardian       — archive back to 1999, free key: GUARDIAN_API_KEY
 */

const UA = { "User-Agent": "Chronolens Research marcusowens94@gmail.com" };
const REVAL = { next: { revalidate: 21600 } }; // 6h — matches the topic TTL

/** Minimal RSS <item> reader — title/link/date plus a media thumbnail when the feed carries one. */
function rssItems(xml: string): { title: string; link: string; pubDate: string; image?: string }[] {
  const items: { title: string; link: string; pubDate: string; image?: string }[] = [];
  const grab = (block: string, tag: string) => {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
    return (m?.[1] ?? "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .trim();
  };
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const block = m[0];
    // media:content / media:thumbnail / enclosure all carry the image as a url attribute
    const img = block.match(/<(?:media:content|media:thumbnail|enclosure)[^>]*\burl="([^"]+)"/i)?.[1];
    items.push({
      title: grab(block, "title"),
      link: grab(block, "link"),
      pubDate: grab(block, "pubDate"),
      image: img && /^https?:\/\//i.test(img) ? img : undefined,
    });
  }
  return items;
}

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/**
 * The article's lead image from an NYT doc. The API has shipped two shapes: a legacy
 * array of crops with site-relative paths, and a newer object with absolute default/
 * thumbnail URLs — accept both, prefer the larger rendition.
 */
function nytImage(m: unknown): string | undefined {
  if (!m) return undefined;
  if (Array.isArray(m)) {
    const crops = m as { url?: string; subtype?: string }[];
    const pick =
      crops.find((x) => x?.subtype === "xlarge") ??
      crops.find((x) => x?.subtype === "thumbnail") ??
      crops[0];
    const u = pick?.url;
    if (typeof u !== "string" || !u) return undefined;
    return /^https?:\/\//i.test(u) ? u : `https://www.nytimes.com/${u.replace(/^\//, "")}`;
  }
  const obj = m as { default?: { url?: string }; thumbnail?: { url?: string } };
  const u = obj.default?.url ?? obj.thumbnail?.url;
  return typeof u === "string" && /^https?:\/\//i.test(u) ? u : undefined;
}

const toDay = (d: Date) =>
  Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);

/** Recent company headlines from Yahoo Finance's per-ticker RSS. Keyless. */
export async function getYahooFinanceNews(ticker: string): Promise<TimelineEvent[]> {
  try {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`;
    const res = await fetch(url, { headers: UA, ...REVAL });
    if (!res.ok) return [];
    const xml = await res.text();
    const events: TimelineEvent[] = [];
    for (const item of rssItems(xml)) {
      const day = item.pubDate ? toDay(new Date(item.pubDate)) : null;
      if (!item.title || !item.link || !day) continue;
      events.push({
        id: `yf-${events.length}`,
        date: day,
        type: "news",
        title: item.title,
        source: "Yahoo Finance",
        url: item.link,
        imageUrl: item.image,
        sourceKey: "yahoo_finance",
        externalId: item.link,
        dedupBasis: item.link,
      });
      if (events.length >= 25) break;
    }
    return events;
  } catch {
    return [];
  }
}

/**
 * NYT Article Search — the archive reaches 1851, which is what makes it a time machine
 * rather than a news feed. Two pages: the oldest coverage of the subject (its earliest
 * appearances in print) and the newest. Free key from developer.nytimes.com.
 */
export async function getNytNews(query: string): Promise<TimelineEvent[]> {
  const key = process.env.NYT_API_KEY;
  if (!key) return [];
  const page = async (sort: "oldest" | "newest") => {
    const url =
      `https://api.nytimes.com/svc/search/v2/articlesearch.json?q=${encodeURIComponent(`"${query}"`)}` +
      `&sort=${sort}&api-key=${encodeURIComponent(key)}`;
    const res = await fetch(url, REVAL);
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.response?.docs ?? []) as {
      headline?: { main?: string };
      web_url?: string;
      pub_date?: string;
      abstract?: string;
      snippet?: string;
      byline?: { original?: string };
      multimedia?: unknown;
    }[];
  };
  try {
    const [oldest, newest] = await Promise.all([page("oldest"), page("newest")]);
    const events: TimelineEvent[] = [];
    for (const doc of [...oldest, ...newest]) {
      const title = doc.headline?.main?.trim();
      const day = doc.pub_date ? toDay(new Date(doc.pub_date)) : null;
      if (!title || !doc.web_url || !day) continue;
      // the response is richer than a headline: byline, abstract and lead image all
      // travel with the event so every surface (list, cards, popup) can use them
      const byline = doc.byline?.original?.trim();
      const summary = (doc.abstract ?? doc.snippet ?? "").trim();
      const description =
        [byline, summary].filter(Boolean).join(" — ").slice(0, 240) || undefined;
      events.push({
        id: `nyt-${events.length}`,
        date: day,
        type: "news",
        title,
        source: "The New York Times",
        url: doc.web_url,
        description,
        imageUrl: nytImage(doc.multimedia),
        sourceKey: "nyt",
        externalId: doc.web_url,
        dedupBasis: doc.web_url,
      });
    }
    return events;
  } catch {
    return [];
  }
}

/** The Guardian Open Platform — archive to 1999. Free key from open-platform.theguardian.com. */
export async function getGuardianNews(query: string): Promise<TimelineEvent[]> {
  const key = process.env.GUARDIAN_API_KEY;
  if (!key) return [];
  const page = async (orderBy: "oldest" | "newest") => {
    // show-fields rides along in the same request: thumbnail, standfirst text, byline
    const url =
      `https://content.guardianapis.com/search?q=${encodeURIComponent(`"${query}"`)}` +
      `&order-by=${orderBy}&page-size=25&show-fields=thumbnail,trailText,byline` +
      `&api-key=${encodeURIComponent(key)}`;
    const res = await fetch(url, REVAL);
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.response?.results ?? []) as {
      webTitle?: string;
      webUrl?: string;
      webPublicationDate?: string;
      fields?: { thumbnail?: string; trailText?: string; byline?: string };
    }[];
  };
  try {
    const [oldest, newest] = await Promise.all([page("oldest"), page("newest")]);
    const events: TimelineEvent[] = [];
    for (const r of [...oldest, ...newest]) {
      const day = r.webPublicationDate ? toDay(new Date(r.webPublicationDate)) : null;
      if (!r.webTitle || !r.webUrl || !day) continue;
      const byline = r.fields?.byline?.trim();
      const trail = r.fields?.trailText ? stripHtml(r.fields.trailText) : "";
      const description =
        [byline, trail].filter(Boolean).join(" — ").slice(0, 240) || undefined;
      const thumb = r.fields?.thumbnail;
      events.push({
        id: `gdn-${events.length}`,
        date: day,
        type: "news",
        title: r.webTitle,
        source: "The Guardian",
        url: r.webUrl,
        description,
        imageUrl: thumb && /^https?:\/\//i.test(thumb) ? thumb : undefined,
        sourceKey: "guardian",
        externalId: r.webUrl,
        dedupBasis: r.webUrl,
      });
    }
    return events;
  } catch {
    return [];
  }
}

/** Keep the first event seen per URL — the same story surfaced by two repositories is one event. */
export function dedupByUrl(...lists: TimelineEvent[][]): TimelineEvent[] {
  const seen = new Set<string>();
  const out: TimelineEvent[] = [];
  for (const list of lists) {
    for (const ev of list) {
      if (ev.url) {
        if (seen.has(ev.url)) continue;
        seen.add(ev.url);
      }
      out.push(ev);
    }
  }
  return out;
}
