import { FetchResult, TimelineEvent, DatePrecision } from "./types";

/**
 * The Internet Archive: `advancedsearch` for dated items, Wayback CDX for a site's own history.
 *
 * This is the only source here that is *structurally* safe. Every other historical feed is one
 * key expiry, price change or licence revision away from going dark — NYT and Guardian already
 * read a server key the operator pays for — and archive.org needs no key at all. It also reaches
 * back further than anything except Chronicling America, and unlike Chronicling America it is
 * not limited to US newspapers before 1963.
 *
 * ⚠ Both payload shapes below come from archive.org's published API documentation and have
 * never been exercised against the live service from this environment (egress is blocked by
 * policy). `npm run check:archive` pins them against canned responses matching that
 * documentation, which is the same standard every other adapter here was verified to.
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
 * Sorted by date ascending rather than by relevance, the opposite of the Chronicling America
 * call: OCR misreads are what makes date-sorting dangerous there, and archive.org items carry
 * catalogued metadata rather than OCR guesses, so the oldest hits are genuinely the oldest.
 */
export async function fetchArchiveItems(term: string, rows = 50): Promise<FetchResult> {
  const q = `"${term.replace(/"/g, "")}"`;
  const params = new URLSearchParams({ q, rows: String(rows), page: "1", output: "json" });
  for (const f of ["identifier", "title", "date", "year", "mediatype", "creator"]) {
    params.append("fl[]", f);
  }
  params.append("sort[]", "date asc");
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

/** One CDX row after the header: [urlkey, timestamp, original, mimetype, statuscode, digest, length]. */
type CdxRow = string[];

export interface SiteSnapshot {
  /** YYYY-MM-DD of the capture */
  date: string;
  url: string;
}

/**
 * Snapshots plus *why* there are none — the distinction an array cannot carry.
 *
 * This used to return a bare `SiteSnapshot[]`, so "the Wayback Machine has never captured this
 * domain" and "we could not reach the Wayback Machine" were both `[]`. Demonstrated rather than
 * theorised on 2026-08-12: from a container where `web.archive.org` is blocked, this reported
 * **zero captures for ford.com** — a domain with tens of thousands of them. A caller reading
 * that number has been told a fact about Ford, and it is false.
 *
 * The same mistake `check:index` exists to prevent for the subject index, in the same shape:
 * an empty answer that a failure is indistinguishable from. `FetchResult` already carries this
 * vocabulary for events, so the outcomes are its outcomes.
 */
export interface SnapshotResult {
  snapshots: SiteSnapshot[];
  outcome: "ok" | "empty" | "error" | "throttled";
  httpStatus?: number;
  detail?: string;
}

/**
 * The first capture of a company's own site in each year it was archived.
 *
 * The point is not to plot 40,000 crawls — it is that "the site that day" already exists as a
 * per-event link, and this is the same evidence at the level of the subject: a visible record of
 * when the company first had a web presence and roughly how often it was being crawled.
 *
 * Collapsed to one per year here rather than by the caller, because the raw CDX response for a
 * large site is tens of thousands of rows and the collapse is what makes it a timeline instead
 * of a log.
 */
export async function fetchSiteSnapshots(domain: string, limit = 40): Promise<SnapshotResult> {
  const d = domain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  // Nothing was asked, so nothing was learned — not "this domain has no captures".
  if (!d) return { snapshots: [], outcome: "empty" };
  const params = new URLSearchParams({
    url: d,
    output: "json",
    fl: "timestamp,original,statuscode",
    // only successful captures: a 404 snapshot is a record of the crawler's disappointment
    filter: "statuscode:200",
    collapse: "timestamp:4", // 4 leading digits = one row per year, done server-side
    limit: String(limit),
  });

  try {
    const res = await fetch(`https://web.archive.org/cdx/search/cdx?${params}`, {
      headers: UA,
      next: { revalidate: 86400 },
    });
    // The Wayback Machine sheds load the same way the rest of archive.org does, and "come back"
    // is a different fact from "there is nothing here".
    if (res.status === 429 || res.status === 503) {
      return { snapshots: [], outcome: "throttled", httpStatus: res.status };
    }
    if (!res.ok) return { snapshots: [], outcome: "error", httpStatus: res.status };
    const rows: CdxRow[] = await res.json();
    // Something that is not an array at all is an answer we do not understand. Reporting it as
    // an empty archive would be the original bug wearing different clothes.
    if (!Array.isArray(rows)) {
      return { snapshots: [], outcome: "error", httpStatus: 200, detail: "response was not an array" };
    }
    // The first row is the column header, not data. Treating it as a capture produced a snapshot
    // dated "timestamp", which parses to nothing and renders as an empty row.
    const [header, ...body] = rows;
    // CDX answers a domain it has never captured with an empty array — no header, no rows. That
    // one really is "there is nothing here".
    if (!header) return { snapshots: [], outcome: "empty", httpStatus: 200 };
    if (header[0] !== "timestamp") {
      return { snapshots: [], outcome: "error", httpStatus: 200, detail: `unexpected columns: ${header.join(",")}` };
    }

    const out: SiteSnapshot[] = [];
    for (const row of body) {
      const ts = row[0];
      if (!/^\d{14}$/.test(ts ?? "")) continue;
      out.push({
        date: `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`,
        url: `https://web.archive.org/web/${ts}/${row[1]}`,
      });
    }
    return { snapshots: out, outcome: out.length ? "ok" : "empty", httpStatus: 200 };
  } catch (err) {
    // A snapshot strip is a nice-to-have; an unreachable Wayback must never take a page down.
    // It must not be reported as an empty archive either — hence `error` rather than `empty`.
    return { snapshots: [], outcome: "error", detail: (err as Error).message };
  }
}
