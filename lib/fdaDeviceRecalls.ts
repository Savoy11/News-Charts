import type { FetchResult, TimelineEvent } from "./types";
import { UA } from "./contact";
import { type FdaFirm, firmFor, productName } from "./fdaRecalls";

/**
 * The FDA's medical-device recalls of 2000 to mid-2012, before the weekly enforcement reports begin
 * (batch 144; lib/fdaRecalls.ts reads the reports, from 2012-06-20).
 *
 * The owner approved the source on 2026-11-12 (`docs/proposals/2026-11-11b-proposals.md` #1). The
 * reports openFDA holds begin on 2012-06-20, so before it no device maker's page had an FDA recall;
 * openFDA's other device file, the FDA's own recall database, goes back to 2002 under the same event
 * numbers. Read from openFDA's keyless API (`device/recall.json`), asked for the firms the recall map
 * gives a company (`FDA_FIRMS`) and the recalls the firm began before the reports' first day. Public
 * domain: "made available with a Creative Commons CC0 1.0 Universal dedication… even for commercial
 * purposes" (open.fda.gov/license, read 2026-11-11), the reports' terms.
 *
 * - **The rule is the map's own:** each product record's firm and the day the firm began the recall
 *   (`firmFor`), as the rows of 2012 on are matched. The map's days for the units bought and sold
 *   between 2000 and 2012 were read for this source (Guidant's heart-rhythm business, filed under
 *   "Boston Scientific CRM Corp" in 2005, counts for Boston Scientific only from 2006-04-21).
 * - **A recall the reports hold is the reports' row:** the reports' own event numbers for the recalls
 *   begun before 2012-06-20 (470 events on 2026-11-10, nearly every one the FDA posted from 2012-06-08
 *   on) are read once a process and skipped. A record whose year is mistyped in both files (Intuitive
 *   Surgical's of 2012, "1930-12-11" in the reports, "0012-11-30" here) is in neither's range.
 * - **The class is the FDA's own page:** the file gives none. The FDA's recall-database page for the
 *   event lists its products with their class, up to 500 a page; a recall takes its most serious
 *   product's, and only Class I and II become rows, the floor the reports' rows keep. The page is on
 *   www.accessdata.fda.gov, whose contents the FDA's website policies call "not copyrighted"; what is
 *   kept is the class, a fact. Each event's page is read once and kept (db/051), a few hundred a run.
 * - **The row** reads as the reports' do, "Class I device recall: Medtronic Sprint Fidelis 6949 … (4
 *   products)", with the FDA's reason, on the day the firm began it, and links to the event's page in
 *   the recall database, since the reports' own page exists only from 2012.
 */

const API = "https://api.fda.gov";
const TIMEOUT_MS = 30_000;
const PAGE = 1000;
/** Far above any company's count (Stryker: 1,113 product records before 2012-06-20, on 2026-11-10); reaching it is reported. */
const RECORD_LIMIT = 5000;

/** The enforcement reports' first day in openFDA: a recall begun from it on is the reports' to give. */
export const REPORTS_BEGIN = "2012-06-20";
/** The file's earliest real day; a few records carry a mistyped year ("0013-03-05" for 2013). */
export const FILE_BEGINS = "2000-01-01";

const CLASS_SITE = "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRES/res.cfm";
/** The recall database's page for an event, listing its products: the row's link. */
export const eventPage = (event: string) => `${CLASS_SITE}?start_search=1&event_id=${event}`;
/** The same page, 500 products a page from `start` (1-based), as the class is read. */
export const classPageUrl = (event: string, start = 1) => `${CLASS_SITE}?start_search=${start}&event_id=${event}&PAGENUM=500`;

export interface DeviceRecord {
  res_event_number?: string;
  /** the product's record in the recall database: the first entered names the recall */
  cfres_id?: string;
  recalling_firm?: string;
  event_date_initiated?: string;
  product_description?: string;
  reason_for_recall?: string;
}

/** A company's firms' product records begun from 2000 to the day before the reports, oldest first. */
export function deviceRecallQuery(firms: readonly FdaFirm[], skip = 0): string {
  const who = [...new Set(firms.map((f) => f.search))].map((s) => `recalling_firm:"${s}"`).join(" ");
  const params = new URLSearchParams({
    search: `(${who}) AND event_date_initiated:[${FILE_BEGINS} TO 2012-06-19]`,
    sort: "event_date_initiated:asc",
    limit: String(PAGE),
    skip: String(skip),
  });
  return `${API}/device/recall.json?${params}`;
}

/** The reports' device records begun before their first day: the events they already hold. */
export function reportedQuery(skip = 0): string {
  const params = new URLSearchParams({ search: "recall_initiation_date:[20000101 TO 20120619]", limit: String(PAGE), skip: String(skip) });
  return `${API}/device/enforcement.json?${params}`;
}

type Answer<T> = { ok: true; value: T; httpStatus: number } | { ok: false; failure: FetchResult };

/** Every page of an openFDA search; a 404 is none. */
async function readAll<T>(url: (skip: number) => string, what: string): Promise<Answer<T[]>> {
  const out: T[] = [];
  let status = 0;
  try {
    for (let skip = 0; skip < RECORD_LIMIT; skip += PAGE) {
      const res = await fetch(url(skip), { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) });
      status = res.status;
      if (res.status === 404) break;
      if (res.status === 429) return { ok: false, failure: { events: [], outcome: "throttled", httpStatus: 429, detail: what } };
      if (!res.ok) return { ok: false, failure: { events: [], outcome: "error", httpStatus: res.status, detail: what } };
      const body = (await res.json()) as { results?: unknown; meta?: { results?: { total?: number } } };
      if (!Array.isArray(body.results)) return { ok: false, failure: { events: [], outcome: "error", httpStatus: res.status, detail: `${what}: no list of records` } };
      out.push(...(body.results as T[]));
      const total = body.meta?.results?.total ?? 0;
      if (out.length >= total || body.results.length < PAGE) return { ok: true, value: out, httpStatus: status };
    }
  } catch (err) {
    return { ok: false, failure: { events: [], outcome: "error", detail: `${what}: ${String(err).slice(0, 200)}` } };
  }
  // the limit is far above any company's count: reaching it is a failure, never a short answer
  if (out.length >= RECORD_LIMIT) return { ok: false, failure: { events: [], outcome: "error", httpStatus: status, detail: `${what}: record limit ${RECORD_LIMIT} reached` } };
  return { ok: true, value: out, httpStatus: status };
}

/** The company's firms' device recall records before the reports, or why there are none. */
export function fetchDeviceRecords(firms: readonly FdaFirm[]): Promise<Answer<DeviceRecord[]>> {
  return readAll<DeviceRecord>((skip) => deviceRecallQuery(firms, skip), "device recall records");
}

/** The reports' event numbers for the recalls begun before their first day. */
export async function fetchReportedEvents(): Promise<Answer<Set<string>>> {
  const got = await readAll<{ event_id?: string }>((skip) => reportedQuery(skip), "the reports' events begun before 2012-06-20");
  return got.ok ? { ok: true, value: new Set(got.value.map((r) => String(r.event_id ?? "")).filter((id) => /^\d+$/.test(id))), httpStatus: got.httpStatus } : got;
}

export interface ClassPage {
  /** the most serious class among the products the page lists, or null when it lists none */
  cls: 1 | 2 | 3 | null;
  /** the products this page lists */
  products: number;
  /** the products the event has, as the page counts them */
  total: number;
}

/**
 * The recall database's results page → its products' classes. The page says "1 to 68 of 68 Results",
 * or "1 result found" for one, and lists each product with its class as a figure in the second
 * column: `res.cfm?id=95530">ASR ACETABULAR…</a></td><td>2</td>`.
 */
export function parseClassPage(html: string): ClassPage | null {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const many = text.match(/\b(\d+) to (\d+) of (\d+) Results\b/);
  const one = text.match(/\b(\d+) results? found\b/i);
  const total = many ? Number(many[3]) : one ? Number(one[1]) : null;
  if (total === null) return null;
  const classes = [...html.matchAll(/href="\.\/res\.cfm\?id=\d+">[\s\S]*?<\/a>\s*<\/td>\s*<td[^>]*>\s*([123])\s*<\/td>/g)].map((m) => Number(m[1]));
  const cls = classes.length ? (Math.min(...classes) as 1 | 2 | 3) : null;
  return { cls, products: classes.length, total };
}

/** An event's class from its pages, 500 products a page, `gapMs` between pages; or why it was not read. */
export async function fetchEventClass(
  event: string,
  { gapMs = 1300, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)) }: { gapMs?: number; sleep?: (ms: number) => Promise<unknown> } = {},
): Promise<{ ok: true; cls: 1 | 2 | 3 | null; products: number; requests: number } | { ok: false; outcome: "throttled" | "error"; httpStatus?: number; detail: string; requests: number }> {
  let cls: 1 | 2 | 3 | null = null;
  let products = 0;
  let requests = 0;
  for (let start = 1; ; start += 500) {
    if (requests) await sleep(gapMs);
    requests++;
    let html: string;
    try {
      const res = await fetch(classPageUrl(event, start), { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status === 429 || res.status === 403) return { ok: false, outcome: "throttled", httpStatus: res.status, detail: `the recall database's page for event ${event}`, requests };
      if (!res.ok) return { ok: false, outcome: "error", httpStatus: res.status, detail: `the recall database's page for event ${event}`, requests };
      html = await res.text();
    } catch (err) {
      return { ok: false, outcome: "error", detail: `event ${event}: ${String(err).slice(0, 160)}`, requests };
    }
    const page = parseClassPage(html);
    if (!page) return { ok: false, outcome: "error", detail: `event ${event}: the page gives no count of its products`, requests };
    products += page.products;
    if (page.cls !== null) cls = cls === null ? page.cls : (Math.min(cls, page.cls) as 1 | 2 | 3);
    if (products >= page.total || page.products === 0 || start + 500 > page.total) return { ok: true, cls, products, requests };
  }
}

const CLASSES = ["Class I", "Class II", "Class III"] as const;

export interface DeviceRecallPlan {
  /** the class kept for each event read, null where its page listed none */
  classes: ReadonlyMap<string, 1 | 2 | 3 | null>;
  /** the reports' events, which this source never gives */
  reported: ReadonlySet<string>;
  /** the company's first price: a recall begun before it is on no page */
  from?: string;
}

/**
 * Records → timeline events, one for each recall: its first day, its products under the company's
 * firms that day, and the product the FDA entered first (the lowest record number, so the row reads
 * the same whatever order openFDA answers in) with its reason. An event whose class is not read yet
 * is `awaiting`; one of Class III, or whose page listed no product, gives no row.
 */
export function deviceRecallEvents(records: readonly DeviceRecord[], firms: readonly FdaFirm[], plan: DeviceRecallPlan): { events: TimelineEvent[]; awaiting: string[] } {
  const byEvent = new Map<string, { date: string; products: number; first: number; product: string; reason: string }>();
  for (const r of records) {
    const id = String(r.res_event_number ?? "");
    const date = r.event_date_initiated ?? "";
    if (!/^\d+$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < FILE_BEGINS || date >= REPORTS_BEGIN) continue;
    if (plan.reported.has(id) || !firmFor(r.recalling_firm ?? "", date, firms)) continue;
    const order = /^\d+$/.test(r.cfres_id ?? "") ? Number(r.cfres_id) : Number.MAX_SAFE_INTEGER;
    const named = { first: order, product: productName(r.product_description), reason: (r.reason_for_recall ?? "").replace(/\s+/g, " ").trim() };
    const e = byEvent.get(id);
    if (!e) {
      byEvent.set(id, { date, products: 1, ...named });
      continue;
    }
    if (date < e.date) e.date = date;
    e.products++;
    if (order < e.first) Object.assign(e, named);
  }
  const events: TimelineEvent[] = [];
  const awaiting: string[] = [];
  for (const [id, e] of byEvent) {
    if (plan.from && e.date < plan.from) continue;
    if (!plan.classes.has(id)) {
      awaiting.push(id);
      continue;
    }
    const cls = plan.classes.get(id);
    if (cls !== 1 && cls !== 2) continue;
    const more = e.products > 1 ? ` (${e.products} products)` : "";
    events.push({
      id: `fda-${id}`,
      date: e.date,
      type: "recall",
      title: `${CLASSES[cls - 1]} device recall: ${e.product}${more}`,
      description: e.reason ? (e.reason.length > 300 ? `${e.reason.slice(0, 297).replace(/\s\S*$/, "")}…` : e.reason) : undefined,
      source: "FDA",
      url: eventPage(id),
      sourceKey: "fda_device_recalls",
      externalId: id,
      // the event number is the recall, as in the reports: one event however many files carry it
      dedupBasis: `fda:${id}`,
    });
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return { events, awaiting: awaiting.sort((a, b) => Number(a) - Number(b)) };
}
