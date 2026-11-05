import { UA } from "./contact";
import { captionParty } from "./secCases";
import type { TimelineEvent } from "./types";

/**
 * Consumer-product recalls on the pages of the companies that made, imported, distributed or sold
 * the product (batch 96, the 2026-10-22 shortlist's #4, approved by the owner on 2026-11-05: "Yes I
 * would like to add product safety recalls.").
 *
 * The U.S. Consumer Product Safety Commission's keyless recall service answers every recall at
 * once: `www.saferproducts.gov/RestWebServices/Recall?format=json`, 28 MB, 10,070 recalls from
 * 1973-06-08 to 2026-10-29 (measured 2026-11-05). It is read once a week for every company and
 * kept (`lib/ingest/cpscWalk.ts`, db/038). A recall names its firms by role: manufacturers,
 * importers and distributors each by name ("Office Depot, Inc., of Boca Raton, Fla."), and the
 * stores that sold it in one line ("Sold At: Target, Walmart, and … online at Amazon.com").
 *
 * The owner's rule of 2026-11-05 applies: every listed company a recall names gets it. A company
 * that made, imported or distributed the product gets the recall on its own row; one that only
 * sold it gets it grouped, a row a month, since a large retailer sold the products of hundreds
 * of recalls (Walmart is named on 709) and they are other makers' news.
 *
 * Licence: the recalls are the Commission's own work, a work of the U.S. Government, which 17
 * U.S.C. § 105 puts outside copyright; the federal data catalog lists the Recalls API under the
 * usa.gov public-domain label (the 2026-10-22 shortlist). Not re-read here: from this session
 * cpsc.gov and saferproducts.gov's pages answered 403 and the catalog's search 404 (2026-11-05);
 * the service itself answered. Used: each recall's title, day, hazard, number of units, the firms
 * it names and a link to its notice — never its images.
 */
export const RECALLS_URL = "https://www.saferproducts.gov/RestWebServices/Recall?format=json";

export interface CpscRecall {
  /** the Commission's recall number, "27055" */
  number: string;
  day: string;
  title: string;
  /** the recall's notice on cpsc.gov */
  url: string | null;
  hazard: string | null;
  units: string | null;
  makers: string[];
  importers: string[];
  distributors: string[];
  /** the stores that sold it, as one line of text */
  soldAt: string;
}

interface RawRecall {
  RecallNumber?: string | number;
  RecallID?: number;
  RecallDate?: string;
  Title?: string;
  URL?: string;
  Products?: { NumberOfUnits?: string }[];
  Hazards?: { Name?: string }[];
  Manufacturers?: { Name?: string }[];
  Importers?: { Name?: string }[];
  Distributors?: { Name?: string }[];
  Retailers?: { Name?: string }[];
}

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const names = (list: { Name?: string }[] | undefined) => [...new Set((list ?? []).map((x) => clean(x.Name)).filter(Boolean))];

/** The recalls in the service's answer, each with a day; a row without one is left out. */
export function parseRecalls(json: unknown): CpscRecall[] {
  if (!Array.isArray(json)) return [];
  const out: CpscRecall[] = [];
  for (const r of json as RawRecall[]) {
    const day = /^(\d{4}-\d{2}-\d{2})/.exec(r.RecallDate ?? "")?.[1];
    const number = clean(String(r.RecallNumber ?? r.RecallID ?? ""));
    const title = clean(r.Title);
    if (!day || !number || !title) continue;
    const url = /^https:\/\/(?:www\.)?cpsc\.gov\//.test(r.URL ?? "") ? (r.URL as string) : null;
    out.push({
      number,
      day,
      title,
      url,
      hazard: clean(r.Hazards?.[0]?.Name) || null,
      units: clean(r.Products?.[0]?.NumberOfUnits) || null,
      makers: names(r.Manufacturers),
      importers: names(r.Importers),
      distributors: names(r.Distributors),
      soldAt: names(r.Retailers).join("; "),
    });
  }
  return out;
}

/**
 * A firm as a recall writes it, without its place: "Office Depot, Inc., of Boca Raton, Fla." →
 * "Office Depot, Inc."; "The Wick & Petal Co. of Indianapolis, Ind." → "The Wick & Petal Co.".
 */
export function firmName(entry: string): string {
  // "…, a division of Office Depot, Inc." names an owner, not a place
  return clean(entry).replace(/(?<!\b(?:division|subsidiary|unit|affiliate)),?\s+of\s+[A-Z][^,]*(?:,\s*[A-Z][\w. ]*)*\.?$/i, "").replace(/,\s*$/, "").trim();
}

/**
 * Whether a firm the recall names as maker, importer or distributor is the company: the firm by
 * the caption rule (`captionParty`), or the parent it names as its owner ("Swinton Avenue
 * Trading, a division of Office Depot").
 */
export function firmIsCompany(entry: string, names: readonly string[]): boolean {
  const firm = firmName(entry);
  const parent = /,?\s+an?\s+(?:division|subsidiary|unit|affiliate)\s+of\s+(.+)$/i.exec(firm);
  if (captionParty(parent ? firm.slice(0, parent.index) : firm, names)) return true;
  return !!parent && !!captionParty(firmName(parent[1]), names);
}

const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const LETTERS = new WeakMap<CpscRecall, string>();
/** Every firm and store a recall names, in letters only, worked out once a recall. */
function lettersOf(r: CpscRecall): string {
  let held = LETTERS.get(r);
  if (held === undefined) {
    held = letters([...r.makers, ...r.importers, ...r.distributors, r.soldAt].join(" "));
    LETTERS.set(r, held);
  }
  return held;
}

/**
 * Whether the stores a recall names hold the company. The line lists them by name ("Target,
 * Walmart, and coffee and home goods stores nationwide and online at Bodum.com, Amazon.com,
 * Target.com"), so a store counts only as a whole item of the list, its name and nothing else
 * but a web address's ".com" or "stores": "Target" and "Target.com" are Target's, "Target
 * Marketing Systems" is not, nor is "home goods stores" Home Depot's.
 */
export function soldAtCompany(soldAt: string, names: readonly string[]): boolean {
  const keys = new Set(names.map(letters).filter((k) => k.length >= 3));
  if (!keys.size) return false;
  const text = soldAt
    .replace(/^\s*sold\s+(?:exclusively\s+)?(?:at|by|through)\s*:?\s*/i, "")
    .replace(/\s+(?:from|between|during|in)\s+(?:about\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December|\d{4})\b.*$/i, "");
  for (const raw of text.split(/\s*(?:[,;:/]|\band\b|\bor\b|\n)\s*/i)) {
    const item = raw
      .replace(/^(?:and\s+)?(?:(?:exclusively|online|nationwide)\s+)*(?:at|through|by|on|in)?\s*(?:the\s+)?/i, "")
      .replace(/\s+(?:retail\s+)?(?:stores?|locations|nationwide|online|websites?|catalogs?|outlets?|clubs?)(?:\s+(?:nationwide|online|and\s+online))*$/i, "")
      .replace(/\.com$/i, "")
      .replace(/['’]s$/i, "")
      .trim();
    const key = letters(item);
    if (key && [...keys].some((k) => key === k || key === letters(k.replace(/s$/, "")))) return true;
  }
  return false;
}

/** How the company is named in a recall: as one that made, imported or distributed it, or only sold it. */
export function roleIn(r: CpscRecall, names: readonly string[]): "maker" | "importer" | "distributor" | "seller" | null {
  if (r.makers.some((m) => firmIsCompany(m, names))) return "maker";
  if (r.importers.some((m) => firmIsCompany(m, names))) return "importer";
  if (r.distributors.some((m) => firmIsCompany(m, names))) return "distributor";
  if (soldAtCompany(r.soldAt, names)) return "seller";
  return null;
}

const ROLE = { maker: "made it", importer: "imported it", distributor: "distributed it", seller: "sold it" } as const;
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "1.7 million" → "about 1.7 million units"; "About 8,000 (in addition, …)" as the Commission wrote it. */
export const unitsOf = (units: string) => (/^about\b/i.test(units) ? units.replace(/^About/, "about") : `about ${units}${/\bunits?\b/i.test(units) ? "" : " units"}`);
const noticeOf = (r: CpscRecall) => r.url ?? `https://www.cpsc.gov/Recalls?search_api_fulltext=${encodeURIComponent(r.number)}`;

/**
 * The recalls naming the company, as timeline events, from `from`, its first price. One a recall
 * the company made, imported or distributed — its recalls of one day one row — and, for a recall
 * it only sold, a row a month when a month holds two or more.
 */
export function cpscEvents(recalls: readonly CpscRecall[], namesIn: (year: number) => string[], { cik, from = "" }: { cik?: number | string; from?: string } = {}): TimelineEvent[] {
  const tag = cik === undefined ? "" : `${Number(cik)}`;
  const own = new Map<string, { r: CpscRecall; role: keyof typeof ROLE }[]>();
  const sold = new Map<string, CpscRecall[]>();
  const cache = new Map<number, { names: string[]; keys: string[] }>();
  for (const r of recalls) {
    if (r.day < from) continue;
    const year = Number(r.day.slice(0, 4));
    let held = cache.get(year);
    if (!held) {
      const n = namesIn(year);
      held = { names: n, keys: [...new Set(n.map(letters).filter((k) => k.length >= 2))] };
      cache.set(year, held);
    }
    const all = lettersOf(r);
    if (!held.keys.some((k) => all.includes(k))) continue;
    const role = roleIn(r, held.names);
    if (!role) continue;
    if (role === "seller") sold.set(r.day.slice(0, 7), [...(sold.get(r.day.slice(0, 7)) ?? []), r]);
    else own.set(r.day, [...(own.get(r.day) ?? []), { r, role }]);
  }
  const events: TimelineEvent[] = [];
  for (const [month, rows] of sold) {
    if (rows.length > 1) continue;
    sold.delete(month);
    own.set(rows[0].day, [...(own.get(rows[0].day) ?? []), { r: rows[0], role: "seller" }]);
  }
  for (const [day, rows] of own) {
    const sorted = [...rows].sort((a, b) => Number(a.role === "seller") - Number(b.role === "seller") || a.r.number.localeCompare(b.r.number));
    const lead = sorted[0];
    const more = sorted.length > 1 ? ` (and ${sorted.length - 1} more recall${sorted.length > 2 ? "s" : ""} that day)` : "";
    const what = (x: { r: CpscRecall; role: keyof typeof ROLE }) =>
      `${x.r.title} — the company ${ROLE[x.role]}${x.r.units ? `; ${unitsOf(x.r.units)}` : ""}${x.r.hazard ? `. ${x.r.hazard}` : ""}`;
    events.push({
      id: `cpsc-${tag}-${day}`,
      date: day,
      type: "regulation",
      title: `${lead.role === "seller" ? "Sold in its stores: " : ""}${lead.r.title}${more}`,
      source: "CPSC",
      url: noticeOf(lead.r),
      description: sorted.map(what).join(" · ").slice(0, 600),
      sourceKey: "cpsc_recalls",
      externalId: sorted.map((x) => x.r.number).join(","),
      dedupBasis: `cpsc:${tag}@${day}`,
    });
  }
  for (const [month, rows] of sold) {
    const sorted = [...rows].sort((a, b) => b.day.localeCompare(a.day) || a.number.localeCompare(b.number));
    const [y, m] = month.split("-");
    events.push({
      id: `cpsc-${tag}-${month}-sold`,
      date: `${month}-01`,
      precision: "month",
      type: "regulation",
      title: `CPSC: ${rows.length} recalls of products sold in its stores, ${MONTH[Number(m) - 1]} ${y}`,
      source: "CPSC",
      url: noticeOf(sorted[0]),
      description: `${rows.length} recalls this month of other makers' products the company sold, grouped into one row: ${sorted.slice(0, 3).map((r) => `"${r.title}"`).join("; ")}${rows.length > 3 ? `; and ${rows.length - 3} more` : ""}. The link opens the newest.`,
      sourceKey: "cpsc_recalls",
      externalId: sorted.map((r) => r.number).join(","),
      dedupBasis: `cpsc:${tag}@${month}:sold`,
    });
  }
  return events.sort((a, b) => b.date.localeCompare(a.date));
}

export interface RecallsAnswer {
  recalls: CpscRecall[];
  outcome: "ok" | "throttled" | "error";
  httpStatus?: number;
  detail?: string;
}

/** Every recall, in one answer. A short answer is a broken one: the service held 10,070 (2026-11-05). */
export async function fetchRecalls(): Promise<RecallsAnswer> {
  try {
    const res = await fetch(RECALLS_URL, { headers: { ...UA, Accept: "application/json" }, signal: AbortSignal.timeout(180_000) });
    if (res.status === 403 || res.status === 429 || res.status === 503) return { recalls: [], outcome: "throttled", httpStatus: res.status };
    if (!res.ok) return { recalls: [], outcome: "error", httpStatus: res.status };
    const recalls = parseRecalls(await res.json());
    if (recalls.length < 9_000) return { recalls: [], outcome: "error", httpStatus: res.status, detail: `only ${recalls.length} recalls read` };
    return { recalls, outcome: "ok", httpStatus: res.status };
  } catch (err) {
    return { recalls: [], outcome: "error", detail: String(err).slice(0, 200) };
  }
}
