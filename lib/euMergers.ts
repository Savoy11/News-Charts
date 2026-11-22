import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { named, partyIsCompany } from "./hsrEarly";
import type { TimelineEvent } from "./types";

/**
 * The European Commission's merger reviews, 1990–2026 (batch 174, the 2026-11-22b proposal 3, approved by the owner
 * that day with its recommended call (a): a row on the notification's day, the Commission's clearance, where its
 * non-opposition notice is published, a line on that row).
 *
 * A concentration above the EU's thresholds is notified to the Commission, which publishes each notification in the
 * Official Journal ("Prior notification of a concentration (Case M.5529 — Oracle/Sun Microsystems)") and, where it
 * clears the deal in its first phase, a notice of non-opposition. The titles name the parties by short names
 * ("Merck/Sigma-Aldrich" is Merck KGaA's, not Merck & Co.'s), so a title alone never makes a row: each candidate's
 * text is read, and its first paragraph's full names decide ("by which the undertaking Merck KGaA ('Merck', Germany)
 * acquires … control of the whole of Sigma-Aldrich Corporation").
 *
 * The notices: the EU Publications Office's SPARQL endpoint, asked year by year for the Official Journal's English
 * notices of each kind (`noticeQuery`), 10,290 notifications from 1990-10-09 and 8,523 notices of non-opposition, nearly
 * all from 2000; each candidate's text from the Publications Office's document store, CELLAR (`cellarText`): its XHTML
 * since 2004, its PDF before, read with pdftotext. `npm run sync:eu-mergers` reads them into the committed
 * `data/eu-mergers.json.gz`, asking only for notices the file does not hold. Ingest asks nothing.
 *
 * A candidate is a notification whose title names, as one of its parties, exactly one of a company's names of the year
 * or aliases (`titleKeys`), or whose title names no party. A party in the text is the company's by the merger notices'
 * rule (`partyIsCompany`): the caption rule under its names of the year, the release map's units, EPA's and the CPSC's
 * units, the table of taken names and the first price; and `NOT_THE_COMPANY` here.
 *
 * Licence: EUR-Lex's legal notice (eur-lex.europa.eu/content/legal-notice/legal-notice.html, read 2026-11-22):
 * "© European Union, 1998-2026. The Commission's document reuse policy is based on Decision 2011/833/EU. Unless
 * otherwise specified, you can re-use the legal documents published in EUR-Lex for commercial or non-commercial
 * purposes." The credit reads "© European Union, https://eur-lex.europa.eu".
 */

export const EU_SPARQL = "https://publications.europa.eu/webapi/rdf/sparql";
export const EU_MERGERS_DATA = join(__dirname, "..", "data", "eu-mergers.json.gz");
/** A notice's page at EUR-Lex, which a row links to. */
export const eurLexPage = (work: string) => `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELLAR:${work}`;
/** A notice in the Publications Office's document store, asked by format (`cellarText`). */
export const cellarWork = (work: string) => `http://publications.europa.eu/resource/cellar/${work}`;

export type NoticeKind = "notification" | "nonopposition";
const PHRASE: Record<NoticeKind, string> = { notification: "prior notification of a concentration", nonopposition: "non-opposition to a notified concentration" };

/** The endpoint's query for one year's English notices of a kind, each with its formats; a year holds under 5,000. */
export function noticeQuery(kind: NoticeKind, year: number): string {
  return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?w ?d ?t (GROUP_CONCAT(DISTINCT ?mt; separator=",") AS ?types) WHERE {
  ?e cdm:expression_title ?t .
  ?t bif:contains '"${PHRASE[kind]}"' .
  ?e cdm:expression_belongs_to_work ?w .
  ?e cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
  ?w cdm:work_date_document ?d .
  FILTER(?d >= "${year}-01-01"^^xsd:date && ?d <= "${year}-12-31"^^xsd:date)
  OPTIONAL { ?m cdm:manifestation_manifests_expression ?e . ?m cdm:manifestation_type ?mt . }
} GROUP BY ?w ?d ?t ORDER BY ?d ?w LIMIT 5000`;
}
export const noticeQueryUrl = (kind: NoticeKind, year: number) =>
  `${EU_SPARQL}?${new URLSearchParams({ query: noticeQuery(kind, year), format: "application/sparql-results+json", timeout: "120000" })}`;

/** A notice as the endpoint lists it. */
export interface EuListed {
  /** the CELLAR work's id, "1dc6fc28-ed6f-11e4-892c-01aa75ed71a1" */
  work: string;
  /** the Official Journal's day */
  published: string;
  title: string;
  /** the formats it is held in: "xhtml", "pdf", "pdfa1b", "print"… */
  types: string[];
}

/** The endpoint's answer for a year, as notices. */
export function listedNotices(answer: unknown): EuListed[] {
  const rows = (answer as { results?: { bindings?: Record<string, { value: string }>[] } }).results?.bindings ?? [];
  return rows.map((b) => ({
    work: b.w.value.replace(/^.*\/cellar\//, ""),
    published: b.d.value.slice(0, 10),
    title: b.t.value.replace(/\s+/g, " ").trim(),
    types: (b.types?.value ?? "").split(",").filter(Boolean).sort(),
  }));
}

/**
 * A notice's case number, "M.877" from "Case No IV/M.877", "IV/M 004", "COMP/M.3083" or "M.12513"; a bracket that opens on
 * the number writes no "Case" ("(M.6968 — Lufthansa/CAE/JV)"), and a notice of two cases says "Cases" (batch 175).
 */
export function caseOf(title: string): string | null {
  const m = /(?:\bCases?\b[^)]*?|\(\s*)\bM\s*[./]?\s*0*(\d{1,6})\b/i.exec(title);
  return m ? `M.${Number(m[1])}` : null;
}

/** The parties a title names after its case number, by their short names: "Boeing/McDonnell Douglas". */
export function titleParties(title: string): string[] {
  const m = /(?:\bCases?\b[^—–-]*?|\(\s*)\bM\s*[./]?\s*\d{1,6}\s*(?:[—–-]+|\s)\s*(.+)$/i.exec(title);
  if (!m) return [];
  // the parties run to the bracket closing the case; a party's own brackets ("BSA (LACTALIS)") are kept
  let depth = 1;
  let end = m[1].length;
  for (let i = 0; i < m[1].length; i++) {
    if (m[1][i] === "(") depth++;
    else if (m[1][i] === ")" && --depth === 0) {
      end = i;
      break;
    }
  }
  return m[1]
    .slice(0, end)
    .split(/\s*\/\s*/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p && !/^(?:JV|joint venture|NewCo|Newco)$/i.test(p));
}

/** A name as a title's party is compared: its letters and digits, "&" read as "and", a legal word off its end. */
export const titleKey = (x: string) =>
  x
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/,?\s+(?:inc|corp|corporation|company|co|ltd|limited|plc|ag|s\.?a|n\.?v|se|llc|l\.?p|group|holdings?)\.?$/i, "")
    .replace(/[^a-z0-9]/g, "");

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** A notice's text as one line: tags off, entities read, a word a line's end broke joined again, every space one. */
export function noticeText(raw: string, kind: "xhtml" | "pdf"): string {
  let t = raw;
  if (kind === "xhtml") {
    t = t.replace(/<(?:script|style)[^>]*>[\s\S]*?<\/(?:script|style)>/gi, " ").replace(/<[^>]+>/g, " ");
    t = t.replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  } else {
    // a word the PDF broke at a line's end: "Regu-\nlation", and a soft hyphen there
    t = t.replace(/(\p{Ll})[-\u00ad]\s*\n\s*(\p{Ll})/gu, "$1$2");
    // the Official Journal's PDFs of 1998–2000 set a thin space as "Ø", "&" as "@" and a footnote's figures as "Î", "Ï"
    if (/\d\s?Ø\s?\(/.test(t)) t = t.replace(/[ØÙÚ]/g, " ").replace(/(\S)\s*@\s*(\S)/g, "$1 & $2").replace(/\(([ÎÏÐ])\)/g, (_, c: string) => `(${"ÎÏÐ".indexOf(c) + 1})`);
  }
  return t.replace(/\u00ad/g, "").replace(/\s+/g, " ").trim();
}

/**
 * The notice's first paragraph: from the day the Commission received the notification to its second paragraph. An older
 * PDF can print several notices on one page ("Telia/Telenor" above "Exxon/Mobil"), so the search begins at the notice's
 * own case number where it is given and printed.
 */
export function firstParagraph(whole: string, caseNo?: string | null): string | null {
  const n = caseNo ? /^M\.(\d+)$/.exec(caseNo)?.[1] : null;
  const at = n ? new RegExp(`\\bM\\s*[./]?\\s*0*${n}\\b`).exec(whole)?.index ?? -1 : -1;
  const text = at >= 0 ? whole.slice(at) : whole;
  const start =
    /\bOn\s+\S{1,3}\s+\p{L}+\s+\d{4}\s*,?\s+the\s+(?:European\s+)?Commission\s+received\b/iu.exec(text) ?? /\bthe\s+(?:European\s+)?Commission\s+received\s+(?:a\s+)?notification\b/i.exec(text);
  if (!start) return null;
  const rest = text.slice(start.index);
  const end = /\s2\s?\.\s+(?=The\b|For\b|—|-|On\b)|\s(?=The\s+business\s+activities\b)/.exec(rest);
  return (end ? rest.slice(0, end.index) : rest.slice(0, 1600)).trim();
}

/** The day the Commission received the notification, as the first paragraph gives it. */
export function notifiedOn(para: string): string | null {
  const m = /\bOn\s+(\d{1,2})\s+(\p{L}+)\s+(\d{4})/iu.exec(para);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  if (month < 0 || Number(m[1]) < 1 || Number(m[1]) > 31) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export type EuRole = "acquiring" | "acquired" | "selling" | "merging" | "party";

export interface EuParty {
  /** the full name the notice gives: "Merck KGaA" */
  name: string;
  /** its short name and country, where the notice gives them: "Merck", "Germany" */
  short?: string;
  country?: string;
  role: EuRole;
}

/** A word a name is made of, or one that joins two of them ("Bank of America", "Procter & Gamble"). */
const NAME_WORD = /^(?:[\p{Lu}\d][\p{L}\d.'’&+\-/!]*|&|\+|of|and|de|des|du|der|den|di|da|do|dos|das|für|fur|y|et|la|le|les|van|von|zu|am|an|for|the|in|on|a\.s\.|s\.a\.|plc|AG|e\.V\.)$/u;
const CONNECTOR = /^(?:&|\+|of|and|de|des|du|der|den|di|da|do|dos|das|für|fur|y|et|la|le|les|van|von|zu|am|an|for|the|in|on)$/;
const LEGAL_TAIL = /^(?:Inc|Incorporated|Corp|Corporation|Co|Company|Ltd|Limited|LLC|L\.?L\.?C|LP|L\.?P|plc|PLC|AG|SE|S\.?A|S\.?p\.?A|N\.?V|B\.?V|GmbH|KGaA|AB|ASA|A\/S|Oyj|S\.?à\s?r\.?l|Sarl|SAS|S\.?A\.?S|SL|S\.?L|SRL|S\.?r\.?l|Holdings?|Group)\.?$/i;

/** The name written just before a bracket: the longest run of a name's words ending there, a legal word after a comma kept. */
function nameBefore(text: string): string {
  const words = text.trim().replace(/[,;:]$/, "").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i].replace(/^[(“"‘']+/, "");
    const bare = w.replace(/,$/, "");
    if (!w) break;
    // a legal word after a comma belongs to the name before it: "Sun Microsystems, Inc."
    if (w.endsWith(",") && out.length && LEGAL_TAIL.test(out[0].replace(/[.,]$/, ""))) {
      out.unshift(w);
      continue;
    }
    if (w.endsWith(",") || w.endsWith(";")) break;
    if (!NAME_WORD.test(bare)) break;
    out.unshift(bare);
  }
  while (out.length && CONNECTOR.test(out[0])) out.shift();
  while (out.length && CONNECTOR.test(out[out.length - 1])) out.pop();
  return out.join(" ").replace(/^The\s+(?=undertaking)/i, "");
}

/**
 * The names a list after "undertakings" gives, "A, B and C", where every item ends in a legal word ("Bayer AG", "Infraserv
 * GmbH & Co. Höchst KG"); none where any item does not, so a name holding a comma or "and" is read whole by `nameBefore`.
 */
function legalList(before: string): string[] {
  const m = /\bundertakings\s+([^()]+?)\s*$/i.exec(before);
  if (!m || !/\sand\s/.test(m[1])) return [];
  const items = m[1].replace(/[,;:]$/, "").split(/\s*,\s+|\s+and\s+/).map((x) => x.trim());
  const legal = (x: string) => LEGAL_TAIL.test(x.split(/\s+/).at(-1)!) || /\s(?:KG|OHG|KK)$/.test(x);
  if (items.length < 2 || !items.every((x) => /^\p{Lu}/u.test(x) && x.split(/\s+/).length >= 2 && legal(x))) return [];
  return items;
}

/** The words before a party that make it the seller of what is acquired: "… the worldwide business of", "parts of", "assets of". */
const SELLER = /\b(?:business(?:es)?|activit(?:y|ies)|assets?|division|divisions|parts?|units?|operations?|interests?|subsidiar(?:y|ies)|portfolio|segment|brands?|plants?|sites?|stations?|refinery|branch(?:es)?)\b[^()]{0,60}?\b(?:of|from|owned by|belonging to)\s+(?:the\s+)?(?:undertakings?\s+)?$/i;

/** A paragraph's sentences, never cut at a legal word's or an initial's full stop ("Broadcom Inc. acquires", "J. P. Morgan"). */
function sentencesOf(para: string): { text: string; at: number }[] {
  const out: { text: string; at: number }[] = [];
  let from = 0;
  for (const m of para.matchAll(/[.;](?=\s|$)/g)) {
    const word = /(\S+)$/.exec(para.slice(from, m.index!))?.[1] ?? "";
    if (m[0] === "." && (/^(?:Inc|Co|Corp|Ltd|Bros|St|No|Nos|Art|Mr|Dr|Jr|Sr|S\.A|N\.V|B\.V|S\.p\.A|L\.P|U\.S|e\.g|i\.e|etc|plc|AG|Sarl|Cie|Ste|LLC|L\.L\.C|Pty|Bhd|AB|ASA|SE|GmbH|KGaA|SpA|SA|NV|BV)$/i.test(word) || /^\p{Lu}$/u.test(word) || /^(?:\p{Lu}\.)+\p{Lu}?$/u.test(word))) continue;
    out.push({ text: para.slice(from, m.index! + 1), at: from });
    from = m.index! + 1;
  }
  if (from < para.length) out.push({ text: para.slice(from), at: from });
  return out.filter((x) => x.text.trim());
}

/** A name the notice's address or its own office gives, never a party's: "Directorate-General for Competition (DG IV)". */
const OFFICE = /^(?:Directorate|DG\b|B-\d|European Commission|Commission|Merger Task Force|Registry)/i;

/** A bracket's content that is no party's: a footnote, an article's letters, a regulation's, a quotation of a term. */
const NOT_A_PARTY = /^(?:\s*\d+\s*|[a-z]|[ivx]+|EEC|EC|EU|EEA|the\s.*|‘?the\s.*|‘?Merger Regulation’?|‘?Regulation’?)$/i;
/** The words before a bracket that make it no party's. */
const NOT_A_NAME = /^(?:Article|Articles|Regulation|No|Nos|Council|Commission|Directive|Decision|EEC|EC|Case|JV|Joint Venture|Newco|NewCo|a|an)$/i;

/**
 * The parties a first paragraph names, each with its part in the deal. Every "Name ('Short', Country)" (or the 1990s'
 * "Name (Short)") is a party; one written before the verb of the sentence that acquires or merges ("by which the
 * undertaking Merck KGaA … acquires", "NVIDIA enters into a full merger") is acquiring, one after its "control of" or
 * "with" acquired, and a controller ("controlled by Alphabet Inc.") takes the part of the party it controls.
 */
export function noticeParties(para: string): EuParty[] {
  const groups: { name: string; short?: string; country?: string; at: number; end: number; controller: boolean }[] = [];
  const re = /\(([^()]{1,90})\)/g;
  let prevEnd = 0;
  for (const m of para.matchAll(re)) {
    const inner = m[1].trim();
    const before = para.slice(prevEnd, m.index!);
    prevEnd = m.index! + m[0].length;
    if (NOT_A_PARTY.test(inner) || /^\d/.test(inner) || /^\(?[a-z]\)?$/.test(inner)) continue;
    // "belonging to the ExxonMobil group ('ExxonMobil', USA)": a group named in lower case is its name's
    const grouped = /([\p{Lu}][\p{L}\d&.\-]*(?:\s+[\p{Lu}][\p{L}\d&.\-]*){0,3})\s+group\s*$/u.exec(before);
    // "the undertakings Bayer AG, Deutsche Telekom AG and Infraserv GmbH & Co. Höchst KG (Infraserv)": each of a list whose every
    // item ends in a legal word is a party, the bracket the last one's (batch 175)
    const listed = grouped ? [] : legalList(before);
    const name = grouped ? `${grouped[1]} Group` : listed.length ? listed.at(-1)! : nameBefore(before.replace(/.*\bundertakings?\s+/i, ""));
    // a regulation's number before a footnote's star is no party: "(EEC) No 4064/89 (*)"
    if (!name || NOT_A_NAME.test(name) || OFFICE.test(name) || !/\p{Lu}/u.test(name) || /^(?:Article|Regulation)\b|^Nos?\s+\d|\b\d{3,4}\s?\/\s?(?:\d{2}|\d{4})\b/i.test(name) || /^\*+$/.test(inner)) continue;
    const q = /^[‘'"“]([^’'"”]{1,60})[’'"”]\s*,?\s*(.*)$/.exec(inner);
    const short = q ? q[1].trim() : /^[\p{Lu}\d][\p{L}\d&.\- ]{0,30}$/u.test(inner) && !/\b(?:States|Kingdom|Republic|Germany|France|Italy|Spain|Netherlands|Japan|China|USA|UK)\b/.test(inner) ? inner : undefined;
    const country = q ? q[2].replace(/^the\s+/i, "").trim() || undefined : short ? undefined : inner.replace(/^the\s+/i, "");
    const lead = before.slice(0, Math.max(0, before.lastIndexOf(grouped ? grouped[1] : name.split(" ")[0])));
    // the list's other items, each a party of its own before the one the bracket follows
    for (const other of listed.slice(0, -1)) groups.push({ name: other, at: m.index! - before.length + Math.max(0, before.lastIndexOf(other)), end: prevEnd, controller: false });
    groups.push({
      name,
      short,
      country,
      at: m.index! - (before.length - lead.length),
      end: prevEnd,
      controller: /\b(?:(?:jointly|solely|ultimately|indirectly|wholly)\s+)?(?:controlled|owned)\s+(?:(?:ultimately|indirectly|jointly|solely)\s+)?by\s*(?:the\s+)?$|\bpart\s+of\s+the\s*$|\bbelonging\s+to\s+(?:the\s+)?$|\bsubsidiary\s+of\s+(?:the\s+)?$/i.test(lead.trimEnd() + " "),
    });
  }
  // the sentence that acquires or merges, and its parts
  const verb = /\b(?:acquires?|acquiring|merges?|enter(?:s)? into a full merger|will merge)\b/i;
  const sentences = sentencesOf(para);
  const act = sentences.find((s) => verb.test(s.text) && /control|merge|merger/i.test(s.text)) ?? sentences.find((s) => verb.test(s.text));
  const out: EuParty[] = [];
  const mentioned = (g: (typeof groups)[number], text: string) =>
    [g.name, g.short].filter((x): x is string => !!x && x.length >= 2).some((x) => new RegExp(`(?:^|[^\\p{L}\\d])${x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\d])`, "u").test(text));
  let last: EuRole = "party";
  for (const g of groups) {
    let role: EuRole = "party";
    if (act) {
      const v = verb.exec(act.text)!;
      const vAt = act.at + v.index;
      const merger = /merge/i.test(v[0]);
      const obj = merger ? /\bwith\b/i.exec(act.text.slice(v.index)) : /\bcontrol\s+of\b|\binterest\s+in\b|\bshares\s+(?:of|in)\b|\bassets\s+of\b/i.exec(act.text.slice(v.index));
      const objAt = obj ? vAt + obj.index : Infinity;
      // the subject is what the sentence says after the last party listed before its verb: "— MGM Holdings Inc. ('MGM', USA) Amazon will acquire"
      const listedEnd = Math.max(act.at, ...groups.filter((x) => x.end <= vAt).map((x) => x.end));
      const subject = para.slice(listedEnd, vAt);
      const object = obj ? para.slice(objAt, act.at + act.text.length) : "";
      if ((g.at >= listedEnd && g.at < vAt) || mentioned(g, subject)) role = merger ? "merging" : "acquiring";
      else if ((g.at >= objAt && g.at < act.at + act.text.length) || (obj && mentioned(g, object))) {
        // "control of the consumer health business of Merck KGaA", "of parts of ConocoPhillips": the business is acquired, its owner sells
        const lead = para.slice(Math.max(objAt, g.at - 120), g.at);
        role = merger ? "merging" : SELLER.test(lead) ? "selling" : "acquired";
      }
      // the older form names the acquirers after "by which", the sentence's start
      if (role === "party" && g.at < vAt && /\bby\s+which\b/i.test(para.slice(0, g.at)) && !/\bconcerns\s+the\s+following\b/i.test(para)) role = merger ? "merging" : "acquiring";
    }
    if (g.controller && role === "party") role = last;
    out.push({ name: g.name, ...(g.short ? { short: g.short } : {}), ...(g.country ? { country: g.country } : {}), role });
    last = role;
  }
  // a notice that writes no bracket after its parties ("by which the undertaking Walmart Stores Inc., acquires … control of the
  // whole of the undertaking ASDA Group plc"): the subject's and the object's names as written
  if (act && !out.some((p) => p.role !== "party")) {
    const v = verb.exec(act.text)!;
    const merger = /merge/i.test(v[0]);
    const subj = act.text.slice(0, v.index).replace(/^.*?\bby\s+which\s+/i, "").replace(/^(?:the\s+)?(?:[\p{Ll}]+\s+)*?(?:undertakings?|compan(?:y|ies)|groups?)\s+/iu, "");
    const objM = (merger ? /\bwith\s+(.*)$/i : /\bcontrol\s+of\s+(?:the\s+whole\s+of\s+|parts?\s+of\s+)?(?:the\s+(?:[\p{Ll}]+\s+)?undertakings?\s+)?(.*)$/iu).exec(act.text.slice(v.index));
    const obj = objM ? objM[1].replace(/\s*(?:,|\bby\s+way\b|\bthrough\b|\(|\.\s*$).*$/i, "") : "";
    const plain = (phrase: string) =>
      phrase
        .split(/\s*,\s*(?!(?:Inc|Corp|Ltd|plc|AG|SA|NV)\b)|\s+and\s+(?=(?:the\s+)?\p{Lu})/u)
        .map((x) => nameBefore(x.replace(/^(?:the\s+)?/i, "").replace(/,\s*$/, "")))
        .filter((x) => x && /\p{Lu}/u.test(x) && !NOT_A_NAME.test(x) && !OFFICE.test(x));
    for (const n of plain(subj)) out.push({ name: n, role: merger ? "merging" : "acquiring" });
    for (const n of plain(obj)) out.push({ name: n, role: merger ? "merging" : "acquired" });
  }
  // a name given twice (the list and the sentence) is one party, its first part kept unless it was none
  const merged = new Map<string, EuParty>();
  for (const p of out) {
    const k = p.name.toLowerCase();
    const had = merged.get(k);
    if (!had) merged.set(k, p);
    else if (had.role === "party" && p.role !== "party") had.role = p.role;
  }
  return [...merged.values()];
}

/** A notice the list holds that is no notification of its own: a corrigendum to one. */
export const isCorrigendum = (title: string) => /^\s*Corrigend/i.test(title);

/** A notification as the committed file holds it, with what its text gives where it was read. */
export interface EuNotification {
  work: string;
  published: string;
  title: string;
  /** "M.5529" */
  case: string | null;
  /** the day the Commission received it, from its text */
  day: string | null;
  /** its first paragraph, as read; "" where its text gave none */
  para: string;
  parties: EuParty[];
  /** whether its text was read */
  read: boolean;
}

/** A notice of non-opposition, the Commission's clearance in its first phase. */
export interface EuClearance {
  work: string;
  published: string;
  case: string;
}

/** The committed file's columns: a listed notice's, and a read text's. */
export const LIST_COLUMNS = ["work", "published", "title", "types"] as const;
export const TEXT_COLUMNS = ["work", "day", "para", "parties"] as const;

let cached: { path: string; notifications: EuNotification[]; clearances: EuClearance[] } | null = null;

/** Every notification and clearance in the committed file, read once a process. */
export function euMergers(path = EU_MERGERS_DATA): { notifications: readonly EuNotification[]; clearances: readonly EuClearance[] } {
  if (cached?.path === path) return cached;
  const body = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as {
    notifications: unknown[][];
    nonopposition: unknown[][];
    texts: unknown[][];
  };
  const texts = new Map(body.texts.map((r) => [String(r[0]), { day: (r[1] as string | null) ?? null, para: String(r[2] ?? ""), parties: (r[3] as EuParty[]) ?? [] }]));
  const notifications = body.notifications.map((r) => {
    const [work, published, title] = r.map(String);
    const t = texts.get(work);
    return { work, published, title, case: caseOf(title), day: t?.day ?? null, para: t?.para ?? "", parties: t?.parties ?? [], read: !!t };
  });
  const clearances = body.nonopposition.flatMap((r) => {
    const c = caseOf(String(r[2]));
    return c ? [{ work: String(r[0]), published: String(r[1]), case: c }] : [];
  });
  cached = { path, notifications, clearances };
  return cached;
}

/** The first clearance of a case published on or after its notification. */
export function clearanceOf(n: Pick<EuNotification, "case" | "published">, clearances: readonly EuClearance[]): EuClearance | null {
  if (!n.case) return null;
  return clearances.filter((c) => c.case === n.case && c.published >= n.published).sort((a, b) => a.published.localeCompare(b.published))[0] ?? null;
}

/**
 * Parties the rule would give a company that are not its, by CIK, read by hand (batch 174) among every party a replay
 * of every notification read against every listed company matched; one with `from` only on and after that day, a name
 * another company took up after the record's own company had given it up (batch 175).
 */
export const NOT_THE_COMPANY: Readonly<Record<number, { ticker: string; party: RegExp; country?: RegExp; from?: string; why: string }[]>> = {
  33213: [{ ticker: "EQT", party: /^EQT\s+(?:AB|Partners|Fund|Infrastructure|Mid\s+Market|Holdings|Management|[IVX]+\b|\d)/i, why: "EQT AB, the Swedish investment firm, and its funds, not EQT Corporation, the American gas producer" }],
  1109345: [{ ticker: "NVMI", party: /^NOVA(?:\s+(?:Corporation|Chemicals?)\b.*)?$/i, why: "NOVA Corporation of Calgary, NOVA Chemicals' parent of the 1990s, and NOVA Chemicals, not Nova Ltd., the Israeli metrology maker" }],
  1563190: [{ ticker: "COMP", party: /^Compass\s+(?:plc|Group)\b/i, why: "Compass Group plc, the British caterer, not Compass, Inc., the American real-estate broker" }],
  1666175: [{ ticker: "FTS", party: /^Fortis\b(?!\s+Inc)/i, why: "Fortis, the Belgian and Dutch bank and insurer of 1990–2009 (Fortis AG, Fortis N.V., Fortis Amev), not Fortis Inc., the Canadian utility" }],
  832101: [{ ticker: "IEX", party: /^Idex\s+S\.?\s?A\b/i, why: "Idex SA, the French energy services group, not IDEX Corporation of Northbrook, Illinois" }],
  1880661: [{ ticker: "TPG", party: /^TPG\s+N\.?\s?V\b/i, why: "TPG N.V., the Dutch post and express group (TNT Post Group), not TPG Inc., the American investment firm" }],
  1841666: [{ ticker: "APA", party: /^APA\b/i, country: /Australia/i, why: "APA Group, the Australian pipeline owner, not APA Corporation, Apache's holding company" }],
  1802883: [{ ticker: "API", party: /^Agora\s+S\.?\s?p\.?\s?A\b/i, why: "Agora SpA, the Italian company, not Agora, Inc., the Chinese video platform listed in New York" }],
  1341766: [{ ticker: "CELH", party: /^Celsius\s+AB\b/i, why: "Celsius AB, the Swedish defence group Saab bought in 2000, not Celsius Holdings, the energy-drink maker" }],
  1289877: [{ ticker: "SFL", party: /^SFL\b/i, country: /France/i, why: "SFL, Société Foncière Lyonnaise, the Paris property company, not SFL Corporation, the Bermuda shipowner" }],
  102752: [{ ticker: "VSEC", party: /^VSE\s+AG\b/i, why: "VSE AG, the German company, not VSE Corporation of Alexandria, Virginia" }],
  2073643: [{ ticker: "METRY", party: /^Metro\s+(?:AG|Group|Cash)\b/i, why: "Metro AG, the German wholesaler, not Metro Inc., the Canadian grocer" }],
  1038143: [{ ticker: "FNCTF", party: /^Orange\s+plc\b/i, why: "Orange plc, the British mobile operator France Télécom bought in 2000 and whose brand it took as its name in 2013, not Orange S.A.'s own past" }],
  2125056: [{ ticker: "WELA", party: /^Wella\s+(?:AG|Aktiengesellschaft)\b/i, why: "Wella AG of Darmstadt, which Procter & Gamble bought in 2003, not The Wella Company spun off from Coty" }],
  // the record's own filings: its depositary's amendment filed 2017-09-01 (0001193805-17-001614) is the first to name the issuer
  // Standard Life Aberdeen plc, the name the merger with Aberdeen Asset Management gave it; EDGAR's record never took the new name
  1370418: [
    {
      ticker: "SLFPY",
      party: /^Standard\s+Life(?:\s+(?:plc|PLC|p\.l\.c\.))?$/,
      from: "2017-09-01",
      why: "Standard Life plc of 2026, a different company that took up the name (M.12645: Standard Life Assurance Limited its subsidiary), not the Standard Life of this record, Standard Life Aberdeen since 2017, abrdn and then Aberdeen Group",
    },
  ],
};

/** Whether a party a notification names is the company on its day. */
export function euPartyIsCompany(party: EuParty, day: string, cik: number, names: () => string[]): boolean {
  return partyIsCompany(party.name, day, cik, names, (p) => !!NOT_THE_COMPANY[cik]?.some((r) => r.party.test(p) && (!r.country || r.country.test(party.country ?? "")) && (!r.from || day >= r.from)));
}

/** The notification's parties that are the company on its day. */
export function euRoles(n: EuNotification, cik: number, names: () => string[]): EuParty[] {
  const day = n.day ?? n.published;
  return n.parties.filter((p) => euPartyIsCompany(p, day, cik, names));
}

const DAY = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]} ${dd}, ${y}`;
};
const possessive = (p: string) => (/s$/i.test(p) ? `${p}'` : `${p}'s`);
const list = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, 2).join(", ")} and ${xs.length - 2} others`);

/** What a notification says was notified, in a row's words: "Oracle Corporation's acquisition of Sun Microsystems, Inc.". */
export function concentration(n: Pick<EuNotification, "title" | "parties">): string {
  const by = (r: EuRole) => n.parties.filter((p) => p.role === r).map((p) => named(p.name));
  const acquiring = by("acquiring");
  const acquired = by("acquired");
  const selling = by("selling");
  const merging = by("merging");
  if (merging.length >= 2) return `the merger of ${list(merging)}`;
  if (acquiring.length && acquired.length) return `${possessive(list(acquiring))} acquisition of ${list(acquired)}`;
  if (acquiring.length && selling.length) return `${possessive(list(acquiring))} acquisition of part of ${list(selling)}`;
  if (acquiring.length >= 2) return `${possessive(list(acquiring))} acquisition of joint control of a joint venture`;
  const short = titleParties(n.title);
  return short.length ? `the concentration ${short.join("/")}` : "a concentration";
}

const ROLE: Record<EuRole, string> = { acquiring: "an acquirer", acquired: "the undertaking acquired", selling: "the seller of the business acquired", merging: "a party to the merger", party: "a party" };
const LIMIT = 900;

/**
 * The company's notified concentrations as timeline events, newest first, from `from`, its first price: one row a
 * company a day, the day the Commission received the notification (its publication's where the text gives none),
 * each with the Commission's clearance as a line where its notice of non-opposition is published.
 */
export function euEvents(
  notifications: readonly EuNotification[],
  clearances: readonly EuClearance[],
  namesIn: (year: number) => string[],
  { cik, from = "", namesOn }: { cik: number | string; from?: string; namesOn?: (day: string) => string[] },
): TimelineEvent[] {
  const tag = Number(cik);
  const byYear = new Map<number, string[]>();
  const yearNames = (year: number) => byYear.get(year) ?? byYear.set(year, namesIn(year)).get(year)!;
  const byDay = new Map<string, { n: EuNotification; mine: EuParty[] }[]>();
  const seen = new Set<string>();
  for (const n of notifications) {
    if (!n.read || !n.parties.length) continue;
    const day = n.day ?? n.published;
    if (day < from) continue;
    const mine = euRoles(n, tag, () => [...yearNames(Number(day.slice(0, 4))), ...(namesOn?.(day) ?? [])]);
    if (!mine.length) continue;
    // a case notified twice on one day is one notification
    const key = `${n.case ?? n.work}@${day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (byDay.get(day) ?? byDay.set(day, []).get(day)!).push({ n, mine });
  }
  const rows: TimelineEvent[] = [];
  for (const [day, found] of byDay) {
    const sorted = [...found].sort((a, b) => (a.n.case ?? "").localeCompare(b.n.case ?? "", "en", { numeric: true }));
    const one = sorted[0].n;
    const ref = (n: EuNotification) => (n.case ? ` (${n.case})` : "");
    const title =
      sorted.length === 1
        ? `European Commission received notification of ${concentration(one)}${ref(one)}`
        : `European Commission received ${sorted.length} notifications naming the company: ${sorted.map((x) => `${concentration(x.n)}${ref(x.n)}`).join("; ")}`;
    const lines = sorted.map(({ n, mine }) => {
      const c = clearanceOf(n, clearances);
      const when = n.day ? `received on ${DAY(n.day)}, published in the Official Journal on ${DAY(n.published)}` : `published in the Official Journal on ${DAY(n.published)}`;
      const cleared = c ? ` The Commission's decision not to oppose it was published on ${DAY(c.published)}.` : "";
      return `${n.case ?? "A notification"}, ${when}: the company is ${mine.map((p) => `${ROLE[p.role]} (${named(p.name)})`).join(" and ")}.${cleared}`;
    });
    const text =
      "A concentration notified to the European Commission under the EU Merger Regulation; a notification is not a clearance or a closing, and a deal can be withdrawn or prohibited after it. " +
      lines.join(" ");
    rows.push({
      id: `eu-merger-${tag}-${day}`,
      date: day,
      type: "regulation",
      title: title.length <= 300 ? title : `${title.slice(0, 299).replace(/\s+\S*$/, "")}…`,
      description: text.length <= LIMIT ? text : `${text.slice(0, LIMIT - 1).replace(/\s+\S*$/, "")}…`,
      source: "European Commission, Official Journal (© European Union)",
      url: eurLexPage(one.work),
      sourceKey: "eu_mergers",
      // the day's case numbers, compared as a set by "Also on" (lib/alsoOn.ts)
      externalId: sorted.map((x) => x.n.case ?? x.n.work).join(","),
      dedupBasis: `eu-merger:${tag}@${day}`,
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
