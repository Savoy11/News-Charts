import { FetchResult, TimelineEvent } from "./types";

const UA = { "User-Agent": "News Charts Research marcusowens94@gmail.com" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface LocResult {
  id?: string;
  url?: string;
  date?: string; // YYYY-MM-DD
  partof_title?: string[];
  location_state?: string[];
  image_url?: string[];
}

/** "aberdeen herald (aberdeen, chehalis county, w.t.) 1886-1917" -> "Aberdeen Herald" */
function cleanPaperName(raw: string | undefined): string {
  if (!raw) return "a newspaper";
  const withoutYears = raw.replace(/\s*\d{4}\s*-\s*\d{2,4}\s*$/, "").trim();
  const name = withoutYears.split("(")[0].trim();
  return name
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()))
    .join(" ");
}

/**
 * Historical US newspaper coverage from the Library of Congress's Chronicling America
 * (public domain, ~1770–1963). This is the only source that covers the stretch between a
 * topic's invention and GDELT's 2017 floor.
 *
 * Results are taken in relevance order deliberately: sorting by date instead surfaces the
 * oldest OCR misreads first (a "bicycle" hit in 1837), whereas relevance ranking lands on
 * genuine mentions. Returns candidates — the caller applies a plausibility floor with
 * `dropImplausiblePress`, since the floor comes from the Wikipedia timeline fetched alongside.
 */
export async function getPressMentions(topic: string): Promise<TimelineEvent[]> {
  return (await fetchPressMentions(topic)).events;
}

/** Same fetch, but reporting LoC's 503 throttling so ingest can back off. */
export async function fetchPressMentions(topic: string): Promise<FetchResult> {
  const url =
    `https://www.loc.gov/collections/chronicling-america/` +
    `?q=${encodeURIComponent(`"${topic}"`)}&fo=json&c=40&at=results`;

  let results: LocResult[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(attempt === 0 ? url : `${url}&_retry=${attempt}`, {
        headers: UA,
        next: { revalidate: 86400 },
      });
      if (res.status === 503 || res.status === 429) {
        if (attempt < 2) {
          await sleep(4000); // LoC throttles aggressively
          continue;
        }
        return { events: [], outcome: "throttled", httpStatus: res.status };
      }
      if (!res.ok) return { events: [], outcome: "error", httpStatus: res.status };
      const json = await res.json();
      results = json?.results ?? [];
      break;
    } catch (err) {
      return { events: [], outcome: "error", detail: String(err).slice(0, 200) };
    }
  }

  const perYear = new Map<number, number>();
  const events: TimelineEvent[] = [];
  for (const r of results) {
    const date = r.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const year = Number(date.slice(0, 4));
    const count = perYear.get(year) ?? 0;
    if (count >= 2) continue;
    perYear.set(year, count + 1);

    const paper = cleanPaperName(r.partof_title?.[0]);
    const state = r.location_state?.[0];
    const where = state ? ` (${state.replace(/\b\w/g, (c) => c.toUpperCase())})` : "";
    const link = (r.id || r.url || "").replace(/^http:/, "https:");
    events.push({
      id: `press-${date}-${events.length}`,
      date,
      type: "press",
      title: `“${topic}” in ${/^the\b/i.test(paper) ? "" : "the "}${paper}${where}`,
      source: "Chronicling America · Library of Congress",
      url: link || undefined,
      description: "Digitised newspaper page",
      imageUrl: (Array.isArray(r.image_url) ? r.image_url[0] : undefined)?.replace(/^http:/, "https:"),
      sourceKey: "loc_chronam",
      // one scanned page is both the document and the event
      externalId: link || `${date}-${paper}`,
      dedupBasis: `loc:${link || `${date}-${paper}`}`,
    });
    if (events.length >= 40) break;
  }
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
}

/**
 * Newspaper OCR is noisy enough that a search for "bicycle" matches garbled text decades
 * before the bicycle existed. Anything earlier than the topic's documented history is
 * almost certainly a misread, so drop it.
 */
export function dropImplausiblePress(
  press: TimelineEvent[],
  notBefore: number,
  limit = 25
): TimelineEvent[] {
  return press.filter((e) => Number(e.date.slice(0, 4)) >= notBefore).slice(0, limit);
}
