import { respondents } from "./cfpb";
import { UA } from "./contact";
import { UNITS as CPSC_UNITS } from "./cpscRecalls";
import { eeocUnitNamesOn } from "./eeoc";
import { andSpellings } from "./edgarName";
import { BRANDED_SITE, UNITS as EPA_UNITS, epaParty } from "./epaCases";
import { takenBefore } from "./takenNames";
import type { TimelineEvent } from "./types";

/**
 * The National Labor Relations Board's decisions in the company's own cases, from 1962 (batch 161, the
 * 2026-11-18 proposal 2, approved by the owner that day with call (a): a row from the listing alone).
 * The Board decides every unfair labor practice case and contested union election in the private sector,
 * and each decision's caption names the employer. No other source the pages read covers labour relations.
 *
 * The Board's decision listing (`NLRB_LIST`, 100 a page): each row gives the issue day, the citation ("375
 * NLRB No. 68", a slip opinion; "1 NLRB 519", a bound volume), the case name with the decision's document
 * and the case number. 66,645 decisions on 2026-11-18, 667 pages, back to 1935-12-07. It is read whole once a
 * year and its newest page once a day, for every company at once (lib/ingest/nlrbWalk.ts, db/054), the
 * whole read only in the NLRB's night window, by its policy (`inNightWindow`), and across runs and nights
 * (db/055): the first night read, 2026-11-21, was refused by the site's firewall at page 340 (`REJECTED`).
 *
 * The kind is the case number's (`nlrbKind`): CA, and C before 1948, is an unfair labor practice case
 * against the employer; RC, RD, RM, R before 1948, RE (the 1940s' employer petitions), UA (the union-shop
 * polls of 1947–1951), UC, UD and AC are an election or a unit question at the employer. CB, CC, CD, CE,
 * CG and CP are cases against a union, and advisory opinions (AO), fee applications (ED) and the rest are
 * no employer's case: they make no row, whatever their caption names ("UFCW, Local 700 (Kroger)").
 *
 * A decision is the company's by EPA's form of the caption rule (`epaParty`: one name joined by "and" is
 * one name, so "Wisconsin Power and Light Co." is no "Light Co."; a person written surname first is no
 * company), on the caption with its "d/b/a" read as a party (`respondents`), under the company's names of
 * the year, the release map's and the EEOC's units of the day, EPA's and the CPSC's units on their days
 * and its own units (`NLRB_UNITS`); never a namesake (`NOT_THE_COMPANY`), nor a name its record took from
 * another company before the day (lib/takenNames.ts); from its first price. A day before the Act's
 * (1935-07-05) is a misdated row and makes none. A company's decisions of a day are one row, its id the
 * decisions' documents, so a joint employers' decision is "Also on" the other page (lib/alsoOn.ts).
 *
 * The listing does not say how the Board ruled; the decision does, and the row says so (the owner's call
 * (a)). Licence: the NLRB's site policies (read 2026-11-18) state no licence or copyright terms, so the
 * decisions are a federal agency's own work, 17 U.S.C. § 105, under the owner's ruling of 2026-11-12. They
 * do state a disclaimer ("the information available on this web site may not reflect official positions of
 * the NLRB") and a bulk-data policy: "bulk data extractions be scheduled for non-peak hours (between 11pm
 * EST – 6am EST)", and no more than 5 concurrent requests or 20 per 200 ms; the walk reads one page at a
 * time, `GAP_MS` apart.
 */
export const NLRB_LIST = "https://www.nlrb.gov/cases-decisions/decisions/board-decisions";
export const NLRB_PAGE_SIZE = 100;
/** A page of the listing, 100 decisions, every volume, newest first. */
export const nlrbPageUrl = (page: number) => `${NLRB_LIST}?volume=-1&items_per_page=${NLRB_PAGE_SIZE}&page=${page}`;
/** The decision's own document. */
export const nlrbDocumentUrl = (document: string) => `https://apps.nlrb.gov/link/document.aspx/${document}`;
/** The National Labor Relations Act's day: a decision dated before it is misdated in the listing ("02/14/1919"). */
export const ACT_DAY = "1935-07-05";

export interface NlrbDecision {
  /** the decision's document id on apps.nlrb.gov, "09031d45843ede05" */
  document: string;
  day: string;
  /** "375 NLRB No. 68", "1 NLRB 519" */
  citation: string;
  /** the case name as the listing gives it, "Pepperjacks, LLC d/b/a Notch 8 Brewery" */
  name: string;
  /** "13-CA-393585", "00-C-000024" */
  caseNumber: string;
}

/** A cell's text, its codes read; the listing writes some older captions' "&" twice over ("Santa Fe Hotel &amp;amp; Casino"). */
const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:amp;)+/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;|&#8217;/g, "'")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * A page of the listing: its decisions, the rows it holds, and the last page the pager names (none on the
 * last page itself). A row the listing gives no day makes no decision but is a row (page 336 of 2026-11-21
 * held 11, "Capital Bakery", 321 NLRB 10, among them), so a page is full by its rows. `table` is false when
 * the page holds no listing at all (a refusal served as a page), which is no empty page.
 */
export function parseNlrbListing(html: string): { decisions: NlrbDecision[]; rows: number; lastPage: number | null; table: boolean } {
  const start = html.search(/<table[^>]*case-decisions-table/i);
  if (start < 0) return { decisions: [], rows: 0, lastPage: null, table: false };
  const body = html.slice(start, html.indexOf("</table>", start));
  const decisions: NlrbDecision[] = [];
  let rows = 0;
  for (const tr of body.match(/<tr>[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (cells.length < 4) continue;
    rows++;
    const day = /(\d{2})\/(\d{2})\/(\d{4})/.exec(cells[0]);
    const doc = /document\.aspx\/([0-9a-f]+)/i.exec(cells[2]);
    if (!day || !doc) continue;
    decisions.push({
      document: doc[1].toLowerCase(),
      day: `${day[3]}-${day[1]}-${day[2]}`,
      // a bound volume's citation without its leading zeros: "001 NLRB 519" is 1 NLRB 519
      citation: text(cells[1]).replace(/^0+(?=\d)/, ""),
      name: text(cells[2]),
      caseNumber: text(cells[3]),
    });
  }
  const last = /pager__item--last[\s\S]{0,400}?[?&](?:amp;)?page=(\d+)/i.exec(html.slice(html.indexOf("</table>", start)));
  return { decisions, rows, lastPage: last ? Number(last[1]) : null, table: true };
}

/** The site's firewall answers a request it refuses with this page, as HTTP 200 (page 340 of 2026-11-21). */
export const REJECTED = /<title>\s*Request Rejected\s*<\/title>|The requested URL was rejected/i;

/** The case's kind by its number's letters: the employer's unfair labor practice case, a representation case, or none. */
export function nlrbKind(caseNumber: string): "ulp" | "representation" | null {
  // the listing's two misspellings of a number: "0 5-CA-31828" (CNN America, 352 NLRB 265) and "090CA-010829"
  const number = caseNumber.replace(/\s+/g, "").replace(/^(\d{2})0([A-Z]{2})-/i, "$1-$2-");
  const letters = /^[0-9A-Z]{1,4}-([A-Z]{1,2})-/i.exec(number)?.[1].toUpperCase();
  if (!letters) return null;
  if (letters === "CA" || letters === "C") return "ulp";
  if (["RC", "RD", "RM", "R", "RE", "UA", "UC", "UD", "AC"].includes(letters)) return "representation";
  return null;
}

const KIND_LABEL = { ulp: "an unfair labor practice case against the employer", representation: "a representation case, an election or a unit question" } as const;

/**
 * Employers a company's names do not reach by the rule, by CIK, read by hand: the units named after it and
 * the spellings the listing gives (batch 161, from the sample of 24 pages the 2026-11-18 proposal read).
 */
export const NLRB_UNITS: Readonly<Record<number, readonly { ticker: string; name: RegExp; from?: string; to?: string; why: string }[]>> = {
  1018724: [{ ticker: "AMZN", name: /^Amazon\.com Services\b/i, why: "Amazon.com Services, LLC, the company's US operating company, as the FDA's letters spell it too" }],
  354950: [{ ticker: "HD", name: /^Home Depot,? U\.?\s?S\.?\s?A\b/i, why: "Home Depot U.S.A., Inc., its operating company" }],
  1744489: [{ ticker: "DIS", name: /^Walt Disney (?:Parks and Resorts|World)\b/i, why: "Walt Disney Parks and Resorts U.S., Inc. and Walt Disney World Co., its parks companies" }],
  1048911: [
    { ticker: "FDX", name: /^FedEx (?:Home Delivery|Ground|Express)\b/i, why: "FedEx's operating companies, named after it" },
    {
      ticker: "FDX",
      name: /^FedEx Freight\b/i,
      to: "2026-05-31",
      why: "FedEx Freight, FedEx's until its spin-off: \"On June 1, 2026, FedEx Corporation ... completed its spin-off of FedEx Freight Holding Company, Inc.\" (8-K 0001104659-26-068519)",
    },
  ],
  // batch 162: FedEx Freight from its spin-off, the day FedEx's own entry ends
  2082247: [{ ticker: "FDXF", name: /^FedEx Freight\b/i, from: "2026-06-01", why: "FedEx Freight, Inc., FedEx Freight Holding Company's operating company from the spin-off of 2026-06-01" }],
  936468: [{ ticker: "LMT", name: /^Lockheed Martin\b/i, why: "Lockheed Martin's own companies (\"Lockheed Martin Tactical Aircraft Systems\", \"Lockheed Martin Skunk Works\")" }],
  79879: [{ ticker: "PPG", name: /^PPG\b/i, why: "PPG Industries' own companies (\"PPG Aerospace\")" }],
  1108109: [{ ticker: "CYH", name: /^CHS Community Health\b/i, why: "CHS/Community Health Systems, Inc., as the listing writes the company" }],
  40545: [{ ticker: "GE", name: /^General Electric\b/i, why: "GE's own divisions written as employers (\"General Electric Wiring Devices\"), as the Labor Department's certifications write them (lib/taaPetitions.ts)" }],
  // batch 162: the units named after their owners in the listing's 33,989 decisions of 1969–2026, each read by hand
  1283699: [
    {
      ticker: "TMUS",
      name: /^T-Mobile USA\b/i,
      from: "2013-04-30",
      why: "T-Mobile USA, Inc., its operating company from the combination with MetroPCS, \"the consummation on April 30, 2013\" (8-K 0001193125-13-193449)",
    },
  ],
  63908: [{ ticker: "MCD", name: /^McDonald['’]?s USA\b/i, why: "McDonald's USA, LLC, its US company, the joint employer in the franchisees' cases of 2015–2019; a franchisee's restaurant is not McDonald's" }],
  1124198: [{ ticker: "FLR", name: /^Fluor Daniel\b/i, why: "Fluor Daniel, Inc., its engineering and construction company" }],
  2115436: [{ ticker: "XOM", name: /^Exxon\b/i, why: "Exxon's own companies as the listing writes them: Exxon Shipping Co., Exxon Co. USA, and \"Exxon Mobile Corp.\"" }],
  18230: [{ ticker: "CAT", name: /^Caterpillar\b/i, why: "Caterpillar Tractor Co., its name to 1986, and its companies (Caterpillar Logistics), as the Labor Department's certifications read them (lib/taaPetitions.ts)" }],
  57131: [{ ticker: "LZB", name: /^La-Z-Boy\b/i, why: "La-Z-Boy's plant companies (La-Z-Boy Midwest, South, Tennessee) and La-Z-Boy Chair Co., its name to 1996" }],
  927653: [{ ticker: "MCK", name: /^McKesson\b/i, why: "McKesson Drug Co. and McKesson's other companies" }],
  1584509: [
    { ticker: "ARMK", name: /^Aramark\b(?!\s+Uniform)/i, why: "Aramark's service companies (Aramark Educational Services, Aramark School Services, Aramark Sports & Entertainment)" },
    {
      ticker: "ARMK",
      name: /^Aramark\s+Uniform\b/i,
      to: "2023-09-29",
      why: "Aramark Uniform & Career Apparel, until its spin-off as Vestis: \"The Distribution was effective at 12:01 a.m., Eastern Time, on September 30, 2023\" (8-K 0001628280-23-033364)",
    },
  ],
  1166691: [{ ticker: "CMCSA", name: /^Comcast\b/i, why: "Comcast Cablevision's local companies (of Philadelphia, of New Haven, Taylor)" }],
  793952: [{ ticker: "HOG", name: /^Harley[- ]Davidson\b/i, why: "Harley-Davidson Motor Company, its motorcycle company" }],
  899051: [{ ticker: "ALL", name: /^Allstate Insurance\b/i, why: "Allstate Insurance Company, its insurer" }],
  77476: [{ ticker: "PEP", name: /^Pepsi-Cola Co(?:mpany|\.)?$/i, why: "Pepsi-Cola Company, PepsiCo's beverage division; never a Pepsi-Cola bottler, which the listing names by its town" }],
  9389: [{ ticker: "BALL", name: /^Ball Plastics\b/i, why: "Ball Plastics Division, its plastics division" }],
  1219601: [{ ticker: "CCK", name: /^Crown Cork\b/i, why: "Crown Cork & Seal Co., its name before Crown Holdings, and Crown Cork de Puerto Rico" }],
  3453: [{ ticker: "MATX", name: /^Matson Terminals\b/i, why: "Matson Terminals, Inc., its stevedoring company" }],
  790526: [{ ticker: "RDNT", name: /^RadNet Management\b/i, why: "RadNet Management, Inc., its operating company" }],
  29905: [{ ticker: "DOV", name: /^Dover Energy, Inc\., Blackmer\b/i, why: "Dover Energy's Blackmer pump division, still Dover's; never another \"Dover\" (Dover Caterers, Dover Hospitality)" }],
  829224: [{ ticker: "SBUX", name: /^Starbucks\b/i, why: "Starbucks Coffee Company, as the listing writes Starbucks Corporation's stores" }],
  794367: [{ ticker: "M", name: /^Macy['’]?s (?:East|West)\b/i, why: "Macy's East and Macy's West, the divisions Federated formed from R.H. Macy & Co. after their 1994 merger; never R.H. Macy's own \"Macy's California\" before it" }],
  15615: [{ ticker: "MTZ", name: /^MasTec\b/i, why: "MasTec Services Company and MasTec Advanced Technologies, its divisions" }],
  1037976: [{ ticker: "JLL", name: /^Jones Lang LaSalle\b/i, why: "Jones Lang LaSalle Americas, Inc., its US company" }],
  1090425: [{ ticker: "LAMR", name: /^Lamar Advertising\b/i, why: "Lamar Advertising's local companies (of Janesville, of Hartford)" }],
  78890: [{ ticker: "BCO", name: /^Brink['’]?s\b/i, why: "Brink's USA and the earlier Brink's armored-car companies, the record's own (it was The Pittston Company's before it took Brink's name)" }],
  61986: [
    {
      ticker: "MTW",
      name: /^Manitowoc Ice\b/i,
      to: "2016-03-03",
      why: "Manitowoc Ice, Inc., until the spin-off of Manitowoc Foodservice \"before the opening of business on March 4, 2016\" (8-K 0000061986-16-000077)",
    },
  ],
  823768: [{ ticker: "WM", name: /^Waste Management de\b/i, from: "1998-07-16", why: "Waste Management de Puerto Rico, from the merger with USA Waste Services, the day EPA's units read (lib/epaCases.ts)" }],
  1058290: [{ ticker: "CTSH", name: /^Cognizant Technology Solutions\b/i, why: "Cognizant Technology Solutions U.S. Corporation, its US company, joint employer with Google LLC (2023–2024)" }],
  91440: [{ ticker: "SNA", name: /^Snap-On\b/i, why: "Snap-On Tools Corp., its name to 1994, and Snap-on Tools, Inc." }],
  703351: [{ ticker: "EAT", name: /^Brinker International\b/i, why: "Brinker International Payroll Company, L.P., its restaurants' employer" }],
  1142417: [{ ticker: "NXST", name: /^Nexstar\b/i, why: "Nexstar Media Group, Inc. \"for their Station, KDVR-TV/KWGN-TV\", which the rule refuses for the words after the name" }],
  1563411: [{ ticker: "CSTM", name: /^Constellium\b/i, why: "Constellium Rolled Products Ravenswood, LLC, its West Virginia mill" }],
  1756770: [{ ticker: "CURLF", name: /^Curaleaf\b/i, why: "Curaleaf Massachusetts, Inc., its state company" }],
  1871509: [{ ticker: "PTLO", name: /^Portillo['’]?s\b/i, why: "Portillo's Hot Dogs, LLC, its restaurants' company" }],
  1454147: [{ ticker: "LOIMF", name: /^Loomis Armored\b/i, why: "Loomis Armored US, Inc., its US company" }],
  4457: [{ ticker: "UHAL", name: /^U-Haul\b/i, why: "U-Haul's state companies (of Nevada, of California)" }],
};

/** Employers the rule would give a company that are not its, by CIK, read by hand. */
export const NOT_THE_COMPANY: Readonly<Record<number, readonly { ticker: string; name: RegExp; why: string }[]>> = {
  // batch 162, read by hand in the listing's decisions of 1969–2026
  753308: [{ ticker: "NEE", name: /\bCredit Union\b/i, why: "Florida Power & Light Credit Union (1978), its employees' credit union, not the utility the release map gives NextEra" }],
  318833: [{ ticker: "TISI", name: /\bTEAM COMPANY\b/i, why: "\"TEAM COMPANY d/b/a STAFFQUICK\" (2016), a staffing company, not Team, Inc., which the rule reads in \"Team\" and \"Company\"" }],
  717720: [{ ticker: "VALU", name: /^Value Line Co\.?$/i, why: "\"Value Line Co.\" of the Memphis region's cases of 1986, not Value Line, Inc., the New York publisher" }],
  2070570: [{ ticker: "RECCY", name: /^The Reece Corp/i, why: "The Reece Corporation (1989), the Massachusetts machine maker, not Reece Limited, the Australian plumbing distributor" }],
  901491: [{ ticker: "PZZA", name: /^Papa['’]s Penn\b/i, why: "Papa's Penn Inc. d/b/a Papa John's (2017), a franchisee, whose restaurants trade under the brand's name" }],
  72741: [
    {
      ticker: "ES",
      name: /^Commonwealth Electric Company of the Midwest\b/i,
      why: "Commonwealth Electric Company of the Midwest (2024), an electrical contractor of Lincoln, Nebraska, not the Massachusetts utility Commonwealth Electric that the release map gives Eversource from 2012",
    },
  ],
  1049659: [{ ticker: "SID", name: /^National Steel\b/i, why: "National Steel Corporation, the American steelmaker, not Companhia Siderúrgica Nacional (as EPA's and the SEC's lists hold)" }],
  1306965: [
    {
      ticker: "SHEL",
      name: /^Shell Co\.?$/i,
      why: "\"Shell Co.\", the listing's Shell Company (Puerto Rico) of 1994: Shell's companies are Shell plc's only from 2005-07-20, when its record became the group's parent (the owner's call, as EPA's unit of Shell holds)",
    },
  ],
};

const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Whether a decision's employer is the company on its day, by its units, the namesakes and the rule. */
export function nlrbIsCompany(d: Pick<NlrbDecision, "name" | "day">, cik: number, names: () => string[]): boolean {
  const name = d.name.trim();
  if (NOT_THE_COMPANY[cik]?.some((r) => r.name.test(name))) return false;
  // a name the record took from another company is that company's before the day (lib/takenNames.ts)
  if (takenBefore(cik, d.day, name)) return false;
  const within = (u: { from?: string; to?: string }) => d.day >= (u.from ?? "") && (!u.to || d.day <= u.to);
  if (NLRB_UNITS[cik]?.some((u) => within(u) && u.name.test(name))) return true;
  // the units EPA's and the CPSC's rules read under their own names, on their days, as the Labor
  // Department's certifications read them (lib/taaPetitions.ts, batch 160); a branded site is no brand's
  if (EPA_UNITS[cik]?.some((u) => within(u) && u.defendant.test(name) && !(u.branded && BRANDED_SITE.test(name)))) return true;
  if (CPSC_UNITS[cik]?.some((u) => within(u) && u.firm.test(name))) return true;
  const held = names();
  const letters = alnum(name);
  if (!held.flatMap(andSpellings).some((n) => alnum(n).length >= 2 && letters.includes(alnum(n)))) return false;
  return epaParty(respondents(name), held) !== null;
}

const LIMIT = 900;

/** "375 NLRB No. 63, Tesla, Inc., case 03-CA-312352: an unfair labor practice case against the employer" */
const decisionLine = (d: NlrbDecision) => `${d.citation}, ${d.name}, case ${d.caseNumber}: ${KIND_LABEL[nlrbKind(d.caseNumber)!]}`;

/**
 * The company's decisions as timeline events, newest first, from `from`, its first price: one row a day,
 * each decision with its citation, caption, case number and kind, linked to the first's document. The
 * listing does not say how the Board ruled, and the row says so.
 */
export function nlrbEvents(
  decisions: readonly NlrbDecision[],
  namesIn: (year: number) => string[],
  { cik, from = "", namesOn }: { cik: number | string; from?: string; namesOn?: (day: string) => string[] },
): TimelineEvent[] {
  const tag = Number(cik);
  const byYear = new Map<number, string[]>();
  const yearNames = (year: number) => byYear.get(year) ?? byYear.set(year, namesIn(year)).get(year)!;
  const byDay = new Map<string, NlrbDecision[]>();
  for (const d of decisions) {
    if (d.day < from || d.day < ACT_DAY || !nlrbKind(d.caseNumber)) continue;
    if (!nlrbIsCompany(d, tag, () => [...yearNames(Number(d.day.slice(0, 4))), ...eeocUnitNamesOn(tag, d.day), ...(namesOn?.(d.day) ?? [])])) continue;
    (byDay.get(d.day) ?? byDay.set(d.day, []).get(d.day)!).push(d);
  }
  return [...byDay.entries()]
    .sort(([x], [y]) => y.localeCompare(x))
    .map(([day, found]) => {
      const kept = [...new Map(found.map((d) => [d.document, d])).values()].sort((a, b) => a.citation.localeCompare(b.citation, "en", { numeric: true }) || a.caseNumber.localeCompare(b.caseNumber));
      const one = kept[0];
      const title =
        kept.length === 1
          ? `NLRB decision: ${one.name}, ${one.citation} (case ${one.caseNumber}), ${KIND_LABEL[nlrbKind(one.caseNumber)!]}`
          : `${kept.length} NLRB decisions: ${[...new Set(kept.map((d) => d.name))].join("; ")}`;
      const body = `${kept.map(decisionLine).join(". ")}. How the Board ruled is in the decision; the Board's listing does not say.`;
      const basis = `nlrb:${tag}@${day}`;
      return {
        id: `nlrb-${tag}-${day}`,
        date: day,
        type: "regulation" as const,
        title: title.length <= 300 ? title : `${title.slice(0, 299).replace(/\s+\S*$/, "")}…`,
        description: body.length <= LIMIT ? body : `${body.slice(0, LIMIT - 1).replace(/\s+\S*$/, "")}…`,
        source: "NLRB",
        url: nlrbDocumentUrl(one.document),
        sourceKey: "nlrb_decisions" as const,
        // the decisions' documents, each the same on every page a joint employers' decision is on ("Also on")
        externalId: kept.map((d) => d.document).join(","),
        // the company's one event a day
        dedupBasis: basis,
      };
    });
}

/**
 * Whether `now` is in the NLRB's night window for bulk reads, 11 pm to 6 am Eastern ("between 11pm EST – 6am
 * EST", its policy), with `room` minutes left in it for the read to finish: the whole listing is about 15
 * minutes at `GAP_MS`.
 */
export function inNightWindow(now: Date, room = 45): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  const minutes = hour * 60 + minute;
  // minutes since 23:00, wrapping past midnight
  const since = (minutes - 23 * 60 + 24 * 60) % (24 * 60);
  return since < 7 * 60 - room;
}

export type NlrbAnswer = { decisions: NlrbDecision[]; rows: number; lastPage: number | null; outcome: "ok" | "throttled" | "error"; httpStatus?: number; detail?: string };

/**
 * A page of the listing. A page without the listing on it is an error, not an empty page; the firewall's
 * "Request Rejected" page is a refusal, whatever its status.
 */
export async function fetchNlrbPage(page: number): Promise<NlrbAnswer> {
  const none = { decisions: [], rows: 0, lastPage: null };
  try {
    const res = await fetch(nlrbPageUrl(page), { headers: { ...UA, Accept: "text/html" }, signal: AbortSignal.timeout(90_000) });
    if (res.status === 403 || res.status === 429 || res.status === 503) return { ...none, outcome: "throttled", httpStatus: res.status };
    if (!res.ok) return { ...none, outcome: "error", httpStatus: res.status };
    const html = await res.text();
    const got = parseNlrbListing(html);
    if (!got.table && REJECTED.test(html)) return { ...none, outcome: "throttled", httpStatus: res.status, detail: "the site's firewall rejected the request" };
    if (!got.table) return { ...none, outcome: "error", httpStatus: res.status, detail: "no listing on the page" };
    return { decisions: got.decisions, rows: got.rows, lastPage: got.lastPage, outcome: "ok", httpStatus: res.status };
  } catch (err) {
    return { ...none, outcome: "error", detail: String(err).slice(0, 200) };
  }
}
