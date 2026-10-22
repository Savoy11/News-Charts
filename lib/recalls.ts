import type { FetchResult, TimelineEvent } from "./types";

/**
 * Vehicle safety recalls a listed company filed with NHTSA, from 1966 (batch 30, NC-095).
 *
 * The only free source found that reaches into the 1963–2017 stretch the corpus is thinnest in
 * (`docs/proposals/2026-10-22-news-sources.md`), and only for one industry: cars, trucks,
 * motorcycles, tyres and RVs. A recall is a dated act the company itself reports — a maker must
 * file a defect report within five business days of deciding there is a safety defect — and a
 * large one is the kind of event a price move follows.
 *
 * Read from the Transportation Department's open-data copy of NHTSA's recall database: one row per
 * recall campaign, with a short subject line, the maker, the number of vehicles and the date the
 * defect report arrived. Public domain ("Public Domain U.S. Government" in the dataset's own
 * licence field); no key.
 */

const DATASET = "https://data.transportation.gov/resource/6axg-epim.json";
// The same contact the other federal requests carry (lib/macro.ts).
const UA = { "User-Agent": "News Charts Research marcusowens94@gmail.com" };
const TIMEOUT_MS = 20_000;
/** Far above any company's count at the floor (Ford: 861 on 2026-10-22); reaching it is reported. */
const ROW_LIMIT = 5000;

/**
 * Only recalls of at least this many vehicles reach a page. Measured 2026-10-22: Ford has 1,754
 * recalls and 861 at this size, GM 1,724 and 756, Honda 478 and 247, while Winnebago keeps 8 and
 * Blue Bird 20. At 100,000 a smaller maker would show almost nothing (Winnebago, Blue Bird and
 * Polaris none at all).
 */
export const RECALL_FLOOR = 10_000;

export interface RecallMaker {
  /** The manufacturer exactly as the dataset writes it. */
  name: string;
  /**
   * The first day its recalls are this company's (YYYY-MM-DD). Absent when every recall under the
   * name is the company's own.
   */
  from?: string;
  /** Why this maker is the company's, and why from that day. */
  why: string;
}

/**
 * Which makers' recalls belong to which listed company, by CIK. Checked by hand, never matched by
 * name: the dataset files every recall under the maker's *current* name, so "Chrysler (FCA US,
 * LLC)" carries Chrysler's recalls back to 1966 and "General Motors, LLC" old GM's.
 *
 * The rule is the one news names follow (`newsNamesFor` in lib/sec.ts): a company's own history
 * and a predecessor whose ticker it carries count, an acquisition's past never does. So a maker
 * a company bought counts from the day it was bought, and a name whose past mixes in another
 * company's records stays out until that can be separated (Shyft Group's start in 1973, two years
 * before Spartan Motors was founded).
 */
export const RECALL_MAKERS: Readonly<Record<number, { ticker: string; makers: readonly RecallMaker[] }>> = {
  37996: { ticker: "F", makers: [{ name: "Ford Motor Company", why: "the company itself" }] },
  1467858: {
    ticker: "GM",
    makers: [{
      name: "General Motors, LLC",
      why: "old GM's recalls to 2009 are filed under today's name too; today's GM carries old GM's ticker",
    }],
  },
  1605484: {
    ticker: "STLA",
    makers: [
      {
        name: "Chrysler (FCA US, LLC)",
        from: "2014-10-12",
        why: "Stellantis N.V. is FCA N.V. renamed, and FCA N.V. became Chrysler's parent on 2014-10-12; the decades before belong to Chrysler's earlier owners",
      },
      { name: "Maserati North America, Inc.", from: "2014-10-12", why: "a Fiat company, inside FCA N.V. from its formation on 2014-10-12" },
    ],
  },
  715153: { ticker: "HMC", makers: [{ name: "Honda (American Honda Motor Co.)", why: "Honda's U.S. subsidiary" }] },
  1094517: {
    ticker: "TM",
    makers: [
      { name: "Toyota Motor Corporation", why: "the company itself" },
      { name: "Toyota Motor Engineering & Manufacturing", why: "Toyota's North American subsidiary" },
    ],
  },
  1318605: { ticker: "TSLA", makers: [{ name: "Tesla, Inc.", why: "the company itself" }] },
  793952: { ticker: "HOG", makers: [{ name: "Harley-Davidson Motor Company", why: "the company itself" }] },
  1898795: { ticker: "LVWR", makers: [{ name: "LIVEWIRE EV, LLC", why: "LiveWire Group's own subsidiary" }] },
  75362: {
    ticker: "PCAR",
    makers: [
      { name: "PACCAR Incorporated", why: "the company itself" },
      { name: "PETERBILT MOTOR COMPANY", why: "a PACCAR company since 1958, before its first recall here (1968)" },
    ],
  },
  931015: {
    ticker: "PII",
    makers: [
      { name: "Polaris Industries Inc.", why: "the company itself" },
      { name: "redundant POLARIS INDUSTRIES, INC.", why: "an older record of the same company" },
      { name: "Indian Motorcycle Company", from: "2011-05-01", why: "bought by Polaris in April 2011; the earlier Indian companies were others'" },
    ],
  },
  42582: { ticker: "GT", makers: [{ name: "Goodyear Tire & Rubber Company", why: "the company itself" }] },
  107687: { ticker: "WGO", makers: [{ name: "Winnebago Industries, Inc.", why: "the company itself" }] },
  1589526: { ticker: "BLBD", makers: [{ name: "Blue Bird Body Company", why: "the company itself" }] },
  1648416: { ticker: "RACE", makers: [{ name: "Ferrari North America, Inc.", why: "Ferrari's own U.S. subsidiary" }] },
  26172: { ticker: "CMI", makers: [{ name: "Cummins, Inc.", why: "the company itself" }] },
  730263: {
    ticker: "THO",
    makers: [
      { name: "Thor Motor Coach", why: "Thor's own motorhome company, formed in 2010" },
      { name: "Airstream, Inc.", why: "Thor's from its founding in 1980, before its first recall here (1995)" },
    ],
  },
  879526: { ticker: "WNC", makers: [{ name: "Wabash National Corporation", why: "the company itself" }] },
  1874178: { ticker: "RIVN", makers: [{ name: "Rivian Automotive, LLC", why: "Rivian's operating company" }] },
  1811210: { ticker: "LCID", makers: [{ name: "Lucid USA, Inc.", why: "Lucid's U.S. operating company" }] },
};

/** The makers whose recalls belong to a company, or null when it makes no vehicles we map. */
export function recallMakersFor(cik: number | string): readonly RecallMaker[] | null {
  return RECALL_MAKERS[Number(cik)]?.makers ?? null;
}

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** One request for every recall of the company's makers at the floor, newest first. */
export function recallQuery(makers: readonly RecallMaker[], floor = RECALL_FLOOR): string {
  const plain = makers.filter((m) => !m.from).map((m) => quote(m.name));
  const dated = makers
    .filter((m) => m.from)
    .map((m) => `(manufacturer = ${quote(m.name)} AND report_received_date >= ${quote(`${m.from}T00:00:00`)})`);
  const who = [...(plain.length ? [`manufacturer IN (${plain.join(", ")})`] : []), ...dated].join(" OR ");
  const params = new URLSearchParams({
    $select: "nhtsa_id, report_received_date, manufacturer, subject, component, recall_type, potentially_affected, defect_summary",
    $where: `(${who}) AND potentially_affected >= ${floor}`,
    $order: "report_received_date DESC, nhtsa_id",
    $limit: String(ROW_LIMIT),
  });
  return `${DATASET}?${params}`;
}

export interface RecallRow {
  nhtsa_id?: string;
  report_received_date?: string;
  manufacturer?: string;
  subject?: string;
  component?: string;
  recall_type?: string;
  potentially_affected?: string | number;
  defect_summary?: string;
}

/** Short words kept in capitals that a vowel test would lower: anti-lock brakes, the airbag system. */
const ACRONYMS = new Set(["ABS", "SIR", "ATV", "UTV", "SUV", "EGR", "ECM", "EV", "RV", "AC", "VIN", "OEM", "LED", "HID", "ESC", "CNG", "LPG", "HVAC", "USA"]);

/**
 * "FUEL TANK STRAP CORROSION" → "fuel tank strap corrosion". A word with a digit ("F-150", "FMVSS
 * 208"), a short word without vowels ("GM", "DRL", "TPMS") and a known acronym keep their capitals.
 */
const lowered = (s: string) =>
  s.replace(/[A-Za-z0-9'-]+/g, (w) => (/\d/.test(w) || ACRONYMS.has(w) || (w.length <= 5 && !/[aeiouy]/i.test(w)) ? w : w.toLowerCase()));
const sentence = (s: string) => {
  const out = lowered(s);
  return out.charAt(0).toUpperCase() + out.slice(1);
};

/**
 * In the middle years the subject often opens with the maker's own name — "FORD/FRONT LOWER BALL
 * JOINTS", "GM/FMVSS 135/REAR BRAKE HOSE" — which says nothing on that maker's own page.
 */
const MAKER_PREFIX =
  /^(?:FORD|GM|GENERAL MOTORS|CHEVROLET|CADILLAC|BUICK|PONTIAC|OLDSMOBILE|GMC|SATURN|LINCOLN|MERCURY|CHRYSLER|DODGE|JEEP|RAM|HONDA|ACURA|TOYOTA|LEXUS|SCION|TESLA|HARLEY-DAVIDSON|HARLEY|PACCAR|PETERBILT|KENWORTH|POLARIS|INDIAN|GOODYEAR|WINNEBAGO|BLUE BIRD|FERRARI|CUMMINS|THOR|AIRSTREAM|WABASH|RIVIAN|LUCID|MASERATI|LIVEWIRE)\s*\/\s*/;

/**
 * The recall's subject line, readable. The dataset's oldest rows carry NHTSA's component code in
 * its place ("BRAKES:HYDRAULIC:POWER ASSIST:BOOSTER"), cut at 50 characters; the middle years
 * shout ("FORD/FUEL TANK CRACKS"); recent ones are written as sentences and are left as written.
 */
export function recallHeadline(subject?: string, component?: string): string {
  let s = (subject ?? "").replace(/\s+/g, " ").trim();
  const comp = (component ?? "").replace(/\s+/g, " ").trim();
  if (!s) return comp ? sentence(comp) : "Safety defect";
  if (s !== s.toUpperCase()) return s;
  const cut = s.length >= 50; // the code column's width: a code this long was cut mid-word
  s = s.replace(MAKER_PREFIX, "") || s;
  if (/:/.test(s)) {
    // a code cut mid-word ("…:BELT ANCHOR AND ATTACHM") reads worse than the plain component
    if (cut && comp) return sentence(comp);
    const [head, ...rest] = s.split(":").map((p) => p.trim()).filter(Boolean);
    const parts = cut ? rest.slice(0, -1) : rest;
    return parts.length ? `${sentence(head)}: ${lowered(parts.join(", "))}` : sentence(head);
  }
  return sentence(s);
}

const NOUN: Record<string, string> = { Vehicle: "vehicles", Tire: "tires", "Child Seat": "child seats", Equipment: "units" };

/**
 * Rows → timeline events. Every row is checked against the maker map again, whatever the query
 * asked for: a recall reaches a company's page only under a mapped maker, on or after its day.
 */
export function recallEvents(rows: readonly RecallRow[], makers: readonly RecallMaker[], floor = RECALL_FLOOR): TimelineEvent[] {
  const byName = new Map(makers.map((m) => [m.name, m]));
  const out: TimelineEvent[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const id = r.nhtsa_id ?? "";
    const date = (r.report_received_date ?? "").slice(0, 10);
    const maker = byName.get(r.manufacturer ?? "");
    const count = Number(r.potentially_affected);
    if (!/^\d{2}[A-Z]\d{6}$/.test(id) || seen.has(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!maker || (maker.from && date < maker.from) || !Number.isFinite(count) || count < floor) continue;
    seen.add(id);
    const summary = (r.defect_summary ?? "").replace(/\s+/g, " ").trim();
    out.push({
      id: `recall-${id}`,
      date,
      type: "recall",
      title: `Recall of ${count.toLocaleString("en-US")} ${NOUN[r.recall_type ?? ""] ?? "vehicles"}: ${recallHeadline(r.subject, r.component)}`,
      // the older summaries are written in capitals; the subject line already carries their gist
      description: summary && summary !== summary.toUpperCase() ? (summary.length > 400 ? `${summary.slice(0, 397).replace(/\s\S*$/, "")}…` : summary) : undefined,
      source: "NHTSA",
      url: `https://www.nhtsa.gov/recalls?nhtsaId=${id}`,
      sourceKey: "nhtsa_recalls",
      externalId: id,
      // the campaign number is the recall: one event however many feeds or runs carry it
      dedupBasis: `nhtsa:${id}`,
    });
  }
  return out;
}

/** A company's recalls at the floor, or why there are none. */
export async function fetchRecalls(cik: number | string): Promise<FetchResult> {
  const makers = recallMakersFor(cik);
  if (!makers) return { events: [], outcome: "empty", detail: "no vehicle maker mapped to this company" };
  try {
    const res = await fetch(recallQuery(makers), { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 429 || res.status === 503) return { events: [], outcome: "throttled", httpStatus: res.status };
    if (!res.ok) return { events: [], outcome: "error", httpStatus: res.status };
    const rows: unknown = await res.json();
    if (!Array.isArray(rows)) return { events: [], outcome: "error", httpStatus: res.status, detail: "the dataset did not answer with a list" };
    const events = recallEvents(rows as RecallRow[], makers);
    return {
      events,
      outcome: events.length ? "ok" : "empty",
      httpStatus: res.status,
      ...(rows.length >= ROW_LIMIT ? { detail: `row limit ${ROW_LIMIT} reached; older recalls not read` } : {}),
    };
  } catch (err) {
    return { events: [], outcome: "error", detail: String(err).slice(0, 200) };
  }
}
