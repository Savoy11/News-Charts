import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { named as shown, noticeLines, noticePage, partyIsCompany, tidy } from "./hsrEarly";
import type { TimelineEvent } from "./types";

/**
 * The International Trade Commission's Section 337 investigations, 1995–2026 (batch 167, the 2026-11-22
 * proposal 2, approved by the owner that day with its recommended call: a second row on the day of the
 * Commission's final determination, with the exclusion order where it issued one, and a settlement or a
 * withdrawal a line on the institution row).
 *
 * Under section 337 of the Tariff Act of 1930 the Commission investigates a complaint that imports
 * infringe a patent or a trademark; a violation found ends in an exclusion order that bars the products
 * at the border. Each investigation opens with a notice in the Federal Register naming the complainant and
 * the respondents, a party a line ("(a) The complainant is …", "(b) The respondents are …"), and its later
 * notices carry its number in their docket ("Investigation No. 337-TA-1093"). The titles name no company
 * ("Certain Mobile Electronic Devices; Institution of Investigation"), so the company feed never kept one.
 *
 * The notices: the Federal Register API's list of the Commission's notices, year by year (`ITC_LIST`); an
 * institution notice is one whose abstract says a complaint "was filed … under section 337 … on behalf of"
 * its complainant (`isInstitution`), 1,140 from 1995-01-19; each one's text read once from govinfo, as the
 * merger notices are (lib/hsrEarly.ts), and the text of each investigation's last notice ending it on the
 * merits for the day the Commission issued it. `npm run sync:itc` reads them into the committed
 * `data/itc-337.json.gz`, asking only for notices the file does not hold. Ingest asks nothing.
 *
 * A party is the company's by the merger notices' rule (`partyIsCompany`): the caption rule under the
 * company's names of the year, the release map's units and EPA's and the CPSC's units on their days, the
 * table of taken names and the first price, and `NOT_THE_COMPANY` here. A company's investigations of a day
 * are one row, and so are its outcomes of a day.
 *
 * Licence: the notices are the Commission's own work in the Federal Register, read from govinfo, as the
 * merger notices are: public domain, govinfo asking that "customary credit should be given to the
 * Government department or agency which prepared the material", the U.S. International Trade Commission.
 */

/** The Federal Register API's list of the Commission's notices of one year, a page of 1,000. */
export const itcList = (year: number, page = 1) =>
  "https://www.federalregister.gov/api/v1/documents.json?per_page=1000&order=oldest" +
  `&page=${page}&conditions%5Bagencies%5D%5B%5D=international-trade-commission&conditions%5Btype%5D%5B%5D=NOTICE` +
  `&conditions%5Bpublication_date%5D%5Bgte%5D=${year}-01-01&conditions%5Bpublication_date%5D%5Blte%5D=${year}-12-31` +
  "&fields%5B%5D=title&fields%5B%5D=publication_date&fields%5B%5D=document_number&fields%5B%5D=abstract&fields%5B%5D=docket_ids";

export const ITC_DATA = join(__dirname, "..", "data", "itc-337.json.gz");

/** A notice as the Federal Register API lists it. */
export interface ItcListed {
  title: string;
  publication_date: string;
  document_number: string;
  abstract?: string | null;
  docket_ids?: string[] | null;
}

const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** A notice of institution: its abstract says a complaint was filed under section 337 on behalf of its complainant. */
export function isInstitution(r: ItcListed): boolean {
  const a = flat(r.abstract);
  return /complaint was filed/i.test(a) && /section 337|1337/i.test(a) && /on behalf of/i.test(a);
}

/** The investigation numbers a notice carries, "337-TA-1093", in its docket, its abstract or its title. */
export function investigationNumbers(r: ItcListed): string[] {
  const s = `${(r.docket_ids ?? []).join(" ")} ${flat(r.abstract)} ${r.title}`;
  return [...new Set([...s.matchAll(/337-TA-(\d+)/g)].map((m) => `337-TA-${Number(m[1])}`))];
}

export type ItcOutcomeKind = "violation" | "no violation" | "terminated";

export interface ItcOutcome {
  kind: ItcOutcomeKind;
  /** the exclusion order the notice says the Commission issued */
  order?: "general" | "limited";
  /** cease and desist orders issued with it */
  cdo?: boolean;
  /** how a termination ended: a settlement, a consent order, a withdrawal */
  how?: string;
}

/**
 * What a notice says the Commission decided, by its title and abstract: a final determination of a
 * violation (an exclusion order issued, or a violation found and the investigation terminated) or of none,
 * or a termination on a settlement, a consent order or the complaint's withdrawal. A notice that reviews,
 * schedules, extends or asks for submissions decides nothing here, nor one about an initial determination
 * the Commission has yet to take up.
 */
export function noticeOutcome(r: ItcListed): ItcOutcome | null {
  const title = flat(r.title);
  const t = `${title} || ${flat(r.abstract)}`;
  if (/Request for (?:Written )?Submissions|Schedule for|Extend(?:ing)? the (?:Target|Deadline)|Extension of|To Review(?:-in-Part| in Part)?\b(?!.*Termination)|Reconsider|Remand|Modification Proceeding|Enforcement Proceeding|Advisory Opinion|Rescission|Bond/i.test(title)) return null;
  const order = /general exclusion order/i.test(t) ? "general" : /limited exclusion order/i.test(t) ? "limited" : undefined;
  const cdo = /cease and desist order/i.test(t) || undefined;
  const ends = /Terminat(?:ion|ing) (?:of )?(?:the )?Investigation|investigation is (?:hereby )?terminated|terminated the investigation|issuance of (?:a )?(?:limited|general) exclusion order/i.test(t);
  // a termination "on the basis of" a settlement, a consent order or a withdrawal is that, whatever else the abstract says
  const how = /consent order/i.test(t) ? "a consent order" : /settlement/i.test(t) ? "a settlement" : /withdraw/i.test(t) ? "the complaint's withdrawal" : null;
  if (how && /Terminat\w* (?:the )?Investigation (?:in its Entirety )?(?:on the Basis of|Based on|Due to|by)/i.test(title)) return { kind: "terminated", how };
  // no violation: the Commission's own determination, or its decision not to review an initial determination
  // finding none, which makes that determination its own
  const none = /(?:final )?determination (?:finding |of )?no violation|finding no violation|determined (?:that there is )?no violation|no violation of section 337 (?:has occurred|occurred)/i.test(t);
  if (none && (ends || /final determination|not to review (?:an? |the )?(?:ALJ'?s )?(?:final )?initial determination/i.test(t))) return { kind: "no violation" };
  if (order && ends && !/Not To Review an Initial Determination|initial determination (?:granting|terminating)/i.test(title)) return { kind: "violation", order, cdo };
  if (/(?:final determination|determined) (?:finding |of )?(?:a )?violation|finding a violation/i.test(t) && ends && !/no violation/i.test(t)) return { kind: "violation", order, cdo };
  if (how && /terminat/i.test(t)) return { kind: "terminated", how };
  return null;
}

const MONTH: Record<string, string> = { january: "01", february: "02", march: "03", april: "04", may: "05", june: "06", july: "07", august: "08", september: "09", october: "10", november: "11", december: "12" };

/**
 * The day the Commission issued a notice, as its last lines give it ("By order of the Commission. … Issued:
 * May 4, 2018."), the day its determination took effect; null where the text gives none.
 */
export function issuedOn(page: string): string | null {
  const text = noticeLines(page).join(" ").replace(/\s+/g, " ");
  const all = [...text.matchAll(/\bIssued:?\s+([A-Z][a-z]+)\.?\s+(\d{1,2}),\s+(\d{4})/g)];
  const m = all.at(-1);
  const month = m ? MONTH[m[1].toLowerCase()] : undefined;
  return m && month ? `${m[3]}-${month}-${m[2].padStart(2, "0")}` : null;
}

/**
 * The parties a notice of institution names: the text after "(a) The complainant(s) is/are", to "(b) The
 * respondent(s)", and from there to "(c)", the Commission's investigative attorney. Each party is an entry
 * of its own ("Sanyo Electric Co., Ltd., 5-5 Keihan-hondori 2-chome, Osaka, 570, Japan"), its name the text
 * before its address (`partyName`).
 */
export function readInstitution(page: string, abstract?: string | null): { complainants: string[]; respondents: string[] } {
  const text = noticeLines(page).join("\n");
  // "(a) The complainant is--", "(a) The complainants are:", "(a) The complainant:" (2011); "(b) The respondents are",
  // once with its "(b)" glued to the line before ("…, CA 95128(b).", 2009), once with no verb (2012), once numbered "(4)" (2020)
  const a = text.search(/\(a\)\s+The\s+complainants?\b|\n\s*The\s+complainants?\s+(?:is|are)\s*(?::|--)/i);
  const b = text.search(/\((?:b|\d)\)\.?\s+The\s+respondents?\b|\n\s*The\s+respondents?\s+(?:is|are)\b/i);
  if (b < 0) return { complainants: [], respondents: [] };
  const rest = text.slice(b);
  // to "(c)" the Commission's investigative attorney, or where none takes part to the order's next paragraph
  const c = rest.search(/\n\s*\((?:c|3|4)\)\s|\n\s*(?:The Office of Unfair Import Investigations|For the investigation so instituted|Responses to the complaint|By order of the Commission)/);
  const complainantsBlock = a >= 0 && a < b ? text.slice(a, b).replace(/\(b\)\.?\s*$/, "").replace(/^\s*(?:\(a\)\s+)?The\s+complainants?(?:\s+(?:is|are))?\b\s*(?:--|:|-)?\s*/i, "") : "";
  const respondentsBlock = (c > 0 ? rest.slice(0, c) : rest.slice(0, 6000)).replace(/^\s*(?:\((?:b|\d)\)\.?\s+)?The\s+respondents?\b[^:\n]*?(?:\n[^:\n]*?){0,7}?(?::|--)\s*/i, "");
  const complainants = entries(complainantsBlock).map(partyName).filter(Boolean);
  // a notice that names no complainant in its list has it in its summary: "on behalf of Akzo N.V. of Arnhem, The Netherlands"
  const byAbstract = flat(abstract).match(/on behalf of\s+(.+?)(?:,?\s+of\s+[A-Z][\w.' -]*,|,\s+\d|\s+\d{2,}|\.\s)/);
  return { complainants: complainants.length || !byAbstract ? complainants : [partyName(byAbstract[1])], respondents: entries(respondentsBlock).map(partyName).filter(Boolean) };
}

const STATES =
  "AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|PR|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|" +
  "Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|" +
  "Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|" +
  "Pennsylvania|Puerto Rico|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|D\\.C";

/**
 * A line that ends a party's entry: its address's state and ZIP code, a postal code after a city, its
 * country, or a full stop; a number a line ends on inside an address ("…, Inc., 9750 / Goethe Road")
 * ends none.
 */
const ENDS_ENTRY = new RegExp(
  String.raw`(?:\b(?:${STATES})\.?,?\s+\d{5}(?:-\d{4})?|\b[A-Z]\d[A-Z] ?\d[A-Z]\d|` +
    String.raw`\b(?:Japan|China|Taiwan|Korea|Germany|France|Hong Kong|Canada|Netherlands|Israel|Sweden|Finland|Switzerland|United Kingdom|U\.K|UK|England|India|Italy|Spain|Mexico|Brazil|Singapore|Malaysia|Thailand|Vietnam|Australia|Belgium|Austria|Denmark|Norway|Ireland|P\.?R\.?C|Philippines|Indonesia|Turkey|Poland|Macau|Luxembourg|Liechtenstein|Czech Republic|Hungary|New Zealand|South Africa|Argentina|Chile|Colombia|Pakistan|Bangladesh|Sri Lanka|Cambodia|Scotland|Wales|Bermuda|Cayman Islands|British Virgin Islands|Republic|Kingdom|Province|ROC|R\.O\.C))\.?;?\s*(?:and)?\s*$|\.\s*$|;\s*(?:and)?\s*$`,
  "i",
);

/**
 * A block's entries: a line ending in a postal code, a country or a full stop ends one, and so does a
 * blank line; any other line runs into the next ("Winbond Electronics Corporation, Number 2, R&D Road VI,
 * Science-Based / Industrial Park, Hsinchu, Taiwan").
 */
export function entries(block: string): string[] {
  const out: string[] = [];
  // a party set as a block, its name on a line of its own and its address on the lines below ("Pioneer
  // Corporation / 4-1, Meguro 1-chome / Meguro-ku / Tokyo 153-8654 / Japan", 2001), is one entry
  for (const chunk of block.split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 2 && !/,\s*$/.test(lines[0]) && !/\d/.test(lines[0].replace(/\d+(?:st|nd|rd|th)\b/g, "")) && lines.slice(1).every((l) => !/^[A-Z][^,]*,\s+\d/.test(l)) && /^\d|Suite|P\.?O\.? Box|\b\d{5}\b/i.test(lines[1])) {
      out.push(lines.join(", "));
      continue;
    }
    out.push(...byLines(chunk));
  }
  return out.map((e) => e.replace(/\s+/g, " ").trim()).filter((e) => /[A-Za-z]/.test(e));
}

function byLines(block: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const raw of block.split("\n")) {
    const l = raw.trim();
    if (!l) {
      if (cur) out.push(cur);
      cur = "";
      continue;
    }
    cur = cur ? `${cur} ${l}` : l;
    if (ENDS_ENTRY.test(l)) {
      out.push(cur);
      cur = "";
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Legal words a comma may stand before inside one party's name, as the merger notices' splitter reads them. */
const LEGAL =
  /^(?:Inc|Incorporated|Ltd|Limited|L\.?\s?L\.?\s?C|L\.?\s?P|L\.?\s?L\.?\s?P|Co|Corp|Corporation|Company|N\.?\s?V|B\.?\s?V|A\.?\s?G|S\.?\s?A|S\.?\s?p\.?\s?A|plc|P\.?\s?L\.?\s?C|GmbH|AB|ASA|A\/S|AS|Oyj|SE|K\.?\s?K|Pty|Jr|Sr|de C\.?\s?V|S\.?\s?A\.?\s?S|S\.?\s?R\.?\s?L|Sdn\.? Bhd|Pte\.?|Co\., Ltd|LLC|PLLC)\b\.?/i;

/**
 * An entry's party: its text up to the first comma that does not stand before a legal word, cut before an
 * address with no comma before it ("Sony Corporation 1-7-1 Konan, Minato-ku"), its "(a.k.a. …)" and its
 * "d/b/a" kept for the caption rule.
 */
export function partyName(entry: string): string {
  const e = entry.replace(/^(?:and|&)\s+/i, "").replace(/^\(\d+\)\s*/, "").trim();
  const pieces = e.split(/,\s+/);
  let name = pieces[0] ?? "";
  for (const p of pieces.slice(1)) {
    if (LEGAL.test(p) || /^\((?:a\.?k\.?a|f\.?k\.?a|d\/b\/a)/i.test(p) || /^d\/b\/a\b/i.test(p)) name += `, ${p}`;
    else break;
  }
  // an address the notice wrote with no comma before it begins with a number
  name = name.replace(/\s+(?:No\.\s*)?\d[\w-]*(?:\s.*)?$/, "");
  // …and a piece of an address split off as an entry of its own names no party ("P.O. Box 3453", "Suite 200")
  if (/^(?:P\.?\s?O\.?\s*)?Box\b|^(?:Suite|Floor|Room|Unit|Building|Bldg\.?|No\.|Post Office)\b/i.test(name)) return "";
  return tidy(name).replace(/[.;:]$/, (m) => (/\b(?:Inc|Ltd|Co|Corp|Jr|Sr|L\.P|S\.A|N\.V|B\.V|A\.G)\.$/i.test(name) ? m : ""));
}

export interface ItcCase {
  /** "337-TA-1093" */
  number: string;
  /** the products, as the title names them: "Certain Mobile Electronic Devices" */
  products: string;
  /** the notice of institution's document number and publication day */
  notice: string;
  published: string;
  complainants: string[];
  respondents: string[];
  /** how it ended, where a later notice says so */
  outcome?: ItcOutcome & { notice: string; published: string; day: string };
}

let cached: { path: string; cases: ItcCase[] } | null = null;

/** Every investigation in the committed file, read once a process. */
export function itcCases(path = ITC_DATA): readonly ItcCase[] {
  if (cached?.path === path) return cached.cases;
  const body = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as { cases: ItcCase[] };
  cached = { path, cases: body.cases };
  return body.cases;
}

/** The products an investigation's title names, its part before the first semicolon. */
export const productsOf = (title: string) => flat(title).replace(/^In the Matter of:?\s+/i, "").split(";")[0].trim();

/**
 * Parties the rule would give a company that are not its, by CIK, read by hand (batch 167) among the 428 names
 * a replay of every investigation against every listed company matched.
 */
export const NOT_THE_COMPANY: Readonly<Record<number, { ticker: string; party: RegExp; why: string }[]>> = {
  720500: [{ ticker: "ASYS", party: /^Amtech\s+Systems,?\s+LLC\b/i, why: "Amtech Systems LLC of Albuquerque, the complainant of 2020 (337-TA-1234), not Amtech Systems, Inc. of Tempe" }],
  1938338: [{ ticker: "GLTK", party: /^Globaltech\s+(?:Corporation\s+)?Pty\b/i, why: "Globaltech Pty Ltd and Globaltech Corporation Pty Ltd of Australia, respondents of 2022 (337-TA-1309), not GlobalTech Corp." }],
};

/** Whether a party of an investigation is the company on its day. */
export const itcPartyIsCompany = (party: string, day: string, cik: number, names: () => string[]) =>
  partyIsCompany(party, day, cik, names, (p) => !!NOT_THE_COMPANY[cik]?.some((r) => r.party.test(p)));

export type ItcRole = "complainant" | "respondent";

const LIMIT = 900;
const SHOWN = 4;
const named = shown;
const list = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, 2).join(", ")} and ${xs.length - 2} more`);

/** "on Qualcomm Incorporated's complaint against Apple Inc. and 3 more" */
function between(c: ItcCase): string {
  const by = c.complainants.length ? `${c.complainants.length === 1 ? `${named(c.complainants[0])}'s` : `${list(c.complainants.map(named))}'`} complaint` : "a complaint";
  return `${by} against ${c.respondents.length ? list(c.respondents.map(named)) : "the respondents"}`;
}

/** A company's role in a case, as complainant or respondent, by the rule on each party. */
export function itcRoles(c: ItcCase, cik: number, day: string, names: () => string[]): ItcRole[] {
  const roles: ItcRole[] = [];
  if (c.complainants.some((p) => itcPartyIsCompany(p, day, cik, names))) roles.push("complainant");
  if (c.respondents.some((p) => itcPartyIsCompany(p, day, cik, names))) roles.push("respondent");
  return roles;
}

/** What an outcome says, in a row's words. */
function outcomeWords(o: ItcOutcome): string {
  if (o.kind === "violation") {
    const order = o.order ? ` and issued a ${o.order} exclusion order${o.cdo ? " and cease and desist orders" : ""}` : o.cdo ? " and issued cease and desist orders" : "";
    return `found a violation of section 337${order}`;
  }
  if (o.kind === "no violation") return "found no violation of section 337";
  return `terminated the investigation on ${o.how}`;
}

/**
 * The company's investigations as timeline events, newest first, from `from`, its first price: one row a
 * day for those instituted, and one a day for those the Commission decided on the merits, violation or
 * not; a settlement, a consent order or a withdrawal is a line on the institution's row.
 */
export function itcEvents(
  cases: readonly ItcCase[],
  namesIn: (year: number) => string[],
  { cik, from = "", namesOn }: { cik: number | string; from?: string; namesOn?: (day: string) => string[] },
): TimelineEvent[] {
  const tag = Number(cik);
  const byYear = new Map<number, string[]>();
  const yearNames = (year: number) => byYear.get(year) ?? byYear.set(year, namesIn(year)).get(year)!;
  const opened = new Map<string, { c: ItcCase; roles: ItcRole[] }[]>();
  const decided = new Map<string, { c: ItcCase; roles: ItcRole[] }[]>();
  for (const c of cases) {
    const names = () => [...yearNames(Number(c.published.slice(0, 4))), ...(namesOn?.(c.published) ?? [])];
    const roles = itcRoles(c, tag, c.published, names);
    if (!roles.length) continue;
    if (c.published >= from) (opened.get(c.published) ?? opened.set(c.published, []).get(c.published)!).push({ c, roles });
    const o = c.outcome;
    if (o && o.kind !== "terminated" && o.day >= from) (decided.get(o.day) ?? decided.set(o.day, []).get(o.day)!).push({ c, roles });
  }
  const as = (roles: ItcRole[]) => roles.join(" and ");
  const rows: TimelineEvent[] = [];
  for (const [day, found] of opened) {
    const sorted = [...found].sort((a, b) => a.c.number.localeCompare(b.c.number, "en", { numeric: true }));
    const one = sorted[0];
    const title =
      sorted.length === 1
        ? `ITC instituted an investigation (${one.c.number}) on ${between(one.c)}: ${one.c.products.replace(/^Certain\b/, "certain")}`
        : `ITC instituted ${sorted.length} investigations naming the company: ${sorted.map((x) => x.c.number).join(", ")}`;
    const lines = sorted.slice(0, SHOWN).map(({ c, roles }) => {
      const end = c.outcome?.kind === "terminated" ? ` It was terminated on ${c.outcome.how}, the Commission's notice of ${c.outcome.published}.` : "";
      return `${c.number}, ${c.products}: the company as ${as(roles)}; complainant${c.complainants.length === 1 ? "" : "s"} ${c.complainants.map(named).join("; ") || "not read"}; respondents ${c.respondents.map(named).join("; ") || "not read"}.${end}`;
    });
    const more = sorted.length > SHOWN ? ` And ${sorted.length - SHOWN} more: ${sorted.slice(SHOWN).map((x) => x.c.number).join(", ")}.` : "";
    const text =
      "The U.S. International Trade Commission opened an investigation under section 337 of the Tariff Act into a complaint that imports infringe a patent or trademark; a complaint is an allegation, and the notice decides nothing. " +
      `${lines.join(" ")}${more}`;
    rows.push({
      id: `itc-${tag}-${day}`,
      date: day,
      type: "regulation",
      title: title.length <= 300 ? title : `${title.slice(0, 299).replace(/\s+\S*$/, "")}…`,
      description: text.length <= LIMIT ? text : `${text.slice(0, LIMIT - 1).replace(/\s+\S*$/, "")}…`,
      source: "U.S. International Trade Commission",
      url: noticePage(one.c.notice),
      sourceKey: "itc_337",
      // the investigations' numbers, compared as a set by "Also on" (lib/alsoOn.ts)
      externalId: sorted.map((x) => x.c.number).join(","),
      dedupBasis: `itc:${tag}@${day}`,
    });
  }
  for (const [day, found] of decided) {
    const sorted = [...found].sort((a, b) => a.c.number.localeCompare(b.c.number, "en", { numeric: true }));
    const one = sorted[0];
    const title =
      sorted.length === 1
        ? `ITC ${outcomeWords(one.c.outcome!)} in ${one.c.number} (${between(one.c)})`
        : `ITC decided ${sorted.length} investigations naming the company: ${sorted.map((x) => `${x.c.number}, ${outcomeWords(x.c.outcome!)}`).join("; ")}`;
    const lines = sorted.slice(0, SHOWN).map(({ c, roles }) => `${c.number}, ${c.products}: the Commission ${outcomeWords(c.outcome!)}; the company as ${as(roles)}; its notice ${c.outcome!.notice} of ${c.outcome!.published}.`);
    const text =
      "The U.S. International Trade Commission's final determination in its section 337 investigation, on the day the Commission issued it. " +
      `${lines.join(" ")} A finding of violation reaches the respondents the Commission's notice names; one that settled or was dismissed before it is not among them.`;
    rows.push({
      id: `itc-final-${tag}-${day}`,
      date: day,
      type: "regulation",
      title: title.length <= 300 ? title : `${title.slice(0, 299).replace(/\s+\S*$/, "")}…`,
      description: text.length <= LIMIT ? text : `${text.slice(0, LIMIT - 1).replace(/\s+\S*$/, "")}…`,
      source: "U.S. International Trade Commission",
      url: noticePage(one.c.outcome!.notice),
      sourceKey: "itc_337",
      externalId: sorted.map((x) => `${x.c.number}:final`).join(","),
      dedupBasis: `itc-final:${tag}@${day}`,
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
