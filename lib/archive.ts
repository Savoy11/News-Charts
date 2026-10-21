import { FetchResult, TimelineEvent, DatePrecision } from "./types";

/**
 * The Internet Archive: `advancedsearch` for dated items.
 *
 * This is the only source here that is *structurally* safe. Every other historical feed is one
 * key expiry, price change or licence revision away from going dark — NYT and Guardian already
 * read a server key the operator pays for — and archive.org needs no key at all. It also reaches
 * back further than anything except Chronicling America, and unlike Chronicling America it is
 * not limited to US newspapers before 1963.
 *
 * ✅ **Exercised against the live service 2026-08-12**, and it found two defects that every
 * offline case passed straight through: year-only items drawn on a specific 1 January, and a
 * `date asc` sort selecting the archive's worst-catalogued rows. The `advancedsearch` fixtures in
 * `npm run check:archive` now match responses captured that day.
 *
 * A Wayback CDX reader for a company's own site history sat here unused until 2026-10-19, when
 * the owner chose to delete it rather than build the snapshot strip it was for (NC-043). The
 * "this site on that date" link on events needs no lookup (`waybackUrl` in lib/wikidata.ts).
 */

const UA = { "User-Agent": "News Charts Research marcusowens94@gmail.com" };

/** advancedsearch.php — one document per archived item. */
interface IaDoc {
  identifier?: string;
  title?: string | string[];
  /** ISO-ish; archive.org returns full timestamps ("1922-03-04T00:00:00Z") and bare years alike */
  date?: string;
  year?: string | number;
  mediatype?: string;
  publicdate?: string;
  creator?: string | string[];
}

/**
 * archive.org returns several fields as *either* a scalar or an array, depending on how many
 * values the item carries. Taking `doc.title` verbatim renders "a,b" or "[object Object]" on a
 * card, so every multi-valued field goes through this.
 */
function first(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v.find((x) => typeof x === "string" && x.trim()) ?? undefined;
  return typeof v === "string" && v.trim() ? v : undefined;
}

/**
 * An archived item's date, and how much of it the archive actually knew.
 *
 * Metadata quality here is uneven by design — it is a public archive, not a catalogue — so a
 * bare year is common and must stay a bare year. Normalising "1922" to 1922-01-01 and calling it
 * day precision would put a March pamphlet in January and draw it as a specific day.
 *
 * ⚠ The archive does that normalising *for us*, which is how the harm above arrived anyway.
 * Exercised against the live service for the first time on 2026-08-12, `advancedsearch` returns
 * a year-only item as `{"date":"1936-01-01T00:00:00Z","year":1936}` — a full midnight timestamp
 * on 1 January, not the bare `year` the API documentation shows. Read literally that is day
 * precision, so every year-only item in the archive was landing on the timeline as a specific
 * 1 January. Three consecutive Jan-1 "day" hits in a ten-row sample is the tell.
 *
 * The canned fixtures were written from the documentation, so no check ever saw the real shape —
 * `check:archive` asserted year precision against a doc carrying `year` and no `date` at all,
 * a payload the service does not send. Both shapes are pinned now.
 *
 * A genuine 1 January event is downgraded to year precision by the rule below. That is the
 * trade, and it is the right way round: a year band that could have been a day is imprecise,
 * a day that was only ever a year is wrong.
 */
export function parseArchiveDate(raw: string | undefined): { date: string; precision: DatePrecision } | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const okYear = (y: number) => y >= 1500 && y <= new Date().getUTCFullYear() + 1;

  // Anchored at both ends: unanchored, a range or a stray identifier matches its own prefix and
  // is stored as a specific day — the same trap `parseCiteDate` documents.
  const day = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(s);
  if (day) {
    const [y, m, d] = [Number(day[1]), Number(day[2]), Number(day[3])];
    const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    if (okYear(y) && m >= 1 && m <= 12 && d >= 1 && d <= maxDay) {
      // Midnight on 1 January *with a time component* is the archive's year-only placeholder
      // (see the note above). A bare "1936-01-01" keeps day precision: the live service sends
      // the timestamp form, so the bare one is far likelier to be a real date somebody typed.
      if (m === 1 && d === 1 && /[T ]00:00:00/.test(s)) {
        return { date: `${day[1]}-01-01`, precision: "year" };
      }
      return { date: `${day[1]}-${day[2]}-${day[3]}`, precision: "day" };
    }
    return null;
  }
  const month = /^(\d{4})-(\d{2})$/.exec(s);
  if (month) {
    const [y, m] = [Number(month[1]), Number(month[2])];
    if (okYear(y) && m >= 1 && m <= 12) return { date: `${month[1]}-${month[2]}-01`, precision: "month" };
    return null;
  }
  const year = /^(\d{4})$/.exec(s);
  if (year && okYear(Number(year[1]))) return { date: `${year[1]}-01-01`, precision: "year" };
  return null;
}

/**
 * Media types worth putting on a timeline, and the ones that are not.
 *
 * `collection` and `web` items are containers rather than happenings — a collection has a
 * creation date that says when someone made a folder, which on a timeline reads as an event that
 * never occurred. Everything else (texts, audio, movies, images, software) is a dated artifact.
 */
const CONTAINER_TYPES = new Set(["collection", "web"]);

/**
 * Dated items mentioning a subject.
 *
 * Sorted by RELEVANCE, the same way the Chronicling America call is, and for the same reason.
 *
 * ⚠ This used to sort `date asc`, on the stated premise that "archive.org items carry catalogued
 * metadata rather than OCR guesses, so the oldest hits are genuinely the oldest". Measured
 * against the live service on 2026-08-12, that premise is false, and the sort was selecting for
 * the failure rather than around it — the worst-catalogued items in the archive are precisely
 * the ones an ascending date sort promotes to the top:
 *
 *   "Ford Motor"  → 48 items, 1770–1916, 12 of them pre-1900. The five oldest are Driscoll
 *                   sheet-music covers for 1914–29 songs, every one stamped `year: 1770`.
 *   "Nvidia"      → 50 items, 1898–1999, for a company founded in 1993.
 *
 * Two harms came out of that one parameter. Roughly half of every request's rows were spent on
 * items `dropImplausiblePress` then discarded — and because the 50 oldest hits are always the
 * subject's earliest years, this source could never return a post-1998 NVIDIA item, a post-1980
 * Apple item or a post-1915 Ford item, however much the archive held. For the source this file
 * calls structurally safe and the coverage map names as the backbone of the 1963–2017 gap, that
 * is most of its reach, silently unreachable.
 *
 * Nothing offline could see it: `check:archive` tests how a payload is parsed, not what the
 * query asked for. A date window, if one is ever wanted, belongs in `q` — not in taking the head
 * of a sort over a field the archive itself does not curate.
 */
export async function fetchArchiveItems(term: string, rows = 50): Promise<FetchResult> {
  const q = `"${term.replace(/"/g, "")}"`;
  const params = new URLSearchParams({ q, rows: String(rows), page: "1", output: "json" });
  for (const f of ["identifier", "title", "date", "year", "mediatype", "creator"]) {
    params.append("fl[]", f);
  }
  // No `sort[]` at all — archive.org's default is relevance, which is what we want. See above:
  // sorting by a date field the archive does not curate selected for mis-catalogued rows.
  const url = `https://archive.org/advancedsearch.php?${params}`;

  try {
    const res = await fetch(url, { headers: UA, next: { revalidate: 86400 } });
    // archive.org answers a 503 under load and a 429 when a client is hammering it; both mean
    // "come back", which is a different fact from "there is nothing" and ingest backs off on it.
    if (res.status === 429 || res.status === 503) {
      return { events: [], outcome: "throttled", httpStatus: res.status };
    }
    if (!res.ok) return { events: [], outcome: "error", httpStatus: res.status };

    const json = await res.json();
    const docs: IaDoc[] = json?.response?.docs ?? [];
    const events: TimelineEvent[] = [];

    for (const d of docs) {
      const identifier = d.identifier;
      if (!identifier) continue;
      if (d.mediatype && CONTAINER_TYPES.has(d.mediatype)) continue;
      const when = parseArchiveDate(d.date ?? (d.year != null ? String(d.year) : undefined));
      if (!when) continue; // undated in the archive — nothing to place it against
      const title = first(d.title) ?? identifier;
      const creator = first(d.creator);
      events.push({
        id: `ia-${identifier}`,
        date: when.date,
        precision: when.precision,
        type: "citation",
        title: title.replace(/\s+/g, " ").trim(),
        source: creator ? `Internet Archive · ${creator}` : "Internet Archive",
        url: `https://archive.org/details/${encodeURIComponent(identifier)}`,
        sourceKey: "internet_archive",
        // the identifier is archive.org's own primary key: globally unique and stable
        externalId: identifier,
        dedupBasis: `ia:${identifier}`,
      });
    }
    return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
  } catch (err) {
    return { events: [], outcome: "error", detail: (err as Error).message };
  }
}

export async function getArchiveItems(term: string): Promise<TimelineEvent[]> {
  return (await fetchArchiveItems(term)).events;
}
