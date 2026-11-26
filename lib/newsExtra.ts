import { FetchResult, TimelineEvent } from "./types";
import { cleanDomain, sourceLabel } from "./sourceLabel";
import { licensedKey } from "./ingest/store";
import { storyKey } from "./newsQuality";
import { CLIENT_NAME, UA } from "./contact";
import { mentions } from "./enrich/relevance";

/**
 * Additional news repositories beyond GDELT, so a subject's coverage isn't one feed's
 * opinion. Each fetcher is failure-isolated (returns [] on any error) and the keyed ones
 * skip silently when their env key is absent — pages must never depend on an optional
 * source being up.
 *
 * **Identity is the story, not the document.** `docs/EVENTS-SCHEMA.md` has always specified
 * that a news event keys on headline + publication date — "an AP story syndicated to 50 papers
 * → one row, 50 attestations" — but every adapter here keyed on its own URL, so one wire story
 * reaching us through three aggregators became three rows. `storyKey` restores the documented
 * contract, and the attestation count becomes the corroboration signal the schema intends.
 *
 * Keys come from `licensedKey`, not `process.env` directly: eight of these sources are on
 * non-commercial tiers today, and `COMMERCIAL_MODE=true` withholds their key so a forgotten
 * `.env.local` entry cannot quietly serve them once anyone else can load the site (D22).
 *
 *   Yahoo Finance RSS  — keyless, per-ticker company headlines (recent); off the ingest path
 *                        since batch 189, kept for the feed diagnostics
 *   Currents           — a company's present-day headlines by name; built for the ingest path
 *                        in batch 189 and off until Currents answers in writing
 *   NYT Article Search — archive back to 1851, free key: NYT_API_KEY
 *   The Guardian       — archive back to 1999, free key: GUARDIAN_API_KEY
 */

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

/**
 * Yahoo Finance's per-ticker RSS headlines, with the outcome kept: a 429/503 is "throttled" and
 * any other failure "error", so ingest backs off and the per-source status shows it. This
 * returned [] for all of them, which ingest logged as "empty" — a successful fetch of nothing
 * (NC-142).
 *
 * Not on the ingest path since batch 189 (the owner's call of 2026-11-26): Yahoo's terms keep its RSS
 * feeds off a page that carries advertising, and the registry now marks the source non-commercial.
 * The reader stays for `npm run check:feeds`, on the owner's own machine.
 */
export async function fetchYahooFinanceNews(ticker: string): Promise<FetchResult> {
  try {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`;
    const res = await fetch(url, { headers: UA, ...REVAL });
    if (res.status === 429 || res.status === 503) {
      return { events: [], outcome: "throttled", httpStatus: res.status };
    }
    if (!res.ok) return { events: [], outcome: "error", httpStatus: res.status };
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
        dedupBasis: storyKey(item.title, day),
      });
      if (events.length >= 25) break;
    }
    return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
  } catch (err) {
    return { events: [], outcome: "error", detail: (err as Error).message };
  }
}

export async function getYahooFinanceNews(ticker: string): Promise<TimelineEvent[]> {
  return (await fetchYahooFinanceNews(ticker)).events;
}

/**
 * NYT Article Search — the archive reaches 1851, which is what makes it a time machine
 * rather than a news feed. Two pages: the oldest coverage of the subject (its earliest
 * appearances in print) and the newest. Free key from developer.nytimes.com.
 */
export async function getNytNews(query: string): Promise<TimelineEvent[]> {
  const key = licensedKey("NYT_API_KEY", "nyt");
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
        dedupBasis: storyKey(title, day),
      });
    }
    return events;
  } catch {
    return [];
  }
}

/** The Guardian Open Platform — archive to 1999. Free key from open-platform.theguardian.com. */
export async function getGuardianNews(query: string): Promise<TimelineEvent[]> {
  const key = licensedKey("GUARDIAN_API_KEY", "guardian");
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
        dedupBasis: storyKey(r.webTitle!, day),
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
  const key = licensedKey("NEWSDATA_API_KEY", "newsdata");
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
        source: sourceLabel(r.source_name ?? r.source_id, "newsdata"),
        url: r.link,
        description,
        imageUrl:
          r.image_url && /^https?:\/\//i.test(r.image_url) ? r.image_url : undefined,
        sourceKey: "newsdata",
        externalId: r.link,
        dedupBasis: storyKey(r.title, day),
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
  const key = licensedKey("GNEWS_API_KEY", "gnews");
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
        source: sourceLabel(a.source?.name, "gnews"),
        url: a.url,
        description: (a.description ?? "").trim().slice(0, 240) || undefined,
        imageUrl: a.image && /^https?:\/\//i.test(a.image) ? a.image : undefined,
        sourceKey: "gnews",
        externalId: a.url,
        dedupBasis: storyKey(a.title, day),
      });
    }
    return events;
  } catch {
    return [];
  }
}

/** What one request on Currents' free plan may ask (its documentation, read 2026-11-26). */
export const CURRENTS_PAGE_SIZE = 20;
/** "The free news API plan covers Search with a 7-day maximum date span per request." */
export const CURRENTS_SPAN_DAYS = 7;
/** The most names one query asks for. */
const CURRENTS_MAX_NAMES = 5;

/**
 * The Boolean query Currents is asked: each name in quotation marks, joined by OR. Its documentation
 * gives the choice: "Use keywords to find articles about a topic; it also matches other forms of each
 * word … Use query when the exact word must appear, such as a company name, ticker, brand, or person."
 * Only names, never a ticker: "Matching ignores letter case, so a ticker that is also a common word,
 * such as ARM, META or NOW, also matches that word. Search the company name instead."
 */
export function currentsQuery(names: readonly string[]): string {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const n of names) {
    const name = n.replace(/["()]/g, " ").replace(/\s+/g, " ").trim();
    const key = name.toLowerCase();
    if (name.length < 3 || seen.has(key)) continue;
    seen.add(key);
    terms.push(`"${name}"`);
    if (terms.length >= CURRENTS_MAX_NAMES) break;
  }
  return terms.join(" OR ");
}

/**
 * Currents' search, for a company's present-day headlines (batch 189): one request for the last
 * seven days under the company's names, twenty results, the free plan's page. Free key from
 * currentsapi.services → CURRENTS_API_KEY, sent as a header, never in the address.
 *
 * Only a headline, its day and its link are kept. The API also returns a preview of the article's
 * text, an image and an author; its pricing page allows "commercial use with attribution and a link
 * to the original article" and says "republication of article text need separate terms", so none of
 * the three is read into a row. The outlet is the link's own domain ("reuters.com · via Currents"):
 * the API names an author, who is a person and not a publisher.
 *
 * An article is kept only where its headline names the company, the way headline scoring counts
 * naming (`mentions`): the search also matches "the start of the article body", so a passing mention
 * comes back too, and a row holding no text but its headline has nothing else to show why it is there.
 * `headlineNames` are the names a headline is scored by (`companyScoringAliases` at ingest); by
 * default the names asked for, in lower case.
 *
 * The outcome is kept: a 429 is the day's quota spent ("At the daily cap, the API returns HTTP 429
 * with a Retry-After header") and a 503 its search timing out, both "throttled"; a refused key or
 * query is an "error" with the API's own code.
 */
export async function fetchCurrentsNews(
  names: readonly string[],
  headlineNames: readonly string[] = names.map((n) => n.toLowerCase()),
  now: Date = new Date()
): Promise<FetchResult> {
  const key = licensedKey("CURRENTS_API_KEY", "currents");
  if (!key) return { events: [], outcome: "empty", detail: "no key, or withheld by COMMERCIAL_MODE" };
  const query = currentsQuery(names);
  if (!query) return { events: [], outcome: "empty", detail: "no name to ask for" };
  try {
    // an hour inside the plan's span, so the request holds whichever way the span is counted; the
    // API takes "Strict RFC 3339 only", as its example writes it: no fraction of a second
    const rfc = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
    const from = new Date(now.getTime() - (CURRENTS_SPAN_DAYS * 24 - 1) * 3_600_000);
    const url =
      `https://api.currentsapi.services/v1/search?query=${encodeURIComponent(query)}&language=en` +
      `&page_size=${CURRENTS_PAGE_SIZE}&start_date=${encodeURIComponent(rfc(from))}&end_date=${encodeURIComponent(rfc(now))}`;
    const res = await fetch(url, {
      // the key says whose requests these are: the client's name alone, no contact address
      headers: { Authorization: `Bearer ${key}`, "User-Agent": CLIENT_NAME, Accept: "application/json" },
      // a keyed answer for a window ending now: never one kept from an earlier request
      cache: "no-store",
    });
    if (res.status === 429 || res.status === 503) {
      const wait = res.headers.get("retry-after");
      const why = res.status === 429 ? "the day's requests are spent" : "the search timed out";
      return { events: [], outcome: "throttled", httpStatus: res.status, detail: wait ? `${why}; retry after ${wait.slice(0, 40)}` : why };
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { code?: unknown; msg?: unknown } | null;
      const said = [body?.code, body?.msg].filter((v): v is string => typeof v === "string").join(": ");
      return { events: [], outcome: "error", httpStatus: res.status, detail: said.slice(0, 160) || undefined };
    }
    const json = (await res.json()) as { status?: string; news?: unknown };
    if (json?.status !== "ok" || !Array.isArray(json.news)) {
      return { events: [], outcome: "error", httpStatus: res.status, detail: "not the documented answer" };
    }
    const items = json.news as { title?: unknown; url?: unknown; published?: unknown }[];
    const seen = new Set<string>();
    const events: TimelineEvent[] = [];
    for (const n of items) {
      // "2026-07-25 03:20:20 +0000"
      const day = typeof n.published === "string" ? toDay(new Date(n.published)) : null;
      const title = typeof n.title === "string" ? n.title.replace(/\s+/g, " ").trim() : "";
      const link = typeof n.url === "string" && /^https?:\/\//i.test(n.url) ? n.url : "";
      // "merge on url before you count articles": one article can come back more than once
      if (!title || !link || !day || seen.has(link)) continue;
      seen.add(link);
      if (mentions(title, [...headlineNames]) !== "named") continue;
      events.push({
        id: `cur-${events.length}`,
        date: day,
        type: "news",
        title,
        source: sourceLabel(cleanDomain(link), "currents"),
        url: link,
        sourceKey: "currents",
        externalId: link,
        dedupBasis: storyKey(title, day),
      });
    }
    return { events, outcome: events.length ? "ok" : "empty", httpStatus: res.status };
  } catch (err) {
    return { events: [], outcome: "error", detail: (err as Error).message };
  }
}

/** The same search for the feed diagnostics, events only. */
export async function getCurrentsNews(query: string): Promise<TimelineEvent[]> {
  return (await fetchCurrentsNews([query])).events;
}

/**
 * Marketaux — finance-native news with per-ticker entity tagging, so company pages can
 * ask by symbol instead of name-matching. Free key from marketaux.com →
 * MARKETAUX_API_KEY (100 req/day, 3 articles/req on the free tier).
 */
export async function getMarketauxNews(query: string, symbol?: string): Promise<TimelineEvent[]> {
  const key = licensedKey("MARKETAUX_API_KEY", "marketaux");
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
        source: sourceLabel(n.source, "marketaux"),
        url: n.url,
        description:
          (n.description ?? n.snippet ?? "").trim().slice(0, 240) || undefined,
        imageUrl:
          n.image_url && /^https?:\/\//i.test(n.image_url) ? n.image_url : undefined,
        sourceKey: "marketaux",
        externalId: n.url,
        dedupBasis: storyKey(n.title, day),
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
  const key = licensedKey("EODHD_API_KEY", "eodhd");
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
        source: sourceLabel(outlet, "eodhd"),
        url: n.link,
        description: (n.content ?? "").replace(/\s+/g, " ").trim().slice(0, 240) || undefined,
        sourceKey: "eodhd",
        externalId: n.link,
        dedupBasis: storyKey(n.title, day),
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
  const key = licensedKey("FINNHUB_API_KEY", "finnhub");
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
        source: sourceLabel(n.source, "finnhub"),
        url: n.url,
        description: (n.summary ?? "").trim().slice(0, 240) || undefined,
        imageUrl: n.image && /^https?:\/\//i.test(n.image) ? n.image : undefined,
        sourceKey: "finnhub",
        externalId: n.url,
        dedupBasis: storyKey(n.headline!.trim(), day),
      });
      if (events.length >= 40) break;
    }
    return events;
  } catch {
    return [];
  }
}

