import archive from "../data/ots-orders.json";
import type { OccAction } from "./occActions";
import { excelDay, readSheet } from "./xlsx";

/**
 * The Office of Thrift Supervision's enforcement orders against the thrifts and their holding
 * companies, 1989–2011 (batch 154, part (b) of the 2026-11-15 proposal 2, approved by the owner that
 * day with the OCC's actions): the OTS's own archive, which the OCC keeps since it took the thrifts
 * over on 2011-07-21. "Enforcement actions taken against federally chartered savings associations
 * (thrifts) prior to July 21, 2011, are only available in the OTS Enforcement Order Archive (XLS)"
 * (the OCC's enforcement page, read 2026-11-15).
 *
 * One workbook (`OTS_FILE`, 557,298 bytes, last changed 2014-01-16): 3,547 orders, 1,497 of them
 * against an institution, each with its docket, number, day, kind and a link to its file on occ.gov.
 * The archive is closed, so it is read once (`npm run sync:ots-orders`) into the committed
 * `data/ots-orders.json`; ingest asks nothing. An order against a person is never kept.
 *
 * Its orders join the OCC's (lib/occActions.ts) under the same rule. A thrift's OTS docket is its OCC
 * charter less 700000 (American Express Bank, FSB is docket 15648 here and charter 715648 there), so
 * the hand list of banks by charter (`OCC_BANKS`) reads both; a holding company's docket ("H2589")
 * has no charter, and the caption rule reads its name. The OCC's own list carries the thrift orders
 * still in force when it took them over: such an order, the same thrift's of the same day and kind
 * or number, is the OCC's row's, which has its subject matters and its end (`isOccTwin`). A
 * termination, its own record here, is a line on the order it ended (the owner's call): the latest
 * earlier order of its kind against the same institution.
 *
 * Licence: the OCC's pages state none, and the orders are a federal agency's own work (17 U.S.C.
 * § 105), under the owner's ruling of 2026-11-12, as the OCC's.
 */
export const OTS_FILE = "https://occ.gov/static/ots/enforcement/ots-enforcement-order-listing.xlsx";

export interface OtsOrder {
  /** the archive's own record number */
  record: number;
  /** the day issued; empty where the archive gives none */
  day: string;
  institution: string;
  /** the OTS docket: a thrift's number ("15648"), a holding company's ("H2589"), or empty */
  docket: string;
  /** the order's number, "WN 10-023"; "SA" for most supervisory agreements */
  order: string;
  /** the archive's kind, "Supervisory Agreement", "Termination of Cease and Desist" */
  type: string;
  city: string;
  state: string;
  /** the order's file on occ.gov */
  link: string;
  notes: string;
}

const text = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * The workbook's orders against institutions, and how many records it held and how many of them
 * were against a person, which are left out.
 */
export function readOtsOrders(workbook: Uint8Array): { orders: OtsOrder[]; records: number; persons: number } {
  const rows = readSheet(workbook);
  if (!rows.length || !("Institution Name" in rows[0]) || !("Issue Date" in rows[0])) throw new Error("not the OTS archive: no Institution Name and Issue Date columns");
  const orders: OtsOrder[] = [];
  let persons = 0;
  for (const r of rows) {
    if (text(r["First Name"]) || text(r["Last Name"])) {
      persons++;
      continue;
    }
    const institution = text(r["Institution Name"]);
    if (!institution) continue;
    orders.push({
      record: Number(r["Record ID"]),
      day: excelDay(r["Issue Date"] ?? "") ?? "",
      institution,
      docket: text(r["Docket Number"]).replace(/^H\s+/i, "H"),
      order: text(r["Order Number"]),
      // a termination the archive files under the kind it ended ("Civil Money Penalty", its "Type of Order"
      // "Termination oF Civil Money Penalty") is a termination
      type: /^termination/i.test(text(r["Type of Order"])) && !/^termination/i.test(text(r["Type Description"])) ? text(r["Type of Order"]) : text(r["Type Description"]),
      city: text(r.City),
      state: text(r.State),
      // some orders' links name no file ("…/enforcement/.pdf"): those have none, 27 in all
      link: /\/\.pdf$/i.test(text(r["Link to Enforcement Action"])) ? "" : text(r["Link to Enforcement Action"]).replace(/^http:\/\/www\.occ\.gov\//i, "https://occ.gov/"),
      notes: text(r.Notes),
    });
  }
  return { orders, records: rows.length, persons };
}

/** The archive as committed. */
export const OTS_ORDERS: readonly OtsOrder[] = (archive as { orders: OtsOrder[] }).orders;

/** The archive's kinds, as the OCC's rows code them; a termination is not an order of its own. */
const CODE: Record<string, string> = {
  "Supervisory Agreement": "OTS-SA",
  "Amended Supervisory Agreements": "OTS-SA-AM",
  "Cease and Desist": "C&D",
  "Amended Orders to Cease and Desist": "OTS-C&D-AM",
  "Civil Money Penalty": "CMP",
  "Prompt Corrective Action": "PCAD",
  "Capital Directives": "CD",
  "Decision/Opinion and Order": "OTS-DO",
  "Orders of Removal/Prohibition": "OTS-PROH",
};

/** The OCC's codes an OTS order of that kind is listed under when the OCC carried it on. */
const OCC_CODES: Record<string, readonly string[]> = {
  "OTS-SA": ["FA"],
  "OTS-SA-AM": ["FA"],
  "C&D": ["C&D", "REST"],
  "OTS-C&D-AM": ["C&D", "REST"],
  CMP: ["CMP"],
  PCAD: ["PCAD"],
  CD: ["CD"],
};

/** The codes a termination of that kind ends. */
function endsCodes(type: string): readonly string[] | null {
  if (!/^Termination/i.test(type)) return null;
  if (/cease/i.test(type)) return ["C&D", "OTS-C&D-AM"];
  if (/supervisory|\bSA\b/i.test(type)) return ["OTS-SA", "OTS-SA-AM"];
  if (/prompt/i.test(type)) return ["PCAD"];
  if (/civil money/i.test(type)) return ["CMP"];
  if (/capital/i.test(type)) return ["CD"];
  return [];
}

/** "WN-09-0007" and "WN 09-007" are one number, "S.A." and "SA" one. */
export const orderNumber = (s: string) =>
  (s.toUpperCase().match(/[A-Z]+|\d+/g) ?? [])
    .map((t) => (/^\d+$/.test(t) ? String(Number(t)) : t))
    .reduce<string[]>((out, t) => (/^[A-Z]/.test(t) && out.length && /^[A-Z]+$/.test(out[out.length - 1]) ? [...out.slice(0, -1), out[out.length - 1] + t] : [...out, t]), [])
    .join("-");

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** The day an order's own note says it ended: "Terminated November 12, 2002", "terminated by NE 01-04 dtd 02/07/01". */
export function endedInNotes(notes: string): { day: string; by: string } | null {
  const long = /\bterminated\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i.exec(notes);
  if (long) {
    const m = MONTHS.indexOf(long[1].toLowerCase());
    if (m >= 0) return { day: `${long[3]}-${String(m + 1).padStart(2, "0")}-${long[2].padStart(2, "0")}`, by: "" };
  }
  const by = /\bterminated\s+by\s+([A-Z]{2,3}[\s-]?\d{2}-\d+)\s+dtd\s+(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/i.exec(notes);
  if (by) {
    const year = by[4].length === 2 ? (Number(by[4]) > 50 ? `19${by[4]}` : `20${by[4]}`) : by[4];
    return { day: `${year}-${by[2].padStart(2, "0")}-${by[3].padStart(2, "0")}`, by: by[1] };
  }
  return null;
}

const charterOf = (docket: string): number | null => (/^\d+$/.test(docket) ? 700_000 + Number(docket) : null);
const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

/**
 * Whether the OCC's list carries the OTS order itself: the same thrift, and the same order number
 * within a month (the OCC dates Sovereign Bank's NE-11-17 2011-04-11, the archive 2011-04-13), or
 * the same day and kind ("SA" is no number, and the OCC wrote Inter Savings Bank's CN 09-15 as MW 08-14).
 */
export function isOccTwin(o: Pick<OccAction, "charter" | "day" | "code" | "document">, occ: readonly OccAction[]): boolean {
  if (o.charter === null) return false;
  const number = /\d/.test(o.document) ? orderNumber(o.document) : null;
  return occ.some(
    (a) =>
      a.charter === o.charter &&
      ((number !== null && orderNumber(a.document) === number && Math.abs(dayNumber(a.day) - dayNumber(o.day)) <= 31) ||
        (a.day === o.day && (OCC_CODES[o.code] ?? []).includes(a.code))),
  );
}

/**
 * The archive's orders as the OCC's rows read them, each termination a line on the order it ended,
 * less those the OCC's own list carries (`isOccTwin`). An order without a day makes none.
 */
export function otsActions(orders: readonly OtsOrder[], occ: readonly OccAction[]): OccAction[] {
  const out: OccAction[] = [];
  const ends: OtsOrder[] = [];
  for (const o of orders) {
    if (!o.day) continue;
    if (endsCodes(o.type)) {
      ends.push(o);
      continue;
    }
    const code = CODE[o.type] ?? `OTS:${o.type}`;
    const noted = endedInNotes(o.notes);
    out.push({
      key: `${o.day}|ots:${o.record}|${code}|${o.docket || alnum(o.institution)}`,
      day: o.day,
      bank: o.institution,
      charter: charterOf(o.docket),
      city: o.city,
      state: o.state,
      code,
      kind: o.type,
      document: o.order,
      docket: o.docket,
      amount: null,
      subjects: [],
      hasDocument: !!o.link,
      ended: noted && noted.day > o.day ? noted.day : null,
      endedBy: noted && noted.day > o.day ? noted.by : "",
      link: o.link || undefined,
      regulator: "OTS",
    });
  }
  // a termination ends the latest earlier order of its kind against the same institution
  const who = (a: { docket: string; bank: string }) => a.docket || alnum(a.bank);
  for (const t of ends.sort((x, y) => x.day.localeCompare(y.day))) {
    const codes = endsCodes(t.type)!;
    const target = out
      .filter((a) => who(a) === (t.docket || alnum(t.institution)) && codes.includes(a.code) && a.day < t.day)
      .sort((x, y) => y.day.localeCompare(x.day))[0];
    if (target && (!target.ended || target.ended > t.day)) {
      target.ended = t.day;
      target.endedBy = t.order;
    }
  }
  return out.filter((a) => !isOccTwin(a, occ));
}
