import { FetchResult, TimelineEvent } from "./types";
import { cleanDomain, sourceLabel } from "./sourceLabel";
import { storyKey } from "./newsQuality";
import { nameKey } from "./companyAliases";
import { commonName } from "./sec";

interface GdeltArticle {
  url: string;
  title: string;
  seendate: string; // 20260717T001500Z
  domain: string;
  language: string;
  socialimage?: string; // article's social/share image, when GDELT has one
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * English-language news coverage from GDELT (free, coverage back to 2017).
 *
 * GDELT throttles to roughly one request every 5 seconds per IP and signals it
 * with a plain-text body under a 200 status, so we detect that and retry once.
 */
export async function getNews(query: string): Promise<TimelineEvent[]> {
  return (await fetchNews(query)).events;
}

/**
 * Words news sites print around the article itself — "Follow us on Google News", share buttons,
 * app-store badges. GDELT matches a word anywhere on the page and returns the newest 100, so one of
 * these in a query fills the result with pages that merely carry it. Measured 2026-10-21:
 * "Alphabet" returned 100 pages, 1 with the company in the headline; "Alphabet" OR "google"
 * returned 97 pages from the last few minutes, none. Such a name still scores headlines.
 */
const PAGE_FURNITURE = new Set(
  "google facebook amazon apple twitter youtube instagram linkedin whatsapp pinterest reddit tiktok snapchat spotify telegram".split(" ")
);

/**
 * GDELT refuses a quoted phrase under five characters, and with it the whole query: "CSX" and
 * "Visa" each came back as "The specified phrase is too short." (2026-10-22, batch 33), while an
 * unquoted Visa matched the word — "Trump revokes over 300,000 visas". Measured with the phrase as
 * sent, spaces counted.
 */
export const GDELT_MIN_PHRASE = 5;

/**
 * The names a GDELT query asks for: the subject's, then its other names but page furniture and any
 * GDELT would refuse as too short ("IBM", "AMD" — still used to score headlines). The other names
 * go in their matching form ("u s bancorp" for "U.S. Bancorp"), which GDELT is measured to take:
 * ("HORTON D R" OR "d r horton") returned 36 articles (batch 28 audit).
 */
export function gdeltNames(query: string, alsoKnownAs: string[] = []): string[] {
  const seen = new Set([nameKey(query).toLowerCase()]);
  const names = [query];
  for (const n of alsoKnownAs) {
    const key = nameKey(n).toLowerCase();
    if (seen.has(key) || PAGE_FURNITURE.has(key) || key.length < GDELT_MIN_PHRASE) continue;
    seen.add(key);
    names.push(key);
  }
  return names;
}

/** Legal forms an SEC title carries after the everyday name: "VISA INC.", "HSBC HOLDINGS PLC". */
const LEGAL_FORM = new Set("INC CORP CO PLC LTD LIMITED HOLDING HOLDINGS GROUP".split(" "));
/** …and those written in capitals: "SAP SE", "Vale S.A.", "ASML HOLDING NV". */
const LEGAL_INITIALS = new Set("SE SA SPA NV AG AB ASA LLC LP".split(" "));

/**
 * The everyday name to ask GDELT for. One it would refuse as too short is asked with the legal form
 * its SEC title carries — "Visa Inc", "CSX Corp", "NIKE Inc", "3M Co", "News Corp" — the way an
 * article names the company at first mention, and never the bare word: 107 of the 1,500 largest
 * companies have an everyday name under five characters, and each was asked a query GDELT refused.
 * A title with no legal form after the name keeps the name as it is.
 */
export function gdeltEverydayName(edgarTitle: string): string {
  const everyday = commonName(edgarTitle);
  if (everyday.length >= GDELT_MIN_PHRASE) return everyday;
  const own = nameKey(everyday);
  const full = nameKey(edgarTitle);
  const after = full.startsWith(`${own} `) ? full.slice(own.length + 1).split(" ") : [];
  // "KKR & Co. Inc." is "KKR & Co"; "TIM S.A." spells its form out letter by letter
  if (after[0] === "&" && after[1] === "CO") return `${everyday} & Co`;
  let next = after[0] ?? "";
  for (let i = 1; next.length < 3 && after[i]?.length === 1 && after[i - 1].length === 1; i++) next += after[i];
  if (LEGAL_INITIALS.has(next)) return `${everyday} ${next}`;
  return LEGAL_FORM.has(next) ? `${everyday} ${next.charAt(0)}${next.slice(1).toLowerCase()}` : everyday;
}

/**
 * The GDELT query for a subject and its other names, as one request: GDELT allows about one
 * request every five seconds, so each name is an `OR` inside the same query, never a call of its
 * own. "GOLDMAN SACHS GROUP", the everyday form of its SEC title, misses every headline that says
 * "Goldman Sachs" (batch 25).
 */
export function gdeltQuery(query: string, alsoKnownAs: string[] = []): string {
  const names = gdeltNames(query, alsoKnownAs);
  return names.length === 1
    ? `"${query}" sourcelang:english`
    : `(${names.map((n) => `"${n}"`).join(" OR ")}) sourcelang:english`;
}

/** Same fetch, but reporting *why* it came back empty so ingest can back off. */
export async function fetchNews(query: string, alsoKnownAs: string[] = []): Promise<FetchResult> {
  const q = gdeltQuery(query, alsoKnownAs);
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(
    q
  )}&mode=artlist&maxrecords=100&format=json&sort=datedesc&startdatetime=20170101000000`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // vary the URL per attempt: a throttle reply arrives as a cacheable 200, so
      // reusing the same key would just re-read the bad body from the fetch cache
      const attemptUrl = attempt === 0 ? url : `${url}&_retry=${attempt}`;
      const res = await fetch(attemptUrl, { next: { revalidate: 1800 } });
      // GDELT signals back-off both as a 429/503 and as a 200 with a text body
      if (res.status === 429 || res.status === 503) {
        if (attempt < 2) {
          await sleep(5500);
          continue;
        }
        return { events: [], outcome: "throttled", httpStatus: res.status };
      }
      if (!res.ok) {
        return { events: [], outcome: "error", httpStatus: res.status };
      }
      const text = await res.text();
      if (!text.trimStart().startsWith("{")) {
        // throttled or an unparseable query — back off and retry, then give up
        if (text.includes("one every")) {
          if (attempt < 2) {
            await sleep(5500);
            continue;
          }
          return { events: [], outcome: "throttled", httpStatus: 200, detail: "GDELT rate limit" };
        }
        // GDELT refuses a query it cannot parse with a line of text. An other name is the likelier
        // cause than the everyday name it has always been asked for, so ask again without them:
        // a refused name never costs the company the news it found before.
        if (gdeltNames(query, alsoKnownAs).length > 1) {
          await sleep(5500);
          const plain = await fetchNews(query);
          const refused = `other names refused: ${text.trim().slice(0, 80)}`;
          return { ...plain, detail: plain.detail ? `${refused}; ${plain.detail}` : refused };
        }
        return { events: [], outcome: "error", httpStatus: 200, detail: "non-JSON body" };
      }
      const articles: GdeltArticle[] = JSON.parse(text)?.articles ?? [];
      const seenTitles = new Set<string>();
      const events: TimelineEvent[] = [];
      for (const a of articles) {
        const key = a.title.toLowerCase().slice(0, 60);
        if (!a.title || seenTitles.has(key)) continue;
        seenTitles.add(key);
        const d = a.seendate;
        const day = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
        events.push({
          id: `news-${events.length}-${d}`,
          date: day,
          type: "news",
          title: a.title,
          // GDELT reports a bare domain and nothing else; it is a real publisher identity,
          // tidied rather than embellished into a masthead we would be guessing at.
          source: sourceLabel(cleanDomain(a.domain), "gdelt"),
          url: a.url,
          sourceKey: "gdelt",
          imageUrl: a.socialimage || undefined,
          // the article URL identifies the document; headline + day identifies the
          // story, so a wire piece syndicated across outlets collapses to one event
          externalId: a.url,
          // The same story key every other news feed uses. GDELT kept its own raw-title and
          // compact-date form, so its copy of a story could never meet Yahoo's (NC-154).
          dedupBasis: storyKey(a.title, day),
          legacyDedupBasis: `${a.title}|${d.slice(0, 8)}`,
        });
      }
      return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
    } catch (err) {
      return { events: [], outcome: "error", detail: String(err).slice(0, 200) };
    }
  }
  return { events: [], outcome: "throttled", detail: "retries exhausted" };
}
