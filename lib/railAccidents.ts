import type { FetchResult, TimelineEvent } from "./types";
import { UA } from "./contact";

/**
 * Railroad accidents a listed company's railroad reported to the Federal Railroad Administration,
 * from 1975 (batch 127, the 2026-11-09 proposal 2, approved by the owner that day).
 *
 * Read from the Transportation Department's open-data copy of FRA's Rail Equipment
 * Accident/Incident Data (Form 54, dataset `85tf-25kj`), the host NHTSA's recalls come from: one
 * row per report a railroad files after a collision, derailment, fire or other accident with on-track
 * equipment that does damage above that year's reporting threshold. Public domain ("Public Domain
 * U.S. Government" in the dataset's own licence field, linked to usa.gov/government-works); no key.
 *
 * A report is the railroad's own filing to its regulator, not a finding of fault, and the row says so.
 * Two railroads in one accident file a report each: each is a row on its own owner's page. A report
 * the dataset holds as several records (its `jointcd` 3 lines) is one row, with the largest count each
 * record gives.
 */

const DATASET = "https://data.transportation.gov/resource/85tf-25kj.json";
const TIMEOUT_MS = 30_000;
/** Far above any company's count at the floor (Union Pacific: 373 reports on 2026-11-09); reaching it is reported. */
const ROW_LIMIT = 5000;

/**
 * The floor, the owner's call of 2026-11-09 ("Draft cut-off (Recommended)"): an accident counts when
 * it killed someone, forced an evacuation, or did $5,000,000 of damage; a highway-rail crossing
 * collision, most often a motorist's death, counts only with an evacuation or that damage. Damage is
 * in the dollars of its year, whole dollars, compared as numbers of digits and never as a float.
 */
export const DAMAGE_FLOOR = "5000000";
const CROSSING = /^Hwy-rail crossing$/i;

export interface RailRoad {
  /** The reporting railroad's code exactly as the dataset writes it. */
  code: string;
  /** The railroad's name on the page: "Union Pacific", "Illinois Central". */
  railroad: string;
  /** The first day its reports are this company's (YYYY-MM-DD). Absent when the company's first price floors it. */
  from?: string;
  /** The last day they are. */
  to?: string;
  /** Why this railroad is the company's, and why from or to that day. */
  why: string;
}

/**
 * Which railroads' reports belong to which listed company, by CIK. Read by hand, never matched by
 * name: the dataset names a reporting railroad, never a listed company. A railroad the company bought
 * counts from the day the filings give, by the batch 120 rule (the buyer's 8-K reporting the completed
 * merger, item 2.01, or item 2 before 2004, else the bought company's own filings, its Form 25 or 15),
 * read from data.sec.gov's filing lists on 2026-11-09; where none reports it, EDGAR's full-text search
 * gives the first filing that names it as the buyer's, and no report falls between the two. A
 * predecessor's past is never the buyer's: Burlington Northern's, Santa Fe's, Conrail's (CSX's and
 * Norfolk Southern's joint venture) and BNSF's before 2010 are no page's. A railroad bought and held in
 * a voting trust until regulators approved the merger counts from the day the buyer owned it, as
 * Illinois Central on CN and Kansas City Southern on CPKC.
 *
 * Every page also counts only from its company's first price, as the other regulators' records do:
 * CSX's and Norfolk Southern's railroads before their holding companies existed are no page's.
 *
 * Two railroads wait for a filing's text, which www.sec.gov serves only to a request naming a contact
 * (`NEWS_CHARTS_CONTACT`): Missouri Pacific on Union Pacific (the merger of 1982-12-22, before EDGAR; 8
 * reports of 1983–1985) and the Delaware & Hudson on CPKC (bought in 1991; 2 reports, of 1993 and 2000).
 */
export const RAIL_OWNERS: Readonly<Record<number, { ticker: string; roads: readonly RailRoad[] }>> = {
  100885: {
    ticker: "UNP",
    roads: [
      { code: "UP", railroad: "Union Pacific", why: "Union Pacific Railroad, the company's own" },
      {
        code: "SP",
        railroad: "Southern Pacific",
        from: "1996-09-11",
        why: "Union Pacific's from the merger with Southern Pacific Rail Corp. (Union Pacific's 8-K reporting 1996-09-11, items 2, 5 and 7); its reports before are Southern Pacific's own",
      },
      { code: "SSW", railroad: "Cotton Belt", from: "1996-09-11", why: "St. Louis Southwestern, Southern Pacific's, with it from 1996-09-11 (Union Pacific's 8-K, item 2)" },
      { code: "DRGW", railroad: "Denver & Rio Grande Western", from: "1996-09-11", why: "Southern Pacific's, with it from 1996-09-11 (Union Pacific's 8-K, item 2)" },
      {
        code: "ALS",
        railroad: "Alton & Southern",
        from: "1996-09-11",
        why: "half Missouri Pacific's and half the Cotton Belt's before the Southern Pacific merger, all Union Pacific's from 1996-09-11 (Union Pacific's 8-K, item 2)",
      },
      {
        code: "CNW",
        railroad: "Chicago & North Western",
        from: "1995-04-25",
        why: "Union Pacific's from its purchase of the rest of Chicago and North Western Transportation (Union Pacific's 8-K reporting 1995-04-25, item 2)",
      },
    ],
  },
  277948: {
    ticker: "CSX",
    roads: [
      { code: "CSX", railroad: "CSX Transportation", why: "CSX Transportation, the company's own" },
      ...(
        [
          ["CSRR", "Chessie System"],
          ["BO", "Baltimore & Ohio"],
          ["CO", "Chesapeake & Ohio"],
          ["WM", "Western Maryland"],
          ["SCL", "Seaboard Coast Line"],
          ["LN", "Louisville & Nashville"],
          ["SBD", "Seaboard System"],
          ["GA", "Georgia Railroad"],
          ["CCO", "Clinchfield"],
          ["WA", "Western Railway of Alabama"],
        ] as const
      ).map(([code, railroad]) => ({
        code,
        railroad,
        why: "Chessie System's or Seaboard Coast Line Industries', whose merger of 1980-11-01 made CSX, before its first price; CSX Transportation since",
      })),
    ],
  },
  702165: {
    ticker: "NSC",
    roads: [
      { code: "NS", railroad: "Norfolk Southern", why: "Norfolk Southern Railway, the company's own" },
      ...(
        [
          ["NW", "Norfolk & Western"],
          ["SOU", "Southern Railway"],
          ["AGS", "Alabama Great Southern"],
          ["CGA", "Central of Georgia"],
          ["CNTP", "Cincinnati, New Orleans & Texas Pacific"],
        ] as const
      ).map(([code, railroad]) => ({
        code,
        railroad,
        why: "Norfolk & Western's or Southern Railway's, whose combination of 1982-06-01 made Norfolk Southern, before its first price",
      })),
    ],
  },
  1067983: {
    ticker: "BRK-B",
    roads: [
      {
        code: "BNSF",
        railroad: "BNSF",
        from: "2010-02-12",
        why: "Berkshire Hathaway's from its purchase of Burlington Northern Santa Fe (BNSF's 8-K reporting 2010-02-12, items 2.01 and 5.01, as EPA's rule reads it, batch 120); BNSF's reports before are its own, and Burlington Northern's and Santa Fe's no page's",
      },
    ],
  },
  16868: {
    ticker: "CNI",
    roads: [
      { code: "GTW", railroad: "Grand Trunk Western", why: "CN's U.S. railroad since long before its first price" },
      { code: "CNRW", railroad: "CN", why: "CN's own U.S. reporting code" },
      {
        code: "IC",
        railroad: "Illinois Central",
        from: "1998-06-05",
        why: "CN's from its purchase of Illinois Central Corp. (CN's tender of 1998-02-13; Illinois Central's Form 15 of 1998-06-05), held in a voting trust until regulators approved the merger; Illinois Central Gulf's reports before 1988 are no page's",
      },
      {
        code: "CC",
        railroad: "Chicago, Central & Pacific",
        from: "2002-03-26",
        why: "Illinois Central's, and so CN's: CN's 6-K of 2002-03-26 is the first filing EDGAR's full-text search finds naming it; its report of 1998 waits for an older filing's text",
      },
      {
        code: "WC",
        railroad: "Wisconsin Central",
        from: "2001-10-09",
        why: "CN's from its purchase of Wisconsin Central Transportation (Wisconsin Central's Form 15 of 2001-10-09); its reports before, Weyauwega's of 1996 among them, are its own",
      },
    ],
  },
  16875: {
    ticker: "CP",
    roads: [
      { code: "CP", railroad: "Canadian Pacific", why: "Canadian Pacific's own U.S. reporting code" },
      { code: "CPKC", railroad: "CPKC", why: "Canadian Pacific Kansas City's own U.S. reporting code" },
      { code: "SOO", railroad: "Soo Line", why: "Canadian Pacific's U.S. railroad, a majority of it held long before its first price, all of it since 1990" },
      {
        code: "DME",
        railroad: "Dakota, Minnesota & Eastern",
        from: "2007-10-04",
        why: "Canadian Pacific's from its purchase (its 6-K of 2007-10-04, the first after the agreement to name \"the acquisition of DM&E\", by EDGAR's full-text search), held in a voting trust until regulators approved it",
      },
      {
        code: "KCS",
        railroad: "Kansas City Southern",
        from: "2021-12-14",
        why: "Canadian Pacific's from the merger (Kansas City Southern's 8-K reporting 2021-12-14, items 2.01 and 5.01, and its Form 25 of that day), held in a voting trust until 2023-04-14 (its 8-K, item 5.01)",
      },
    ],
  },
};

/** The railroads mapped to a company, or null when it has none. */
export function railRoadsFor(cik: number | string): readonly RailRoad[] | null {
  return RAIL_OWNERS[Number(cik)]?.roads ?? null;
}

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** The query's railroad filter: an undated code by name, a dated one only between its days. */
export function roadsWhere(roads: readonly RailRoad[]): string {
  const plain = roads.filter((r) => !r.from && !r.to).map((r) => quote(r.code));
  const dated = roads
    .filter((r) => r.from || r.to)
    .map((r) => `(${[
      `reportingrailroadcode = ${quote(r.code)}`,
      ...(r.from ? [`date >= ${quote(`${r.from}T00:00:00`)}`] : []),
      ...(r.to ? [`date <= ${quote(`${r.to}T23:59:59`)}`] : []),
    ].join(" AND ")})`);
  return [...(plain.length ? [`reportingrailroadcode IN (${plain.join(", ")})`] : []), ...dated].join(" OR ");
}

export const FIELDS = [
  "reportingrailroadcode", "reportingrailroadname", "accidentnumber", "year", "date", "accidenttype", "totalkilledform54", "totalinjuredform54",
  "personsevacuated", "hazmatreleasedcars", "totaldamagecost", "station", "statename", "url", "reportkey", "incidentkey", "primaryaccidentcause", "jointcd",
].join(",");

/**
 * One request for every report of the company's railroads that could clear the floor, oldest first.
 * The crossing rule and the days are applied again to every row (`accidentEvents`).
 */
export function accidentQuery(roads: readonly RailRoad[], from = ""): string {
  const params = new URLSearchParams({
    $select: FIELDS,
    $where: `(${roadsWhere(roads)}) AND (totalkilledform54 > 0 OR personsevacuated > 0 OR totaldamagecost >= ${DAMAGE_FLOOR})${from ? ` AND date >= ${quote(`${from}T00:00:00`)}` : ""}`,
    $order: "date, reportkey",
    $limit: String(ROW_LIMIT),
  });
  return `${DATASET}?${params}`;
}

export interface AccidentRow {
  reportingrailroadcode?: string;
  reportingrailroadname?: string;
  accidentnumber?: string;
  year?: string;
  date?: string;
  accidenttype?: string;
  totalkilledform54?: string | number;
  totalinjuredform54?: string | number;
  personsevacuated?: string | number;
  hazmatreleasedcars?: string | number;
  totaldamagecost?: string | number;
  station?: string;
  statename?: string;
  url?: { url?: string } | string;
  reportkey?: string;
  incidentkey?: string;
  primaryaccidentcause?: string;
  jointcd?: string;
}

/** A whole count as its digits: "5200" → "5200", "" or junk → "0". Never a float. */
const digits = (v: unknown): string => {
  const s = String(v ?? "").trim().replace(/\.0+$/, "");
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, "") : "0";
};
/** a ≥ b for two strings of digits, compared as whole numbers. */
const atLeast = (a: string, b: string) => a.length > b.length || (a.length === b.length && a >= b);
const larger = (a: string, b: string) => (atLeast(a, b) ? a : b);
const grouped = (d: string) => d.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** The dataset's type, readable on a page. */
const TYPE: Record<string, string> = {
  "Derailment": "derailment",
  "Head on collision": "head-on collision",
  "Rear end collision": "rear-end collision",
  "Side collision": "side collision",
  "Raking collision": "raking collision",
  "Broken train collision": "broken-train collision",
  "Hwy-rail crossing": "highway-rail crossing collision",
  "RR grade crossing": "collision at a railroad crossing",
  "Obstruction": "collision with an obstruction",
  "Other impacts": "impact",
  "Fire/violent rupture": "fire or violent rupture",
  "Explosion-detonation": "explosion",
  "Other (describe in narrative)": "train accident",
};

/** "GRANITEVILLE" → "Graniteville", "ST. LOUIS" → "St. Louis", "DE QUEEN" → "De Queen". */
const placeName = (s?: string) =>
  (s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/(^|[\s\-/.(])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase())
    .replace(/\bMc([a-z])/g, (_, c: string) => `Mc${c.toUpperCase()}`);

/** The PDF readout FRA serves for the report, when the dataset gives one on an http(s) address. */
const reportUrl = (u: AccidentRow["url"]) => {
  const s = typeof u === "string" ? u : u?.url;
  return s && /^https?:\/\//i.test(s) ? s : undefined;
};

interface Report {
  row: AccidentRow;
  road: RailRoad;
  date: string;
  killed: string;
  injured: string;
  evacuated: string;
  released: string;
  damage: string;
}

/** Whether a report clears the floor: a death, an evacuation or the damage; a crossing collision only the last two. */
export function clearsFloor(r: { type?: string; killed: string; evacuated: string; damage: string }): boolean {
  const evacuatedOrDamage = r.evacuated !== "0" || atLeast(r.damage, DAMAGE_FLOOR);
  return CROSSING.test(r.type ?? "") ? evacuatedOrDamage : evacuatedOrDamage || r.killed !== "0";
}

const heldOn = (road: RailRoad, day: string) => (!road.from || day >= road.from) && (!road.to || day <= road.to);

/**
 * Rows → timeline events. Every row is checked against the railroad map and the floor again,
 * whatever the query asked for: a report reaches a company's page only under a mapped railroad,
 * between its days, from `from`, the company's first price. One accident two of the company's own
 * railroads reported is one row, the first report's.
 */
export function accidentEvents(rows: readonly AccidentRow[], roads: readonly RailRoad[], { from = "" }: { from?: string } = {}): TimelineEvent[] {
  const byCode = new Map(roads.map((r) => [r.code, r]));
  const reports = new Map<string, Report>();
  for (const row of rows) {
    const key = row.reportkey ?? "";
    const date = (row.date ?? "").slice(0, 10);
    const road = byCode.get(row.reportingrailroadcode ?? "");
    if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !road || !heldOn(road, date) || date < from) continue;
    const was = reports.get(key);
    const next: Report = {
      row: was && was.row.jointcd === "1" ? was.row : row.jointcd === "1" || !was ? row : was.row,
      road,
      date,
      killed: larger(was?.killed ?? "0", digits(row.totalkilledform54)),
      injured: larger(was?.injured ?? "0", digits(row.totalinjuredform54)),
      evacuated: larger(was?.evacuated ?? "0", digits(row.personsevacuated)),
      released: larger(was?.released ?? "0", digits(row.hazmatreleasedcars)),
      damage: larger(was?.damage ?? "0", digits(row.totaldamagecost)),
    };
    reports.set(key, next);
  }
  const out: TimelineEvent[] = [];
  const incidents = new Set<string>();
  for (const [key, r] of [...reports].sort((a, b) => a[1].date.localeCompare(b[1].date) || a[0].localeCompare(b[0]))) {
    if (!clearsFloor({ type: r.row.accidenttype, ...r })) continue;
    // two of the company's railroads reporting one accident, the Soo Line and CP: one row
    const incident = r.row.incidentkey ? `${r.row.incidentkey}@${r.date}` : "";
    if (incident && incidents.has(incident)) continue;
    if (incident) incidents.add(incident);
    const type = TYPE[r.row.accidenttype ?? ""] ?? "train accident";
    const place = [placeName(r.row.station), placeName(r.row.statename)].filter(Boolean).join(", ");
    const counts = [
      r.killed !== "0" ? `${grouped(r.killed)} killed` : "",
      r.injured !== "0" ? `${grouped(r.injured)} injured` : "",
      r.evacuated !== "0" ? `${grouped(r.evacuated)} evacuated` : "",
    ].filter(Boolean);
    const lead = `${r.road.railroad}: ${type}${place ? ` at ${place}` : ""}`;
    const number = (r.row.accidentnumber ?? "").trim();
    // the railroad's cause code, unless it is only the form's pointer to the narrative ("Other
    // causes (Provide detailed description in narrative)"), which the row does not carry
    const cause = (r.row.primaryaccidentcause ?? "").replace(/\s+/g, " ").trim().replace(/^.*\bnarrative\b.*$/i, "");
    out.push({
      id: `fra-${key}`,
      date: r.date,
      type: "regulation",
      title: counts.length ? `${lead} — ${counts.join(", ")}` : `${lead} — $${grouped(r.damage)} of damage`,
      description: [
        `Reported to the Federal Railroad Administration by ${(r.row.reportingrailroadname ?? r.road.railroad).trim()}${number ? ` (accident ${number})` : ""}.`,
        r.released !== "0" ? `${grouped(r.released)} car${r.released === "1" ? "" : "s"} released hazardous material.` : "",
        r.damage !== "0" ? `Damage to equipment and track: $${grouped(r.damage)}.` : "",
        cause ? `Cause the railroad reported: ${cause.replace(/\.$/, "")}.` : "",
        "The report is the railroad's own filing to its regulator, not a finding of fault.",
      ]
        .filter(Boolean)
        .join(" ")
        .slice(0, 600),
      source: "FRA",
      url: reportUrl(r.row.url),
      sourceKey: "fra_accidents",
      externalId: key,
      // the report is the event: one row however many runs read it
      dedupBasis: `fra:${key}`,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** A company's accidents at the floor from `from`, its first price, or why there are none. */
export async function fetchRailAccidents(cik: number | string, { from = "" }: { from?: string } = {}): Promise<FetchResult> {
  const roads = railRoadsFor(cik);
  if (!roads) return { events: [], outcome: "empty", detail: "no railroad mapped to this company" };
  try {
    const res = await fetch(accidentQuery(roads, from), { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 429 || res.status === 503) return { events: [], outcome: "throttled", httpStatus: res.status };
    if (!res.ok) return { events: [], outcome: "error", httpStatus: res.status };
    const rows: unknown = await res.json();
    if (!Array.isArray(rows)) return { events: [], outcome: "error", httpStatus: res.status, detail: "the dataset did not answer with a list" };
    const events = accidentEvents(rows as AccidentRow[], roads, { from });
    return {
      events,
      outcome: events.length ? "ok" : "empty",
      httpStatus: res.status,
      ...(rows.length >= ROW_LIMIT ? { detail: `row limit ${ROW_LIMIT} reached; later reports not read` } : {}),
    };
  } catch (err) {
    return { events: [], outcome: "error", detail: String(err).slice(0, 200) };
  }
}
