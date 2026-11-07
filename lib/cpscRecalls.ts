import { UA } from "./contact";
import { epaParty } from "./epaCases";
import type { TimelineEvent } from "./types";
import { takenBefore } from "./takenNames";

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
 * "Office Depot, Inc."; "The Wick & Petal Co. of Indianapolis, Ind." → "The Wick & Petal Co.";
 * "Asweets Global Inc., City of Industry, California" → "Asweets Global Inc." (batch 100: the
 * place was cut at its "of", which left "…Inc., City", and "City" named City Holding).
 */
export function firmName(entry: string): string {
  return (
    clean(entry)
      // a place whose own name holds "of": "City of Industry", "City of Commerce", "Town of Wheatland"
      .replace(/,\s+(?:City|Town|Village|Borough|Township)\s+of\s+[A-Z][^,]*(?:,\s*[A-Z][\w. ]*)*\.?$/, "")
      // "…, a division of Office Depot, Inc." names an owner, not a place
      .replace(/(?<!\b(?:division|subsidiary|unit|affiliate|City|Town|Village|Borough|Township)),?\s+of\s+[A-Z][^,]*(?:,\s*[A-Z][\w. ]*)*\.?$/i, "")
      .replace(/,\s*$/, "")
      .trim()
  );
}

/**
 * Whether a firm the recall names as maker, importer or distributor is the company: the firm by
 * the caption rule with the EPA rule's two guards (`epaParty`: one name joined by "and" is one
 * name, so "Allied Tube and Conduit Corporation" is not Conduit's and "Adam and Eve" not Eve's;
 * a person written surname first is no company), or the parent it names as its owner ("Swinton
 * Avenue Trading, a division of Office Depot").
 */
export function firmIsCompany(entry: string, names: readonly string[]): boolean {
  const firm = firmName(entry);
  const parent = /,?\s+an?\s+(?:division|subsidiary|unit|affiliate)\s+of\s+(.+)$/i.exec(firm);
  if (epaParty(parent ? firm.slice(0, parent.index) : firm, names)) return true;
  return !!parent && !!epaParty(firmName(parent[1]), names);
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
 * Marketing Systems" is not, nor is "home goods stores" Home Depot's. A store is a proper name
 * (batch 100): an item written all in small letters is a kind of store, "coffee and home goods
 * stores" names no Coffee Holding, unless it is a web address ("amazon.com"); and a name's
 * closing "s" is dropped only against an item written with a possessive, so "Lowe's" is
 * Lowe's and "A&E stores" is not AES.
 */
export function soldAtCompany(soldAt: string, names: readonly string[]): boolean {
  const keys = new Set(names.map(letters).filter((k) => k.length >= 3));
  if (!keys.size) return false;
  const text = soldAt
    .replace(/^\s*sold\s+(?:exclusively\s+)?(?:at|by|through)\s*:?\s*/i, "")
    .replace(/\s+(?:from|between|during|in)\s+(?:about\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December|\d{4})\b.*$/i, "");
  for (const raw of text.split(/\s*(?:[,;:/]|\band\b|\bor\b|\n)\s*/i)) {
    const named = raw
      .replace(/^(?:and\s+)?(?:(?:exclusively|online|nationwide)\s+)*(?:at|through|by|on|in)?\s*(?:the\s+)?/i, "")
      .replace(/\s+(?:retail\s+)?(?:stores?|locations|nationwide|online|websites?|catalogs?|outlets?|clubs?)(?:\s+(?:nationwide|online|and\s+online))*$/i, "");
    const web = /\.(?:com|net)$/i.test(named);
    if (!web && !/\p{Lu}/u.test(named)) continue;
    const possessive = /['’]s$/i.test(named);
    const key = letters(named.replace(/\.(?:com|net)$/i, "").replace(/['’]s$/i, "").trim());
    if (key && [...keys].some((k) => key === k || (possessive && key === letters(k.replace(/s$/, ""))))) return true;
  }
  return false;
}

/**
 * The firms and stores a recall names that are another company's though they carry a listed
 * company's name, read by hand on 2026-11-05 (batch 100, the audit of batches 94–99) among the 269
 * firm names and the stores the 10,070 recalls gave the index, by CIK. `firm` refuses a maker,
 * importer or distributor the pattern matches, from `from` when given (a name the company's record
 * took from another company is refused before that day by lib/takenNames.ts, batch 117); `store` refuses a store
 * line the pattern matches, or every one ("never") for a company that is no retailer. Firms that
 * are other companies' but whose recalls come before the company's first price are left to the
 * floor: STIHL's VIKING GmbH (Viking Holdings, 2024), Innovage LLC (InnovAge, 2021), the go-kart
 * "Fox" (Fox Corp, 2019). Ingersoll-Rand Company's are refused on Ingersoll Rand Inc. by its taken
 * name's day, 2020-02-28 (lib/takenNames.ts, batch 117).
 */
export const NOT_THE_COMPANY: Readonly<Record<number, { ticker: string; firm?: RegExp; from?: string; store?: RegExp | "never"; why: string }[]>> = {
  42888: [{ ticker: "GGG", firm: /^Graco(?:\s+Children['’]s\s+Products\b.*)?$/i, why: "Graco Children's Products of Elverson, Pennsylvania (strollers, swings, playards), not Graco Inc., the Minneapolis pump and sprayer maker" }],
  1032033: [{ ticker: "SLM", firm: /^SLM\b/i, why: "SLM International, Buddy L's toy-making parent, not SLM Corporation (Sallie Mae)" }],
  1126956: [{ ticker: "SR", firm: /^Spire LLC\b/i, why: "Spire LLC d/b/a StoreYourBoard.com of Troy, Virginia, not Spire Inc., the gas utility" }],
  1800227: [{ ticker: "PPLI", firm: /^HSN\b/i, from: "2008-08-20", why: "HSN, Inc., the shopping network IAC spun off on 2008-08-20; before that HSN was IAC's own" }],
  108312: [{ ticker: "WWD", firm: /^Woodward$/i, why: "Woodward & Lothrop, the department store, which the 1985 recall lists as \"Woodward\" and \"Lothrop\", not Woodward, Inc." }],
  1551182: [{ ticker: "ETN", firm: /^Eaton$/i, why: "an \"Eaton\" among the aluminum bat makers of 1975 and 1976, which the recalls do not tie to Eaton Corporation" }],
  1190370: [{ ticker: "IVDN", firm: /^Innovative Designs LLC\b/i, why: "Innovative Designs LLC of New York (light-up bracelets), not Innovative Designs, Inc. of Pittsburgh" }],
  1895262: [{ ticker: "NE", store: "never", why: "Noble Corporation drills offshore wells; \"Barnes and Noble\" is the bookseller" }],
  1587603: [{ ticker: "WNRS", store: "never", why: "Winners, Inc. is a sports-betting media company; \"Winners\" is TJX's Canadian chain" }],
  1015383: [{ ticker: "POWW", store: "never", why: "Outdoor Holding sells ammunition; \"Outdoor and ski supply stores\" is a kind of store" }],
  1013488: [{ ticker: "BJRI", store: "never", why: "BJ's Restaurants sells no products; \"BJ's\" is BJ's Wholesale Club" }],
  775158: [{ ticker: "OSK", store: "never", why: "Oshkosh Corporation makes trucks; \"OshKosh\" stores are OshKosh B'gosh's, Carter's brand" }],
  709283: [{ ticker: "QMCO", store: "never", why: "Quantum Corporation makes data storage; \"Quantum and e4L\" were television marketers" }],
  1107280: [{ ticker: "OVTZ", store: "never", why: "Oculus Inc. is not Oculus.com, Meta's store" }],
  763901: [{ ticker: "BPOP", store: "never", why: "Popular, Inc. is a bank; \"Popular Club\" was a mail-order catalog" }],
  945841: [{ ticker: "POOL", store: /\bPool and Spa\b/i, why: "\"Pool and Spa dealers\" and \"Pool and Spa Depot\" are kinds and names of stores, not Pool Corporation" }],
  1166691: [{ ticker: "CMCSA", store: /\btelevision networks? airing on\b/i, why: "Shop LC's television network airing on Comcast's channels: Shop LC sold it" }],
  1428439: [{ ticker: "ROKU", store: /\btelevision networks? airing on\b/i, why: "Shop LC's television network airing on Roku: Shop LC sold it" }],
  // batch 116's T entry, AT&T Corp.'s 1995 charger, is lib/takenNames.ts's (batch 117)
};

/**
 * The units a listed company owned that recalls name by their own name, by the owner's CIK, each
 * from the day the company owned it (the owner's call of 2026-11-06: "Put … Graco on Newell"),
 * read by hand. `key` is the letters the stored recalls are asked by.
 *
 * - Graco Children's Products is Newell's from 1999-03-24, the day Newell merged with Rubbermaid,
 *   Graco's owner: Newell's EDGAR record ends its name "NEWELL CO" on 1999-03-23 and its 8-K of
 *   1999-03-25 reports an acquisition completed on 1999-03-24 (item 2). Graco's recalls before
 *   are no listed company's, and none is Graco Inc.'s (`NOT_THE_COMPANY`).
 */
export const UNITS: Readonly<Record<number, { ticker: string; unit: string; firm: RegExp; key: string; from: string; to?: string }[]>> = {
  814453: [{ ticker: "NWL", unit: "Graco Children's Products", firm: /^Graco(?:\s+Children['’]s\s+Products\b.*)?$/i, key: "graco", from: "1999-03-24" }],
};

/** The letters a company's stored recalls are asked by for its units (`UNITS`). */
export const unitKeysOf = (cik: number | string): string[] => (UNITS[Number(cik)] ?? []).map((u) => u.key);

/** How the company is named in a recall: as one that made, imported or distributed it, or only sold it. */
export function roleIn(r: CpscRecall, names: readonly string[], cik?: number | string): "maker" | "importer" | "distributor" | "seller" | null {
  const refused = cik === undefined ? [] : (NOT_THE_COMPANY[Number(cik)] ?? []);
  const units = cik === undefined ? [] : (UNITS[Number(cik)] ?? []);
  const owned = (entry: string) => units.some((u) => r.day >= u.from && (!u.to || r.day <= u.to) && u.firm.test(firmName(entry)));
  const firm = (entry: string) =>
    owned(entry) ||
    (firmIsCompany(entry, names) &&
      !refused.some((n) => n.firm && (!n.from || r.day >= n.from) && n.firm.test(firmName(entry))) &&
      // …and not a name the record took from another company, before the day (lib/takenNames.ts, batch 117)
      !takenBefore(cik, r.day, firmName(entry)));
  if (r.makers.some(firm)) return "maker";
  if (r.importers.some(firm)) return "importer";
  if (r.distributors.some(firm)) return "distributor";
  if (refused.some((n) => n.store === "never" || (n.store instanceof RegExp && n.store.test(r.soldAt)))) return null;
  if (soldAtCompany(r.soldAt, names)) return "seller";
  return null;
}

const ROLE = { maker: "made it", importer: "imported it", distributor: "distributed it", seller: "sold it" } as const;
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// a count the Commission qualified itself: 7,836 recalls say "About", 56 "Approximately", 15 "More than"
const QUALIFIED_COUNT = /^(?:about|approximately|more than|up to|over|nearly|roughly|between|less than|fewer than|an estimated)\b/i;

/**
 * "1.7 million" → "about 1.7 million units"; "About 8,000 (in addition, …)" and "Approximately
 * 39,000" as the Commission wrote them, which read "about Approximately 39,000 units" before batch 111.
 */
export const unitsOf = (units: string) =>
  QUALIFIED_COUNT.test(units) ? units.charAt(0).toLowerCase() + units.slice(1) : `about ${units}${/\bunits?\b/i.test(units) ? "" : " units"}`;
const noticeOf = (r: CpscRecall) => r.url ?? `https://www.cpsc.gov/Recalls?search_api_fulltext=${encodeURIComponent(r.number)}`;

/**
 * The recalls naming the company, as timeline events, from `from`, its first price. One a recall
 * the company made, imported or distributed — its recalls of one day one row — and, for a recall
 * it only sold, a row a month when a month holds two or more.
 *
 * A month's sold recalls are kept under the month's key from the first (batch 100, the audit of
 * batches 94–99, finding 2): a month read when it held one, and again when it held two, updates
 * one row, where a lone recall stored under its day stayed on the page beside the month's row
 * once a second arrived. A row stored under the old day key moves onto the month's
 * (`legacyDedupBasis`): the month's first recall's day, when no recall of the company's own is
 * that day.
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
      held = { names: n, keys: [...new Set([...n.map(letters).filter((k) => k.length >= 2), ...(cik === undefined ? [] : unitKeysOf(cik))])] };
      cache.set(year, held);
    }
    const all = lettersOf(r);
    if (!held.keys.some((k) => all.includes(k))) continue;
    const role = roleIn(r, held.names, cik);
    if (!role) continue;
    if (role === "seller") sold.set(r.day.slice(0, 7), [...(sold.get(r.day.slice(0, 7)) ?? []), r]);
    else own.set(r.day, [...(own.get(r.day) ?? []), { r, role }]);
  }
  const events: TimelineEvent[] = [];
  const what = (x: { r: CpscRecall; role: keyof typeof ROLE }) =>
    `${x.r.title} — the company ${ROLE[x.role]}${x.r.units ? `; ${unitsOf(x.r.units)}` : ""}${x.r.hazard ? `. ${x.r.hazard}` : ""}`;
  for (const [day, rows] of own) {
    const sorted = [...rows].sort((a, b) => a.r.number.localeCompare(b.r.number));
    const lead = sorted[0];
    const more = sorted.length > 1 ? ` (and ${sorted.length - 1} more recall${sorted.length > 2 ? "s" : ""} that day)` : "";
    events.push({
      id: `cpsc-${tag}-${day}`,
      date: day,
      type: "regulation",
      title: `${lead.r.title}${more}`,
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
    const first = sorted[sorted.length - 1].day;
    const moved = own.has(first) ? {} : { legacyDedupBasis: `cpsc:${tag}@${first}` };
    const kept = { id: `cpsc-${tag}-${month}-sold`, type: "regulation" as const, source: "CPSC", url: noticeOf(sorted[0]), sourceKey: "cpsc_recalls" as const, externalId: sorted.map((r) => r.number).join(","), dedupBasis: `cpsc:${tag}@${month}:sold`, ...moved };
    if (rows.length === 1)
      events.push({ ...kept, date: rows[0].day, title: `Sold in its stores: ${rows[0].title}`, description: what({ r: rows[0], role: "seller" }).slice(0, 600) });
    else
      events.push({
        ...kept,
        date: `${month}-01`,
        precision: "month",
        title: `CPSC: ${rows.length} recalls of products sold in its stores, ${MONTH[Number(m) - 1]} ${y}`,
        description: `${rows.length} recalls this month of other makers' products the company sold, grouped into one row: ${sorted.slice(0, 3).map((r) => `"${r.title}"`).join("; ")}${rows.length > 3 ? `; and ${rows.length - 3} more` : ""}. The link opens the newest.`,
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
