import { TimelineEvent } from "./types";

const API = "https://en.wikipedia.org/w/api.php";
const UA = { "User-Agent": "Chronolens Research marcusowens94@gmail.com" };

interface Page {
  title: string;
  text: string;
  /** the article's lead image, shared by every history event drawn from this page */
  image?: string;
}

async function getExtract(title: string): Promise<Page | null> {
  // pageimages rides along in the same request — one call gets the prose and the lead thumbnail.
  const url = `${API}?action=query&prop=extracts|pageimages&explaintext=1&piprop=thumbnail&pithumbsize=400&redirects=1&format=json&titles=${encodeURIComponent(
    title
  )}`;
  const res = await fetch(url, { headers: UA, next: { revalidate: 86400 } });
  if (!res.ok) return null;
  const json = await res.json();
  const pages = json?.query?.pages ?? {};
  const page = Object.values(pages)[0] as {
    title?: string;
    extract?: string;
    missing?: string;
    thumbnail?: { source?: string };
  };
  if (!page || page.missing !== undefined || !page.extract) return null;
  return { title: page.title ?? title, text: page.extract, image: page.thumbnail?.source };
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

// ---------------------------------------------------------------------------
// Citation mining — the References list, not the prose.
//
// Every prose 'history' event deep-links the same encyclopedia article, so as
// *sourcing* a 60-event timeline is one document sliced 60 ways. The article's
// {{cite ...}} templates are the opposite: a hand-curated bibliography of real,
// dated, external articles — the thing a reader from that period actually read.
// Mining them turns Wikipedia from "the story" into an index of period sources.
// ---------------------------------------------------------------------------

/** One parsed {{cite ...}} template that carried enough to become an event. */
export interface WikiCitation {
  title: string;
  url: string;
  date: string; // YYYY-MM-DD (month/day default to 01 when the template omits them)
  yearOnly: boolean;
  /** work / newspaper / publisher — falls back to the URL's hostname */
  publication: string;
}

/** Raw wikitext of an article (the rendered extract has no reference metadata). */
async function getWikitext(title: string): Promise<string | null> {
  try {
    const url = `${API}?action=parse&page=${encodeURIComponent(
      title
    )}&prop=wikitext&format=json&redirects=1`;
    const res = await fetch(url, { headers: UA, next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.parse?.wikitext?.["*"] ?? null;
  } catch {
    // citations are an enrichment — a network failure must never take down the topic
    return null;
  }
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
  sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Parse the |date= field of a cite template. Handles the forms Wikipedia's style
 * guide allows: "2015-01-05", "January 5, 2015", "5 January 2015", "January 2015",
 * and a bare "2015". Anything else (n.d., ranges, seasons) is rejected — an
 * undatable citation can't take a place on a timeline.
 */
export function parseCiteDate(raw: string): { date: string; yearOnly: boolean } | null {
  const s = raw.trim();
  const okYear = (y: number) => y >= 1750 && y <= new Date().getFullYear() + 1;
  const okDay = (m: number, d: number) => d >= 1 && d <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // ISO
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (okYear(y) && mo >= 1 && mo <= 12 && okDay(mo, d)) {
      return { date: `${y}-${pad(mo)}-${pad(d)}`, yearOnly: false };
    }
    return null;
  }
  m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/); // January 5, 2015
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    const [d, y] = [Number(m[2]), Number(m[3])];
    if (mo && okYear(y) && okDay(mo, d)) return { date: `${y}-${pad(mo)}-${pad(d)}`, yearOnly: false };
    return null;
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/); // 5 January 2015
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()];
    const [d, y] = [Number(m[1]), Number(m[3])];
    if (mo && okYear(y) && okDay(mo, d)) return { date: `${y}-${pad(mo)}-${pad(d)}`, yearOnly: false };
    return null;
  }
  m = s.match(/^([A-Za-z]+)\.?\s+(\d{4})$/); // January 2015
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    const y = Number(m[2]);
    if (mo && okYear(y)) return { date: `${y}-${pad(mo)}-01`, yearOnly: false };
    return null;
  }
  m = s.match(/^(\d{4})$/); // bare year
  if (m && okYear(Number(m[1]))) return { date: `${m[1]}-01-01`, yearOnly: true };
  return null;
}

/** Strip wiki markup from a template field value so it reads as plain text. */
function cleanCiteText(s: string): string {
  return s
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1") // [[target|label]] → label
    .replace(/\{\{!\}\}/g, "|")
    .replace(/\{\{[^{}]*\}\}/g, "") // any leftover inner template
    .replace(/<[^>]+>/g, "")
    .replace(/''+/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Split a template body on top-level pipes (nested {{...}} and [[...]] stay intact). */
function templateParams(tpl: string): Map<string, string> {
  const inner = tpl.slice(2, -2);
  const parts: string[] = [];
  let cur = "";
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2);
    if (two === "{{" || two === "[[") { depth++; cur += two; i++; continue; }
    if (two === "}}" || two === "]]") { depth--; cur += two; i++; continue; }
    if (inner[i] === "|" && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += inner[i];
  }
  parts.push(cur);
  const map = new Map<string, string>();
  for (const p of parts.slice(1)) { // parts[0] is the template name itself
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    map.set(p.slice(0, eq).trim().toLowerCase(), p.slice(eq + 1).trim());
  }
  return map;
}

// template families that cite a dated, linkable document
const CITE_RE = /\{\{\s*cite\s+(?:news|web|press release|magazine|journal|report|interview|av media|podcast|episode)\b/gi;

/**
 * Every citation in an article's wikitext that has a title, a real URL, and a
 * parseable publication date. Order follows the article, which for history
 * articles is roughly chronological — but callers should sort by date anyway.
 */
export function parseCitations(wikitext: string): WikiCitation[] {
  const out: WikiCitation[] = [];
  let m: RegExpExecArray | null;
  while ((m = CITE_RE.exec(wikitext))) {
    // walk to the matching close so nested templates don't truncate the block
    let depth = 0;
    let i = m.index;
    while (i < wikitext.length) {
      const two = wikitext.slice(i, i + 2);
      if (two === "{{") { depth++; i += 2; continue; }
      if (two === "}}") { depth--; i += 2; if (depth === 0) break; continue; }
      i++;
    }
    if (depth !== 0) break; // unbalanced tail — stop rather than mis-parse
    const params = templateParams(wikitext.slice(m.index, i));
    CITE_RE.lastIndex = i;

    const url = params.get("url")?.trim() ?? "";
    if (!/^https?:\/\//i.test(url)) continue;
    const title = cleanCiteText(params.get("title") ?? "");
    if (title.length < 8) continue;
    const when = parseCiteDate(params.get("date") ?? "");
    if (!when) continue;

    let publication = cleanCiteText(
      params.get("work") ?? params.get("newspaper") ?? params.get("magazine") ??
      params.get("website") ?? params.get("publisher") ?? params.get("agency") ?? ""
    );
    if (!publication) {
      try {
        publication = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        publication = "cited source";
      }
    }
    out.push({ title, url, date: when.date, yearOnly: when.yearOnly, publication });
  }
  return out;
}

/** Timelines stack fine, but the DB write path pays per event — keep an upper bound. */
const CITATION_CAP = 160;

/** Even-spread sample so a cap keeps the full range instead of one era. */
function spreadSample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const kept: T[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < max; i++) {
    const idx = Math.round((i * (items.length - 1)) / (max - 1));
    if (!seen.has(idx)) {
      seen.add(idx);
      kept.push(items[idx]);
    }
  }
  return kept;
}

/** Turn every article's parsed citations into deduplicated, date-sorted events. */
function citationEvents(articles: { wikitext: string }[]): TimelineEvent[] {
  const byUrl = new Map<string, WikiCitation>();
  for (const a of articles) {
    for (const c of parseCitations(a.wikitext)) {
      const existing = byUrl.get(c.url);
      // same URL cited in both the History and Timeline articles: keep the fuller date
      if (!existing || (existing.yearOnly && !c.yearOnly)) byUrl.set(c.url, c);
    }
  }
  const sorted = [...byUrl.values()].sort((a, b) => a.date.localeCompare(b.date));
  return spreadSample(sorted, CITATION_CAP).map((c, i) => ({
    id: `cite-${i}`,
    date: c.date,
    type: "citation" as const,
    title: c.title,
    source: c.publication,
    url: c.url,
    sourceKey: "wikipedia" as const,
    // the cited article is the document AND the event — one URL, one row
    externalId: c.url,
    dedupBasis: c.url,
    yearOnly: c.yearOnly,
  }));
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
      // one sentence per year: prose is connective narrative now — the citations
      // mined from the same article carry the "what was written then" weight
      if (count >= 1) continue;
      seenYears.set(year, count + 1);
      events.push({
        id: `${idPrefix}-${year}-${count}`,
        date: `${year}-01-01`,
        type: "history",
        title: s,
        source: `Wikipedia: ${page.title}`,
        url: quoteUrl(page.title, s),
        imageUrl: page.image,
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

  // the References lists ride along as their own event stream: distinct, dated,
  // external articles — the part of Wikipedia that actually resurfaces the period
  const wikitexts = await Promise.all(pages.map((p) => getWikitext(p.title)));
  const citations = citationEvents(
    wikitexts.filter((w): w is string => w !== null).map((w) => ({ wikitext: w }))
  );

  const seen = new Set<string>();
  const events: TimelineEvent[] = [];
  pages.forEach((p, i) => {
    for (const ev of eventsFromPage(p, `hist${i}`, 40)) {
      const key = ev.title.slice(0, 80).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(ev);
    }
  });
  events.push(...citations);
  events.sort((a, b) => a.date.localeCompare(b.date));

  return {
    title: page.title,
    summary,
    articleUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
    articles: pages.map((p) => p.title),
    events,
  };
}
