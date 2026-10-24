import type { FetchResult, TimelineEvent } from "./types";

/**
 * Drug, medical-device and food recalls a listed company made, from the FDA's weekly enforcement
 * report, mid-2012 on (batch 40).
 *
 * The owner approved the source on 2026-10-24 (`docs/proposals/2026-10-22-news-sources.md`, #3).
 * It adds depth for health and food companies rather than filling the pre-2017 hole: Medtronic
 * alone has 420 recalls in it, Philips 602, Stryker 335.
 *
 * Read from openFDA's keyless API, one endpoint per product type. Public domain: "made available
 * with a Creative Commons CC0 1.0 Universal dedication… even for commercial purposes"
 * (open.fda.gov/license, read 2026-10-24). Without a key it allows 1,000 requests a day.
 */

const API = "https://api.fda.gov";
// The same contact the other federal requests carry (lib/recalls.ts).
const UA = { "User-Agent": "News Charts Research marcusowens94@gmail.com" };
const TIMEOUT_MS = 20_000;
/** openFDA's largest page. */
const PAGE = 1000;
/** Far above any company's count (Philips: 1,770 device records on 2026-10-24); reaching it is reported. */
const RECORD_LIMIT = 5000;

export const FDA_KINDS = ["drug", "device", "food"] as const;
export type FdaKind = (typeof FDA_KINDS)[number];

export interface FdaFirm {
  /** What openFDA is asked for: a phrase the company's firm names contain. */
  search: string;
  /** A firm name this matches is the company's. Defaults to the search phrase as whole words. */
  match?: RegExp;
  /** Firm names the phrase also finds that are not the company's. */
  not?: RegExp;
  /** The first day a recall under these names is the company's (YYYY-MM-DD). */
  from?: string;
  /** The last day it is. */
  to?: string;
  /** Why these names are the company's, and why from or to that day. */
  why: string;
}

/**
 * Which firms' recalls belong to which listed company, by CIK. Checked by hand against the firm
 * names openFDA holds, never matched by name alone: "Hershey Creamery Co." is not the Hershey
 * Company, and "Merck Millipore" is Germany's Merck, not Merck & Co.
 *
 * The rule is the one vehicle recalls and news names follow (lib/recalls.ts): a company's own
 * history and a predecessor whose ticker it carries count, an acquisition's past never does. So a
 * firm a company bought counts from the day the deal closed, as the company's own SEC filing
 * gives it, and a business it spun off or sold stops counting the day it left. A recall's day is
 * the day the firm started it.
 */
export const FDA_FIRMS: Readonly<Record<number, { ticker: string; firms: readonly FdaFirm[] }>> = {
  // ---- medical devices ----
  1613103: {
    ticker: "MDT",
    firms: [
      { search: "Medtronic", why: "the company and its divisions; Medtronic plc carries Medtronic, Inc.'s ticker" },
      { search: "Covidien", from: "2015-01-26", why: "bought 2015-01-26 (Medtronic plc's 8-K filed 2015-01-27); Covidien's earlier recalls were its own" },
    ],
  },
  310764: { ticker: "SYK", firms: [{ search: "Stryker", why: "the company and its divisions" }] },
  885725: { ticker: "BSX", firms: [{ search: "Boston Scientific", why: "the company and its divisions" }] },
  10795: {
    ticker: "BDX",
    firms: [
      { search: "Becton", why: "the company and its divisions" },
      { search: "BD", match: /^BD\b/i, why: "the company's units filed under its initials (BD Biosciences, BD Switzerland)" },
      { search: "Bard", from: "2017-12-29", why: "C.R. Bard and its units, bought 2017-12-29 (BD's 8-K filed 2017-12-29)" },
    ],
  },
  1136869: {
    ticker: "ZBH",
    firms: [
      { search: "Zimmer", why: "the company itself, Zimmer Holdings until it bought Biomet" },
      {
        search: "Biomet",
        from: "2015-06-24",
        not: /Changzhou/i,
        why: "bought 2015-06-24 (Zimmer Biomet's 8-K filed 2015-06-26); a Chinese firm of the name is left out as not shown to be the company's",
      },
    ],
  },
  10456: { ticker: "BAX", firms: [{ search: "Baxter", why: "the company itself; the kidney-care business it sold in 2025 files as Vantive" }] },
  1035267: { ticker: "ISRG", firms: [{ search: "Intuitive Surgical", why: "the company itself" }] },
  1099800: { ticker: "EW", firms: [{ search: "Edwards Lifesciences", why: "the company itself" }] },
  96943: { ticker: "TFX", firms: [{ search: "Teleflex", why: "the company and its divisions, Arrow among them" }] },
  313216: {
    ticker: "PHG",
    firms: [{ search: "Philips", not: /Neusoft/i, why: "the company and its divisions; its joint venture with Neusoft is left out" }],
  },
  845982: { ticker: "SNN", firms: [{ search: "Smith & Nephew", why: "the company and its divisions" }] },
  943819: { ticker: "RMD", firms: [{ search: "ResMed", why: "the company itself" }] },
  40545: {
    ticker: "GE",
    firms: [{
      search: "GE Healthcare",
      to: "2023-01-03",
      not: /Wipro/i,
      why: "GE's healthcare business until it was spun off on 2023-01-03 (GE's 8-K filed 2023-01-04); the joint venture with Wipro is left out",
    }],
  },
  1932393: {
    ticker: "GEHC",
    firms: [{
      search: "GE Healthcare",
      from: "2023-01-04",
      not: /Wipro/i,
      why: "the company from its first day apart from GE; before that its recalls were GE's",
    }],
  },
  1800: {
    ticker: "ABT",
    firms: [
      { search: "Abbott", not: /Abbott Medical Optics/i, why: "the company and its divisions" },
      {
        search: "Abbott Medical Optics",
        to: "2017-02-26",
        why: "Abbott's eye-care business until its sale to Johnson & Johnson completed 2017-02-27 (Abbott's 10-Q filed 2017-05-03)",
      },
      { search: "St Jude", match: /\bSt\.?\s*Jude\b/i, from: "2017-01-04", why: "St. Jude Medical, bought 2017-01-04 (Abbott's 8-K filed 2017-01-05)" },
      { search: "Alere", from: "2017-10-03", why: "bought 2017-10-03 (Abbott's 8-K filed 2017-10-03)" },
    ],
  },

  // ---- drugs ----
  78003: {
    ticker: "PFE",
    firms: [
      { search: "Pfizer", why: "the company and its units, King Legacy and Meridian among them" },
      { search: "Hospira", from: "2015-09-03", why: "bought 2015-09-03 (Pfizer's 8-K filed 2015-09-03); Hospira's earlier recalls were its own" },
      {
        search: "Greenstone",
        to: "2020-11-15",
        why: "Pfizer's generics company until it went with Upjohn to form Viatris, 2020-11-16 (Viatris's 8-K/A filed 2020-11-19)",
      },
    ],
  },
  818686: {
    ticker: "TEVA",
    firms: [
      { search: "Teva", why: "the company and its U.S. arm" },
      { search: "Actavis", from: "2016-08-02", why: "Allergan's generics business, bought 2016-08-02 (Teva's 6-K filed 2016-08-02)" },
    ],
  },
  59478: { ticker: "LLY", firms: [{ search: "Eli Lilly", why: "the company itself" }] },
  310158: {
    ticker: "MRK",
    firms: [{ search: "Merck", not: /Millipore|KGaA|EMD/i, why: "Merck & Co. and Merck Sharp & Dohme; Germany's Merck (Millipore, EMD) is another company" }],
  },
  14272: {
    ticker: "BMY",
    firms: [{ search: "Bristol", match: /\bBristol[- ]?M[ey]+ers\s+Squibb\b/i, why: "the company itself, however the firm name is spelled" }],
  },

  1114448: {
    ticker: "NVS",
    firms: [
      { search: "Novartis", not: /Consumer Health/i, why: "the company and its units" },
      {
        search: "Novartis Consumer Health",
        to: "2015-03-01",
        why: "its consumer business until it went into GSK's consumer joint venture on 2015-03-02 (Novartis's 20-F for 2015)",
      },
      { search: "Sandoz", to: "2023-10-03", why: "its generics business until the spin-off on 2023-10-04 (Novartis's 6-K filed 2023-10-04)" },
      { search: "Alcon", to: "2019-04-08", why: "its eye-care business until the spin-off on 2019-04-09 (Alcon's 20-F for 2019)" },
    ],
  },
  1167379: {
    ticker: "ALC",
    firms: [{ search: "Alcon", from: "2019-04-09", why: "the company from its spin-off from Novartis on 2019-04-09; before that its recalls were Novartis's" }],
  },
  1792044: {
    ticker: "VTRS",
    firms: [
      { search: "Viatris", why: "the company itself" },
      {
        search: "Mylan",
        from: "2020-11-16",
        why: "joined Viatris at its formation 2020-11-16 (Viatris's 8-K/A filed 2020-11-19); Viatris does not carry Mylan's ticker, so Mylan's earlier recalls are not its",
      },
      { search: "Greenstone", from: "2020-11-16", why: "Pfizer's generics company, part of the Upjohn business that formed Viatris" },
    ],
  },
  200406: {
    ticker: "JNJ",
    firms: [
      { search: "Johnson & Johnson", not: /Consumer/i, why: "the company and the units named for it" },
      { search: "Ethicon", why: "its surgical company" },
      { search: "DePuy", why: "its orthopaedics company since 1998" },
      { search: "Janssen", why: "its pharmaceutical companies" },
      { search: "Biosense Webster", why: "its heart-rhythm company" },
      { search: "Mentor Texas", why: "its breast-implant maker since 2009" },
      { search: "Acclarent", why: "its ear, nose and throat company since 2010" },
      { search: "Synthes", from: "2012-06-14", why: "bought 2012-06-14 (J&J's 8-K filed 2012-06-14)" },
      { search: "Abbott Medical Optics", from: "2017-02-27", why: "bought from Abbott 2017-02-27, now Johnson & Johnson Surgical Vision" },
      { search: "Auris Health", from: "2019-04-01", why: "bought 2019-04-01 (J&J's 10-K for 2019)" },
      { search: "Abiomed", from: "2022-12-22", why: "bought 2022-12-22 (J&J's 8-K filed 2022-12-22)" },
      { search: "Shockwave Medical", from: "2024-05-31", why: "bought 2024-05-31 (J&J's 10-Q filed 2024-07-25)" },
      {
        search: "Ortho Clinical",
        match: /\bOrtho[- ]Clinical\b/i,
        to: "2014-06-29",
        why: "its diagnostics company until the sale to Carlyle on 2014-06-30 (J&J's 8-K filed 2014-06-30)",
      },
      { search: "Cordis", to: "2015-10-01", why: "its until Cardinal Health bought it 2015-10-02 (Cardinal's 10-Q filed 2015-11-03)" },
      { search: "Codman", to: "2017-10-01", why: "Codman Neurosurgery, its until Integra bought it 2017-10-02 (Integra's 8-K filed 2017-10-02)" },
      { search: "LifeScan", to: "2018-10-01", why: "sold to Platinum Equity; J&J announced the sale complete on 2018-10-02 (its 8-K filed that day)" },
      { search: "Advanced Sterilization Products", to: "2019-03-31", why: "sold to Fortive 2019-04-01 (Fortive's 8-K filed 2019-04-01)" },
      {
        search: "Johnson & Johnson Consumer",
        to: "2023-08-22",
        why: "its consumer business, now Kenvue; J&J's until its exchange offer for Kenvue completed 2023-08-23 (J&J's 8-K filed 2023-08-25)",
      },
      { search: "McNeil", to: "2023-08-22", why: "a consumer company, J&J's until the Kenvue exchange offer completed 2023-08-23" },
    ],
  },
  1944048: {
    ticker: "KVUE",
    firms: [
      { search: "Kenvue", why: "the company itself" },
      {
        search: "Johnson & Johnson Consumer",
        from: "2023-05-08",
        why: "Kenvue's from the close of its IPO on 2023-05-08 (Kenvue's 8-K filed 2023-05-08); until 2023-08-23 J&J still held most of Kenvue, so a recall then is both companies'",
      },
      { search: "McNeil", from: "2023-05-08", why: "a Kenvue company from the close of its IPO on 2023-05-08" },
    ],
  },
  917520: {
    ticker: "IART",
    firms: [
      {
        search: "Integra",
        match: /\bIntegra (?:Life ?Sci|York|Burlington)/i,
        why: "Integra LifeSciences and its named sites; other firms called Integra are left out",
      },
      { search: "Codman", from: "2017-10-02", why: "Codman Neurosurgery, bought from J&J 2017-10-02 (Integra's 8-K filed 2017-10-02)" },
    ],
  },
  721371: {
    ticker: "CAH",
    firms: [
      { search: "Cardinal Health", why: "the company itself, recalling what it makes or labels" },
      {
        search: "Cordis",
        match: /\bCordis Corporation\b/i,
        from: "2015-10-02",
        to: "2021-06-30",
        why: "bought from J&J 2015-10-02 (Cardinal's 10-Q filed 2015-11-03) and sold in the quarter to 2021-09-30 (its 10-Q filed 2021-11-09): counted to the last day its filings show it held Cordis",
      },
    ],
  },
  1906324: {
    ticker: "QDEL",
    firms: [
      { search: "Quidel", why: "Quidel, and QuidelOrtho, which carries Quidel's ticker" },
      {
        search: "Ortho Clinical",
        match: /\bOrtho[- ]Clinical\b/i,
        from: "2022-05-27",
        why: "joined QuidelOrtho at its formation on 2022-05-27 (QuidelOrtho's 10-K for 2022)",
      },
    ],
  },

  // ---- food ----
  40704: { ticker: "GIS", firms: [{ search: "General Mills", why: "the company itself" }] },
  23217: { ticker: "CAG", firms: [{ search: "Conagra", why: "the company itself, ConAgra Foods before 2016" }] },
  77476: {
    ticker: "PEP",
    firms: [
      { search: "PepsiCo", why: "the company itself" },
      { search: "Frito-Lay", match: /\bFrito[- ]Lay\b/i, why: "PepsiCo's since 1965" },
      { search: "Quaker", match: /\bQuaker (?:Oats|Foods|Manufacturing)\b/i, why: "PepsiCo's since 2001; other firms called Quaker are left out" },
    ],
  },
  1103982: { ticker: "MDLZ", firms: [{ search: "Mondelez", why: "the company itself" }] },
  91419: {
    ticker: "SJM",
    firms: [
      { search: "Smucker", why: "the company itself" },
      { search: "Hostess Brands", from: "2023-11-07", why: "bought 2023-11-07 (Smucker's 8-K filed 2023-11-07)" },
    ],
  },
  1637459: { ticker: "KHC", firms: [{ search: "Kraft Heinz", why: "the company itself, formed 2015" }] },
  47111: {
    ticker: "HSY",
    firms: [{ search: "Hershey Company", match: /\bThe Hershey Company\b/i, why: "the company itself; Hershey Creamery is another company" }],
  },
  48465: { ticker: "HRL", firms: [{ search: "Hormel", why: "the company itself" }] },
  100493: { ticker: "TSN", firms: [{ search: "Tyson Foods", why: "the company itself" }] },
  16732: { ticker: "CPB", firms: [{ search: "Campbell Soup", why: "the company and its supply company; other firms called Campbell are left out" }] },
};

/** The firms whose recalls belong to a company, or null when none is mapped. */
export function fdaFirmsFor(cik: number | string): readonly FdaFirm[] | null {
  return FDA_FIRMS[Number(cik)]?.firms ?? null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const matcher = (f: FdaFirm) => f.match ?? new RegExp(`\\b${escape(f.search).replace(/\s+/g, "\\s+")}\\b`, "i");

/** The firm entry a recall falls under: its name is the company's on its day, or null. */
export function firmFor(name: string, day: string, firms: readonly FdaFirm[]): FdaFirm | null {
  return (
    firms.find((f) => matcher(f).test(name) && !f.not?.test(name) && (!f.from || day >= f.from) && (!f.to || day <= f.to)) ?? null
  );
}

/**
 * One page of a product type's records for the company's firms, newest first. The names are
 * bracketed: unbracketed, openFDA answers `recalling_firm:"Medtronic" recalling_firm:"Covidien"`
 * with Covidien's 573 records alone, where bracketed it gives both, 1,787 (measured 2026-10-24).
 */
export function fdaQuery(kind: FdaKind, firms: readonly FdaFirm[], skip = 0): string {
  const who = [...new Set(firms.map((f) => f.search))].map((s) => `recalling_firm:"${s}"`).join(" ");
  const params = new URLSearchParams({ search: `(${who})`, sort: "recall_initiation_date:desc", limit: String(PAGE), skip: String(skip) });
  return `${API}/${kind}/enforcement.json?${params}`;
}

export interface FdaRecord {
  event_id?: string;
  recall_number?: string;
  recalling_firm?: string;
  classification?: string;
  recall_initiation_date?: string;
  report_date?: string;
  product_description?: string;
  reason_for_recall?: string;
  product_type?: string;
}

/** Class I: use may cause serious harm or death. Class II: temporary or reversible harm. Class III, unlikely to cause harm, is left out. */
const CLASSES = ["Class I", "Class II"] as const;

/**
 * "Vial Label: Epinephrine Injection, USP, 1mg/10mL…" → "Epinephrine Injection", and "28 oz.
 * Gatorade Lemon Lime, …" → "Gatorade Lemon Lime". A record's product description is its whole
 * label; the name is what comes before the first comma, model, catalogue or lot number, after any
 * package size a food label opens with, cut to a line.
 */
export function productName(description?: string): string {
  let s = (description ?? "").replace(/\s+/g, " ").trim();
  const brand = s.match(/^Brand Name:\s*(.+?)\s*(?:Product Name:|Model|$)/i);
  if (brand) s = brand[1];
  s = s.replace(/^(?:\w+\s+)?Label:\s*/i, "");
  s = s.replace(/^(?:Cases? of\s+|\d+(?:\.\d+)?\s*-?\s*(?:fl\.?\s*oz|oz|ounces?|lbs?|pounds?|kg|g|ml|count|ct|pk)\b\.?\s+)/i, "");
  s = s.charAt(0).toUpperCase() + s.slice(1);
  s = s.split(/,\s|;\s|\.\s|\s(?=(?:Model|Catalog|Cat\.|REF|Ref\.|Part|NDC|(?:Case |Package |Unit |Carton )?UPC|Lot|UDI|Rx only|Item)\b)/)[0].trim();
  if (s.length > 80) s = `${s.slice(0, 79).replace(/\s\S*$/, "")}…`;
  return s || "Product";
}

const day = (yyyymmdd?: string) => (/^\d{8}$/.test(yyyymmdd ?? "") ? `${yyyymmdd!.slice(0, 4)}-${yyyymmdd!.slice(4, 6)}-${yyyymmdd!.slice(6, 8)}` : null);

/**
 * The day a recall started, or the day the report published it when the start is impossible: one
 * of Intuitive Surgical's, published 2013-11-13, says it started on 1930-12-11, the only record in
 * any of the three sets dated before 2000 (2026-10-24).
 */
export function recallDay(r: Pick<FdaRecord, "recall_initiation_date" | "report_date">): string | null {
  const started = day(r.recall_initiation_date);
  const reported = day(r.report_date);
  return started && started >= "2000-01-01" && (!reported || started <= reported) ? started : reported;
}

/**
 * Records → timeline events, one for each recall. A recall of several products is several
 * records under one event number; the event takes its first day, its most serious class, and the
 * first product named. Every record is checked against the firm map again, whatever the query
 * asked for.
 */
export function fdaRecallEvents(records: readonly FdaRecord[], firms: readonly FdaFirm[], kind: FdaKind): TimelineEvent[] {
  const byEvent = new Map<string, { date: string; cls: number; products: string[]; reason: string }>();
  for (const r of records) {
    const id = r.event_id ?? "";
    const date = recallDay(r);
    const cls = CLASSES.indexOf(r.classification as (typeof CLASSES)[number]);
    if (!/^\d+$/.test(id) || !date || cls < 0 || !firmFor(r.recalling_firm ?? "", date, firms)) continue;
    const e = byEvent.get(id);
    const product = productName(r.product_description);
    if (!e) {
      byEvent.set(id, { date, cls, products: [product], reason: (r.reason_for_recall ?? "").replace(/\s+/g, " ").trim() });
      continue;
    }
    if (date < e.date) e.date = date;
    e.cls = Math.min(e.cls, cls);
    e.products.push(product);
  }
  return [...byEvent].map(([id, e]) => {
    const more = e.products.length > 1 ? ` (${e.products.length} products)` : "";
    return {
      id: `fda-${id}`,
      date: e.date,
      type: "recall" as const,
      title: `${CLASSES[e.cls]} ${kind} recall: ${e.products[0]}${more}`,
      description: e.reason ? (e.reason.length > 300 ? `${e.reason.slice(0, 297).replace(/\s\S*$/, "")}…` : e.reason) : undefined,
      source: "FDA",
      // the enforcement report's own page for the event, which lists every product in it
      url: `https://www.accessdata.fda.gov/scripts/ires/index.cfm?Event=${id}`,
      sourceKey: "fda_enforcement" as const,
      externalId: id,
      // the event number is the recall: one event however many products, feeds or runs carry it
      dedupBasis: `fda:${id}`,
    };
  });
}

/** A company's Class I and II recalls of every product type, or why there are none. */
export async function fetchFdaRecalls(cik: number | string): Promise<FetchResult> {
  const firms = fdaFirmsFor(cik);
  if (!firms) return { events: [], outcome: "empty", detail: "no FDA-regulated firm mapped to this company" };
  const events: TimelineEvent[] = [];
  const capped: string[] = [];
  let lastStatus = 0;
  try {
    for (const kind of FDA_KINDS) {
      const records: FdaRecord[] = [];
      for (let skip = 0; skip < RECORD_LIMIT; skip += PAGE) {
        const res = await fetch(fdaQuery(kind, firms, skip), { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) });
        lastStatus = res.status;
        // openFDA answers a search that matches nothing with a 404
        if (res.status === 404) break;
        if (res.status === 429) return { events: [], outcome: "throttled", httpStatus: res.status };
        if (!res.ok) return { events: [], outcome: "error", httpStatus: res.status, detail: `${kind} records` };
        const body = (await res.json()) as { results?: unknown; meta?: { results?: { total?: number } } };
        if (!Array.isArray(body.results)) return { events: [], outcome: "error", httpStatus: res.status, detail: `${kind}: no list of records` };
        records.push(...(body.results as FdaRecord[]));
        const total = body.meta?.results?.total ?? 0;
        if (records.length >= total || body.results.length < PAGE) break;
        if (skip + PAGE >= RECORD_LIMIT) capped.push(kind);
      }
      events.push(...fdaRecallEvents(records, firms, kind));
    }
  } catch (err) {
    return { events: [], outcome: "error", detail: String(err).slice(0, 200) };
  }
  return {
    events,
    outcome: events.length ? "ok" : "empty",
    httpStatus: lastStatus,
    ...(capped.length ? { detail: `record limit ${RECORD_LIMIT} reached for ${capped.join(", ")}; older recalls not read` } : {}),
  };
}
