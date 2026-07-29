import { FetchResult, TimelineEvent } from "./types";
import { cleanDomain, sourceLabel } from "./sourceLabel";

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

/** Same fetch, but reporting *why* it came back empty so ingest can back off. */
export async function fetchNews(query: string): Promise<FetchResult> {
  const q = `"${query}" sourcelang:english`;
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
        events.push({
          id: `news-${events.length}-${d}`,
          date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
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
          dedupBasis: `${a.title}|${d.slice(0, 8)}`,
        });
      }
      return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
    } catch (err) {
      return { events: [], outcome: "error", detail: String(err).slice(0, 200) };
    }
  }
  return { events: [], outcome: "throttled", detail: "retries exhausted" };
}
