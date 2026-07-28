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

const UA = { "User-Agent": "News Charts Research marcusowens94@gmail.com" };
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

/**
 * Newsdata.io — a multi-outlet aggregator, so one call brings back coverage from many
 * publications at once (the free tier reaches recent news; its deep archive is paid).
 * Free key from newsdata.io → NEWSDATA_API_KEY. 200 credits/day; one page per subject
 * per 6h cache window stays far under that.
 */
export async function getNewsdataNews(query: string): Promise<TimelineEvent[]> {
  const key = process.env.NEWSDATA_API_KEY;
  if (!key) return [];
  try {
    const url =
      `https://newsdata.io/api/1/latest?apikey=${encodeURIComponent(key)}` +
      `&q=${encodeURIComponent(`"${query}"`)}&language=en`;
    const res = await fetch(url, REVAL);
    if (!res.ok) return [];
    const json = await res.json();
    const results = (json?.results ?? []) as {
      title?: string;
      link?: string;
      pubDate?: string; // "2026-07-25 14:03:11"
      description?: string;
      image_url?: string;
      source_name?: string;
      source_id?: string;
      creator?: string[] | null;
    }[];
    const events: TimelineEvent[] = [];
    for (const r of results) {
      const day = r.pubDate ? toDay(new Date(r.pubDate.replace(" ", "T") + "Z")) : null;
      if (!r.title || !r.link || !day) continue;
      const byline = Array.isArray(r.creator) ? r.creator.filter(Boolean).join(", ") : "";
      const description =
        [byline, (r.description ?? "").trim()].filter(Boolean).join(" — ").slice(0, 240) ||
        undefined;
      events.push({
        id: `nd-${events.length}`,
        date: day,
        type: "news",
        title: r.title.trim(),
        // the aggregator isn't the publisher — credit the outlet it found
        source: r.source_name?.trim() || r.source_id?.trim() || "Newsdata.io",
        url: r.link,
        description,
        imageUrl:
          r.image_url && /^https?:\/\//i.test(r.image_url) ? r.image_url : undefined,
        sourceKey: "newsdata",
        externalId: r.link,
        dedupBasis: r.link,
      });
      if (events.length >= 25) break;
    }
    return events;
  } catch {
    return [];
  }
}

/**
 * GNews — Google News results as JSON. Recent coverage across many outlets; each
 * article credits the publishing outlet. Free key from gnews.io → GNEWS_API_KEY
 * (100 req/day, 10 articles/req on the free tier — one cached call per subject per
 * 6h window stays far under that).
 */
export async function getGnewsNews(query: string): Promise<TimelineEvent[]> {
  const key = process.env.GNEWS_API_KEY;
  if (!key) return [];
  try {
    const url =
      `https://gnews.io/api/v4/search?q=${encodeURIComponent(`"${query}"`)}` +
      `&lang=en&max=10&apikey=${encodeURIComponent(key)}`;
    const res = await fetch(url, REVAL);
    if (!res.ok) return [];
    const json = await res.json();
    const articles = (json?.articles ?? []) as {
      title?: string;
      description?: string;
      url?: string;
      image?: string;
      publishedAt?: string; // ISO
      source?: { name?: string };
    }[];
    const events: TimelineEvent[] = [];
    for (const a of articles) {
      const day = a.publishedAt ? toDay(new Date(a.publishedAt)) : null;
      if (!a.title || !a.url || !day) continue;
      events.push({
        id: `gn-${events.length}`,
        date: day,
        type: "news",
        title: a.title.trim(),
        // credit the outlet Google News found, not the aggregator
        source: a.source?.name?.trim() || "GNews",
        url: a.url,
        description: (a.description ?? "").trim().slice(0, 240) || undefined,
        imageUrl: a.image && /^https?:\/\//i.test(a.image) ? a.image : undefined,
        sourceKey: "gnews",
        externalId: a.url,
        dedupBasis: a.url,
      });
    }
    return events;
  } catch {
    return [];
  }
}

/**
 * Currents API — another multi-outlet aggregator with a keyword search. Free key from
 * currentsapi.services → CURRENTS_API_KEY. Items carry an author but no reliable outlet
 * name, so the author stands in when present.
 */
export async function getCurrentsNews(query: string): Promise<TimelineEvent[]> {
  const key = process.env.CURRENTS_API_KEY;
  if (!key) return [];
  try {
    const url =
      `https://api.currentsapi.services/v1/search?keywords=${encodeURIComponent(query)}` +
      `&language=en&apiKey=${encodeURIComponent(key)}`;
    const res = await fetch(url, REVAL);
    if (!res.ok) return [];
    const json = await res.json();
    const items = (json?.news ?? []) as {
      title?: string;
      description?: string;
      url?: string;
      author?: string;
      image?: string;
      published?: string; // "2026-07-25 03:20:20 +0000"
    }[];
    const events: TimelineEvent[] = [];
    for (const n of items) {
      const day = n.published ? toDay(new Date(n.published)) : null;
      if (!n.title || !n.url || !day) continue;
      const author = n.author?.trim();
      events.push({
        id: `cur-${events.length}`,
        date: day,
        type: "news",
        title: n.title.trim(),
        source: author && author.toLowerCase() !== "none" ? author : "Currents",
        url: n.url,
        description: (n.description ?? "").trim().slice(0, 240) || undefined,
        // the API uses the literal string "None" for missing images
        imageUrl: n.image && /^https?:\/\//i.test(n.image) ? n.image : undefined,
        sourceKey: "currents",
        externalId: n.url,
        dedupBasis: n.url,
      });
      if (events.length >= 25) break;
    }
    return events;
  } catch {
    return [];
  }
}

/**
 * Marketaux — finance-native news with per-ticker entity tagging, so company pages can
 * ask by symbol instead of name-matching. Free key from marketaux.com →
 * MARKETAUX_API_KEY (100 req/day, 3 articles/req on the free tier).
 */
export async function getMarketauxNews(query: string, symbol?: string): Promise<TimelineEvent[]> {
  const key = process.env.MARKETAUX_API_KEY;
  if (!key) return [];
  try {
    const filter = symbol
      ? `symbols=${encodeURIComponent(symbol)}`
      : `search=${encodeURIComponent(query)}`;
    const url =
      `https://api.marketaux.com/v1/news/all?${filter}` +
      `&language=en&api_token=${encodeURIComponent(key)}`;
    const res = await fetch(url, REVAL);
    if (!res.ok) return [];
    const json = await res.json();
    const items = (json?.data ?? []) as {
      title?: string;
      description?: string;
      snippet?: string;
      url?: string;
      image_url?: string;
      published_at?: string; // ISO
      source?: string; // publisher domain, e.g. "reuters.com"
    }[];
    const events: TimelineEvent[] = [];
    for (const n of items) {
      const day = n.published_at ? toDay(new Date(n.published_at)) : null;
      if (!n.title || !n.url || !day) continue;
      events.push({
        id: `mx-${events.length}`,
        date: day,
        type: "news",
        title: n.title.trim(),
        source: n.source?.trim() || "Marketaux",
        url: n.url,
        description:
          (n.description ?? n.snippet ?? "").trim().slice(0, 240) || undefined,
        imageUrl:
          n.image_url && /^https?:\/\//i.test(n.image_url) ? n.image_url : undefined,
        sourceKey: "marketaux",
        externalId: n.url,
        dedupBasis: n.url,
      });
    }
    return events;
  } catch {
    return [];
  }
}

/**
 * EODHD financial news — ticker-keyed (s=BABA.US). Free key from eodhd.com →
 * EODHD_API_KEY. The free tier is ~20 calls/day and news access varies by plan;
 * a plan without news just yields an error status here, which degrades to [].
 * Items carry no publisher name, so the link's domain stands in (GDELT-style).
 */
export async function getEodhdNews(ticker: string): Promise<TimelineEvent[]> {
  const key = process.env.EODHD_API_KEY;
  if (!key) return [];
  try {
    const url =
      `https://eodhd.com/api/news?s=${encodeURIComponent(`${ticker}.US`)}` +
      `&limit=25&fmt=json&api_token=${encodeURIComponent(key)}`;
    const res = await fetch(url, REVAL);
    if (!res.ok) return [];
    const json = await res.json();
    if (!Array.isArray(json)) return [];
    const items = json as {
      date?: string; // ISO
      title?: string;
      content?: string;
      link?: string;
    }[];
    const events: TimelineEvent[] = [];
    for (const n of items) {
      const day = n.date ? toDay(new Date(n.date)) : null;
      if (!n.title || !n.link || !day) continue;
      let outlet = "EODHD";
      try {
        outlet = new URL(n.link).hostname.replace(/^www\./, "");
      } catch {
        /* keep fallback */
      }
      events.push({
        id: `eod-${events.length}`,
        date: day,
        type: "news",
        title: n.title.trim(),
        source: outlet,
        url: n.link,
        description: (n.content ?? "").replace(/\s+/g, " ").trim().slice(0, 240) || undefined,
        sourceKey: "eodhd",
        externalId: n.link,
        dedupBasis: n.link,
      });
    }
    return events;
  } catch {
    return [];
  }
}

/**
 * Finnhub company news — ticker-keyed, with the publisher named per article. Free key
 * from finnhub.io → FINNHUB_API_KEY (60 req/min; company news reaches back one year on
 * the free tier, so that's exactly the window requested).
 */
export async function getFinnhubNews(ticker: string): Promise<TimelineEvent[]> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];
  try {
    const to = new Date();
    const from = new Date(to.getTime() - 365 * 86_400_000);
    const url =
      `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(ticker)}` +
      `&from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}` +
      `&token=${encodeURIComponent(key)}`;
    const res = await fetch(url, REVAL);
    if (!res.ok) return [];
    const json = await res.json();
    if (!Array.isArray(json)) return [];
    const items = json as {
      headline?: string;
      url?: string;
      datetime?: number; // unix seconds
      source?: string;
      summary?: string;
      image?: string;
    }[];
    const events: TimelineEvent[] = [];
    for (const n of items) {
      const day = n.datetime ? toDay(new Date(n.datetime * 1000)) : null;
      if (!n.headline || !n.url || !day) continue;
      events.push({
        id: `fh-${events.length}`,
        date: day,
        type: "news",
        title: n.headline.trim(),
        source: n.source?.trim() || "Finnhub",
        url: n.url,
        description: (n.summary ?? "").trim().slice(0, 240) || undefined,
        imageUrl: n.image && /^https?:\/\//i.test(n.image) ? n.image : undefined,
        sourceKey: "finnhub",
        externalId: n.url,
        dedupBasis: n.url,
      });
      if (events.length >= 40) break;
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
