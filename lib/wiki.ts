import { TimelineEvent } from "./types";

const API = "https://en.wikipedia.org/w/api.php";
const UA = { "User-Agent": "Chronolens Research marcusowens94@gmail.com" };

interface Page {
  title: string;
  text: string;
}

async function getExtract(title: string): Promise<Page | null> {
  const url = `${API}?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(
    title
  )}`;
  const res = await fetch(url, { headers: UA, next: { revalidate: 86400 } });
  if (!res.ok) return null;
  const json = await res.json();
  const pages = json?.query?.pages ?? {};
  const page = Object.values(pages)[0] as { title?: string; extract?: string; missing?: string };
  if (!page || page.missing !== undefined || !page.extract) return null;
  return { title: page.title ?? title, text: page.extract };
}

/** Best-matching article title via Wikipedia's search index, for queries that aren't exact titles. */
async function searchTitle(query: string): Promise<string | null> {
  const url = `${API}?action=query&list=search&srsearch=${encodeURIComponent(
    query
  )}&srlimit=1&format=json`;
  const res = await fetch(url, { headers: UA, next: { revalidate: 86400 } });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.query?.search?.[0]?.title ?? null;
}

/**
 * Deep-link straight to the sentence using a URL text fragment, so clicking a card
 * scrolls to and highlights the passage instead of dumping the reader at the top.
 * Anchoring on the first and last few words keeps the match resilient to citation
 * markers that appear in the rendered page but not in the plain-text extract.
 */
function quoteUrl(title: string, sentence: string): string {
  const page = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  const clean = sentence.replace(/\s+/g, " ").trim();
  // "-" and "," are directive separators inside a text fragment and must be escaped
  const enc = (s: string) => encodeURIComponent(s).replace(/-/g, "%2D");
  const words = clean.split(" ");
  if (words.length <= 10) return `${page}#:~:text=${enc(clean)}`;
  const start = words.slice(0, 5).join(" ");
  const end = words.slice(-5).join(" ");
  return `${page}#:~:text=${enc(start)},${enc(end)}`;
}

/**
 * Pull a year from a sentence, ignoring numbers that only look like years.
 * Screen resolutions ("1280 x 720"), sensor sizes ("3264 × 1836") and spec figures
 * are the common false positives and would otherwise plant events in the Middle Ages.
 */
function extractYear(sentence: string): number | null {
  const masked = sentence
    // resolutions and dimension pairs
    .replace(/\d[\d,.]*\s*[×x*]\s*\d[\d,.]*/gi, " ")
    // measurements and hardware specs
    .replace(
      /\b\d+(\.\d+)?\s*(mm|cm|km|in|inch|inches|mah|k?hz|mhz|ghz|kb|mb|gb|tb|ppi|dpi|px|nm|bit|megapixels?|mp|rpm|w|kw)\b/gi,
      " "
    )
    // currency and large counts, e.g. "$1,999" or "1080p"
    .replace(/[$€£]\s?\d[\d,.]*/g, " ")
    .replace(/\b\d{3,4}[ip]\b/gi, " ");
  // reject digit/letter neighbours so model numbers ("PW1500G") don't read as years,
  // while still allowing "in 2013," and decade forms like "mid-1990s"
  const m = masked.match(/(?<!\w)(1[0-9]{3}|20[0-2][0-9])(?:s\b)?(?!\w)/);
  return m ? Number(m[1]) : null;
}

export interface TopicResult {
  title: string;
  summary: string;
  articleUrl: string;
  /** every Wikipedia article the timeline drew on */
  articles: string[];
  events: TimelineEvent[];
}

/** Pull dated sentences out of one article's prose. */
function eventsFromPage(page: Page, idPrefix: string, limit: number): TimelineEvent[] {
  const paragraphs = page.text
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 40 && !p.startsWith("=="));

  const events: TimelineEvent[] = [];
  const seenYears = new Map<number, number>(); // year -> count, cap events per year
  const sentenceRe = /[^.!?]*[.!?]/g;
  for (const para of paragraphs) {
    for (const match of para.match(sentenceRe) ?? []) {
      const s = match.trim();
      if (s.length < 60 || s.length > 400) continue;
      const year = extractYear(s);
      if (year === null) continue;
      const count = seenYears.get(year) ?? 0;
      if (count >= 2) continue;
      seenYears.set(year, count + 1);
      events.push({
        id: `${idPrefix}-${year}-${count}`,
        date: `${year}-01-01`,
        type: "history",
        title: s,
        source: `Wikipedia: ${page.title}`,
        url: quoteUrl(page.title, s),
        sourceKey: "wikipedia",
        // the article is the document; the sentence is the event, so the same
        // sentence in "History of X" and "Timeline of X" collapses to one row
        externalId: page.title,
        dedupBasis: s,
        yearOnly: true,
      });
      if (events.length >= limit) return events;
    }
  }
  return events;
}

/**
 * Build a rough historical timeline for a topic: pull the Wikipedia article
 * (preferring a dedicated "History of ..." page) and extract sentences that
 * mention a year.
 */
export async function getTopicTimeline(topic: string): Promise<TopicResult | null> {
  const t = topic.trim();
  let page = (await getExtract(`History of the ${t}`)) ?? (await getExtract(`History of ${t}`));
  if (!page) page = await getExtract(t);
  if (!page) {
    // not an exact title — fall back to the search index, preferring a history article
    const found = (await searchTitle(`History of ${t}`)) ?? (await searchTitle(t));
    if (found) page = await getExtract(found);
  }
  if (!page) return null;

  const summary =
    page.text
      .split("\n")
      .map((p) => p.trim())
      .find((p) => p.length > 40 && !p.startsWith("==")) ?? "";

  // "Timeline of ..." articles are already chronological and often cover events the prose
  // article skips, so merge them in when one exists.
  const companions = await Promise.all([
    getExtract(`Timeline of the ${t}`),
    getExtract(`Timeline of ${t}`),
  ]);

  const pages: Page[] = [page];
  for (const c of companions) {
    if (c && !pages.some((p) => p.title === c.title)) pages.push(c);
  }

  const seen = new Set<string>();
  const events: TimelineEvent[] = [];
  pages.forEach((p, i) => {
    for (const ev of eventsFromPage(p, `hist${i}`, 80)) {
      const key = ev.title.slice(0, 80).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(ev);
    }
  });
  events.sort((a, b) => a.date.localeCompare(b.date));

  return {
    title: page.title,
    summary,
    articleUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
    articles: pages.map((p) => p.title),
    events,
  };
}
