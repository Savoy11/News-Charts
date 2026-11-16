import { UA } from "./contact";
import { DESIGNATOR, FOLLOWS, escapeName, outrankedName, plainText, releaseNamesParty } from "./doj";
import { longerListedNameIn } from "./frCompany";
import { takenBefore } from "./takenNames";
import { isEverydayWord, oneWordName } from "./wordNames";
import type { TimelineEvent } from "./types";

/**
 * The Equal Employment Opportunity Commission's press releases on the pages of the companies it sues
 * or settles with (batch 152, the 2026-11-15 proposal 1, approved by the owner that day).
 *
 * The Commission's newsroom lists its releases on one paged search, newest first, 24 a page:
 * `www.eeoc.gov/newsroom/search?page=N`, 7,625 releases from 1994-06-22, most from 1996 (read 2026-11-15). It is read whole
 * once a year and its newest pages once a day, for every company (`lib/ingest/eeocWalk.ts`, db/052);
 * each company's ingest keeps the releases whose title makes it the party, by the Justice
 * Department's rule (`releaseNamesParty`) and the Commission's own title shapes, under the names it
 * had that year and the release map's units, from its first price, one row a company a day.
 *
 * The day is the listing's. Many releases of 1996–2006 carry none there, and their text gives it,
 * "PRESS RELEASE 2-21-02", which the listing's excerpt holds; a release whose excerpt holds no day
 * either has its own page read once for it (the owner's call (a) of 2026-11-15).
 *
 * Licence: the site states none; its disclaimer says only that a reference to a company "does not
 * constitute or imply its endorsement" and "shall not be used for advertising or product endorsement
 * purposes" (www.eeoc.gov, read 2026-11-11 and 2026-11-15). The releases are the Commission's own work,
 * 17 U.S.C. § 105, which the owner's ruling of 2026-11-12 allows where a federal site states no
 * licence. Used: each release's title, day, first lines and link, credited to the EEOC, implying no
 * endorsement. A suit's charge is the Commission's allegation until a court or a decree resolves it,
 * and the row says so.
 */
export const EEOC_LIST = "https://www.eeoc.gov/newsroom/search";
export const EEOC_PAGE_SIZE = 24;

export interface EeocRelease {
  /** the release's path on eeoc.gov, its key: "/newsroom/eeoc-sues-autozone-disability-discrimination" */
  path: string;
  title: string;
  /** the listing's published day, else the day its text gives, else null until its page is read */
  day: string | null;
  /** the listing's excerpt, plain text */
  summary: string;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "April 26, 2018" as ISO; null for anything else. */
export function longDay(s: string): string | null {
  const m = /^\s*([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})\s*$/.exec(s);
  if (!m) return null;
  const month = MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase()) && m[1].length >= 3);
  return month < 0 ? null : real(Number(m[3]), month + 1, Number(m[2]));
}

function real(y: number, mo: number, d: number): string | null {
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
}

/**
 * The day a release's own text gives, for a release the listing gives none: its date line,
 * "PRESS RELEASE 7-22-05" or "PRESS RELEASE 2/21/02", or "FOR IMMEDIATE RELEASE July 22, 2003". The
 * first in the text, which is the release's own; a two-digit year before 90 is this century's.
 */
export function dayInText(text: string): string | null {
  const t = text.replace(/\s+/g, " ");
  const short = /\bPRESS\s+RELEASE:?\s+(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/i.exec(t);
  const long = /\bFOR\s+IMMEDIATE\s+RELEASE:?\s+(?:[A-Za-z]+day,?\s+)?([A-Za-z]+\.?\s+\d{1,2},?\s+\d{4})\b/i.exec(t);
  const fromShort = short ? real(short[3].length === 2 ? (Number(short[3]) < 90 ? 2000 : 1900) + Number(short[3]) : Number(short[3]), Number(short[1]), Number(short[2])) : null;
  const fromLong = long ? longDay(long[1]) : null;
  if (fromShort && fromLong) return short!.index <= long!.index ? fromShort : fromLong;
  return fromShort ?? fromLong;
}

/** The releases on one listing page, with the listing's own count ("Displaying 1 - 24 of 7625 results"). */
export function parseEeocList(html: string): { releases: EeocRelease[]; total: number | null } {
  const total = /Displaying\s+\d+\s*-\s*\d+\s+of\s+(\d+)\s+results/i.exec(html);
  const releases: EeocRelease[] = [];
  for (const a of html.match(/<article\b[^>]*class="press_release"[\s\S]*?<\/article>/gi) ?? []) {
    const about = /<article\b[^>]*\babout="([^"]+)"/i.exec(a);
    const title = /field--name-title[^>]*>([\s\S]*?)<\/span>/i.exec(a);
    if (!about || !title) continue;
    let path: string;
    try {
      const url = new URL(about[1].trim(), "https://www.eeoc.gov");
      // the oldest releases are listed under "/index%2ephp/newsroom/…", the same page as "/newsroom/…"
      path = url.pathname.replace(/^\/index(?:%2e|\.)php(?=\/)/i, "");
      if (url.hostname !== "www.eeoc.gov" || !/^\/(?:newsroom\/|node\/\d+$)/.test(path)) continue;
    } catch {
      continue;
    }
    const body = /field--name-body[^>]*>([\s\S]*?)<\/div>/i.exec(a);
    const published = /field--name-field-published-date[^>]*>([\s\S]*?)<\/div>/i.exec(a);
    const summary = body ? plainText(body[1]) : "";
    const day = (published && longDay(plainText(published[1]))) || dayInText(summary);
    // some titles are encoded twice on the site, "Dillard&amp;#39;s": read once more
    const t = plainText(plainText(title[1]));
    if (t) releases.push({ path, title: t, day, summary: plainText(summary) });
  }
  return { releases, total: total ? Number(total[1]) : null };
}

/**
 * The Commission's own title shapes the Justice rule does not read (the 2026-11-15 proposal's sample,
 * measured again on the whole listing in batch 152), each followed by the company's name:
 *
 * - a decree, judgment or verdict entered with or against it: "Final Decree Entered With Walgreens",
 *   "Verdict For EEOC Against Autozone Affirmed", "Jury Verdict Against";
 * - a suit or charge "… Against" it with words between: "Bias Suit For $1 Million Against Optical
 *   Cable Corp.", "Sex Discrimination Lawsuit Against Morgan Stanley";
 * - money obtained or recovered from it: "EEOC Obtains $3 Million From";
 * - a court's or jury's order or finding: "Court Orders Walmart to Pay", "Jury Finds Against".
 */
const SHAPES = [
  String.raw`\b(?:Decrees?|Judgments?|Verdicts?|Orders?|Awards?|Injunctions?)\s+(?:(?:Is|Was)\s+)?(?:Entered\s+|Issued\s+|Approved\s+|Upheld\s+|Affirmed\s+)?(?:(?:With|Against|For\s+EEOC\s+(?:Against|Over|in\s+Suit\s+Against))\s+)`,
  String.raw`\b(?:Suit|Lawsuit|Suits|Lawsuits|Case|Claims?|Charges?|Complaint|Action)\b[^.;:!?]{0,60}?\bAgainst\s+`,
  String.raw`\b(?:Obtains?|Obtained|Recovers?|Recovered|Secures?|Secured|Wins?|Won|Collects?)\b[^.;:!?]{0,60}?\b(?:From|Against)\s+`,
  String.raw`\b(?:Court|Judge|Jury|Appeals\s+Court|Circuit)\s+(?:Orders?|Finds?|Rules?\s+Against|Holds?|Sanctions?|Enjoins?|Fines?)\s+`,
];

/** What a court did to the case, after the company's name: "Verdict For EEOC Against Autozone Affirmed". */
const COURT_WORDS = String.raw`(?=\s+(?:Affirmed|Upheld|Reinstated|Approved|Entered|Ends?|Resolved|Revived|Reversed)\b)`;

/**
 * A release about a franchisee, a bottler or an owner of the company's brand is not the company's:
 * "McDONALD'S FRANCHISE TO PAY $505,000", "IHOP Franchisee", "Owner of Brandon Denny's", "Coca-Cola
 * Bottling Company United" (the proposal's risks, read on the whole listing).
 */
function aboutAnother(t: string, n: string): boolean {
  return (
    new RegExp(String.raw`${n}${DESIGNATOR}(?:['’]s)?\s+(?:(?:Restaurant|Store|Hotel|Location)s?\s+)?(?:Franchis\w*|Bottl\w*|Licensee|Dealer(?:ship)?s?|Distributors?|Contractors?|Supplier|Operators?|Owners?)\b`, "i").test(t) ||
    new RegExp(String.raw`\b(?:Franchis\w*|Bottl\w*|Licensee|Owners?|Operators?|Contractors?|Supplier|Vendor|Staffing\s+(?:Firm|Agency|Company))\s+(?:of|for|to|at|operating)\s+(?:(?:an?|the|\w+)\s+){0,3}${n}`, "i").test(t)
  );
}

/** Whether the release's first sentence makes the employer a franchisee, bottler or licensee of one of the names. */
export function franchiseeInLead(summary: string, names: readonly string[]): boolean {
  const lead = leadOf(summary, 400).split(/(?<=[.!?])\s+(?=[A-Z])/)[0] ?? "";
  // only a franchise, bottler or licensee here: a release's own lines call the company's subsidiary its
  // stores' "operator" ("DolgenCorp, LLC, which operates Dollar General stores")
  return names.some((name) => {
    if (name.trim().length < 2) return false;
    const n = escapeName(name);
    return (
      new RegExp(String.raw`${n}${DESIGNATOR}(?:['’]s)?\s+(?:(?:Restaurant|Store|Hotel|Location)s?\s+)?(?:Franchis\w*|Bottl\w*|Licensee)\b`, "i").test(lead) ||
      new RegExp(String.raw`\b(?:Franchis\w*|Bottl\w*|Licensee)\s+(?:of|for)\s+(?:(?:an?|the|\w+)\s+){0,3}${n}`, "i").test(lead)
    );
  });
}

/**
 * A release that is not the Commission's action against the company: an agreement to mediate, a
 * memorandum of understanding, an alliance or award, a conference or a hearing.
 */
const NOT_AN_ACTION = /\b(?:Mediation\s+(?:Agreements?|Pacts?)|Memorand(?:um|a)\s+of\s+Understanding|Alliance|Partnership|National\s+(?:Mediation|Universal)\s+Agreement|Universal\s+Agreements?\s+to\s+Mediate|Honors?|Freedom\s+to\s+Compete|Award(?:s|ed)?\s+(?:for|to)\s+(?:Excellence|Diversity)|Conference|Hearing|Roundtable|Testif\w+|Commissioners?\s+(?:Visit|Meet))\b/i;

/**
 * Whether the title makes the company the party: the Justice Department's rule, then the
 * Commission's own shapes (`SHAPES`), with what follows the name read as the Justice rule reads it
 * (`FOLLOWS`). Not a release about the company's franchisee, bottler or contractor, nor one that is
 * no action, nor a name every mention of which "Former" comes before.
 */
export function eeocNamesParty(title: string, names: readonly string[], cik?: number | string): boolean {
  const t = title.replace(/\s+/g, " ").trim();
  if (NOT_AN_ACTION.test(t) && !/\b(?:Sues?|Suit|Lawsuit|Settle\w*|Pay|Decree|Verdict|Judgment)\b/i.test(t)) return false;
  if (cik !== undefined && NOT_THE_COMPANY[Number(cik)]?.some((n) => n.title.test(t))) return false;
  const held = names.filter((name) => {
    if (name.trim().length < 2) return false;
    const at = [...t.matchAll(new RegExp(String.raw`(?<![\w&])${escapeName(name)}(?![\w])`, "gi"))];
    return at.length > 0 && !at.every((m) => /\b(?:Former|Ex-)\s*$/i.test(t.slice(0, m.index)));
  });
  if (!held.length) return false;
  if (held.some((name) => aboutAnother(t, outrankedName(name, escapeName(name), held)))) return false;
  if (releaseNamesParty(t, held)) return true;
  for (const name of held) {
    if (longerListedNameIn(t, name)) continue;
    // a name that is an everyday word is the Justice rule's alone, with its guards: "Consent Decree
    // Resolving EEOC Lawsuit Against City of Boone" is no City Holding's
    const key = oneWordName(name);
    if (key && isEverydayWord(key)) continue;
    const n = outrankedName(name, escapeName(name), held);
    // the company first, the Commission's charge last: "Walmart Refused to Provide Qualified
    // Interpreters for Deaf Employees, EEOC Charges in Suit"
    if (new RegExp(String.raw`^(?:The\s+)?${n}${DESIGNATOR}\s+(?![,;:])[^.;:!?]{3,140}?,?\s+(?:the\s+)?(?:EEOC|Federal\s+Agency)\s+(?:Charges|Says|Alleges|Contends|Claims)\b`, "iu").test(t)) return true;
    for (const shape of SHAPES) {
      const m = new RegExp(String.raw`${shape}(?:the\s+)?${n}(?!-\p{L})${DESIGNATOR}(?:${FOLLOWS}|${COURT_WORDS})`, "iu").exec(t);
      if (m && !/\bwho\b/i.test(t.slice(0, m.index))) return true;
    }
  }
  return false;
}

/**
 * Releases that name a listed company's name and are another firm's, read by hand in batch 152 among
 * every match the whole listing gave the index, by CIK.
 */
export const NOT_THE_COMPANY: Readonly<Record<number, { ticker: string; title: RegExp; why: string }[]>> = {
  1393818: [{ ticker: "BX", title: /\bBlackstone Consulting\b/i, why: "Blackstone Consulting, Inc., a Los Angeles security and janitorial contractor (2010, 2019), not Blackstone" }],
  46195: [{ ticker: "BOH", title: /\bBlood Bank of Hawaii\b/i, why: "the Blood Bank of Hawaii (2017, 2019), not Bank of Hawaii" }],
  946673: [{ ticker: "BANR", title: /\bBanner Health\b/i, why: "Banner Health, the Arizona hospital system (2012), not Banner Corporation" }],
  1841408: [{ ticker: "DAVE", title: /\bDave['’]s Supermarket\b/i, why: "Dave's Supermarket of Cleveland (2009), not Dave Inc." }],
  356037: [{ ticker: "CSPI", title: /\bConnections CSP\b/i, why: "Connections Community Support Programs of Delaware (2017), not CSP Inc." }],
  1043337: [{ ticker: "SRI", title: /\bStoneRidge Health\b/i, why: "StoneRidge Health and Rehab Center (2011), not Stoneridge, Inc." }],
  1836775: [{ ticker: "TNYZF", title: /\bTiny['’]s Organic\b/i, why: "Tiny's Organic, a California farm (2014), not Tiny Ltd." }],
  1563190: [{ ticker: "COMP", title: /\bCompass Group\b/i, why: "Compass Group USA, the food-service arm of Compass Group PLC (2018, 2019), not Compass, Inc." }],
  717423: [
    { ticker: "MUR", title: /\bMurphy Oil USA\b/i, why: "Murphy Oil USA, Inc., Murphy USA's since the spin-off of 2013-08-30 (the settlement of 2018), not Murphy Oil Corporation's" },
    { ticker: "MUR", title: /^Murphy Oil Sued By EEOC for Disability Discrimination and Retaliation$/i, why: "the same suit, filed 2016 against the store chain the release says operates Murphy USA stations in Walmart parking lots: Murphy USA's since 2013, not Murphy Oil Corporation's" },
  ],
};

/**
 * The companies' own units and brands the Commission's titles name, read by hand in batch 152 among the
 * listing's releases no rule gave a page, by CIK. A unit counts from the company's first price, as every
 * name does, and between its days where it was bought or sold while the company was listed; each day
 * from a filing. Left out: Oncor (Sempra holds it by the equity method, ring-fenced), Philips Lighting
 * (no filing read gives the day it stopped being Philips's), U.S. Steel (no page here), the franchisees of
 * a brand, and the bottlers.
 */
export const EEOC_UNITS: Readonly<Record<number, readonly { ticker: string; names: readonly string[]; from?: string; to?: string; why: string }[]>> = {
  104169: [{ ticker: "WMT", names: ["Wal-Mart Stores East", "Walmart Stores East", "Sam's Club", "Sam’s Club"], why: "Walmart's own operating partnership in the East and its warehouse clubs" }],
  56873: [{ ticker: "KR", names: ["Fred Meyer", "Fred Meyer Stores"], why: "Kroger's since the merger of 1999; every release is of 2008 on" }],
  1090727: [{ ticker: "UPS", names: ["UPS Freight"], why: "UPS's freight unit (Overnite, bought 2005), sold to TFI in 2021; every release is of 2009–2020" }],
  1048911: [{ ticker: "FDX", names: ["Federal Express"], why: "FedEx's own operating company" }],
  1058090: [{ ticker: "CMG", names: ["Chipotle"], why: "the company's own short name" }],
  1657853: [{ ticker: "HTZ", names: ["Hertz", "Hertz Corporation"], why: "The Hertz Corporation, the operating company; its 1996 suit is long before the page's first price" }],
  940944: [
    { ticker: "DRI", names: ["Bahama Breeze", "Olive Garden", "GMRI"], why: "Darden's own restaurant chains and GMRI, Inc., the company that runs them" },
    { ticker: "DRI", names: ["Red Lobster"], to: "2014-07-27", why: "Darden's until it \"completed its previously announced sale of its Red Lobster restaurant business\" to an affiliate of Golden Gate Capital on 2014-07-28 (Darden's 8-K filed that day, 0000940944-14-000075): its suit of 2013 is Darden's, its settlement of 2015 is not" },
  ],
  1546417: [{ ticker: "BLMN", names: ["Outback Steakhouse"], why: "Bloomin' Brands' own chain" }],
  889900: [{ ticker: "PTEN", names: ["Patterson-UTI Drilling"], why: "Patterson-UTI's drilling company" }],
  1770450: [{ ticker: "XRX", names: ["Xerox State Healthcare"], why: "Xerox's (Affiliated Computer Services, bought 2010) until the Conduent spin-off at the end of 2016; its releases are of 2015 and 2016" }],
  27904: [{ ticker: "DAL", names: ["Mesaba Airlines"], why: "Northwest's regional carrier, Delta's from the merger of 2008 to its sale to Pinnacle in 2010; its one release is of 2009-12-23" }],
  936468: [{ ticker: "LMT", names: ["Lockheed Martin Global Telecommunications"], why: "Lockheed Martin's satellite-communications unit" }],
  91388: [{ ticker: "SFD", names: ["Smithfield Fresh Meats"], why: "Smithfield Foods' pork processor" }],
  732712: [{ ticker: "VZ", names: ["Verizon Maryland", "Verizon Pennsylvania"], why: "Verizon's operating telephone companies, filers of their own, so the rule reads them as other companies" }],
  849869: [{ ticker: "SLGN", names: ["Silgan Containers"], why: "Silgan's can maker" }],
  716643: [{ ticker: "RGS", names: ["Supercuts"], why: "Regis's chain since the merger of 1996; every release is of 2003 on" }],
  1646972: [{ ticker: "ACI", names: ["Albertsons", "Safeway"], why: "the company's own short name and Safeway, its since 2015, both from the page's first price of 2020" }],
  1971213: [{ ticker: "SBGI", names: ["Sinclair Broadcast Group"], why: "Sinclair's operating company, the listed company itself before the new parent of 2023" }],
  // batch 155, the 2026-11-16 audit's finding 4
  871763: [{ ticker: "MAN", names: ["ManpowerGroup US", "Manpowergroup US"], why: "ManpowerGroup's own US staffing company, sued with Johnson Controls in 2019 and settling with it in 2020" }],
};

/**
 * Releases read by hand as the company's though no name in their title is its own, by CIK, from the day
 * given: the title names another company the release's own first lines say is not the employer. Batch
 * 155, the 2026-11-16 audit's finding 4: the suit `NOT_THE_COMPANY` keeps off Murphy Oil is Murphy USA's.
 */
export const RELEASES_OF: Readonly<Record<number, readonly { ticker: string; title: RegExp; from: string; why: string }[]>> = {
  1573516: [
    {
      ticker: "MUSA",
      title: /^Murphy Oil Sued By EEOC for Disability Discrimination and Retaliation$/i,
      from: "2013-08-30",
      why: "the suit of 2016-05-05 against the chain of stations its first lines say Murphy USA operates (\"Murphy Oil Corporation, which operates Murphy USA retail gasoline stores…\"), Murphy USA's since the spin-off of 2013-08-30; its settlement of 2018 is already the page's",
    },
  ],
};

const releaseOf = (cik: number | string | undefined, r: Pick<EeocRelease, "title" | "day">) =>
  cik !== undefined && !!r.day && (RELEASES_OF[Number(cik)] ?? []).some((x) => r.day! >= x.from && x.title.test(r.title));

/** The EEOC units the company held on `day`. */
export function eeocUnitNamesOn(cik: number | string | undefined, day: string): string[] {
  if (cik === undefined) return [];
  return (EEOC_UNITS[Number(cik)] ?? []).filter((u) => (!u.from || day >= u.from) && (!u.to || day <= u.to)).flatMap((u) => [...u.names]);
}

/** Every name the units list gives the company, for asking which undated releases to read. */
export const eeocUnitNamesAsked = (cik: number | string): string[] => (EEOC_UNITS[Number(cik)] ?? []).flatMap((u) => [...u.names]);

/** What the row says of a suit: the Commission's charge is an allegation until a court or a decree resolves it. */
const ALLEGED = "The EEOC's charges are allegations until a court or a settlement resolves them.";

/** The release's first lines, as the listing gives them, without its date line, cut at a word under `max`. */
export function leadOf(summary: string, max = 300): string {
  let s = summary.replace(/\s+/g, " ");
  // an old release's header (contacts, phone numbers) ends at its date line: the text begins after it
  const dateLine = /\bPRESS\s+RELEASE:?\s+\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b\s*/i.exec(s.slice(0, 500));
  if (dateLine) s = s.slice(dateLine.index + dateLine[0].length);
  s = s
    .replace(/^(?:The\s+)?U\.?S\.?\s+Equal\s+Employment\s+Opportunity\s+Commission\s*/i, "")
    .replace(/^(?:FOR\s+IMMEDIATE\s+RELEASE:?\s+(?:[A-Za-z]+day,?\s+)?[A-Za-z]+\.?\s+\d{1,2},?\s+\d{4}\s*)?(?:PRESS\s+RELEASE:?\s+\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\s*)?/i, "")
    .trim();
  if (s.length > max) s = `${s.slice(0, s.lastIndexOf(" ", max - 1)).replace(/[,;:\s]+$/, "")}…`;
  return s;
}

/**
 * The releases naming the company as the party, as timeline events, one a day. `names` are its
 * names, `namesOn(day)` its names of that year and the units it then owned; before `from`, its first
 * price, only the units marked to count before it listed (`namesBefore`). A release posted twice under
 * one title is one release, on the day its own text gives, else the earlier.
 */
export function eeocEvents(
  releases: readonly EeocRelease[],
  names: readonly string[],
  { cik, from = "", namesOn, namesBefore }: { cik?: number | string; from?: string; namesOn?: (day: string) => string[]; namesBefore?: (day: string) => string[] } = {},
): TimelineEvent[] {
  const tag = cik === undefined ? "" : `${Number(cik)}`;
  const kept = new Map<string, EeocRelease>();
  for (const r of releases) {
    if (!r.day) continue;
    const asked = r.day < from ? (namesBefore?.(r.day) ?? []) : [...names, ...(namesOn?.(r.day) ?? []), ...eeocUnitNamesOn(cik, r.day)];
    const t = lettersOf(r);
    // a release read by hand as the company's (`RELEASES_OF`) needs no name of its own in the title
    const byHand = r.day >= from && releaseOf(cik, r);
    if (!byHand && (!asked.length || !asked.some((n) => { const k = letters(n); return k.length >= 2 && t.includes(k); }) || !eeocNamesParty(r.title, asked, cik))) continue;
    // …nor a release whose first lines say the employer is the brand's franchisee or bottler: "Jack In
    // The Box Sued For Sexual Harassment" is "Jack in the Box franchisee Kobra Associates, Inc."
    if (!byHand && franchiseeInLead(r.summary, asked)) continue;
    if (takenBefore(cik, r.day, r.title)) continue;
    // one release posted twice: the same title and the same first lines; kept once, on the day its text
    // gives, else the earlier. One title over two texts is two releases: the site numbers every repeated
    // title's address ("-0" to "-10"), and "EEOC Sues Walmart for Disability Discrimination" is a dozen suits
    const key = twinKey(r);
    const had = kept.get(key);
    if (!had || better(r, had)) kept.set(key, r);
  }
  // …and one title twice on one day is one release, whatever its excerpt: the site lists some copies
  // with none ("EEOC Files Two Suits Against Caterpillar", 2003-08-13)
  const sameDay = new Map<string, EeocRelease>();
  for (const r of kept.values()) {
    const key = `${r.day}|${letters(r.title)}`;
    const had = sameDay.get(key);
    if (!had || better(r, had) || (!had.summary && r.summary)) sameDay.set(key, r);
  }
  const byDay = new Map<string, EeocRelease[]>();
  for (const r of sameDay.values()) byDay.set(r.day!, [...(byDay.get(r.day!) ?? []), r]);
  return [...byDay]
    .sort((x, y) => y[0].localeCompare(x[0]))
    .map(([day, rows]) => {
      const sorted = [...rows].sort((x, y) => x.path.localeCompare(y.path));
      const lead = leadOf(sorted[0].summary);
      return {
        id: `eeoc-${tag}-${day}`,
        date: day,
        type: "regulation" as const,
        title: sorted[0].title + (sorted.length > 1 ? ` (and ${sorted.length - 1} more that day)` : ""),
        source: "EEOC",
        url: `https://www.eeoc.gov${sorted[0].path}`,
        description: [sorted.length > 1 ? sorted.map((r) => r.title).join(" · ") : lead, ALLEGED].filter(Boolean).join(" "),
        sourceKey: "eeoc_press" as const,
        externalId: sorted.map((r) => r.path).join(","),
        dedupBasis: `eeoc:${tag}@${day}`,
      };
    });
}

/** What two copies of one release share: the title and the first lines, as letters. */
export const twinKey = (r: Pick<EeocRelease, "title" | "summary">) =>
  `${letters(r.title)}|${letters(leadOf(r.summary, 400)).slice(0, 160)}`;

/** Of two copies of one release, the one whose own text gives its day, else the earlier. */
function better(a: EeocRelease, b: EeocRelease): boolean {
  const ta = dayInText(a.summary) === a.day;
  const tb = dayInText(b.summary) === b.day;
  if (ta !== tb) return ta;
  return a.day! < b.day! || (a.day === b.day && a.path < b.path);
}

const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const LETTERS = new WeakMap<EeocRelease, string>();
function lettersOf(r: EeocRelease): string {
  let held = LETTERS.get(r);
  if (held === undefined) {
    held = letters(r.title);
    LETTERS.set(r, held);
  }
  return held;
}

export interface EeocAnswer {
  releases: EeocRelease[];
  /** the listing's own count of releases */
  total: number | null;
  outcome: "ok" | "throttled" | "error";
  httpStatus?: number;
  detail?: string;
}

/** One page of the listing, 0 the newest. A page without the listing's count is an error, not an empty page. */
export async function fetchEeocPage(page: number): Promise<EeocAnswer> {
  try {
    const res = await fetch(`${EEOC_LIST}${page ? `?page=${page}` : ""}`, { headers: { ...UA, Accept: "text/html" }, signal: AbortSignal.timeout(60_000) });
    if (res.status === 403 || res.status === 429 || res.status === 503) return { releases: [], total: null, outcome: "throttled", httpStatus: res.status };
    if (!res.ok) return { releases: [], total: null, outcome: "error", httpStatus: res.status };
    const got = parseEeocList(await res.text());
    if (got.total === null) return { ...got, outcome: "error", httpStatus: res.status, detail: "no listing on the page" };
    return { ...got, outcome: "ok", httpStatus: res.status };
  } catch (err) {
    return { releases: [], total: null, outcome: "error", detail: String(err).slice(0, 200) };
  }
}

/** A release's own page, for the day its text gives where the listing's excerpt gives none. */
export async function fetchEeocRelease(path: string): Promise<{ day: string | null; outcome: "ok" | "throttled" | "error"; httpStatus?: number; detail?: string }> {
  try {
    const res = await fetch(`https://www.eeoc.gov${path}`, { headers: { ...UA, Accept: "text/html" }, signal: AbortSignal.timeout(60_000) });
    if (res.status === 403 || res.status === 429 || res.status === 503) return { day: null, outcome: "throttled", httpStatus: res.status };
    if (!res.ok) return { day: null, outcome: "error", httpStatus: res.status };
    return { day: dayOnPage(await res.text()), outcome: "ok", httpStatus: res.status };
  } catch (err) {
    return { day: null, outcome: "error", detail: String(err).slice(0, 200) };
  }
}

/** The day on a release's own page: its published field, else its text's date line. */
export function dayOnPage(html: string): string | null {
  const published = /field--name-field-published-date[^>]*>([\s\S]*?)<\/div>/i.exec(html);
  const fromField = published ? longDay(plainText(published[1])) : null;
  if (fromField) return fromField;
  const main = html.slice(Math.max(0, html.search(/<main\b/i)));
  return dayInText(plainText(main.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")));
}
