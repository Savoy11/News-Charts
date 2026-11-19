import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { respondents } from "./cfpb";
import { andSpellings } from "./edgarName";
import { captionParty } from "./secCases";
import { takenBefore } from "./takenNames";
import type { TimelineEvent } from "./types";
import { decodeText, eachCsvRow, readZip, zipEntryNames } from "./zip";

/**
 * The Labor Department's trade adjustment assistance (TAA) certifications, 1975–2022 (batch 159, the
 * 2026-11-18 proposal 1, approved by the owner that day with its recommended call: a denial makes no
 * row). Under the Trade Act of 1974 the Department ruled, petition by petition, whether a named plant's
 * or office's job losses came from foreign trade; a certification made its workers eligible to apply for
 * the program's help. Each names the firm, the division, the town, the product or service, the
 * Department's estimate of the workers and the day separations were covered from. The Federal Register
 * prints them weekly under titles that name no company, so no other source reaches them.
 *
 * One keyless zip on the Department's open-data portal (`TAA_FILE`, 47,935,779 bytes on 2026-11-18):
 * the Employment and Training Administration's petition file, 86,334 petitions, 86,306 decided, from
 * 1975-05-15 to 2022-06-30. The program's authority lapsed on 2022-07-01 and no petition is decided after
 * 2022-06-30, so the file is closed in practice: it is read once (`npm run sync:taa`) into the committed
 * `data/taa-certifications.json.gz`, its certifications only, and ingest asks nothing. `check:live`
 * says when a later determination appears.
 *
 * The codes, read in the Federal Register's own notices (batch 159, two petitions a code, each found by
 * number and read on govinfo.gov): C, C1, C2 and CU are listed under "The following certifications have
 * been issued"; D under "Negative Determinations", a denial; T is a "Notice of Termination of
 * Investigation"; P was found under the certifications once and under the denials once ("All workers
 * engaged in the production of bearing caps are denied eligibility"), a partial determination, and CD
 * with a part of the workers certified. Only the four whole certifications make rows (`CERTIFIED`).
 *
 * A certification is the company's by the caption rule on its firm (`captionParty`, as EPA's and the
 * CPSC's parties are read), under the company's names of the year and the release map's units of the
 * day, by the units named after it that the rule does not read (`TAA_UNITS`), never by a name a
 * namesake shares (`NOT_THE_COMPANY`) or one its record took from another company before the day
 * (lib/takenNames.ts), and from its first price. A company's certifications of a day are one row.
 *
 * Licence: the Department's terms, read 2026-11-10 for MSHA (lib/ingest/store.ts, source 38):
 * "Materials created by the federal government are generally part of the public domain and may be
 * used, reproduced and distributed without permission", credited "to the U.S. Department of Labor",
 * never "in a manner that implies any affiliation or endorsement by the DOL". The portal's catalog and
 * its download state none of their own; no key is asked.
 */
export const TAA_FILE = "https://data.dol.gov/data-catalog/ETA/otaa_petition/ETA_otaa_petition.zip";

/** The committed certifications (`npm run sync:taa`). */
export const TAA_DATA = join(__dirname, "..", "data", "taa-certifications.json.gz");

/** The codes that are a certification of the whole worker group, as the Federal Register lists them. */
export const CERTIFIED: readonly string[] = ["C", "C1", "C2", "CU"];

export interface TaaCertification {
  /** the petition's number, TA-W-40,525 */
  petition: number;
  /** its letter, for a further site of one petition ("A"); empty for the first */
  suffix: string;
  /** the worker group's firm, as the Department wrote it: "Boeing Co. (The)" */
  firm: string;
  /** its division or second name: "Commercial Airplane Group"; empty where none */
  division: string;
  city: string;
  state: string;
  /** what the workers made or did: "Commercial Aircraft" */
  what: string;
  /** the determination's day */
  day: string;
  /** the Department's code, one of `CERTIFIED` */
  code: string;
  /** the day separations are covered from; empty where none */
  impact: string;
  /** the Department's estimate of the workers in the group, or null where it gives none */
  workers: number | null;
}

/** The file's columns the rows are read from, in the order `eachCsvRow` gives them. */
const COLUMNS = ["TAW", "SUFFIX", "WORKER_GROUP_NAME", "SECOND_NAME", "CITY", "STATE", "PRODUCT", "SERVICE", "DET_DATE", "DET_CODE", "IMPACT_DATE", "EST_WORKERS_OBJ"] as const;

/**
 * A field as the file writes it, less its placeholders ("nan", "NaT", "0", "----") and the web codes its
 * certifications' fields carry, 547 of them ("Aerotek Recruiting &amp; Staff").
 */
const field = (s: string) => {
  const t = (s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:nan|NaT|0|-+|0E-10)$/i.test(t) ? "" : t;
};
const dayOf = (s: string) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "");
const count = (s: string): number | null => {
  const n = Math.round(Number(field(s)));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * The petition file's certifications, and how many petitions it held, decided by code, and its last
 * determination's day. A file without the columns read is refused.
 */
export function readTaaPetitions(zip: Uint8Array): { certifications: TaaCertification[]; petitions: number; byCode: Record<string, number>; lastDecided: string } {
  const names = zipEntryNames(zip).filter((n) => /\.csv$/i.test(n));
  if (names.length !== 1) throw new Error(`not the petition file: ${names.length} CSV files in the zip`);
  const text = decodeText(readZip(zip, names).get(names[0])!).replace(/^﻿/, "");
  const certifications: TaaCertification[] = [];
  const byCode: Record<string, number> = {};
  let petitions = 0;
  let lastDecided = "";
  // the header is read by `eachCsvRow` itself: each call is a petition
  eachCsvRow(text, COLUMNS, ([taw, suffix, firm, second, city, state, product, service, det, code, impact, workers]) => {
    petitions++;
    const day = dayOf(det);
    const c = (code ?? "").trim();
    if (!day || !c) return;
    byCode[c] = (byCode[c] ?? 0) + 1;
    if (day > lastDecided) lastDecided = day;
    if (!CERTIFIED.includes(c)) return;
    certifications.push({
      petition: Number(taw),
      suffix: (suffix ?? "").trim(),
      firm: field(firm),
      // a legal word the file put in the second name ("INC") is the firm's, not a division
      division: /^(?:inc|corp|co|llc|ltd|lp|company|corporation)\.?$/i.test(field(second)) ? "" : field(second),
      city: field(city),
      state: field(state),
      what: field(product) || field(service),
      day,
      code: c,
      impact: dayOf(impact),
      workers: count(workers),
    });
  });
  return { certifications, petitions, byCode, lastDecided };
}

/** The committed file's columns, each certification one array of them, to keep the file small. */
export const DATA_COLUMNS = ["petition", "suffix", "firm", "division", "city", "state", "what", "day", "code", "impact", "workers"] as const;

let loaded: readonly TaaCertification[] | null = null;

/** The committed certifications, read once a process. */
export function taaCertifications(path = TAA_DATA): readonly TaaCertification[] {
  if (loaded && path === TAA_DATA) return loaded;
  const file = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as { columns: string[]; rows: unknown[][] };
  if (JSON.stringify(file.columns) !== JSON.stringify(DATA_COLUMNS)) throw new Error(`${path}: not the columns this reader reads`);
  const rows = file.rows.map((r) => Object.fromEntries(DATA_COLUMNS.map((c, i) => [c, r[i]])) as unknown as TaaCertification);
  if (path === TAA_DATA) loaded = rows;
  return rows;
}

/**
 * Worker groups of a company the caption rule does not read, by CIK: its units named after it, read
 * by hand from the file (batch 159). Each is the company's from `from` to `to`, its days; a unit with
 * neither was the company's for every certification the file gives it.
 */
export const TAA_UNITS: Readonly<Record<number, { ticker: string; firm: RegExp; from?: string; to?: string; why: string }[]>> = {
  103379: [
    {
      ticker: "VFC",
      firm: /^VF (?:Jeanswear|Knitwear|Imagewear)\b/i,
      why: "VF's own apparel companies, named after it: 77 certifications of 1998-02-06 to 2014-11-18, all before VF Jeanswear left with Kontoor Brands in 2019",
    },
  ],
  1341439: [
    {
      ticker: "ORCL",
      firm: /^Oracle America\b/i,
      why: "Sun Microsystems, renamed Oracle America after Oracle bought it in 2010, a name only Oracle's: nine certifications of 2011-04-06 to 2022-06-16 (Sun's own before the purchase are Sun's)",
    },
  ],
};

/** Firms the rule would give a company that are not its, by CIK, read by hand (batch 159). */
export const NOT_THE_COMPANY: Readonly<Record<number, { ticker: string; firm: RegExp; why: string }[]>> = {
  26780: [
    {
      ticker: "DAN",
      firm: /^Coupled Products\b/i,
      why: "Coupled Products, sold by Dana, its certification of 2008-10-27 written \"Coupled Products LLC (Formerly known as Dana Corporation)\"",
    },
  ],
};

const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Whether a certification's firm is the company on its day, by the units, the namesakes and the caption rule. */
export function taaIsCompany(
  c: Pick<TaaCertification, "firm" | "day">,
  cik: number,
  names: () => string[],
): boolean {
  if (NOT_THE_COMPANY[cik]?.some((r) => r.firm.test(c.firm))) return false;
  // a name the record took from another company is that company's before the day (lib/takenNames.ts)
  if (takenBefore(cik, c.day, c.firm)) return false;
  if (TAA_UNITS[cik]?.some((u) => u.firm.test(c.firm) && (!u.from || c.day >= u.from) && (!u.to || c.day <= u.to))) return true;
  const held = names();
  const letters = alnum(c.firm);
  if (!held.flatMap(andSpellings).some((n) => alnum(n).length >= 2 && letters.includes(alnum(n)))) return false;
  return captionParty(respondents(c.firm), held) !== null;
}

/** "TA-W-40,525A": the number as the Federal Register writes it. */
export const petitionNumber = (c: Pick<TaaCertification, "petition" | "suffix">) => `TA-W-${c.petition.toLocaleString("en-US")}${c.suffix}`;

/**
 * Where a reader finds the notice: the Federal Register's own search for the petition's number, whose
 * full text begins in 1994. An earlier certification has no link; its number is in the row.
 */
export const noticeSearch = (c: Pick<TaaCertification, "petition" | "day">): string | undefined =>
  c.day >= "1994-01-01"
    ? `https://www.federalregister.gov/documents/search?conditions%5Bterm%5D=${encodeURIComponent(`"TA-W-${c.petition.toLocaleString("en-US")}"`)}`
    : undefined;

const LIMIT = 900;
const SITES_SHOWN = 4;
/** A division in a title, cut at a comma: some list the staffing agencies too ("…, Teksystems, Quadratic, Solstice, Forbes, etc."). */
const DIVISION_SHOWN = 60;
const shortDivision = (d: string) => {
  if (d.length <= DIVISION_SHOWN) return d;
  const cut = d.slice(0, DIVISION_SHOWN).lastIndexOf(",");
  return `${(cut > 0 ? d.slice(0, cut) : d.slice(0, DIVISION_SHOWN).replace(/\s+\S*$/, "")).trim()}…`;
};

/** "Commercial Airplane Group, Seattle, WA: commercial aircraft, 6,000 workers (TA-W-40,525)" */
function siteLine(c: TaaCertification): string {
  const where = [c.division, [c.city, c.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  const what = [c.what, c.workers !== null ? `${c.workers.toLocaleString("en-US")} ${c.workers === 1 ? "worker" : "workers"}` : ""].filter(Boolean).join(", ");
  const from = c.impact ? `, separations from ${c.impact}` : "";
  return `${where || c.firm}${what ? `: ${what}` : ""}${from} (${petitionNumber(c)})`;
}

/**
 * The company's certifications as timeline events, newest first, from `from`, its first price: one row a
 * day, each site listed with its own worker estimate, never added up, as the Department gives one a group.
 */
export function taaEvents(
  certs: readonly TaaCertification[],
  namesIn: (year: number) => string[],
  { cik, from = "", namesOn }: { cik: number | string; from?: string; namesOn?: (day: string) => string[] },
): TimelineEvent[] {
  const tag = Number(cik);
  const byYear = new Map<number, string[]>();
  const yearNames = (year: number) => byYear.get(year) ?? byYear.set(year, namesIn(year)).get(year)!;
  const byDay = new Map<string, TaaCertification[]>();
  for (const c of certs) {
    if (c.day < from || !CERTIFIED.includes(c.code)) continue;
    if (!taaIsCompany(c, tag, () => [...yearNames(Number(c.day.slice(0, 4))), ...(namesOn?.(c.day) ?? [])])) continue;
    (byDay.get(c.day) ?? byDay.set(c.day, []).get(c.day)!).push(c);
  }
  return [...byDay.entries()]
    .sort(([x], [y]) => y.localeCompare(x))
    .map(([day, found]) => {
      const sites = [...found].sort((a, b) => a.petition - b.petition || a.suffix.localeCompare(b.suffix));
      // the firm as the Department wrote it most often that day
      const firms = new Map<string, number>();
      for (const s of sites) firms.set(s.firm, (firms.get(s.firm) ?? 0) + 1);
      const firm = [...firms.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const one = sites[0];
      const title =
        sites.length === 1
          ? `Labor Department certified workers at ${firm}${one.division ? `, ${shortDivision(one.division)}` : ""}${one.city ? ` (${[one.city, one.state].filter(Boolean).join(", ")})` : ""} for trade adjustment assistance`
          : `Labor Department certified workers at ${sites.length} sites of ${firm} for trade adjustment assistance`;
      const lines = sites.slice(0, SITES_SHOWN).map(siteLine);
      const more = sites.length > SITES_SHOWN ? ` And ${sites.length - SITES_SHOWN} more: ${sites.slice(SITES_SHOWN).map(petitionNumber).join(", ")}.` : "";
      const text =
        `The Department found that foreign trade contributed importantly to the workers' job losses, making them eligible to apply for trade adjustment assistance. ` +
        `${lines.join("; ")}.${more}${sites.length > 1 ? " Worker counts are the Department's estimate for each group, not added up." : " The worker count is the Department's estimate."}`;
      const basis = `taa:${tag}@${day}`;
      return {
        id: `taa-${tag}-${day}`,
        date: day,
        type: "regulation" as const,
        title,
        description: text.length <= LIMIT ? text : `${text.slice(0, LIMIT - 1).replace(/\s+\S*$/, "")}…`,
        source: "U.S. Department of Labor",
        url: noticeSearch(one),
        sourceKey: "dol_taa" as const,
        externalId: basis,
        // the company's one event a day
        dedupBasis: basis,
      };
    });
}
