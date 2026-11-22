import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { andSpellings } from "./edgarName";
import { APPLICANT_NAMES, approvalIsCompany } from "./fdaApprovals";
import { FDA_FIRMS } from "./fdaRecalls";
import type { TimelineEvent } from "./types";

/**
 * The FDA's 510(k) clearances and De Novo grants, 1976–2026 (batch 172, the 2026-11-22b proposal 1, approved by the
 * owner that day with call (a): one row a company a month naming each device and its number, a De Novo grant a row
 * of its own).
 *
 * Since the Medical Device Amendments of 1976 a device of moderate risk reaches the market by a premarket
 * notification, a 510(k), that the FDA finds "substantially equivalent" to a device already marketed, or by a De Novo
 * request it grants for a new kind of device. openFDA publishes every decision as one keyless file
 * (`FDA_510K_FILE`, 249,823,383 bytes on 2026-11-22, 1.6 GB of JSON, "last_updated" 2026-11-18): 176,683, from
 * 1976-07-15, each with the applicant that filed it. The PMA file was cut on 2026-11-07 because it names today's
 * holder; this one keeps the filer, so St. Jude Medical's clearances before 2017 read "St Jude Medical", not Abbott.
 *
 * `npm run sync:fda-clearances` streams the file a record at a time (`readClearanceLines`, never parsing it whole)
 * and commits the clearances some company in the index holds by the rule on their day (`data/fda-clearances.json.gz`);
 * it is run monthly and again after `npm run sync:tickers`. A name only EDGAR's former names give, which the index
 * does not hold, is not read. Ingest asks nothing.
 *
 * A clearance is the company's by the approvals' rule (`approvalIsCompany` in lib/fdaApprovals.ts): the caption rule
 * under its names of the year, the recall map's firms (`FDA_FIRMS`) and the approvals' names (`APPLICANT_NAMES`) on
 * their days, the table of taken names; then this source's namesakes and the names its file gives a unit before the
 * day its owner took it, read by hand (`NOT_THE_COMPANY`), and the company's first price. A clearance says the FDA
 * found the device substantially equivalent, nothing more: never that it was launched or sold.
 *
 * Licence: openFDA's (open.fda.gov/license, as recorded for sources 40 and 47): "unless otherwise noted, the content,
 * data, documentation, code, and related materials on openFDA is public domain and made available with a Creative
 * Commons CC0 1.0 Universal dedication… even for commercial purposes". The file's header adds: "Do not rely on
 * openFDA to make decisions regarding medical care… you should assume all results are unvalidated."
 */

export const FDA_510K_FILE = "https://download.open.fda.gov/device/510k/device-510k-0001-of-0001.json.zip";
export const FDA_510K_ENTRY = "device-510k-0001-of-0001.json";
export const FDA_CLEARANCES_DATA = join(__dirname, "..", "data", "fda-clearances.json.gz");

/** The FDA's own page of a clearance or a De Novo grant. */
export const clearancePage = (k: string) =>
  /^DEN/i.test(k)
    ? `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/denovo.cfm?id=${encodeURIComponent(k)}`
    : `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=${encodeURIComponent(k)}`;

export interface FdaClearance {
  /** "K990188", "DEN180044" */
  k: string;
  /** the decision's day */
  day: string;
  applicant: string;
  device: string;
  /** the FDA's three-letter product code */
  product: string;
  /** the decision's code: "SESE" substantially equivalent, "DENG" a De Novo grant, and their variants */
  code: string;
}

/** The decision's words, by its code, as the FDA's database gives them. */
const DECISIONS: Readonly<Record<string, string>> = {
  SESE: "substantially equivalent to a device already marketed",
  SN: "substantially equivalent for some of its indications",
  SESK: "substantially equivalent, as a kit",
  SESD: "substantially equivalent, with a drug",
  SEKD: "substantially equivalent, as a kit with a drug",
  SESU: "substantially equivalent, with limitations",
  SESP: "substantially equivalent, subject to postmarket surveillance",
  ST: "substantially equivalent, subject to tracking",
  PT: "substantially equivalent, subject to tracking and postmarket surveillance",
  SI: "substantially equivalent, to be marketed after an inspection",
};

export const isDeNovo = (c: Pick<FdaClearance, "k" | "code">) => c.code === "DENG" || /^DEN/i.test(c.k);

/**
 * openFDA's file read a line at a time: each record between its indented braces, parsed alone, as `eachZipLine`
 * hands the lines over; the decisions with a number, an applicant and a day. `meta` gets the file's header.
 */
export function clearanceReader(onRecord: (c: FdaClearance) => void): { line: (line: Buffer) => void; meta: () => { lastUpdated: string | null; total: number | null } } {
  let buf: string[] | null = null;
  const head: string[] = [];
  let inHead = true;
  return {
    line: (raw) => {
      const l = raw.toString("utf8");
      if (inHead) {
        if (l === '  "results": [') inHead = false;
        else head.push(l);
        return;
      }
      if (l === "    {") {
        buf = [l];
        return;
      }
      if (!buf) return;
      buf.push(l);
      if (l !== "    }," && l !== "    }") return;
      const r = JSON.parse(buf.join("\n").replace(/,\s*$/, "")) as Record<string, unknown>;
      buf = null;
      const k = String(r.k_number ?? "").trim();
      const applicant = String(r.applicant ?? "").replace(/\s+/g, " ").trim();
      const day = String(r.decision_date ?? "");
      if (!k || !applicant || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
      onRecord({ k, day, applicant, device: String(r.device_name ?? "").replace(/\s+/g, " ").trim(), product: String(r.product_code ?? ""), code: String(r.decision_code ?? "") });
    },
    meta: () => {
      const text = `${head.join("\n").replace(/,\s*$/, "")}}}`;
      const lastUpdated = /"last_updated":\s*"(\d{4}-\d{2}-\d{2})"/.exec(text)?.[1] ?? null;
      const total = Number(/"total":\s*(\d+)/.exec(text)?.[1] ?? NaN);
      return { lastUpdated, total: Number.isFinite(total) ? total : null };
    },
  };
}

/** The committed file's columns, a clearance an array of them. */
export const CLEARANCE_COLUMNS = ["k", "day", "applicant", "device", "product", "code"] as const;

let cached: { path: string; rows: FdaClearance[] } | null = null;

/** Every clearance in the committed file, read once a process. */
export function fdaClearances(path = FDA_CLEARANCES_DATA): readonly FdaClearance[] {
  if (cached?.path === path) return cached.rows;
  const body = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as { columns: string[]; rows: unknown[][] };
  const at = (k: (typeof CLEARANCE_COLUMNS)[number]) => body.columns.indexOf(k);
  const rows = body.rows.map((r) => Object.fromEntries(CLEARANCE_COLUMNS.map((k) => [k, String(r[at(k)] ?? "")])) as unknown as FdaClearance);
  cached = { path, rows };
  return rows;
}

/**
 * Applicant names the rule gives a company that are not its on the day, by CIK, read by hand (batch 172) among
 * every company's distinct applicant names: a namesake, or a unit's name the file gives on a record before its owner
 * took it (`before`, the owner's day, each read from a filing or, for a purchase before EDGAR, the first year surely
 * after it).
 */
export const NOT_THE_COMPANY: Readonly<Record<number, { ticker: string; applicant: RegExp; before?: string; why: string }[]>> = {
  1800: [
    { ticker: "ABT", applicant: /^Keith E\. Abbott\b/i, why: "Keith E. Abbott, a person, not Abbott Laboratories" },
    { ticker: "ABT", applicant: /^Abbott Research Group\b/i, why: "Abbott Research Group, Inc., a douching-device firm of 2008 no Abbott filing names" },
  ],
  7084: [{ ticker: "ADM", applicant: /^Adm,? Inc\b/i, why: "Adm, Inc., a device firm of 1995, not Archer-Daniels-Midland" }],
  1866692: [{ ticker: "AMPL", applicant: /^Amplitude\b/i, why: "Amplitude, the French orthopaedic implant maker, not Amplitude, Inc., the analytics company" }],
  2042320: [{ ticker: "AOAO", applicant: /^Alpha One\b/i, why: "Alpha One, a device firm of 2009, not Alpha One Inc." }],
  315293: [{ ticker: "AON", applicant: /^Aon Co\b/i, why: "Aon Co., Ltd., a Korean device maker, not Aon plc" }],
  1018963: [{ ticker: "ATI", applicant: /^Ati\b(?!\s+(?:Inc|Allegheny))/i, why: "Ati, a device firm of 1989–1990, not ATI Inc." }],
  1394832: [{ ticker: "ATS", applicant: /^Ats Co\b/i, why: "Ats Co., a device firm of 1988, not ATS Corp." }],
  14272: [{ ticker: "BMY", applicant: /^Bms,? Inc\b/i, why: "Bms, Inc. of 1982, before Bristol-Myers and Squibb merged in 1989 into the company the initials name" }],
  1372612: [{ ticker: "BOX", applicant: /^Box,? Inc\b/i, why: "Box, Inc., a device firm of 2015, not Box, the cloud-storage company" }],
  1133818: [{ ticker: "BPTH", applicant: /^Bio Path\b/i, why: "Bio Path, a device firm of 1995, not Bio-Path Holdings" }],
  1393818: [{ ticker: "BX", applicant: /^Blackstone$/i, why: "Blackstone Medical, the spinal-implant maker Orthofix bought in 2006, not Blackstone Inc." }],
  1839341: [{ ticker: "CORZ", applicant: /^Core Scientific\s*,? Ltd\b/i, why: "Core Scientific, Ltd., a device firm of 2014, not Core Scientific, the bitcoin miner" }],
  1671750: [{ ticker: "DISPF", applicant: /^Disco,? Inc\b/i, why: "Disco, Inc., a device firm of 1991–1993, not Disco Corporation of Japan" }],
  31107: [{ ticker: "EML", applicant: /^Eastern Corp\b/i, why: "Eastern Corp., a device firm of 1989, not The Eastern Company" }],
  355811: [{ ticker: "GNTX", applicant: /^Gentex Corporation$/i, why: "Gentex Corporation of Carbondale, Pennsylvania, the maker of protective lenses and isolation units, not Gentex of Zeeland, Michigan" }],
  1610853: [{ ticker: "HSDT", applicant: /^Solana,? Inc\b/i, why: "Solana, Inc., a device firm of 1982, not Solana Co" }],
  1652535: [{ ticker: "ICHR", applicant: /^Ichor$/i, why: "Ichor, a device firm of 2023–2024, not Ichor Holdings, the semiconductor supplier" }],
  1400438: [{ ticker: "LGO", applicant: /^Conmed Corporation, Largo\b/i, why: "ConMed's site in Largo, Florida, not Largo Inc." }],
  310158: [
    { ticker: "MRK", applicant: /^(?:Merck Biomaterial|Biomet Merck)\b/i, why: "Merck KGaA's biomaterials companies of Darmstadt, not Merck & Co." },
    { ticker: "MRK", applicant: /^Schering (?:Chemicals|Research)\b/i, why: "Schering AG's British chemicals company and research unit, not Schering-Plough's Schering Corporation" },
  ],
  2028707: [{ ticker: "MRLN", applicant: /^The Merlin Corp\b/i, why: "The Merlin Corp., a device firm of 1994–1996, not Merlin, Inc." }],
  1109345: [{ ticker: "NVMI", applicant: /^Nova Corp\b/i, why: "Nova Corp., a device firm of 1979, not Nova Ltd. of Israel" }],
  1609804: [{ ticker: "OEC", applicant: /^Orion Corp\b/i, why: "Orion Corporation of Finland, the drug and diagnostics maker, not Orion S.A." }],
  1761312: [{ ticker: "PLMR", applicant: /^Palomar$/i, why: "Palomar Medical Technologies, the laser maker, not Palomar Holdings, the insurer" }],
  709283: [{ ticker: "QMCO", applicant: /^Quantum (?:Co\.,? Ltd|,? Inc)\b/i, why: "Quantum Co., Ltd., Shandong's exam-glove maker, and Quantum, Inc., device firms, not Quantum Corporation" }],
  1971213: [{ ticker: "SBGI", applicant: /^Sinclair Corp\b/i, why: "Sinclair Corp., a device firm of 1995, not Sinclair, the broadcaster" }],
  1820190: [{ ticker: "SCLX", applicant: /^Scilex,? Ltd\b/i, why: "Scilex, Ltd., a device firm of 2008, not Scilex Holding" }],
  1883814: [{ ticker: "SLND", applicant: /^Southland,? Ltd\b/i, why: "Southland, Ltd., a device firm of 1994, not Southland Holdings" }],
  1810467: [{ ticker: "SNTG", applicant: /^Sentage Corporation\b/i, why: "Sentage Corporation, a dental laboratory group of 2003, not Sentage Holdings" }],
  889353: [{ ticker: "SNTL", applicant: /^Sentinel$/i, why: "Sentinel, a device firm of 1991, not Sentinel Holdings" }],
  1126956: [{ ticker: "SR", applicant: /^Spire,? Inc\.? D\/B\/A\/? Spire Health\b/i, why: "Spire Health, a breathing-monitor maker, not Spire Inc., the gas utility" }],
  2070845: [{ ticker: "SUNI", applicant: /^The Sun Co\b/i, why: "The Sun Co., a device firm of 1986, not SUN" }],
  27419: [{ ticker: "TGT", applicant: /^Boston Scientific, Target\b/i, why: "Target Therapeutics, Boston Scientific's neurovascular company, not Target Corporation" }],
  320121: [{ ticker: "TLS", applicant: /^The Telos Co\b/i, why: "The Telos Co., a device firm of 1981, not Telos Corporation" }],
  1006837: [{ ticker: "VATE", applicant: /^Innovate,? Inc\b/i, why: "Innovate, Inc., a device firm of 1981, not INNOVATE Corp." }],
  200406: [{ ticker: "JNJ", applicant: /^Reimers and Janssen\b/i, why: "Reimers & Janssen GmbH of Waltrop, a German maker, not J&J's Janssen" }],
  // the file gives some units' present names on their records before their owners took them
  1613103: [
    { ticker: "MDT", applicant: /^Medtronic\s+Mini ?Med\b/i, before: "2001-08-28", why: "MiniMed's own clearances under Medtronic's later name: Medtronic's from MiniMed's Form 15, dated 2001-08-28 (filed 2001-08-30); MiniMed, Inc.'s own name is not Medtronic's" },
    { ticker: "MDT", applicant: /^Medtronic\s+Xomed\b/i, before: "1999-11-12", why: "Xomed's own clearances under Medtronic's later name: Medtronic's from Xomed Surgical Products' Form 15, dated 1999-11-12" },
  ],
  66740: [
    { ticker: "MMM", applicant: /^3M Health Care,\s*Sarns\b/i, before: "1982-01-01", why: "Sarns, Inc.'s clearances under 3M's later name: 3M bought Sarns in 1981, before EDGAR (the National Library of Medicine's guide to the ASAIO papers, \"Sarns-3M from 1981-1999\"), so from 1982, the first year surely after" },
  ],
  885725: [
    { ticker: "BSX", applicant: /^Meadox Medicals,?\s+Div\.?\s+Boston Scientific\b/i, before: "1995-11-16", why: "Meadox Medicals' own clearances under Boston Scientific's later name: bought 1995-11-16 (Boston Scientific's 10-K filed 1997-03-31)" },
    { ticker: "BSX", applicant: /^Boston Scientific Scimed\b/i, before: "1995-02-24", why: "SCIMED Life Systems' clearances under Boston Scientific's later name: merged 1995-02-24 (Boston Scientific's 10-K filed 1997-03-31)" },
  ],
};

const words = (x: string) => x.toLowerCase().replace(/&/g, " and ").split(/[^a-z0-9]+/).filter(Boolean);
const indexCache = new WeakMap<readonly FdaClearance[], Map<string, number[]>>();

/**
 * The clearances the rule could give a company, for a replay over every company: those whose applicant holds the first
 * word of one of its names of 1985, 1995, 2005 or today, or of one of its firms' searches, or that a firm's own pattern
 * matches anywhere. The rule (`clearanceIsCompany`) decides among them.
 */
export function candidatesFor(rows: readonly FdaClearance[], cik: number, namesIn: (year: number) => string[]): FdaClearance[] {
  let byWord = indexCache.get(rows);
  if (!byWord) {
    byWord = new Map();
    rows.forEach((c, j) => {
      for (const w of new Set(words(c.applicant))) (byWord!.get(w) ?? byWord!.set(w, []).get(w)!).push(j);
    });
    indexCache.set(rows, byWord);
  }
  const firms = [...(FDA_FIRMS[cik]?.firms ?? []), ...(APPLICANT_NAMES[cik]?.names ?? [])];
  const names = [...new Set([...namesIn(2026), ...namesIn(2005), ...namesIn(1995), ...namesIn(1985), ...firms.map((f) => f.search)].flatMap(andSpellings))];
  const out = new Set<number>();
  for (const n of names) {
    const w = words(n)[0];
    if (w) for (const j of byWord.get(w) ?? []) out.add(j);
  }
  const patterns = firms.filter((f) => f.match).map((f) => f.match!);
  if (patterns.length) rows.forEach((c, j) => patterns.some((p) => p.test(c.applicant)) && out.add(j));
  return [...out].sort((a, b) => a - b).map((j) => rows[j]);
}

/** Whether a clearance's applicant is the company on its day: the approvals' rule, less the names read by hand. */
export function clearanceIsCompany(c: Pick<FdaClearance, "applicant" | "day">, cik: number, namesIn: (year: number) => string[]): boolean {
  if (NOT_THE_COMPANY[cik]?.some((r) => r.applicant.test(c.applicant) && (!r.before || c.day < r.before))) return false;
  return approvalIsCompany(c, cik, namesIn);
}

const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthOf = (day: string) => `${MONTH[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
/** A device's name as the FDA's file gives it. */
const deviceName = (d: string) => (d ? d : "an unnamed device");
/** …and shortened at a word where a month's title lists several ("da Vinci 5 Handheld Camera Head (470080);…"). */
const shortName = (d: string) => {
  const n = deviceName(d);
  return n.length <= 80 ? n : `${n.slice(0, 79).replace(/[\s;,]+\S*$/, "")}…`;
};
/** A name's possessive: "Intuitive Surgical, Inc.'s", "Abbott Laboratories'". */
const possessive = (n: string) => (/s$/i.test(n) ? `${n}'` : `${n}'s`);
const listed = (xs: readonly string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
/** How many devices a month's row names; the rest are counted. */
const SHOWN = 5;
const LIMIT = 900;

/**
 * The company's clearances as timeline events, newest first, from `from`, its first price: one row a company a
 * month, on the month's first decision day, naming each device and its number (the owner's call), and a De Novo
 * grant a row of its own on its day. Its id the clearances' numbers, a month's joined.
 */
export function clearanceEvents(rows: readonly FdaClearance[], namesIn: (year: number) => string[], { cik, from = "" }: { cik: number | string; from?: string }): TimelineEvent[] {
  const tag = Number(cik);
  const months = new Map<string, FdaClearance[]>();
  const deNovo: FdaClearance[] = [];
  const seen = new Set<string>();
  for (const c of rows) {
    if (!c.day || c.day < from || seen.has(c.k) || !clearanceIsCompany(c, tag, namesIn)) continue;
    seen.add(c.k);
    if (isDeNovo(c)) deNovo.push(c);
    else (months.get(c.day.slice(0, 7)) ?? months.set(c.day.slice(0, 7), []).get(c.day.slice(0, 7))!).push(c);
  }
  const out: TimelineEvent[] = [];
  for (const c of deNovo) {
    const title = `FDA granted ${possessive(c.applicant)} De Novo request for ${deviceName(c.device)} (${c.k}), a new kind of device`;
    out.push({
      id: `fda-clearance-${tag}-${c.k}`,
      date: c.day,
      type: "regulation",
      title: title.length <= 300 ? title : `${title.slice(0, 299).replace(/\s+\S*$/, "")}…`,
      description: `The FDA classified a new kind of device on ${possessive(c.applicant)} De Novo request ${c.k} (product code ${c.product}), granted ${c.day}. A grant lets the device be sold; it says nothing of a launch.`,
      source: "FDA",
      url: clearancePage(c.k),
      sourceKey: "fda_clearances",
      externalId: c.k,
      dedupBasis: `fda-clearance:${tag}@${c.k}`,
    });
  }
  for (const [month, found] of months) {
    const sorted = [...found].sort((a, b) => a.day.localeCompare(b.day) || a.k.localeCompare(b.k));
    const one = sorted[0];
    const shown = sorted.slice(0, SHOWN).map((c) => `${shortName(c.device)} (${c.k})`);
    const more = sorted.length > SHOWN ? [`${sorted.length - SHOWN} more`] : [];
    const title =
      sorted.length === 1
        ? `FDA cleared ${possessive(one.applicant)} ${deviceName(one.device)} (${one.k}): ${DECISIONS[one.code] ?? "substantially equivalent to a device already marketed"}`
        : `FDA cleared ${sorted.length} of the company's devices in ${monthOf(one.day)}: ${listed([...shown, ...more])}`;
    const lines = sorted.map((c) => `${c.k}, ${c.day}, ${c.applicant}: ${deviceName(c.device)}, ${DECISIONS[c.code] ?? "substantially equivalent"}`);
    const text =
      `The FDA's 510(k) clearances of the company's devices in ${monthOf(one.day)}: ${lines.join("; ")}. ` +
      "A clearance finds a device substantially equivalent to one already marketed; it says nothing of a launch.";
    out.push({
      id: `fda-clearance-${tag}-${month}`,
      date: one.day,
      type: "regulation",
      title: title.length <= 300 ? title : `${title.slice(0, 299).replace(/\s+\S*$/, "")}…`,
      description: text.length <= LIMIT ? text : `${text.slice(0, LIMIT - 1).replace(/\s+\S*$/, "")}…`,
      source: "FDA",
      url: clearancePage(one.k),
      sourceKey: "fda_clearances",
      // the month's numbers, so a month whose list grows is one row stored again (`GROUPED_ROW_SOURCES`)
      externalId: sorted.map((c) => c.k).join(","),
      dedupBasis: `fda-clearance:${tag}@${month}`,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
