import { andSpellings } from "./edgarName";
import { captionParty } from "./secCases";
import { takenBefore } from "./takenNames";
import type { FetchResult, TimelineEvent } from "./types";
import { UA } from "./contact";

/**
 * The Office of the Comptroller of the Currency's enforcement actions against the national banks
 * themselves, from 1987 (batch 153, the 2026-11-15 proposal 2, approved by the owner on 2026-11-15
 * with the recommended call: an order's termination is a line on its row).
 *
 * Bank pages carried the Federal Reserve Board's actions against the holding company
 * (lib/fedActions.ts) and the CFPB's from 2012, but not the orders of the bank's own regulator. The
 * OCC's search page says it: the Board covers "bank holding companies and their nonbank
 * subsidiaries", the OCC "national banks and their subsidiaries". JPMorgan Chase Bank, N.A.'s
 * $300,000,000 penalty of 2013-09-18, HSBC Bank USA's $500,000,000 of 2012-12-11 and Bank of
 * America, N.A.'s restitution of $1,127,453,261 of 2013-02-28 were on no page.
 *
 * Read from the API the search page's own script calls (apps.occ.gov/EASearch/api/WebSearch/Actions),
 * which gives every action against an institution in one keyless answer (`instOnly=true`; an action
 * against a person is never asked for, and one that names a person is never read): 2,655 actions,
 * 1987-02-11 to 2026-10-13, 2,202,663 bytes on 2026-11-16. Its count (`/Count`) says how many there
 * are, and the answer is complete when it holds them all. Read once a process for every company, as
 * the Board's files are; a company's actions are asked again a week after the last ask
 * (lib/ingest/refresh.ts).
 *
 * The rule is the CFPB's (lib/cfpb.ts): a bank's name keeps the action when the caption rule
 * (`captionParty`) reads it as the company under the names it had that year, its legal names among
 * them, or as a bank the release map gives it that day (lib/releaseNames.ts), or one of the OCC's
 * own spellings of its banks (`OCC_BANKS`), from its first price on. "The names of the banking
 * organizations accessed through the Enforcement Action Search reflect the institutions' identities
 * when the enforcement documents became final" (the search page, read 2026-11-15), so a name is read
 * on the day the order became final: Wachovia Bank's penalty of 2010-03-12 is Wells Fargo's, its
 * agreement of 2008-04-24, before the merger, is not. The table of taken names applies
 * (`takenBefore`): "Bank Of America, Nt & Sa", 1992, is old BankAmerica's bank, not BAC's.
 *
 * One event a company a day, as the Board's are: JPMorgan's four orders of 2013-09-18 against three of
 * its banks are one row. It gives each order's kind in the OCC's words, its amount as numeric money,
 * the subject matters the OCC gives (from 2012), the order's number, and the day it ended where it
 * has; it links the order's document where the OCC holds one, else the OCC's search for it.
 *
 * Licence: the OCC's enforcement pages and its web privacy policy (occ.gov/about/policies/
 * web-privacy-policy.html), read 2026-11-15, state no licence and no copyright terms. The orders are
 * a federal agency's own work, the owner's ruling of 2026-11-12 (17 U.S.C. § 105). No key.
 */
const API = "https://apps.occ.gov/EASearch/api/WebSearch";
const SEARCH = "https://apps.occ.gov/EASearch/Search/Table";
const DOCUMENTS = "https://occ.gov/static/enforcement-actions";
/** One answer holds every action: the list held 2,655 on 2026-11-16, and a longer one is refused, not cut. */
export const OCC_PAGE_SIZE = 3_000;
const QUERY = (size: number) =>
  `q=&acs=&cat=&srt=1&pg=0&pgsz=${size}&view=Table&startDteMin=&startDteMax=&termDteMin=&termDteMax=&indOnly=false&instOnly=true&terminatedOnly=false&activeOnly=false`;
export const OCC_ACTIONS_URL = `${API}/Actions?${QUERY(OCC_PAGE_SIZE)}`;
export const OCC_COUNT_URL = `${API}/Count?${QUERY(10)}`;
const TIMEOUT_MS = 120_000;

export interface OccAction {
  /** the day, the order, its kind and the bank's charter: what no two actions of the list share */
  key: string;
  /** the day the order became final (the OCC's "CompleteDate") */
  day: string;
  /** the bank, as the OCC names it on that day */
  bank: string;
  charter: number | null;
  city: string;
  state: string;
  /** the OCC's code for the kind of action, "CMP", "C&D", "FA", "REST" */
  code: string;
  /** …and its own words for it, "Civil Money Penalty (CMP)" */
  kind: string;
  /** the order's number, "2013-140"; "SA" for an agreement the OTS made, which has none */
  document: string;
  docket: string;
  /** the amount, as numeric text: "300000000", "143517.21"; null where the OCC gives none */
  amount: string | null;
  /** the subject matters the OCC gives, the most particular of each ("Unfair or Deceptive (UDAP)") */
  subjects: string[];
  hasDocument: boolean;
  /** the day the order ended, where it has */
  ended: string | null;
  endedBy: string;
  /** the order's own document where it is not the OCC's numbered PDF: the OTS archive's (lib/otsOrders.ts) */
  link?: string;
  /** "OTS" for an order of the Office of Thrift Supervision, from the archive the OCC keeps (batch 154) */
  regulator?: "OTS";
}

const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const clean = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");

/**
 * An amount as the answer's own digits, never through a float: "300000000.0" is "300000000",
 * "143517.21" itself. Null for none, zero or anything that is not a plain decimal.
 */
export function amountText(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const whole = m[1].replace(/^0+(?=\d)/, "");
  const part = (m[2] ?? "").replace(/0+$/, "");
  if (/^0*$/.test(whole) && !part) return null;
  return part ? `${whole}.${part}` : whole;
}

interface SubjectNode {
  name?: string;
  children?: SubjectNode[] | null;
}

/** The most particular subject matter of each branch: "Internal Audit", not "Audit" and "Internal Audit". */
function leaves(nodes: readonly SubjectNode[] | null | undefined): string[] {
  const out: string[] = [];
  for (const n of nodes ?? []) {
    if (n.children?.length) out.push(...leaves(n.children));
    else if (clean(n.name)) out.push(clean(n.name));
  }
  return out;
}

/**
 * The API's answer → its actions against institutions, each once. The answer is read with each
 * amount's own digits (`JSON.parse`'s source text, Node 21 on); where a runtime gives none, the
 * number's shortest decimal, which is the same digits for any amount of fewer than 16.
 */
export const parseOccActions = (body: string): OccAction[] => parseOccList(body).actions;

/** …and how many records the answer held, before any was left out or found twice: what the OCC's count counts. */
export function parseOccList(body: string): { actions: OccAction[]; records: number } {
  const reviver = function (this: unknown, key: string, value: unknown, context?: { source?: string }) {
    return key === "Amount" && typeof value === "number" ? (context?.source ?? String(value)) : value;
  };
  const rows = JSON.parse(body.replace(/^﻿/, ""), reviver as (key: string, value: unknown) => unknown) as unknown;
  if (!Array.isArray(rows)) throw new Error("the OCC's answer is not a list of actions");
  const out = new Map<string, OccAction>();
  for (const r of rows as Record<string, unknown>[]) {
    // an action against a person names the bank only as where they worked
    if (r.EnforcementInstIAPType !== "Institution" || clean(r.FirstName) || clean(r.LastName)) continue;
    const day = typeof r.CompleteDate === "string" ? r.CompleteDate.slice(0, 10) : "";
    const bank = clean(r.BankName);
    const code = clean(r.EnforcementTypeCode);
    if (!isDay(day) || !bank || !code) continue;
    const charter = typeof r.CharterNumber === "number" && r.CharterNumber > 0 ? r.CharterNumber : null;
    const document = clean(r.DocumentNumber);
    const key = `${day}|${document}|${code}|${charter ?? bank}`;
    if (out.has(key)) continue;
    const ended = typeof r.TerminationDate === "string" ? r.TerminationDate.slice(0, 10) : "";
    const subjects = Array.isArray(r.SubjectMatters)
      ? leaves(r.SubjectMatters as SubjectNode[])
      : clean(r.SubjectMatterAssociations).split("|").map(clean).filter(Boolean);
    out.set(key, {
      key,
      day,
      bank,
      charter,
      city: clean(r.CityName),
      state: clean(r.StateAbbreviation),
      code,
      kind: clean(r.EnforcementTypeDescription),
      document,
      docket: clean(r.DocketNumber),
      amount: amountText(r.Amount as string | number | null),
      subjects: [...new Set(subjects)],
      hasDocument: r.HasPdf === true,
      ended: isDay(ended) && ended > day ? ended : null,
      endedBy: clean(r.TerminationDocumentNumber),
    });
  }
  return { actions: [...out.values()], records: rows.length };
}

/** The OCC's kinds, as a row says them. */
const KIND: Record<string, string> = {
  FA: "formal agreement",
  "C&D": "cease-and-desist order",
  CMP: "civil money penalty",
  REST: "order requiring restitution",
  PCAD: "prompt corrective action directive",
  SEC: "securities enforcement action",
  GLBA: "Gramm-Leach-Bliley Act agreement",
  CD: "capital directive",
  Notice: "notice of charges",
  SASO: "safety and soundness order",
  // the Office of Thrift Supervision's kinds, from its archive (lib/otsOrders.ts)
  "OTS-SA": "supervisory agreement",
  "OTS-SA-AM": "amended supervisory agreement",
  "OTS-C&D-AM": "amended cease-and-desist order",
  "OTS-DO": "decision and order",
  "OTS-PROH": "removal or prohibition order",
};

/** "$300,000,000" from "300000000". */
export const dollars = (amount: string) => {
  const [whole, cents] = amount.split(".");
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${cents ? `.${cents.padEnd(2, "0")}` : ""}`;
};

/** Which of two numeric amounts is larger, compared as text: never through a float. */
const larger = (a: string | null, b: string | null): string | null => {
  if (!a || !b) return a ?? b;
  const [aw, ap = ""] = a.split(".");
  const [bw, bp = ""] = b.split(".");
  if (aw.length !== bw.length) return aw.length > bw.length ? a : b;
  const width = Math.max(ap.length, bp.length);
  return `${aw}${ap.padEnd(width, "0")}` >= `${bw}${bp.padEnd(width, "0")}` ? a : b;
};

/** An order: its number on its day, the OTS's unnumbered agreements by their bank. */
interface Order {
  document: string;
  docket: string;
  codes: string[];
  kinds: Map<string, string>;
  /** the amount of each kind, the largest any of its banks' records gives (the OCC gives it on each) */
  amounts: Map<string, string>;
  subjects: string[];
  hasDocument: boolean;
  ended: string | null;
  endedBy: string;
  banks: string[];
  link: string;
  regulator: "OCC" | "OTS";
}

const numbered = (document: string) => /\d/.test(document);

function ordersOf(actions: readonly OccAction[]): Order[] {
  const byKey = new Map<string, Order>();
  for (const a of actions) {
    const k = numbered(a.document) ? a.document : `${a.document}@${a.charter ?? a.bank}`;
    let o = byKey.get(k);
    if (!o) {
      o = { document: a.document, docket: a.docket, codes: [], kinds: new Map(), amounts: new Map(), subjects: [], hasDocument: false, ended: null, endedBy: "", banks: [], link: a.link ?? "", regulator: a.regulator ?? "OCC" };
      byKey.set(k, o);
    }
    if (!o.codes.includes(a.code)) o.codes.push(a.code);
    o.kinds.set(a.code, a.kind);
    const amount = larger(o.amounts.get(a.code) ?? null, a.amount);
    if (amount) o.amounts.set(a.code, amount);
    for (const s of a.subjects) if (!o.subjects.includes(s)) o.subjects.push(s);
    o.hasDocument ||= a.hasDocument;
    if (!o.docket) o.docket = a.docket;
    // the order ended when the last of its banks' parts did
    if (a.ended && (!o.ended || a.ended > o.ended)) {
      o.ended = a.ended;
      o.endedBy = a.endedBy;
    }
    if (!o.banks.includes(a.bank)) o.banks.push(a.bank);
  }
  return [...byKey.values()];
}

/** What an order is, in the row's words: "$300,000,000 civil money penalty", "cease-and-desist order requiring restitution of $1,127,453,261". */
function orderPhrase(o: Order): string {
  const said = (code: string) => {
    const words = KIND[code] ?? (o.kinds.get(code) || code).toLowerCase();
    const amount = o.amounts.get(code);
    if (!amount) return words;
    if (code === "REST") return `${words} of ${dollars(amount)}`;
    return `${dollars(amount)} ${words}`;
  };
  // the OCC lists an order requiring restitution as a cease-and-desist order and again as its restitution
  if (o.codes.includes("C&D") && o.codes.includes("REST")) {
    const rest = o.amounts.get("REST") ?? o.amounts.get("C&D");
    const others = o.codes.filter((c) => c !== "C&D" && c !== "REST").map(said);
    return [`cease-and-desist order requiring restitution${rest ? ` of ${dollars(rest)}` : ""}`, ...others].join(" and ");
  }
  return o.codes.map(said).join(" and ");
}

const ORDER_RANK = (o: Order) => [...o.amounts.values()].reduce<string | null>((m, a) => larger(m, a), null);

/** The orders of a day in the order a reader wants them: the largest amount first, then by number. */
function ranked(orders: Order[]): Order[] {
  return orders.sort((x, y) => {
    const ax = ORDER_RANK(x);
    const ay = ORDER_RANK(y);
    if (ax !== ay) return larger(ax, ay) === ax ? -1 : 1;
    return x.document.localeCompare(y.document, "en", { numeric: true });
  });
}

const NUMBER: Record<number, string> = { 2: "two", 3: "three", 4: "four", 5: "five" };

/** A phrase's kinds in the plural: "formal agreements", "cease-and-desist orders requiring restitution". */
const plural = (p: string) => p.replace(/\bpenalty\b/g, "penalties").replace(/\b(agreement|order|directive|action|notice)\b/g, "$1s");

/** Who made a day's orders: the OCC, the OTS, or both, as a title and a source say them. */
function regulators(orders: readonly Order[]): { title: string; source: string; names: string } {
  const has = new Set(orders.map((o) => o.regulator));
  if (has.size > 1) return { title: "OCC and OTS", source: "Office of the Comptroller of the Currency, with the Office of Thrift Supervision's archive", names: "the OCC and the OTS name" };
  return has.has("OTS")
    ? { title: "OTS", source: "Office of Thrift Supervision, in the OCC's archive", names: "the OTS names" }
    : { title: "OCC", source: "Office of the Comptroller of the Currency", names: "the OCC names" };
}

/** "Civil money penalty", "Two formal agreements", from a day's orders. */
function dayTitle(orders: readonly Order[]): string {
  const counts = new Map<string, number>();
  for (const o of orders) {
    const p = orderPhrase(o);
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  const parts = [...counts].map(([p, n]) => (n > 1 ? `${NUMBER[n] ?? n} ${plural(p)}` : p));
  const what = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
  return `${regulators(orders).title}: ${what.charAt(0).toUpperCase()}${what.slice(1)}`;
}

/** An order's line: its kind, its number, what it is about, and the day it ended. */
function orderLine(o: Order): string {
  const phrase = orderPhrase(o);
  // the OCC's newer orders are numbered by their docket: "AA-EC-2023-49" is both
  const docket = o.docket && o.docket !== o.document ? `${o.regulator === "OTS" ? "OTS docket" : "docket"} ${o.docket}` : "";
  const number = numbered(o.document) ? ` (order ${o.document}${docket ? `, ${docket}` : ""})` : docket ? ` (${docket})` : "";
  const about = o.subjects.length ? `: ${o.subjects.join("; ")}` : "";
  const ended = o.ended ? ` It ended ${o.ended}${o.endedBy ? ` (order ${o.endedBy})` : ""}.` : "";
  return `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}${number}${about}.${ended}`;
}

const LIMIT = 1_200;

/** Text cut at a word, marked, within `LIMIT`. */
const within = (text: string) => (text.length <= LIMIT ? text : `${text.slice(0, LIMIT - 1).replace(/\s+\S*$/, "")}…`);

/**
 * The banks a company's name reads as that are other banks, read by hand on 2026-11-16 among every
 * company day the 2,655 actions gave, by CIK and the OCC's charter number, which names one bank
 * whatever it is called: the caption rule reads "and Trust Company" or "N.A." after a name as legal
 * words (the scout's closing note of 2026-11-15), and a whole name like "National Bank" is many banks'.
 */
export const NOT_THE_COMPANY: Readonly<Record<number, { ticker: string; charters: readonly number[]; dockets?: readonly string[]; why: string }>> = {
  1475841: {
    ticker: "NBHC",
    charters: [14510, 3906, 24555],
    why: "\"National Bank\" of Hillsboro, Illinois (2004), \"National Bank And Trust\" of La Grange, Texas (2000) and \"THE National Bank\" of Moline, Illinois (2011): National Bank Holdings' bank is NBH Bank, of Colorado",
  },
  1476034: {
    ticker: "MCB",
    charters: [80066, 16220, 706381],
    why: "\"Metropolitan Bank and Trust Company\", a federal branch in New York (2004, 2006), \"Metropolitan Bank, N.A.\" of Washington, D.C. (1991), and the OTS's \"Metropolitan Bank and Trust Company\" of Highland Hills, Ohio (2001, docket 6381): Metropolitan Bank Holding's bank is Metropolitan Commercial Bank, a New York state bank",
  },
  731653: {
    ticker: "UBCP",
    charters: [],
    dockets: ["H3475"],
    why: "the OTS's \"United Bancorp, Inc.\" of Bridgeview, Illinois, a thrift holding company (2008): United Bancorp of Martins Ferry, Ohio holds a state bank (batch 154)",
  },
  2057463: {
    ticker: "GLIBA",
    charters: [],
    dockets: ["H0876"],
    why: "the OTS's \"Liberty Capital, Inc.\" of Wilmington, Ohio, a thrift holding company (2009): not Liberty Capital Corp of Nevada (batch 154)",
  },
  740806: {
    ticker: "FMBM",
    charters: [705608],
    why: "\"F&M Bank and Trust Company\" of Hannibal, Missouri, a savings association (2012, 2014): F&M Bank Corp's bank is Farmers & Merchants Bank of Timberville, Virginia",
  },
  759944: {
    ticker: "CFG",
    charters: [3175],
    why: "\"Citizens Bank, National Association\" of Fort Scott, Kansas (2010): Citizens Financial Group's is the bank of that name in Providence, charter 24571",
  },
};

/**
 * A bank of the company's the OCC names otherwise than the company's names and the release map do,
 * by its charter number and the name the OCC gives it, between the days the company held it (the
 * hand list of the 2026-11-15 proposal, and a scan of every listed bank's name against the OCC's
 * banks, read by hand on 2026-11-16). A bank named after the company, or its own lead bank since
 * before its first price, counts from that price; one bought or sold after it, from or to the day
 * its owner's filing gives. The name guards a charter's earlier holder: charter 1316 was Midlantic
 * National Bank's before it was PNC Bank's.
 */
export interface OccBank {
  charter: number;
  bank: RegExp;
  from?: string;
  to?: string;
  why: string;
}

const own = (charter: number, bank: RegExp, why: string): OccBank => ({ charter, bank, why });

export const OCC_BANKS: Readonly<Record<number, { ticker: string; banks: readonly OccBank[] }>> = {
  831001: {
    ticker: "C",
    banks: [
      {
        charter: 1461,
        bank: /^Citibank\b/i,
        from: "1998-10-08",
        why: "Citicorp's bank, the company's from the merger of 1998-10-08 (its 8-K of that day), as the release map's \"Citibank, N.A.\" holds it; the OCC also writes \"Citibank, National Association\" (2011–2020), among them $350,000,000 of 2014-11-11 and $400,000,000 of 2020-10-07",
      },
    ],
  },
  19617: { ticker: "JPM", banks: [own(24802, /^JPMorgan Bank and Trust Company\b/i, "its bank in San Francisco, named after it, in the orders of 2013–2015 with JPMorgan Chase Bank")] },
  72971: {
    ticker: "WFC",
    banks: [
      {
        charter: 1,
        bank: /^Wachovia Bank\b/i,
        from: "2008-12-31",
        why: "Wachovia's bank, the company's from the day the release map gives (\"Successfully closed Wachovia acquisition on December 31, 2008\", its 8-K filed 2009-01-28): its penalty of 2010-03-12 is Wells Fargo's, its orders of 2008 Wachovia's",
      },
    ],
  },
  36966: { ticker: "FHN", banks: [own(336, /^First Tennessee Bank\b/i, "its bank in Memphis, named after the company's own former name, First Tennessee National Corporation")] },
  891478: {
    ticker: "SAN",
    banks: [704410, 25022].map((charter) => ({
      charter,
      bank: /^Sovereign Bank\b/i,
      from: "2009-01-30",
      why: "Sovereign Bancorp's bank, the company's from 2009-01-30 (\"The acquisition of Sovereign has been completed today and, therefore, Sovereign is now a 100% subsidiary of Grupo Santander\", its 6-K filed that day), renamed Santander Bank in 2013",
    })),
  },
  91576: {
    ticker: "KEY",
    banks: [
      own(14761, /^KeyBank\b/i, "its bank in Cleveland, named after it"),
      {
        charter: 24968,
        bank: /^First Niagara Bank\b/i,
        from: "2016-07-29",
        why: "First Niagara Financial's bank, the company's from \"the closing on July 29, 2016\" of the merger (its 8-K filed 2016-08-01, 0001193125-16-665717): its penalty of 2016-09-06 is KeyCorp's, its orders of 2011 and 2016-07-25 First Niagara's (batch 155, the 2026-11-16 audit's finding 1)",
      },
    ],
  },
  67088: {
    ticker: "MUFG",
    banks: [
      {
        charter: 21541,
        bank: /^(?:MUFG )?Union Bank\b/i,
        from: "2008-11-05",
        to: "2022-11-30",
        why: "UnionBanCal's bank, the company's whole from 2008-11-05 (\"MUFG and BTMU has successfully acquired all of the outstanding shares of UnionBanCal Corporation\", its 6-K filed that day) until U.S. Bancorp bought it on 2022-12-01",
      },
      ...[80138, 80139, 80140, 80141].map((charter) => own(charter, /^MUFG Bank\b/i, "the federal branches of its bank, MUFG Bank, Ltd., named after it")),
    ],
  },
  36104: {
    ticker: "USB",
    banks: [
      {
        charter: 21541,
        bank: /^MUFG Union Bank\b/i,
        from: "2022-12-01",
        why: "bought 2022-12-01 (it \"completed the acquisition of MUFG Union Bank N.A.\u2019s core regional banking franchise from Mitsubishi UFJ Financial Group, Inc.\", its 8-K filed that day): its penalty of 2023-05-10 is U.S. Bancorp's, its orders of 2019 and 2021 MUFG's",
      },
      own(23446, /^U\.S\. Bank National Association ND\b/i, "its card bank in Fargo, named after it"),
    ],
  },
  927971: { ticker: "BMO", banks: [own(14583, /^BMO Harris Bank\b/i, "its US bank in Chicago, named after it")] },
  895421: {
    ticker: "MS",
    banks: [own(24908, /^Morgan Stanley Bank\b/i, "its bank, named after it"), own(24981, /^Morgan Stanley Private Bank\b/i, "its private bank, named after it")],
  },
  713676: { ticker: "PNC", banks: [own(1316, /^PNC Bank\b/i, "its bank, named after it; the charter was Midlantic National Bank's before PNC bought Midlantic, which the name keeps off")] },
  49196: { ticker: "HBAN", banks: [own(7745, /^The Huntington National Bank\b/i, "its bank in Columbus, named after it")] },
  700564: { ticker: "FULT", banks: [own(24891, /^Fulton Bank\b/i, "its bank in Lancaster, Pennsylvania, named after it")] },
  101382: { ticker: "UMBF", banks: [own(23920, /^UMB Bank\b/i, "its bank in Kansas City, named after it")] },
  7789: { ticker: "ASB", banks: [own(23695, /^Associated Bank\b/i, "its bank in Green Bay, named after it")] },
  805676: { ticker: "PRK", banks: [own(9179, /^The Park National Bank\b/i, "its bank in Newark, Ohio, named after it (not Park National Bank of Chicago, charter 24634)")] },
  357173: { ticker: "OSBC", banks: [own(4596, /^Old Second National Bank\b/i, "its bank in Aurora, Illinois, named after it")] },
  357301: { ticker: "TRST", banks: [own(22844, /^Trustco Bank\b/i, "its bank in Glenville, New York, named after it"), own(707635, /^Trustco Bank\b/i, "the same bank as a federal savings bank, named after it")] },
  1090009: { ticker: "SFST", banks: [own(23919, /^Southern First Bank\b/i, "its bank in Greenville, South Carolina, named after it")] },
  842717: { ticker: "BRBS", banks: [own(23903, /^Blue Ridge Bank\b/i, "its bank in Martinsville, Virginia, named after it")] },
  2059653: { ticker: "LSBK", banks: [own(705506, /^Lake Shore Savings Bank\b/i, "its bank in Dunkirk, New York, named after it")] },
  1098146: { ticker: "PNBK", banks: [own(22545, /^Patriot (?:National )?Bank\b/i, "its bank in Stamford, Connecticut, named after it")] },
  2094107: { ticker: "BSPA", banks: [own(1253, /^Ballston Spa National Bank\b/i, "its bank, named after it")] },
  4962: { ticker: "AXP", banks: [own(25151, /^American Express National Bank\b/i, "its card bank in Sandy, Utah, named after it")] },
  947263: { ticker: "TD", banks: [own(22611, /^TD Bank USA\b/i, "its US card bank, named after it, in the order of 2024-10-09 with TD Bank, N.A.")] },
  759944: { ticker: "CFG", banks: [own(24571, /^RBS Citizens\b/i, "its bank in Providence under its earlier name, RBS Citizens, N.A., renamed Citizens Bank in 2014")] },
  109380: { ticker: "ZION", banks: [own(4341, /^Zions First National Bank\b/i, "its bank in Salt Lake City, named after it")] },
  37808: { ticker: "FNB", banks: [own(249, /^First National Bank of Pennsylvania\b/i, "its bank in Hermitage and Greenville, Pennsylvania (not FNB Bank, N.A. of Danville, charter 325)")] },
  1000275: {
    ticker: "RY",
    banks: [
      {
        charter: 14695,
        bank: /^City National Bank$/i,
        from: "2015-11-02",
        why: "City National Corporation's bank in Los Angeles, the company's from 2015-11-02 (\"Royal Bank of Canada … today announced it has completed the acquisition of City National Corporation\", its 6-K filed that day)",
      },
    ],
  },
  726854: { ticker: "CHCO", banks: [own(14807, /^City National Bank of West Virginia\b/i, "its bank in Charleston, West Virginia")] },
  22356: {
    ticker: "CBSH",
    banks: [15985, 18112].map((charter) =>
      own(charter, /^Commerce Bank\b/i, "its banks in Kansas City, named after it (\"merged into Commerce Bank, N.A.\", its 10-K filed 1997-03-13); not Commerce Bank, N.A. of New Jersey, charter 17094"),
    ),
  },
  39263: {
    ticker: "CFR",
    banks: [
      own(5179, /^(?:The )?Frost National Bank\b/i, "its bank in San Antonio (\"The largest of these banks is The Frost National Bank of San Antonio\", its 10-K filed 1994-03-30)"),
      own(15280, /^Cullen\/Frost Bank\b/i, "its bank in Dallas, named after it (the same 10-K)"),
    ],
  },
  708955: { ticker: "FFBC", banks: [own(56, /^First Financial Bank, National Association$/i, "its bank in Hamilton, Ohio, named after it")] },
  730708: { ticker: "SBCF", banks: [own(14838, /^Seacoast National Bank\b/i, "its bank in Stuart, Florida, named after it")] },
  828944: { ticker: "WSFS", banks: [own(707938, /^Wilmington Savings Fund Society\b/i, "its bank, whose name its own is short for")] },
  1114700: {
    ticker: "GGAL",
    banks: [own(80109, /^Banco de Galicia\b/i, "the New York branch of its bank (\"Banco de Galicia y Buenos Aires S.A., its wholly-owned subsidiary\"; \"On March 22, 2002, the 'New York Branch Restructuring Plan' was submitted to … the OCC\", its 20-F filed 2003-07-14)")],
  },
  1160330: { ticker: "BBD", banks: [own(80041, /^Banco Bradesco\b/i, "its own New York branch")] },
  1610520: {
    ticker: "UBS",
    banks: [
      ...[80113, 80115, 80135].map((charter) => own(charter, /^UBS AG\b/i, "the federal branches of its bank, UBS AG, the release map's call (b)")),
      { charter: 80146, bank: /^Credit Suisse\b/i, from: "2023-06-12", why: "Credit Suisse's federal branch in New York, the company's from the day the release map gives (2023-06-12)" },
    ],
  },
  936528: {
    ticker: "WAFD",
    banks: [
      own(25073, /^Washington Federal\b/i, "its bank in Seattle, named after it, whose order of 2018-02-28 the company's present name does not read"),
      own(700880, /^Washington Federal Savings and Loan Association\b/i, "the same bank as a savings association in Seattle, OTS docket 880, in the OTS's order of 2007-12-21 (not Washington Federal Savings Bank of Washington, Iowa, docket 2715)"),
    ],
  },
  // the OTS archive's thrifts (batch 154): a thrift's OTS docket is its OCC charter less 700000
  5272: { ticker: "AIG", banks: [own(714939, /^AIG Federal Savings Bank\b/i, "its savings bank in Wilmington, Delaware, named after it, in the supervisory agreement of 2007-06-07")] },
  40545: {
    ticker: "GE",
    banks: [own(715044, /^GE Money Bank\b/i, "its savings bank in Draper, Utah, named after it, in the penalty of 2010-10-19; renamed GE Capital Retail Bank in 2011 and Synchrony Bank in 2014, names this does not read")],
  },
  1381668: { ticker: "TFSL", banks: [own(704544, /^Third Federal Savings\b/i, "its savings association in Cleveland, the company's own (not Third Federal Bank of Newtown, Pennsylvania, docket 2966)")] },
  1016178: {
    ticker: "CARV",
    banks: [own(705273, /^Carver Federal Savings Bank\b/i, "its savings bank in New York, named after it, in the orders of 2011, 2016 and 2025 and the OTS's of 2011")],
  },
  912967: { ticker: "FBSI", banks: [own(705233, /^First Home Savings Bank\b/i, "its savings bank in Mountain Grove, Missouri, where the company is (not First Home Savings Bank, S.L.A. of Pennsville, New Jersey, 1991)")] },
  // batch 155, the 2026-11-16 audit's finding 1: banks named after a company that is not itself a bank, or
  // after its former name, which the scans of batches 153 and 154 left out
  70858: {
    ticker: "BAC",
    banks: [own(22381, /^FIA Card Services\b/i, "its card bank, one of the \"two national bank charters\" it operated under (its 10-Q filed 2014-05-01, 0000070858-14-000056), in the orders of 2014-04-07 with Bank of America, N.A.")],
  },
  1099219: { ticker: "MET", banks: [own(23743, /^MetLife Bank\b/i, "its bank in Convent Station and Morristown, New Jersey, named after it, which its 10-Ks' Exhibit 21.1 name (filed 2011-02-25, 2012-02-28 and 2013-02-27)")] },
  28917: { ticker: "DDS", banks: [own(18777, /^Dillard National Bank\b/i, "its card bank in Gilbert, Arizona, named after it, which its 10-Ks' Exhibit 21 name (filed 2003-04-10 and 2004-04-13)")] },
  1041368: { ticker: "RVSB", banks: [own(704347, /^Riverview Community Bank\b/i, "its savings bank in Camas, Washington, OTS docket 4347, which its 10-Ks name (filed 2011-06-08 and 2012-06-15)")] },
  907471: {
    ticker: "CASH",
    banks: [own(705902, /^MetaBank\b/i, "its savings bank in Storm Lake, Iowa, named after the company's former name, Meta Financial Group, whose 10-K and Exhibit 21 filed 2011-12-20 name it")],
  },
  1367859: { ticker: "CZWI", banks: [own(25088, /^Citizens Community Federal\b/i, "its bank in Altoona, Wisconsin, named after it")] },
  873860: { ticker: "ONIT", banks: [own(704592, /^Ocwen Federal Bank\b/i, "its savings bank in Fort Lee, New Jersey, named after the company's own former name, Ocwen Financial Corporation")] },
};

const heldOn = (b: OccBank, day: string) => (!b.from || day >= b.from) && (!b.to || day <= b.to);

/** Whether the action is against a bank of the company's that `OCC_BANKS` gives it on the action's day. */
export const isOccBankOf = (cik: number | string, a: Pick<OccAction, "charter" | "bank" | "day">): boolean =>
  a.charter !== null && (OCC_BANKS[Number(cik)]?.banks ?? []).some((b) => b.charter === a.charter && b.bank.test(a.bank) && heldOn(b, a.day));

const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Where a row links: the first of its orders the OCC holds a document for, else the OCC's search for
 * its docket, or for the bank where an old order has none ("362" alone finds other banks' orders too).
 */
function linkFor(orders: readonly Order[]): string {
  const withDocument = orders.find((o) => o.regulator === "OCC" && o.hasDocument && numbered(o.document));
  if (withDocument) return `${DOCUMENTS}/ea${withDocument.document}.pdf`;
  // …else an OTS order's own file in the OCC's archive
  const filed = orders.find((o) => o.link);
  if (filed) return filed.link;
  const o = orders[0];
  return `${SEARCH}?q=${encodeURIComponent(o.docket || o.banks[0])}`;
}

/**
 * The actions against the company's banks, as timeline events, newest first. `namesIn(year)` gives
 * the names it had that year, `namesOn(day)` the banks it then owned (`releaseNamesOn`), or the bank
 * is one `OCC_BANKS` gives it by charter, and an action from before `from`, its first price, is not
 * its, but for the banks `namesBefore(day)` gives (`releaseNamesBefore`, the owner's rule of 2026-11-05).
 */
export function occEvents(
  actions: readonly OccAction[],
  namesIn: (year: number) => string[],
  { cik, from = "", namesOn, namesBefore }: { cik: number | string; from?: string; namesOn?: (day: string) => string[]; namesBefore?: (day: string) => string[] },
): TimelineEvent[] {
  const byYear = new Map<number, string[]>();
  const names = (year: number) => byYear.get(year) ?? byYear.set(year, namesIn(year)).get(year)!;
  const byDay = new Map<string, { a: OccAction; party: string }[]>();
  for (const a of actions) {
    const refused = NOT_THE_COMPANY[Number(cik)];
    // …by charter, or for an OTS holding company, which has none, by its OTS docket
    if (refused && ((a.charter !== null && refused.charters.includes(a.charter)) || (a.regulator === "OTS" && !!a.docket && !!refused.dockets?.includes(a.docket)))) continue;
    // a name the record took from another company is that company's before the day (lib/takenNames.ts)
    if (takenBefore(cik, a.day, a.bank)) continue;
    // a bank of the company's the OCC names its own way, by its charter (`OCC_BANKS`), from its first price
    if (a.day >= from && isOccBankOf(cik, a)) {
      (byDay.get(a.day) ?? byDay.set(a.day, []).get(a.day)!).push({ a, party: a.bank });
      continue;
    }
    const held = a.day < from ? (namesBefore?.(a.day) ?? []) : [...names(Number(a.day.slice(0, 4))), ...(namesOn?.(a.day) ?? [])];
    if (!held.length) continue;
    const letters = alnum(a.bank);
    if (!held.flatMap(andSpellings).some((n) => alnum(n).length >= 2 && letters.includes(alnum(n)))) continue;
    const party = captionParty(a.bank, held);
    if (!party) continue;
    (byDay.get(a.day) ?? byDay.set(a.day, []).get(a.day)!).push({ a, party });
  }
  return [...byDay.entries()]
    .sort(([x], [y]) => y.localeCompare(x))
    .map(([day, rows]) => {
      const orders = ranked(ordersOf(rows.map((r) => r.a).sort((x, y) => x.key.localeCompare(y.key))));
      // one bank however its two regulators spell it: the OCC's "Metabank" is the archive's "MetaBank"
      const banks = [...new Map(orders.flatMap((o) => o.banks).map((b) => [alnum(b), b] as const)).values()];
      const by = regulators(orders);
      const basis = `occ:${Number(cik)}@${day}`;
      return {
        id: `occ-${Number(cik)}-${day}`,
        date: day,
        type: "regulation" as const,
        title: dayTitle(orders),
        description: within([`Against ${banks.join("; ")}, as ${by.names} ${banks.length > 1 ? "them" : "it"}.`, ...orders.map(orderLine)].join(" ")),
        source: by.source,
        url: linkFor(orders),
        sourceKey: "occ_actions" as const,
        externalId: basis,
        // the company's one event a day: an order learned later the same day changes its description
        dedupBasis: basis,
      };
    });
}

export interface OccList {
  actions: OccAction[];
  /** how many records the answer held */
  records: number;
  /** how many the OCC's count says there are */
  total: number;
}

async function getText(url: string): Promise<{ body?: string; outcome: FetchResult["outcome"]; httpStatus?: number; detail?: string }> {
  try {
    const res = await fetch(url, { headers: { ...UA, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 403 || res.status === 429 || res.status === 503) return { outcome: "throttled", httpStatus: res.status };
    // the OCC refuses by sending us to its home page ("Security Redirect", 2026-10-28; a 302 to
    // www.occ.treas.gov, 2026-11-16): a refusal, so the source-wide back-off holds every company back
    if (res.redirected) return { outcome: "throttled", httpStatus: res.status, detail: `redirected to ${res.url.slice(0, 120)}` };
    if (!res.ok) return { outcome: "error", httpStatus: res.status, detail: `HTTP ${res.status}` };
    return { body: await res.text(), outcome: "ok", httpStatus: res.status };
  } catch (err) {
    return { outcome: "error", detail: String(err).slice(0, 200) };
  }
}

/** The count and the whole list, in two requests. Throws, with the outcome to log, when either fails. */
export async function readOccList(): Promise<OccList> {
  const count = await getText(OCC_COUNT_URL);
  if (count.outcome !== "ok") throw Object.assign(new Error(`the OCC's count: ${count.detail ?? count.outcome}`), { outcome: count.outcome, httpStatus: count.httpStatus });
  const total = Number(count.body!.replace(/^﻿/, "").trim());
  if (!Number.isInteger(total) || total <= 0) throw Object.assign(new Error("the OCC's count is not a number"), { outcome: "error", httpStatus: count.httpStatus });
  if (total > OCC_PAGE_SIZE) throw Object.assign(new Error(`the OCC lists ${total} actions, more than one answer of ${OCC_PAGE_SIZE} holds`), { outcome: "error", httpStatus: count.httpStatus });
  const list = await getText(OCC_ACTIONS_URL);
  if (list.outcome !== "ok") throw Object.assign(new Error(`the OCC's list: ${list.detail ?? list.outcome}`), { outcome: list.outcome, httpStatus: list.httpStatus });
  return { ...parseOccList(list.body!), total };
}

let cached: Promise<OccList> | null = null;

/**
 * The list, read once a process for every company. A failed read is the process's answer too, so the
 * companies after it are told the same without asking again, and the next run asks anew (batch 155,
 * the 2026-11-16 audit's finding 2: a refusal had cost one request a company, about 200 a run).
 */
export function cachedOccList(read: () => Promise<OccList> = readOccList): Promise<OccList> {
  if (!cached) {
    cached = read();
    // the rejection is handled by each caller; this keeps an unawaited copy from being reported
    cached.catch(() => undefined);
  }
  return cached;
}

/** For the checks: forget the process's read. */
export const forgetOccList = () => {
  cached = null;
};
