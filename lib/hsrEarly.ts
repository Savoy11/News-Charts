import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { respondents } from "./cfpb";
import { UNITS as CPSC_UNITS } from "./cpscRecalls";
import { andSpellings } from "./edgarName";
import { BRANDED_SITE, UNITS as EPA_UNITS } from "./epaCases";
import { captionParty } from "./secCases";
import { takenBefore } from "./takenNames";
import type { TimelineEvent } from "./types";

/**
 * The antitrust agencies' early terminations of the merger waiting period, 1994–2026 (batch 166, the
 * 2026-11-22 proposal 1, approved by the owner that day with its recommended call: every grant naming
 * the company makes a row, as the acquiring person, the acquired person or an acquired entity).
 *
 * Under the Hart-Scott-Rodino Act (section 7A of the Clayton Act) an acquisition above the thresholds
 * is notified to the Federal Trade Commission and the Justice Department's Antitrust Division, and the
 * parties wait before closing. Section 7A(b)(2) lets the agencies end the wait early "and requires that
 * notice of this action be published in the Federal Register", in the notices' own words. Each notice
 * lists the grants of a few weeks: the transaction's number, the day it was granted, the acquiring
 * person, the acquired person and the acquired entities. Its title names no company ("Granting of
 * Request for Early Termination of the Waiting Period Under the Premerger Notification Rules"), so the
 * Federal Register's company feed never kept one.
 *
 * The notices: the Federal Register API's list of the FTC's notices holding "early termination" and
 * "waiting period", those titled as grants (`isGrantTitle`), 441 from 1994-11-02, each notice's text
 * read once from the Government Publishing Office's copy on govinfo (the Federal Register's own text
 * pages answered 302 to an unblock page from this container on 2026-11-22). `npm run sync:hsr` reads
 * them into the committed `data/hsr-early-terminations.json.gz`, asking only for notices the file does
 * not hold, so it is run monthly: the agencies suspended grants in February 2021 (three of November 2021
 * aside), granted again from June 2025 and publish about one notice a month since. Ingest asks nothing.
 *
 * The tables come in four layouts (`readGrantNotice`), each read whole and checked against the
 * transaction numbers the notice's text holds:
 *  - 1994–1998, a transaction a run of lines ending in its PMN number and the day terminated, its
 *    parties joined by commas (by semicolons from late 1996);
 *  - 1999–2003 in part, a party a line under "Party name", by the day granted;
 *  - 2001–2009, three columns (Acquiring, Acquired, Entities) under each day's header, wrapped;
 *  - 2009–2026, the parties joined by semicolons, under a day's header or beside an "ET date" column.
 *
 * A grant is the company's by the caption rule on each party (`captionParty`, as the trade
 * certifications' firms are read), under the company's names of the year and the release map's units
 * of the day, by EPA's and the CPSC's units on their days, never by a name a namesake shares
 * (`NOT_THE_COMPANY`) or one its record took from another company before the day (lib/takenNames.ts),
 * and from its first price. A company's grants of a day are one row.
 *
 * Licence: the notices are the FTC's and the Justice Department's own work in the Federal Register,
 * which the registry records as public domain (source 5). govinfo's policies page, read 2026-11-22:
 * "Copyright protection under this title is not available for any work of the United States Government
 * … public documents can generally be reprinted without legal restriction", asking that "customary
 * credit should be given to the Government department or agency which prepared the material". No key.
 */

export const HSR_LIST =
  "https://www.federalregister.gov/api/v1/documents.json?per_page=1000&order=oldest&conditions%5Bagencies%5D%5B%5D=federal-trade-commission&conditions%5Btype%5D%5B%5D=NOTICE&conditions%5Bterm%5D=%22early+termination%22+%22waiting+period%22&fields%5B%5D=title&fields%5B%5D=publication_date&fields%5B%5D=document_number";

/** govinfo's copy of a notice, by its publication day and document number. */
export const noticeText = (published: string, doc: string) => `https://www.govinfo.gov/content/pkg/FR-${published}/html/${doc}.htm`;

/** The notice's page on the Federal Register, for a reader. */
export const noticePage = (doc: string) => `https://www.federalregister.gov/d/${doc}`;

/** A grant notice's title, as the list writes it: "Granting of Requests for…", once "Grant of Request…", once "Terminiation". */
export const isGrantTitle = (title: string) => /^Grant(?:ing)? of Requests? for Early Termin/i.test(title.trim());

export const HSR_DATA = join(__dirname, "..", "data", "hsr-early-terminations.json.gz");

export interface HsrGrant {
  /** the transaction's number, "20050831", or a PMN number before 1999, "95-1351" */
  number: string;
  /** the day the waiting period was ended */
  day: string;
  acquiring: string;
  acquired: string;
  /** the acquired entities; none where the notice gives none (from 2011 its third name is the acquiring side's) */
  entities: string[];
  /**
   * From 2011 a notice's third name is the acquiring person again ("Amazon.com, Inc.; Aurora Innovation, Inc.;
   * Amazon.com, Inc."), in 99% of its transactions: the acquiring side's entity, kept here where it is another
   * name, never read as an entity acquired (`thirdIsAcquiring`)
   */
  acquiringEntities: string[];
  /** the notice's document number and publication day */
  notice: string;
  published: string;
}

const MONTHS: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };
const century = (yy: string) => (Number(yy) > 50 ? `19${yy}` : `20${yy}`);

/** The year of a day printed without one: the notice's, or the year before for a month after its publication. */
function yearOf(published: string, month: string): string {
  const y = Number(published.slice(0, 4));
  return String(Number(month) > Number(published.slice(5, 7)) ? y - 1 : y);
}

/** "JAN. 18, 2000" alone on its line, as [_, month, day, year] in figures. */
function spelledDay(l: string): string[] | null {
  const m = l.match(/^\s*([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s+(\d{4})\s*$/);
  const month = m ? MONTHS[m[1].toUpperCase()] : undefined;
  return m && month ? [m[0], month, m[2].padStart(2, "0"), m[3]] : null;
}

/** The notice's text, its HTML tags and page markers taken off. */
export function noticeLines(page: string): string[] {
  const text = page
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ");
  return text.split(/\r?\n/).filter((l) => !/^\s*\[\[Page \d+\]\]\s*$/.test(l));
}

/** Legal words a comma may stand before inside one party's name. */
const SUFFIX =
  /^(?:Inc|Incorporated|Ltd|Limited|L\.?\s?L\.?\s?C|L\.?\s?P|L\.?\s?L\.?\s?P|Co|Corp|Corporation|Company|N\.?\s?V|B\.?\s?V|A\.?\s?G|S\.?\s?A|S\.?\s?A\.?\s?S|S\.?\s?p\.?\s?A|S\.?\s?A\.?\s?R\.?\s?L|S\.?\s?[aà]\s?r\.?\s?l|plc|P\.?\s?L\.?\s?C|GmbH|AB|ASA|A\/S|AS|Oyj|SE|K\.?\s?K|Pty|P\.?\s?C|Jr|Sr|II|III|IV|V|VI|VII|VIII|IX|X|de C\.?\s?V|N\.?\s?A|F\.?\s?S\.?\s?B)\b\.?/i;

/** A name with dot leaders and spacing tidied: "Kreher Steel Co., Inc......" is "Kreher Steel Co., Inc." */
export function tidy(s: string): string {
  return s
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    // a name the notice wrapped at its hyphen, "Bristol-" and "Myers", is one word again
    .replace(/(\w)- (?=[A-Za-z0-9])/g, "$1-")
    .replace(/\s+([.,;])/g, "$1")
    .trim()
    .replace(/^[.;,\s]+|[;,\s]+$/g, "")
    .replace(/\.\.$/, ".");
}

/**
 * One table cell's parties: split at semicolons where it has them, else at commas, a comma before a
 * legal word ("Kreher Steel Co., Inc.", "Pincus Capital Company, L.P.") keeping its name whole.
 */
export function splitParties(text: string): string[] {
  const t = tidy(text);
  const chunks = t.split(/;\s*/).map(tidy).filter(Boolean);
  // three or more chunks are a party each; fewer, and the first holds the parties joined by commas, as in
  // 1997's "Lincoln National Corporation, CIGNA Corporation, CIGNA Associates, Inc.; CIGNA Financial Advisors, Inc."
  if (chunks.length >= 3) return chunks;
  return [...byCommas(chunks[0] ?? ""), ...chunks.slice(1)];
}

function byCommas(t: string): string[] {
  const out: string[] = [];
  for (const piece of t.split(/,\s+/)) {
    if (out.length && (SUFFIX.test(piece) || /^\(/.test(piece) || /^(?:a|an)\s+\S+\s+(?:company|corporation|limited|partnership)\b/i.test(piece))) out[out.length - 1] += `, ${piece}`;
    else out.push(piece);
  }
  return out.map(tidy).filter(Boolean);
}

/** The parties of a run read in order: acquiring, acquired, the entities after. */
function ordered(number: string, day: string, parties: string[], notice: { doc: string; published: string }): HsrGrant | null {
  // a group the notice prints no day for is kept with none, and makes no row
  if (!parties.length) return null;
  const [acquiring, acquired = "", ...entities] = parties;
  return { number, day, acquiring, acquired, entities: entities.length ? entities : acquired ? [acquired] : [], acquiringEntities: [], notice: notice.doc, published: notice.published };
}

/** The transaction numbers the notice's text holds, each read once: the check on every layout. */
export function numbersIn(lines: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const l of lines) {
    const pmn = l.match(/\b(\d{2}-\d{4})\s+\d{1,2}\/\d{1,2}\/\d{2}\s*$/);
    if (pmn) seen.add(pmn[1]);
    const trans = l.match(/^\s*(?:\d{2}-[A-Za-z]{3}-\d{2,4}\.*\s+|\d{2}\/\d{2}\/\d{4}\.*\s+)?((?:19|20)\d{6})\b/) ?? l.match(/^\s*\d{2}-[A-Za-z]{3}-\d{2,4}\.*\s+(\d{7})\s/) ?? l.match(/^\s*(\d{5,8})(?:\.{2,}|\s{2,}\S|--\S)/) ?? l.match(/^\s*(\d{7})\s+[A-Z]\s{2,}\S/) ?? l.match(/^\s*((?:19|20)\d{6})\s[A-Z]/) ?? l.match(/^\s*((?:19|20)\d{7})(?:\.{2,}|-)/);
    if (trans) seen.add(trans[1]);
    // 2003 in part: the party first, then its status, the number and the day
    const last = l.match(/\s[A-Z]\s+((?:19|20)\d{6})\s+(?:\d{2}-[A-Za-z]{3}-\d{2,4}|\.{3,})\s*$/);
    if (last) seen.add(last[1]);
  }
  return [...seen];
}

/**
 * A grant notice's transactions, in any of its four layouts. Each transaction's parties are kept as
 * the notice writes them, its dot leaders taken off; a name the notice wraps over lines is joined.
 */
export function readGrantNotice(page: string, notice: { doc: string; published: string }): HsrGrant[] {
  // a transaction a notice prints twice is one grant
  const seen = new Set<string>();
  return thirdIsAcquiring(readLayouts(page, notice).filter((g) => !seen.has(g.number) && !!seen.add(g.number)));
}

const same = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * A notice whose third names are mostly its acquiring persons again, as from 2011 (736 of 931 transactions
 * that year, 99% after): its third names are the acquiring side's, so its transactions give no acquired
 * entity, and a third name that is neither party is kept as the acquiring side's entity.
 */
export function thirdIsAcquiring(grants: HsrGrant[]): HsrGrant[] {
  const repeats = grants.filter((g) => g.entities.length === 1 && same(g.entities[0], g.acquiring)).length;
  if (!grants.length || repeats * 2 <= grants.length) return grants;
  return grants.map((g) => ({ ...g, entities: [], acquiringEntities: g.entities.filter((e) => !same(e, g.acquiring) && !same(e, g.acquired)) }));
}

function readLayouts(page: string, notice: { doc: string; published: string }): HsrGrant[] {
  const lines = noticeLines(page);
  const out: HsrGrant[] = [];
  const isRule = (l: string) => /^\s*[-=]{10,}\s*$/.test(l);

  // 1994–1998: a run of lines ending in the PMN number and the day terminated
  if (lines.some((l) => /\b\d{2}-\d{4}\s+\d{1,2}\/\d{1,2}\/\d{2}\s*$/.test(l))) {
    let buf: string[] = [];
    for (const l of lines) {
      const m = l.match(/^(.*?)\s*(\d{2}-\d{4})\s+(\d{1,2})\/(\d{1,2})\/(\d{2})\s*$/);
      if (m) {
        buf.push(m[1]);
        const g = ordered(m[2], `${century(m[5])}-${m[3].padStart(2, "0")}-${m[4].padStart(2, "0")}`, splitParties(buf.join(" ")), notice);
        if (g) out.push(g);
        buf = [];
      } else if (isRule(l) || /Name of acquir|person[,;] name of|^\s*Date\s*$|terminated\s*$|Granted Early Termination/i.test(l)) buf = [];
      else if (l.trim()) buf.push(l);
    }
    return out;
  }

  // 2001–2009: three columns, a day's header above its transactions
  if (lines.some((l) => /\bAcquiring\s+Acquired\s+Entit\w*\b/i.test(l) || /\bAcquired\s+person\s+Acquired\s+entities\b/i.test(l) || /\bAcquiring\s+person\s+Acquired\s+person\b/i.test(l) || /^\s*Trans\b.*\s{2,}Acquired\s{2,}.*\bEntit\w*\s*$/i.test(l))) {
    let day = "";
    let cur: { number: string; day: string; cols: string[][]; starts: number[] } | null = null;
    const flush = () => {
      if (!cur) return;
      const [acq, acqd, ents] = cur.cols.map((c) => c.map(tidy).filter(Boolean));
      const acquiring = tidy((acq ?? []).join(" "));
      const acquired = tidy((acqd ?? []).join(" "));
      const entities = (ents ?? []).flatMap(splitParties);
      if (acquiring || acquired) out.push({ number: cur.number, day: cur.day, acquiring, acquired, entities: entities.length ? entities : acquired ? [acquired] : [], acquiringEntities: [], notice: notice.doc, published: notice.published });
      cur = null;
    };
    let lastStarts: number[] | null = null;
    for (const l of lines) {
      // "…Early Termination--04/17/2001", "…Terminations--8/08/2005", "…Early Termination, 03/29/99" (never the
      // range "03/29/99-04/22/99"), the day alone ("08/13/1999"), or spelled ("JAN. 18, 2000", early 2000)
      const d =
        l.match(/Granted\s+Early\s+Ter\w*ions?\s*(?:-+|,)\s*(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\s*$/i) ??
        l.match(/^\s*(\d{2})\/(\d{2})\/(\d{4})\s*$/) ??
        spelledDay(l) ??
        // "…Early Termination--08/05", once in 2008, the year the notice's
        l.match(/Granted\s+Early\s+Ter\w*ions?\s*-+\s*(\d{1,2})\/(\d{1,2})()\s*$/i)?.map((x, i) => (i === 3 ? yearOf(notice.published, x) : x)) ??
        null;
      if (d) {
        flush();
        day = `${d[3].length === 4 ? d[3] : century(d[3])}-${d[1].padStart(2, "0")}-${d[2].padStart(2, "0")}`;
        continue;
      }
      if (isRule(l)) {
        flush();
        continue;
      }
      if (!l.trim()) continue;
      // the number with its leader, two spaces or "--" after it (five digits in 1999, nine in one misprint of 2002), or
      // one space before the name ("20004275 AXA....")
      const t = l.match(/^(\s*(\d{5,9})(?:\.{2,}\s*|\s{2,}|--))(\S.*)$/) ?? l.match(/^(\s*((?:19|20)\d{6})\s)([A-Z].*)$/);
      if (t) {
        flush();
        // the cells' starts: after the number's leader, each text that follows two spaces or more
        const starts: number[] = [];
        const rest = t[3];
        const re = /(?:^|\s{2,})(\S)/g;
        for (const m of rest.matchAll(re)) starts.push(t[1].length + m.index! + m[0].length - 1);
        // a first line with a cell left empty takes the table's starts of the transaction before
        const prev: number[] | null = lastStarts;
        const use: number[] = starts.length >= 3 ? starts.slice(0, 3) : prev && starts[0] === prev[0] ? prev : starts;
        if (use.length >= 3) lastStarts = use;
        cur = { number: t[2], day, cols: [[], [], []], starts: use };
      }
      if (!cur) continue;
      const bounds = [...cur.starts, Number.MAX_SAFE_INTEGER];
      for (let k = 0; k < Math.min(3, cur.starts.length); k++) {
        // the number's line exactly at each cell's start ("20000877--Brian L. Roberts"); a wrapped line from one before it
        const from = t ? bounds[k] : Math.max(0, bounds[k] - 1);
        const cell = l.slice(from, bounds[k + 1] - 1);
        if (!cell.trim()) continue;
        // in the entities' cell, a name begun at the cell's start after one that ended is a new entity; a wrapped
        // line is indented, or follows a line that did not end ("Clinical Laboratories / of Hawaii, LLP, Pan"),
        // and an initial ("Gerald R.") ends no name
        const col = cur.cols[k];
        const before = (col.at(-1) ?? "").trim();
        const isNew = !t && k === 2 && l.length > bounds[2] && l[bounds[2]] !== " " && (bounds[2] === 0 || l[bounds[2] - 1] === " ") && /\.$/.test(before) && !/(?:^|\s)[A-Z]\.$/.test(before);
        if (t || isNew || !col.length) col.push(cell);
        else col[col.length - 1] += ` ${cell}`;
      }
    }
    flush();
    return out;
  }

  // 2003 in part: a party a line, its status, number and day after it, the number on a transaction's first party
  if (lines.some((l) => /\s[A-Z]\s+(?:19|20)\d{6}\s+\d{2}-[A-Za-z]{3}-\d{2,4}\s*$/.test(l))) {
    let day = "";
    let cur: { number: string; day: string; parties: string[] } | null = null;
    const flush = () => {
      if (cur) {
        const g = ordered(cur.number, cur.day, cur.parties.map(tidy).filter(Boolean), notice);
        if (g) out.push(g);
      }
      cur = null;
    };
    for (const l of lines) {
      if (isRule(l) || !l.trim()) continue;
      const m = l.match(/^(\S.*?)\.*\s{2,}([A-Z])\s{2,}((?:19|20)\d{6}|\.{3,})\s+(?:(\d{2})-([A-Za-z]{3})-(\d{2,4})|\.{3,})\s*$/);
      if (m) {
        if (m[4]) day = `${m[6].length === 4 ? m[6] : century(m[6])}-${MONTHS[m[5].toUpperCase()]}-${m[4]}`;
        if (/^\d/.test(m[3])) {
          flush();
          cur = { number: m[3], day, parties: [] };
        }
        cur?.parties.push(m[1]);
        continue;
      }
      if (cur && cur.parties.length && /^\S/.test(l) && !/Party\s+name|ET\s+date|status/i.test(l)) cur.parties[cur.parties.length - 1] += ` ${l.trim()}`;
    }
    flush();
    return out;
  }

  // 1999–2003: a party a line, "G" for granted, under "Party name"
  if (lines.some((l) => /\d{2}-[A-Za-z]{3}-\d{2}\b/.test(l)) && lines.some((l) => /Party\s+name/i.test(l))) {
    let day = "";
    let cur = null as { number: string; day: string; parties: string[]; indent: number } | null;
    const flush = () => {
      if (cur) {
        const g = ordered(cur.number, cur.day, cur.parties.map(tidy).filter(Boolean), notice);
        if (g) out.push(g);
      }
      cur = null;
    };
    for (const l of lines) {
      if (isRule(l) || !l.trim()) continue;
      // the number's column may hold a leader, and a column of dots may stand before the status (2009)
      const m = l.match(/^\s*(?:(\d{2})-([A-Za-z]{3})-(\d{2,4})\.*\s+)?(\d{7,8})?[.\s]*?\s\b[A-Z]\s{2,}(\S.*)$/);
      if (m) {
        if (m[1]) day = `${m[3].length === 4 ? m[3] : century(m[3])}-${MONTHS[m[2].toUpperCase()]}-${m[1]}`;
        // a number printed again on a transaction's later party is the same transaction
        if (m[4] && m[4] !== cur?.number) {
          flush();
          cur = { number: m[4], day, parties: [], indent: l.indexOf(m[5]) };
        }
        if (cur) {
          cur.parties.push(m[5]);
          cur.indent = l.indexOf(m[5]);
        }
        continue;
      }
      if (cur && cur.parties.length && /^\s+\S/.test(l) && l.search(/\S/) >= cur.indent - 1 && !/Party\s+name|ET\s+date/i.test(l)) cur.parties[cur.parties.length - 1] += ` ${l.trim()}`;
    }
    flush();
    return out;
  }

  // 2009–2026: the parties joined by semicolons, a day's line above or beside them
  let day = "";
  let cur: { number: string; day: string; text: string } | null = null;
  const flush = () => {
    if (cur) {
      const g = ordered(cur.number, cur.day, splitParties(cur.text), notice);
      if (g) out.push(g);
    }
    cur = null;
  };
  for (const l of lines) {
    const alone = l.match(/^\s*(\d{1,2})\/(\d{1,2})\/(\d{4}):?\s*$/);
    if (alone) {
      flush();
      day = `${alone[3]}-${alone[1].padStart(2, "0")}-${alone[2].padStart(2, "0")}`;
      continue;
    }
    if (isRule(l)) {
      flush();
      continue;
    }
    if (!l.trim()) continue;
    const m = l.match(/^\s*(?:(\d{2})\/(\d{2})\/(\d{4})\.*\s+)?((?:19|20)\d{6,7})\.*\s+(?:[A-Z](?:\.{2,}|\b(?=\s{2,})|\s(?=\S))|\.{3,})?\s*(\S.*)?$/);
    if (m) {
      flush();
      if (m[1]) day = `${m[3]}-${m[1]}-${m[2]}`;
      cur = { number: m[4], day, text: m[5] ?? "" };
      continue;
    }
    // a wrapped line is indented, or, in the compact notices of 2011, begins its line after a text that has not ended
    const heading = /Party\s+name|ET\s+date|Trans\.?\s+No|FOR FURTHER INFORMATION|By direction|BILLING CODE|\[FR Doc/i.test(l);
    if (cur && !heading && (/^\s{6,}\S/.test(l) || !/[.;]\s*$/.test(cur.text))) cur.text += ` ${l.trim()}`;
    else if (cur && !/^\s/.test(l)) flush();
  }
  flush();
  return out;
}

/** The committed file's columns, a grant an array of them. */
export const DATA_COLUMNS = ["number", "day", "acquiring", "acquired", "entities", "acquiringEntities", "notice", "published"] as const;

let cached: { path: string; grants: HsrGrant[] } | null = null;

/** Every grant in the committed file, read once a process. */
export function hsrGrants(path = HSR_DATA): readonly HsrGrant[] {
  if (cached?.path === path) return cached.grants;
  const body = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as { columns: string[]; rows: unknown[][] };
  const at = (k: (typeof DATA_COLUMNS)[number]) => body.columns.indexOf(k);
  const grants = body.rows.map((r) => ({
    number: String(r[at("number")]),
    day: String(r[at("day")]),
    acquiring: String(r[at("acquiring")]),
    acquired: String(r[at("acquired")]),
    entities: (r[at("entities")] as string[]) ?? [],
    acquiringEntities: (r[at("acquiringEntities")] as string[]) ?? [],
    notice: String(r[at("notice")]),
    published: String(r[at("published")]),
  }));
  cached = { path, grants };
  return grants;
}

/**
 * Parties the rule would give a company that are not its, by CIK, read by hand (batch 166) among the 535
 * names a replay of every grant against every listed company matched that are not the company's own EDGAR
 * name: the namesakes, and the names a caption's "and" splits ("Pacific and Southern Company").
 */
export const NOT_THE_COMPANY: Readonly<Record<number, { ticker: string; party: RegExp; why: string }[]>> = {
  40545: [
    {
      ticker: "GE",
      party: /^(?:The\s+)?General\s+Electric\s+Company,?\s*(?:p\.?\s?l\.?\s?c|plc|Limited)/i,
      why: "The General Electric Company, p.l.c. of Britain (Marconi from 1999), eight grants of 1996–1999, not General Electric of the United States",
    },
  ],
  92122: [{ ticker: "SO", party: /\bPacific\s+and\s+Southern\b/i, why: "Pacific and Southern Company, Gannett's television stations sold to Jacor in 1996, not Southern Company" }],
  833444: [{ ticker: "JCI", party: /^JCI\s+Limited\b/i, why: "JCI Limited, Johannesburg Consolidated Investment, sold to Glencore in 1998, not Johnson Controls or Tyco" }],
  1447221: [{ ticker: "LGSXY", party: /\bPower\s+(?:and|&)\s+Light\b/i, why: "Wisconsin Power and Light and Interstate Power and Light, Alliant Energy's utilities, not Light S.A.: the caption rule reads \"… Power and Light Company\" as a party \"Light Company\"" }],
  33213: [{ ticker: "EQT", party: /^EQT\s+(?:AB|Partners|Fund|Infrastructure|Mid\s+Market|[IVX]+\b)/i, why: "EQT AB, the Swedish investment firm, and its funds, not EQT Corporation" }],
  1666175: [{ ticker: "FTS", party: /^Fortis\s*(?:AG|AMEV|N\.?\s?V|S\.?\s?A|Bank|Insurance|,\s*Inc)/i, why: "Fortis AG of Belgium and Fortis, Inc., its American insurer, 1996–1998, not Fortis Inc. of Canada" }],
  80661: [{ ticker: "PGR", party: /^Progressive\s+Incorporated\b/i, why: "Progressive Incorporated, a machining company Heroux-Devtek bought in 2004, not The Progressive Corporation" }],
  771999: [{ ticker: "DSS", party: /^DSS\s+Company\b/i, why: "DSS Company of California, which MDU Resources bought in 1999, not DSS, Inc." }],
  2073643: [{ ticker: "METRY", party: /^Metro\s+Corporation\b/i, why: "Metro Corporation, an entity Bank One sold in 2002, not Metro Inc. of Canada" }],
};

/** A credit union is its members', never a listed company's, whatever its name: "Boeing Employees' Credit Union", "Detroit Edison Credit Union". */
const CREDIT_UNION = /\bCredit\s+Union\b/i;

const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Whether one of a grant's parties is the company on the grant's day, by the units, the namesakes and the caption rule. */
export function hsrPartyIsCompany(party: string, day: string, cik: number, names: () => string[]): boolean {
  const p = party.trim();
  if (!p) return false;
  if (CREDIT_UNION.test(p) || NOT_THE_COMPANY[cik]?.some((r) => r.party.test(p))) return false;
  // a name the record took from another company is that company's before the day (lib/takenNames.ts)
  if (takenBefore(cik, day, p)) return false;
  const within = (u: { from?: string; to?: string }) => day >= (u.from ?? "") && (!u.to || day <= u.to);
  if (EPA_UNITS[cik]?.some((u) => within(u) && u.defendant.test(p) && !(u.branded && BRANDED_SITE.test(p)))) return true;
  if (CPSC_UNITS[cik]?.some((u) => within(u) && u.firm.test(p))) return true;
  const held = names();
  const letters = alnum(p);
  if (!held.flatMap(andSpellings).some((n) => alnum(n).length >= 2 && letters.includes(alnum(n)))) return false;
  if (captionParty(respondents(p), held) !== null) return true;
  // a legal name with ".com" in it, which the caption rule reads as no legal word: "Amazon.com, Inc." is read as
  // EDGAR writes it, "AMAZON COM", so it is a company's only where one of its own names is written so
  // ("AMAZON COM INC", "SALESFORCE COM INC" to 2022), never another's whose name is the word before it ("Pets.com, Inc.")
  return /\.com\b/i.test(p) && captionParty(respondents(p.replace(/\.com\b/gi, " COM")), held.filter((n) => /\sCOM\b/i.test(n))) !== null;
}

export type HsrRole = "acquiring" | "acquired" | "entity";

/** The roles the company holds in a grant, in the notice's order. */
export function hsrRoles(g: HsrGrant, cik: number, names: () => string[]): HsrRole[] {
  const roles: HsrRole[] = [];
  if (hsrPartyIsCompany(g.acquiring, g.day, cik, names) || g.acquiringEntities.some((e) => hsrPartyIsCompany(e, g.day, cik, names))) roles.push("acquiring");
  if (hsrPartyIsCompany(g.acquired, g.day, cik, names)) roles.push("acquired");
  if (g.entities.some((e) => !same(e, g.acquired) && hsrPartyIsCompany(e, g.day, cik, names))) roles.push("entity");
  return roles;
}

/** A natural person, as the notices write one: "Timothy D. Cook", "Mr. Keith Rupert Murdoch", "Dr. Phillip Frost". */
export function isPerson(party: string): boolean {
  const p = party.trim().replace(/\.$/, "");
  if (/\b(?:Inc|Corp|Corporation|Company|Co|L\.?L\.?C|L\.?P|Ltd|Limited|Fund|Partners|Partnership|Trust|Holdings?|Group|plc|AG|N\.?V|B\.?V|S\.?A|GmbH|Capital|Investments?|Associates|Foundation|University|College|Bank|Estate|Family|Children|Heirs|System|Systems|Health|Hospital|Industries|International|Enterprises|Management|Ventures|Equity|Media|Energy|Resources|Services|Technologies|America|Americas|Global|Pension|Retirement|Board|State|Government|Republic|Kingdom|Authority)\b/i.test(p)) return false;
  return /^(?:(?:Mr|Mrs|Ms|Dr)\.?\s+)?[A-Z][a-zA-Z'’\-]+(?:\s+[A-Z]\.)*(?:\s+[A-Z][a-zA-Z'’\-]+){1,3}(?:,?\s+(?:Jr|Sr|II|III|IV)\.?)?$/.test(p);
}

/** A party as a row shows it: a name's closing period taken off, an abbreviation's kept ("Pfizer Inc.", "Pharmacia Corporation"). */
export function named(party: string): string {
  const p = party.trim();
  if (!p.endsWith(".")) return p;
  const last = p.slice(0, -1).split(/\s+/).at(-1) ?? "";
  return /^(?:Inc|Corp|Co|Ltd|Jr|Sr|Bros|Mfg|Cos|Assn|Intl|Mr|Dr|[A-Z])$/i.test(last) || /\./.test(last) ? p : p.slice(0, -1);
}

/** "Johnson & Johnson's", "Cisco Systems, Inc.'s", "Harris' ": a party in the possessive. */
const possessive = (p: string) => (/s$/i.test(p) ? `${p}'` : `${p}'s`);

/** A transaction in a phrase: "Ford Motor Company's acquisition of The Beanstalk Group, Inc. from Michael S. Stone". */
export function hsrPhrase(g: Pick<HsrGrant, "acquiring" | "acquired" | "entities">): string {
  const ents = g.entities.filter((e) => e && !same(e, g.acquired)).map(named);
  const acquiring = named(g.acquiring) || "an acquiring person";
  const acquired = named(g.acquired);
  if (!ents.length) return `${possessive(acquiring)} acquisition involving ${acquired || "an acquired person"}`;
  const shown = ents.length <= 2 ? ents.join(" and ") : `${ents[0]} and ${ents.length - 1} other entities`;
  return `${possessive(acquiring)} acquisition of ${shown}${acquired ? ` from ${acquired}` : ""}`;
}

const LIMIT = 900;
const SHOWN = 4;

/** One grant in a row's description. */
function grantLine(g: HsrGrant, roles: HsrRole[]): string {
  const as = roles.map((r) => (r === "acquiring" ? "the acquiring person" : r === "acquired" ? "the acquired person" : "an acquired entity")).join(" and ");
  const ents = g.entities.length ? `; acquired entities ${g.entities.map(named).join("; ")}` : "";
  const via = g.acquiringEntities.length ? `; acquiring through ${g.acquiringEntities.map(named).join("; ")}` : "";
  const person = roles.includes("acquired") && isPerson(g.acquiring) ? " The acquiring person is an individual, whose filing is usually a purchase of the company's own voting securities above the filing threshold." : "";
  return `Transaction ${g.number}: acquiring person ${named(g.acquiring) || "not given"}${via}; acquired person ${named(g.acquired) || "not given"}${ents} (the company as ${as}).${person}`;
}

/**
 * The company's grants as timeline events, newest first, from `from`, its first price: one row a day,
 * each transaction with its number and its parties as the notice writes them.
 */
export function hsrEvents(
  grants: readonly HsrGrant[],
  namesIn: (year: number) => string[],
  { cik, from = "", namesOn }: { cik: number | string; from?: string; namesOn?: (day: string) => string[] },
): TimelineEvent[] {
  const tag = Number(cik);
  const byYear = new Map<number, string[]>();
  const yearNames = (year: number) => byYear.get(year) ?? byYear.set(year, namesIn(year)).get(year)!;
  const byDay = new Map<string, { g: HsrGrant; roles: HsrRole[] }[]>();
  for (const g of grants) {
    if (g.day < from) continue;
    const roles = hsrRoles(g, tag, () => [...yearNames(Number(g.day.slice(0, 4))), ...(namesOn?.(g.day) ?? [])]);
    if (!roles.length) continue;
    (byDay.get(g.day) ?? byDay.set(g.day, []).get(g.day)!).push({ g, roles });
  }
  return [...byDay.entries()]
    .sort(([x], [y]) => y.localeCompare(x))
    .map(([day, found]) => {
      const sorted = [...found].sort((a, b) => a.g.number.localeCompare(b.g.number));
      const one = sorted[0];
      const personsBuy = sorted.length === 1 && one.roles.includes("acquired") && isPerson(one.g.acquiring);
      const title =
        sorted.length === 1
          ? `FTC and Justice Department ended the merger waiting period early on ${hsrPhrase(one.g)}${personsBuy ? ", an individual's filing" : ""}`
          : `FTC and Justice Department ended the merger waiting period early on ${sorted.length} transactions: ${sorted
              .slice(0, 2)
              .map((x) => hsrPhrase(x.g))
              .join("; ")}${sorted.length > 2 ? `; and ${sorted.length - 2} more` : ""}`;
      const lines = sorted.slice(0, SHOWN).map((x) => grantLine(x.g, x.roles));
      const more = sorted.length > SHOWN ? ` And ${sorted.length - SHOWN} more: ${sorted.slice(SHOWN).map((x) => x.g.number).join(", ")}.` : "";
      const notices = [...new Set(sorted.map((x) => `${x.g.notice} of ${x.g.published}`))].join(", ");
      const text =
        "The Federal Trade Commission and the Justice Department's Antitrust Division granted early termination of the Hart-Scott-Rodino waiting period, so the parties could close without waiting it out; the notice does not say the deal closed, its terms or its value. " +
        `${lines.join(" ")}${more} Federal Register notice ${notices}.`;
      const basis = `hsr:${tag}@${day}`;
      return {
        id: `hsr-${tag}-${day}`,
        date: day,
        type: "regulation" as const,
        title: title.length <= 300 ? title : `${title.slice(0, 299).replace(/\s+\S*$/, "")}…`,
        description: text.length <= LIMIT ? text : `${text.slice(0, LIMIT - 1).replace(/\s+\S*$/, "")}…`,
        source: "Federal Trade Commission",
        url: noticePage(one.g.notice),
        sourceKey: "hsr_early" as const,
        // the day's transaction numbers, compared as a set by "Also on" (lib/alsoOn.ts)
        externalId: sorted.map((x) => x.g.number).join(","),
        dedupBasis: basis,
      };
    });
}
