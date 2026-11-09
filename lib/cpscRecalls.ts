import { UA } from "./contact";
import { andSpellings } from "./edgarName";
import { epaParty } from "./epaCases";
import type { TimelineEvent } from "./types";
import { takenBefore } from "./takenNames";

/**
 * Consumer-product recalls on the pages of the companies that made, imported, distributed or sold
 * the product (batch 96, the 2026-10-22 shortlist's #4, approved by the owner on 2026-11-05: "Yes I
 * would like to add product safety recalls.").
 *
 * The U.S. Consumer Product Safety Commission's keyless recall service answers every recall at
 * once: `www.saferproducts.gov/RestWebServices/Recall?format=json`, 28 MB, 10,070 recalls from
 * 1973-06-08 to 2026-10-29 (measured 2026-11-05). It is read once a week for every company and
 * kept (`lib/ingest/cpscWalk.ts`, db/038). A recall names its firms by role: manufacturers,
 * importers and distributors each by name ("Office Depot, Inc., of Boca Raton, Fla."), and the
 * stores that sold it in one line ("Sold At: Target, Walmart, and … online at Amazon.com").
 *
 * The owner's rule of 2026-11-05 applies: every listed company a recall names gets it. A company
 * that made, imported or distributed the product gets the recall on its own row; one that only
 * sold it gets it grouped, a row a month, since a large retailer sold the products of hundreds
 * of recalls (Walmart is named on 709) and they are other makers' news.
 *
 * Licence: the recalls are the Commission's own work, a work of the U.S. Government, which 17
 * U.S.C. § 105 puts outside copyright; the federal data catalog lists the Recalls API under the
 * usa.gov public-domain label (the 2026-10-22 shortlist). Not re-read here: from this session
 * cpsc.gov and saferproducts.gov's pages answered 403 and the catalog's search 404 (2026-11-05);
 * the service itself answered. Used: each recall's title, day, hazard, number of units, the firms
 * it names and a link to its notice — never its images.
 */
export const RECALLS_URL = "https://www.saferproducts.gov/RestWebServices/Recall?format=json";

export interface CpscRecall {
  /** the Commission's recall number, "27055" */
  number: string;
  day: string;
  title: string;
  /** the recall's notice on cpsc.gov */
  url: string | null;
  hazard: string | null;
  units: string | null;
  makers: string[];
  importers: string[];
  distributors: string[];
  /** the stores that sold it, as one line of text */
  soldAt: string;
}

interface RawRecall {
  RecallNumber?: string | number;
  RecallID?: number;
  RecallDate?: string;
  Title?: string;
  URL?: string;
  Products?: { NumberOfUnits?: string }[];
  Hazards?: { Name?: string }[];
  Manufacturers?: { Name?: string }[];
  Importers?: { Name?: string }[];
  Distributors?: { Name?: string }[];
  Retailers?: { Name?: string }[];
}

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const names = (list: { Name?: string }[] | undefined) => [...new Set((list ?? []).map((x) => clean(x.Name)).filter(Boolean))];

/** The recalls in the service's answer, each with a day; a row without one is left out. */
export function parseRecalls(json: unknown): CpscRecall[] {
  if (!Array.isArray(json)) return [];
  const out: CpscRecall[] = [];
  for (const r of json as RawRecall[]) {
    const day = /^(\d{4}-\d{2}-\d{2})/.exec(r.RecallDate ?? "")?.[1];
    const number = clean(String(r.RecallNumber ?? r.RecallID ?? ""));
    const title = clean(r.Title);
    if (!day || !number || !title) continue;
    const url = /^https:\/\/(?:www\.)?cpsc\.gov\//.test(r.URL ?? "") ? (r.URL as string) : null;
    out.push({
      number,
      day,
      title,
      url,
      hazard: clean(r.Hazards?.[0]?.Name) || null,
      units: clean(r.Products?.[0]?.NumberOfUnits) || null,
      makers: names(r.Manufacturers),
      importers: names(r.Importers),
      distributors: names(r.Distributors),
      soldAt: names(r.Retailers).join("; "),
    });
  }
  return out;
}

/**
 * A firm as a recall writes it, without its place: "Office Depot, Inc., of Boca Raton, Fla." →
 * "Office Depot, Inc."; "The Wick & Petal Co. of Indianapolis, Ind." → "The Wick & Petal Co.";
 * "Asweets Global Inc., City of Industry, California" → "Asweets Global Inc." (batch 100: the
 * place was cut at its "of", which left "…Inc., City", and "City" named City Holding).
 */
export function firmName(entry: string): string {
  return (
    clean(entry)
      // a place whose own name holds "of": "City of Industry", "City of Commerce", "Town of Wheatland"
      .replace(/,\s+(?:City|Town|Village|Borough|Township)\s+of\s+[A-Z][^,]*(?:,\s*[A-Z][\w. ]*)*\.?$/, "")
      // "…, a division of Office Depot, Inc." names an owner, not a place
      .replace(/(?<!\b(?:division|subsidiary|unit|affiliate|City|Town|Village|Borough|Township)),?\s+of\s+[A-Z][^,]*(?:,\s*[A-Z][\w. ]*)*\.?$/i, "")
      .replace(/,\s*$/, "")
      .trim()
  );
}

/**
 * Whether a firm the recall names as maker, importer or distributor is the company: the firm by
 * the caption rule with the EPA rule's two guards (`epaParty`: one name joined by "and" is one
 * name, so "Allied Tube and Conduit Corporation" is not Conduit's and "Adam and Eve" not Eve's;
 * a person written surname first is no company), or the parent it names as its owner ("Swinton
 * Avenue Trading, a division of Office Depot").
 */
export function firmIsCompany(entry: string, names: readonly string[]): boolean {
  const firm = firmName(entry);
  const parent = /,?\s+an?\s+(?:division|subsidiary|unit|affiliate)\s+of\s+(.+)$/i.exec(firm);
  if (epaParty(parent ? firm.slice(0, parent.index) : firm, names)) return true;
  return !!parent && !!epaParty(firmName(parent[1]), names);
}

const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const LETTERS = new WeakMap<CpscRecall, string>();
/** Every firm and store a recall names, in letters only, worked out once a recall. */
function lettersOf(r: CpscRecall): string {
  let held = LETTERS.get(r);
  if (held === undefined) {
    held = letters([...r.makers, ...r.importers, ...r.distributors, r.soldAt].join(" "));
    LETTERS.set(r, held);
  }
  return held;
}

/**
 * Whether the stores a recall names hold the company. The line lists them by name ("Target,
 * Walmart, and coffee and home goods stores nationwide and online at Bodum.com, Amazon.com,
 * Target.com"), so a store counts only as a whole item of the list, its name and nothing else
 * but a web address's ".com" or "stores": "Target" and "Target.com" are Target's, "Target
 * Marketing Systems" is not, nor is "home goods stores" Home Depot's. A store is a proper name
 * (batch 100): an item written all in small letters is a kind of store, "coffee and home goods
 * stores" names no Coffee Holding, unless it is a web address ("amazon.com"); and a name's
 * closing "s" is dropped only against an item written with a possessive, so "Lowe's" is
 * Lowe's and "A&E stores" is not AES.
 */
export function soldAtCompany(soldAt: string, names: readonly string[]): boolean {
  const keys = new Set(names.map(letters).filter((k) => k.length >= 3));
  if (!keys.size) return false;
  const text = soldAt
    .replace(/^\s*sold\s+(?:exclusively\s+)?(?:at|by|through)\s*:?\s*/i, "")
    .replace(/\s+(?:from|between|during|in)\s+(?:about\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December|\d{4})\b.*$/i, "");
  for (const raw of text.split(/\s*(?:[,;:/]|\band\b|\bor\b|\n)\s*/i)) {
    const named = raw
      .replace(/^(?:and\s+)?(?:(?:exclusively|online|nationwide)\s+)*(?:at|through|by|on|in)?\s*(?:the\s+)?/i, "")
      .replace(/\s+(?:retail\s+)?(?:stores?|locations|nationwide|online|websites?|catalogs?|outlets?|clubs?)(?:\s+(?:nationwide|online|and\s+online))*$/i, "");
    const web = /\.(?:com|net)$/i.test(named);
    if (!web && !/\p{Lu}/u.test(named)) continue;
    const possessive = /['’]s$/i.test(named);
    const key = letters(named.replace(/\.(?:com|net)$/i, "").replace(/['’]s$/i, "").trim());
    if (key && [...keys].some((k) => key === k || (possessive && key === letters(k.replace(/s$/, ""))))) return true;
  }
  return false;
}

/**
 * The firms and stores a recall names that are another company's though they carry a listed
 * company's name, read by hand on 2026-11-05 (batch 100, the audit of batches 94–99) among the 269
 * firm names and the stores the 10,070 recalls gave the index, by CIK. `firm` refuses a maker,
 * importer or distributor the pattern matches, from `from` when given (a name the company's record
 * took from another company is refused before that day by lib/takenNames.ts, batch 117); `store` refuses a store
 * line the pattern matches, or every one ("never") for a company that is no retailer. Firms that
 * are other companies' but whose recalls come before the company's first price are left to the
 * floor: STIHL's VIKING GmbH (Viking Holdings, 2024), Innovage LLC (InnovAge, 2021), the go-kart
 * "Fox" (Fox Corp, 2019). Ingersoll-Rand Company's are refused on Ingersoll Rand Inc. by its taken
 * name's day, 2020-02-28 (lib/takenNames.ts, batch 117).
 */
export const NOT_THE_COMPANY: Readonly<Record<number, { ticker: string; firm?: RegExp; from?: string; store?: RegExp | "never"; why: string }[]>> = {
  42888: [{ ticker: "GGG", firm: /^Graco(?:\s+Children['’]s\s+Products\b.*)?$/i, why: "Graco Children's Products of Elverson, Pennsylvania (strollers, swings, playards), not Graco Inc., the Minneapolis pump and sprayer maker" }],
  1032033: [{ ticker: "SLM", firm: /^SLM\b/i, why: "SLM International, Buddy L's toy-making parent, not SLM Corporation (Sallie Mae)" }],
  1126956: [{ ticker: "SR", firm: /^Spire LLC\b/i, why: "Spire LLC d/b/a StoreYourBoard.com of Troy, Virginia, not Spire Inc., the gas utility" }],
  1800227: [{ ticker: "PPLI", firm: /^HSN\b/i, from: "2008-08-20", why: "HSN, Inc., the shopping network IAC spun off on 2008-08-20; before that HSN was IAC's own" }],
  108312: [{ ticker: "WWD", firm: /^Woodward$/i, why: "Woodward & Lothrop, the department store, which the 1985 recall lists as \"Woodward\" and \"Lothrop\", not Woodward, Inc." }],
  1551182: [{ ticker: "ETN", firm: /^Eaton$/i, why: "an \"Eaton\" among the aluminum bat makers of 1975 and 1976, which the recalls do not tie to Eaton Corporation" }],
  1190370: [{ ticker: "IVDN", firm: /^Innovative Designs LLC\b/i, why: "Innovative Designs LLC of New York (light-up bracelets), not Innovative Designs, Inc. of Pittsburgh" }],
  1895262: [{ ticker: "NE", store: "never", why: "Noble Corporation drills offshore wells; \"Barnes and Noble\" is the bookseller" }],
  1587603: [{ ticker: "WNRS", store: "never", why: "Winners, Inc. is a sports-betting media company; \"Winners\" is TJX's Canadian chain" }],
  1015383: [{ ticker: "POWW", store: "never", why: "Outdoor Holding sells ammunition; \"Outdoor and ski supply stores\" is a kind of store" }],
  1013488: [{ ticker: "BJRI", store: "never", why: "BJ's Restaurants sells no products; \"BJ's\" is BJ's Wholesale Club" }],
  775158: [{ ticker: "OSK", store: "never", why: "Oshkosh Corporation makes trucks; \"OshKosh\" stores are OshKosh B'gosh's, Carter's brand" }],
  709283: [{ ticker: "QMCO", store: "never", why: "Quantum Corporation makes data storage; \"Quantum and e4L\" were television marketers" }],
  1107280: [{ ticker: "OVTZ", store: "never", why: "Oculus Inc. is not Oculus.com, Meta's store" }],
  763901: [{ ticker: "BPOP", store: "never", why: "Popular, Inc. is a bank; \"Popular Club\" was a mail-order catalog" }],
  945841: [{ ticker: "POOL", store: /\bPool and Spa\b/i, why: "\"Pool and Spa dealers\" and \"Pool and Spa Depot\" are kinds and names of stores, not Pool Corporation" }],
  1166691: [{ ticker: "CMCSA", store: /\btelevision networks? airing on\b/i, why: "Shop LC's television network airing on Comcast's channels: Shop LC sold it" }],
  1428439: [{ ticker: "ROKU", store: /\btelevision networks? airing on\b/i, why: "Shop LC's television network airing on Roku: Shop LC sold it" }],
  // batch 116's T entry, AT&T Corp.'s 1995 charger, is lib/takenNames.ts's (batch 117)
};

/**
 * The units a listed company owned that recalls name by their own name, by the owner's CIK, each
 * between the days the company owned it, read by hand (the owner's call of 2026-11-06: "Put … Graco
 * on Newell"; the 2026-11-09 proposal 1, approved by the owner that day, batch 126). `key` is the
 * letters the stored recalls are asked by; every firm a pattern takes holds one of its unit's keys.
 * The caption rule refuses a company's name followed by words that are not legal words, as it
 * should, so "American Honda Motor Co., Inc." and "Home Depot U.S.A., Inc." need an entry here.
 *
 * - Graco Children's Products is Newell's from 1999-03-24, the day Newell merged with Rubbermaid,
 *   Graco's owner: Newell's EDGAR record ends its name "NEWELL CO" on 1999-03-23 and its 8-K of
 *   1999-03-25 reports an acquisition completed on 1999-03-24 (item 2). Graco's recalls before
 *   are no listed company's, and none is Graco Inc.'s (`NOT_THE_COMPANY`).
 *
 * Batch 126: 81 more units on 47 companies, in 103 entries, one for each key. A unit named after its
 * owner, or the owner's own since before EDGAR, counts from the owner's first price, the floor every
 * recall has. A bought or sold unit counts between the days data.sec.gov's filing lists give, read on
 * 2026-11-09 by the batch 120 rule: the earliest report day of the deal's 8-K (item 2.01, or item 2
 * before 2004), else the bought company's own filings (its 8-K of the change in control, its Form 25
 * or 15). Where no 8-K reports the deal, EDGAR's full-text search (efts.sec.gov) gives the two filings
 * around it: a unit bought counts from the first filing that names it as the owner's, and a unit sold
 * to the last that shows it held, and no recall of the unit falls between the two. A day before 2001
 * that only a filing's text gives waits for `NEWS_CHARTS_CONTACT` (below).
 * - Named after the owner: American Honda Motor and Honda Power Equipment (Honda); Textron
 *   Specialized Vehicles and Greenlee Textron; GE Consumer & Industrial, GE Infrastructure Sensing
 *   and GE Interlogix (GE's from its purchase, whose name it took); Acuity Brands Lighting and its
 *   divisions (from Acuity's first price, its spin-off; Lithonia "a division of National Service
 *   Industries" is not); Generac Power Systems; The William Carter Company; Amazon.com Services;
 *   Home Depot U.S.A. and Home Depot Product Authority; Macy's Merchandising Group; Best Buy
 *   Purchasing; Gap Outlet; Dollar General Merchandising and Stores; Walt Disney Parks and Resorts and
 *   Disney's merchandise companies; Sony Electronics, Energy Devices and Computer Entertainment; The
 *   Children's Place Services and Retail Stores; Emerson Tool; Brunswick Bowling & Billiards (a name
 *   the units sold in 2014 do not carry); John Deere; Masco Canada; Philips' Lighting, Consumer,
 *   Electronics, Personal Health and Entertainment companies (Philips Lighting is Signify since 2018;
 *   its last recall under Philips' name, of 2017-03-01, came while Philips held most of it); VF's
 *   divisions; NIKE USA; Lowe's Home Centers; Target Stores; Kohl's Department Stores; Ross
 *   Procurement; Dollar Tree Distribution.
 * - The owner's own since before EDGAR: E-Z-GO (Textron's since 1960, EPA's rule reads it too);
 *   KitchenAid (Whirlpool's); Pottery Barn and West Elm (Williams-Sonoma's); Bloomingdale's (Macy's,
 *   Federated's record); Old Navy (Gap's); White-Rodgers and InSinkErator (Emerson's); Delta Faucet
 *   (Masco's); Brita LP and Clorox Manufacturing (Clorox's); Eveready Battery (Energizer's, Edgewell's
 *   record, from its first price).
 * - Bought, each from its day: Black & Decker (U.S.) and DeWALT on Stanley Black & Decker from
 *   2010-03-12 (Black & Decker's 8-K, items 2.01 and 5.01); Arctic Cat on Textron from 2017-03-06
 *   (Arctic Cat's 8-K, items 2.01 and 5.01, and its Form 25); Maytag on Whirlpool from 2006-03-31
 *   (Whirlpool's 8-K, item 2.01); OshKosh B'gosh on Carter's from 2005-07-14 (item 2.01); Black
 *   Diamond Equipment on Clarus from 2010-05-28 (item 2.01); Viking Range on Middleby from
 *   2012-12-31 (Middleby's 8-K of 2013-01-07, items 1.01 and 2.01: a year before the scout's draft);
 *   Fred Meyer on Kroger from 1999-05-28 (Kroger's 8-K, item 2; Fred Meyer's Form 15 of 1999-06-08);
 *   Trane U.S. on Trane Technologies from 2008-06-05 (Ingersoll-Rand Company Limited's 8-K, items
 *   1.01 and 2.01); Cooper Lighting on Eaton from 2012-11-30 (Eaton Corporation's 8-K of 2012-12-04,
 *   item 2.01); Playtex Products on Edgewell from 2007-10-01 (item 2.01); Rust-Oleum on RPM from
 *   1994-06-28 (item 2); Kaz on Helen of Troy from 2010-12-30 and OXO from 2004-06-01 (items 2.01 and
 *   2); Vans on VF from 2004-06-30 (item 2), The North Face from 2000-08-14 (its Form 15); Sunbeam
 *   Products, Coleman, Contigo and Yankee Candle on Newell from 2016-04-15 (Jarden's 8-K, item 5.01,
 *   and its Form 25 of 2016-04-18); Family Dollar on Dollar Tree from 2015-07-06 (item 2.01); Gillette
 *   on Procter & Gamble from 2005-10-03 (Gillette's Form 15; P&G's 8-K of 2005-10-04, item 2.01); Fitbit
 *   on Alphabet from 2021-01-14 (Fitbit's 8-K, items 2.01 and 5.01, and its Form 25); Applica on
 *   Spectrum Brands from 2011-01-07, the day SPB's record, Harbinger's, took a majority of Spectrum
 *   (lib/takenNames.ts); Little Tikes on Newell from 1999-03-24, as Graco.
 * - Bought, from the first filing that names them as the owner's (full-text search): Kidde on RTX
 *   from 2005-04-26 (United Technologies' 10-Q of that day, the first to say it "completed the
 *   acquisition of Kidde"; its 8-K of 2004-12-17 announced the offer); Nest Labs on Alphabet from
 *   2014-04-24 (Google's 10-Q, "completed the acquisition of Nest"; its 8-K of 2014-01-13 the
 *   agreement); MTD Products on Stanley Black & Decker from 2022-02-22 (its 10-K; its 10-Q of
 *   2021-11-12 holds MTD Holdings as an investment); AGA Rangemaster on Middleby from 2015-11-10 (its
 *   results release, "completed the acquisition of AGA"); Rejuvenation on Williams-Sonoma from
 *   2011-11-17 (its results release, "acquired Rejuvenation"); American Girl on Mattel from
 *   2001-03-28, Life Fitness on Brunswick from 2001-03-09, Exmark on Toro from 2001-01-29 and
 *   Calphalon on Newell from 2001-03-27 (each owner's 10-K, the first filing full-text search reaches:
 *   each was bought in the 1990s, and none has a recall before 2002).
 * - Sold, each to its day: White-Rodgers to 2023-05-30 (Emerson's 8-K reporting 2023-05-31, item 2.01,
 *   the Copeland sale); InSinkErator to 2022-10-30 (Whirlpool's 8-K reporting 2022-10-31, item 2.01);
 *   Life Fitness to 2019-06-26 (Brunswick's 8-K reporting 2019-06-27, item 2.01); Eveready Battery to
 *   2015-06-29 (Edgewell's 8-K reporting 2015-06-30, item 2.01, the spin-off of Energizer); Family
 *   Dollar to 2025-07-04 (Dollar Tree's 8-K reporting 2025-07-05, item 2.01); Kidde to 2020-04-01 on
 *   RTX, and Carrier Global's from 2020-04-02 with Edwards Fire Safety, as EPA's rule splits them
 *   (batch 120).
 * - Sold, to the last filing that shows them held (full-text search): GE Appliances to 2016-05-04
 *   (GE's 10-Q of that day; its next, of 2016-08-01, says it "completed the sale of our Appliances"
 *   business to Haier), and "GE Appliances, a Haier company" is refused; GE Lighting to 2020-04-29
 *   (its 10-Q; its results release of 2020-07-29 is the first to name Savant), and "GE Lighting, a
 *   Savant company" is refused; GE Security to 2010-02-11 (United Technologies' 10-K of that day
 *   holds the purchase pending); Cooper Lighting to 2020-02-26 (Eaton's 10-K; its 10-Q of 2020-04-30
 *   reports the sale to Signify); Little Tikes to 2006-06-30 (Newell's 10-Q for that quarter; its next
 *   reports the sale to MGA); Emerson Motor to 2009-11-23 (Emerson's 10-K, the last to name it; the
 *   motors business went to Nidec in 2010); Stanley Security Solutions to 2017-02-15 (Stanley Black &
 *   Decker's 10-K; its 10-Q of 2017-04-25 reports the sale of the mechanical security business, whose
 *   locks the recalls name, to dormakaba: dormakaba's recall of 2018-12-12 is no page's).
 * - The Disney Store is Disney's to 2004-11-21 and again from 2008-11-20: The Children's Place bought
 *   it (its 8-K reporting 2004-11-22, item 2.01), and Disney's 10-K of 2008-11-20 is its first annual
 *   report after taking the stores back. The Disney Store's two recalls of 2008-05-22, imported by
 *   The Children's Place's Hoop Retail Stores, are no page's.
 * - Left out: Fisher-Price (Mattel's from 1993-11-30, before Mattel's first EDGAR filing of
 *   1994-02-03), Hasbro's Playskool and Milton Bradley (1984) and Kenner and Tonka (1991), Carrier on
 *   RTX before 2020 (1979) and Lawn-Boy on Toro (1989): their days need a filing's text, which
 *   www.sec.gov serves only with `NEWS_CHARTS_CONTACT` set. Baby Jogger: Newell's filings name it
 *   first in 2015, after its last recall. MTD's Cub Cadet, Rubbermaid, Mega Brands, Timberland, Bryant
 *   and First Alert: no recall falls in their owners' days.
 */
export interface CpscUnit {
  ticker: string;
  unit: string;
  firm: RegExp;
  key: string;
  from?: string;
  to?: string;
}
const unit = (ticker: string, name: string, firm: RegExp, keys: readonly string[], days: { from?: string; to?: string } = {}): CpscUnit[] =>
  keys.map((key) => ({ ticker, unit: name, firm, key, ...days }));
export const UNITS: Readonly<Record<number, readonly CpscUnit[]>> = {
  814453: [
    { ticker: "NWL", unit: "Graco Children's Products", firm: /^Graco(?:\s+Children['’]s\s+Products\b.*)?$/i, key: "graco", from: "1999-03-24" },
    ...unit("NWL", "Little Tikes", /^Little Tikes\b/i, ["littletikes"], { from: "1999-03-24", to: "2006-06-30" }),
    ...unit("NWL", "Calphalon", /^Calphalon\b/i, ["calphalon"], { from: "2001-03-27" }),
    ...unit("NWL", "Jarden's companies", /^(?:Sunbeam Products|(?:The )?Coleman Company|Contigo|(?:The )?Yankee Candle)\b/i, ["sunbeamproducts", "colemancompany", "contigo", "yankeecandle"], { from: "2016-04-15" }),
  ],
  715153: [
    ...unit("HMC", "American Honda Motor", /^American Honda Motor\b/i, ["americanhondamotor"]),
    ...unit("HMC", "Honda Power Equipment", /^Honda Power Equipment\b/i, ["hondapowerequipment"]),
  ],
  217346: [
    ...unit("TXT", "Textron Specialized Vehicles", /^Textron Specialized Vehicles\b/i, ["textronspecialized"]),
    ...unit("TXT", "E-Z-GO", /^(?:Textron )?E-Z-GO\b/i, ["ezgo"]),
    ...unit("TXT", "Greenlee Textron", /^Greenlee Textron\b/i, ["greenleetextron"]),
    ...unit("TXT", "Arctic Cat", /^Arctic Cat\b/i, ["arcticcat"], { from: "2017-03-06" }),
  ],
  93556: [
    ...unit("SWK", "Black & Decker (U.S.)", /^(?:Craftsman by )?Black (?:&|and) Decker \(U\.S\.\)/i, ["blackdeckerus", "blackanddeckerus"], { from: "2010-03-12" }),
    ...unit("SWK", "DeWALT", /^DE ?WALT\b/i, ["dewalt"], { from: "2010-03-12" }),
    ...unit("SWK", "MTD Products", /^MTD Products\b/i, ["mtdproducts"], { from: "2022-02-22" }),
    ...unit("SWK", "Stanley Security Solutions", /^Stanley Security Solutions\b/i, ["stanleysecuritysolutions"], { to: "2017-02-15" }),
  ],
  106640: [
    ...unit("WHR", "Maytag", /^Maytag\b/i, ["maytag"], { from: "2006-03-31" }),
    ...unit("WHR", "KitchenAid", /^KitchenAid\b/i, ["kitchenaid"]),
  ],
  40545: [
    ...unit("GE", "GE Appliances", /^(?:GE Appliances(?!\s*,\s*a\s+Haier)(?:\s+(?:&|and)\s+Lighting)?|General Electric(?:\s*-)?\s+Appliances)\b/i, ["geappliances", "generalelectricappliances"], { to: "2016-05-04" }),
    ...unit("GE", "GE Consumer & Industrial", /^GE Consumer (?:&|and) Industrial\b/i, ["geconsumer"]),
    ...unit("GE", "GE Lighting", /^GE Lighting\b(?!\s*,\s*a\s+Savant)/i, ["gelighting"], { to: "2020-04-29" }),
    ...unit("GE", "GE Security and GE Interlogix", /^GE (?:Security|Interlogix)\b/i, ["gesecurity", "geinterlogix"], { to: "2010-02-11" }),
    ...unit("GE", "GE Infrastructure Sensing", /^GE Infrastructure Sensing\b/i, ["geinfrastructure"]),
  ],
  719955: [
    ...unit("WSM", "Pottery Barn", /^(?:Williams[- ]Sonoma\/)?Pottery Barn\b/i, ["potterybarn"]),
    ...unit("WSM", "West Elm", /^West Elm\b/i, ["westelm"]),
    ...unit("WSM", "Rejuvenation", /^Rejuvenation$/i, ["rejuvenation"], { from: "2011-11-17" }),
  ],
  1144215: [
    ...unit("AYI", "Acuity Brands Lighting and its divisions",
      /^(?:Lithonia Lighting(?!\s*,\s*a\s+division\s+of\s+National\s+Service)|Acuity Brands Lighting|Holophane|American Electric Lighting\s*,\s*a\s+division\s+of\s+Acuity|Gotham Architectural Lighting\s*,?\s*division\s+of\s+Acuity)\b/i,
      ["lithonia", "acuitybrandslighting", "holophane", "americanelectriclighting", "gothamarchitectural"]),
  ],
  1474735: [...unit("GNRC", "Generac Power Systems", /^Generac Power Systems\b/i, ["generacpowersystems"])],
  1060822: [
    ...unit("CRI", "The William Carter Company", /^The William Carter Co/i, ["williamcarter"]),
    ...unit("CRI", "OshKosh B'gosh", /^OshKosh B['’]?gosh\b/i, ["oshkoshbgosh"], { from: "2005-07-14" }),
  ],
  1018724: [...unit("AMZN", "Amazon.com Services", /^Amazon\.com (?:Services )?LLC\b/i, ["amazoncomservices", "amazoncomllc"])],
  354950: [...unit("HD", "Home Depot U.S.A. and Home Depot Product Authority", /^Home Depot (?:U\.?S\.?A\.?|Product Authority)\b/i, ["homedepotusa", "homedepotproduct"])],
  794367: [
    ...unit("M", "Macy's Merchandising Group", /^Macy['’]?s Merchandising Group\b/i, ["macysmerchandising"]),
    ...unit("M", "Bloomingdale's", /^Bloomingdale['’]?s\b/i, ["bloomingdales"]),
  ],
  764478: [...unit("BBY", "Best Buy Purchasing", /^Best Buy Purchasing\b/i, ["bestbuypurchasing"])],
  39911: [
    ...unit("GAP", "Old Navy", /^Old Navy\b/i, ["oldnavy"]),
    ...unit("GAP", "Gap Outlet", /^Gap Outlet\b/i, ["gapoutlet"]),
  ],
  29534: [...unit("DG", "Dollar General Merchandising and Stores", /^Dollar General (?:Merchandising|Stores)\b/i, ["dollargeneralmerchandising", "dollargeneralstores"])],
  1466258: [...unit("TT", "Trane U.S.", /^(?:The )?Trane(?: U\.?S\.?)?(?: Inc\.?| Co\.?| Company)?$/i, ["trane"], { from: "2008-06-05" })],
  101829: [...unit("RTX", "Kidde", /^Walter Kidde Portable Equipment\b/i, ["walterkidde"], { from: "2005-04-26", to: "2020-04-01" })],
  1783180: [
    ...unit("CARR", "Kidde", /^Walter Kidde Portable Equipment\b/i, ["walterkidde"], { from: "2020-04-02" }),
    ...unit("CARR", "Edwards Fire Safety", /^Edwards Fire Safety\b/i, ["edwardsfire"], { from: "2020-04-02" }),
  ],
  913277: [...unit("CLAR", "Black Diamond Equipment", /^Black Diamond (?:Equipment|Ltd)\b/i, ["blackdiamondequipment", "blackdiamondltd"], { from: "2010-05-28" })],
  769520: [
    ...unit("MIDD", "Viking Range", /^Viking Range\b/i, ["vikingrange"], { from: "2012-12-31" }),
    ...unit("MIDD", "AGA Rangemaster", /^AGA Rangemaster\b/i, ["agarangemaster"], { from: "2015-11-10" }),
  ],
  109177: [...unit("SPB", "Applica", /^Applica Consumer Products\b/i, ["applica"], { from: "2011-01-07" })],
  1744489: [
    ...unit("DIS", "Walt Disney Parks and Resorts", /^Walt Disney Parks and Resorts\b/i, ["waltdisneyparks"]),
    ...unit("DIS", "Disney's merchandise companies", /^Disney (?:Destinations|Merchandise)\b/i, ["disneydestinations", "disneymerchandise"]),
    ...unit("DIS", "The Disney Store", /^(?:The )?Disney Store\b/i, ["disneystore"], { to: "2004-11-21" }),
    ...unit("DIS", "The Disney Store", /^(?:The )?Disney Store\b/i, ["disneystore"], { from: "2008-11-20" }),
  ],
  313838: [...unit("SONY", "Sony Electronics, Energy Devices and Computer Entertainment", /^Sony (?:Electronics|Energy Devices|Computer Entertainment)\b/i, ["sonyelectronics", "sonyenergy", "sonycomputer"])],
  1041859: [...unit("PLCE", "The Children's Place Services and Retail Stores", /^The Children['’]?s Place (?:Services|Retail)\b/i, ["childrensplaceservices", "childrensplaceretail"])],
  56873: [...unit("KR", "Fred Meyer", /^Fred Meyer\b/i, ["fredmeyer"], { from: "1999-05-28" })],
  32604: [
    ...unit("EMR", "White-Rodgers", /^White[- ]Rodgers\b/i, ["whiterodgers"], { to: "2023-05-30" }),
    ...unit("EMR", "Emerson Tool", /^(?:The )?Emerson Tool Co/i, ["emersontool"]),
    ...unit("EMR", "Emerson Motor", /^(?:The )?Emerson Motor Co/i, ["emersonmotor"], { to: "2009-11-23" }),
    ...unit("EMR", "InSinkErator", /^InSinkErator\b/i, ["insinkerator"], { to: "2022-10-30" }),
  ],
  1551182: [...unit("ETN", "Cooper Lighting", /^Cooper Lighting\b/i, ["cooperlighting"], { from: "2012-11-30", to: "2020-02-26" })],
  14930: [
    ...unit("BC", "Brunswick Bowling & Billiards", /^Brunswick Bowling (?:&|and) Billiards\b/i, ["brunswickbowling"]),
    ...unit("BC", "Life Fitness", /^Life Fitness\b/i, ["lifefitness"], { from: "2001-03-09", to: "2019-06-26" }),
  ],
  1096752: [
    ...unit("EPC", "Playtex Products", /^Playtex Products\b/i, ["playtexproducts"], { from: "2007-10-01" }),
    ...unit("EPC", "Eveready Battery", /^Eveready Battery\b/i, ["evereadybattery"], { to: "2015-06-29" }),
  ],
  110621: [...unit("RPM", "Rust-Oleum", /^Rust-?Oleum\b/i, ["rustoleum"], { from: "1994-06-28" })],
  916789: [
    ...unit("HELE", "Kaz", /^Kaz USA\b/i, ["kazusa"], { from: "2010-12-30" }),
    ...unit("HELE", "OXO", /^OXO$/i, ["oxo"], { from: "2004-06-01" }),
  ],
  315189: [...unit("DE", "John Deere", /^John Deere\b/i, ["johndeere"])],
  737758: [...unit("TTC", "Exmark", /^Exmark\b/i, ["exmark"], { from: "2001-01-29" })],
  62996: [
    ...unit("MAS", "Delta Faucet", /^Delta Faucet\b/i, ["deltafaucet"]),
    ...unit("MAS", "Masco Canada", /^Masco Canada\b/i, ["mascocanada"]),
  ],
  313216: [...unit("PHG", "Philips' companies", /^Philips (?:Lighting|Consumer|Electronics|Personal Health|Entertainment|PC Peripherals)\b/i, ["philips"])],
  103379: [
    ...unit("VFC", "Vans", /^Vans Inc\b/i, ["vansinc"], { from: "2004-06-30" }),
    ...unit("VFC", "The North Face", /^The North Face\b/i, ["northface"], { from: "2000-08-14" }),
    ...unit("VFC", "VF's divisions", /^(?:Healthtex|Splendid),? a division of VF\b/i, ["divisionofvf"]),
  ],
  320187: [...unit("NKE", "NIKE USA", /^NIKE USA\b/i, ["nikeusa"])],
  60667: [...unit("LOW", "Lowe's Home Centers", /^Lowe['’]?s (?:Home Centers|HIW)\b/i, ["loweshomecenters", "loweshiw"])],
  27419: [...unit("TGT", "Target Stores", /^Target Stores\b/i, ["targetstores"])],
  885639: [...unit("KSS", "Kohl's Department Stores", /^Kohl['’]?s Department Stores\b/i, ["kohlsdepartment"])],
  745732: [...unit("ROST", "Ross Procurement", /^Ross Procurement\b/i, ["rossprocurement"])],
  21076: [...unit("CLX", "Brita LP and Clorox Manufacturing", /^(?:BRITA LP|Clorox Manufacturing)\b/i, ["britalp", "cloroxmanufacturing"])],
  1652044: [
    ...unit("GOOGL", "Nest Labs", /^Nest Labs\b/i, ["nestlabs"], { from: "2014-04-24" }),
    ...unit("GOOGL", "Fitbit", /^Fitbit LLC\b/i, ["fitbitllc"], { from: "2021-01-14" }),
  ],
  80424: [...unit("PG", "Gillette", /^The Gillette Company LLC\b/i, ["gillettecompany"], { from: "2005-10-03" })],
  935703: [
    ...unit("DLTR", "Family Dollar", /^(?:Family Dollar|Midwood Brands)\b/i, ["familydollar", "midwoodbrands"], { from: "2015-07-06", to: "2025-07-04" }),
    ...unit("DLTR", "Dollar Tree Distribution", /^Dollar Tree Distribution\b/i, ["dollartreedistribution"]),
  ],
  63276: [...unit("MAT", "American Girl", /^American Girl\b/i, ["americangirl"], { from: "2001-03-28" })],
};

/** The letters a company's stored recalls are asked by for its units (`UNITS`). */
export const unitKeysOf = (cik: number | string): string[] => (UNITS[Number(cik)] ?? []).map((u) => u.key);

/** How the company is named in a recall: as one that made, imported or distributed it, or only sold it. */
export function roleIn(r: CpscRecall, names: readonly string[], cik?: number | string): "maker" | "importer" | "distributor" | "seller" | null {
  const refused = cik === undefined ? [] : (NOT_THE_COMPANY[Number(cik)] ?? []);
  const units = cik === undefined ? [] : (UNITS[Number(cik)] ?? []);
  const owned = (entry: string) => units.some((u) => (!u.from || r.day >= u.from) && (!u.to || r.day <= u.to) && u.firm.test(firmName(entry)));
  const firm = (entry: string) =>
    owned(entry) ||
    (firmIsCompany(entry, names) &&
      !refused.some((n) => n.firm && (!n.from || r.day >= n.from) && n.firm.test(firmName(entry))) &&
      // …and not a name the record took from another company, before the day (lib/takenNames.ts, batch 117)
      !takenBefore(cik, r.day, firmName(entry)));
  if (r.makers.some(firm)) return "maker";
  if (r.importers.some(firm)) return "importer";
  if (r.distributors.some(firm)) return "distributor";
  if (refused.some((n) => n.store === "never" || (n.store instanceof RegExp && n.store.test(r.soldAt)))) return null;
  if (soldAtCompany(r.soldAt, names)) return "seller";
  return null;
}

const ROLE = { maker: "made it", importer: "imported it", distributor: "distributed it", seller: "sold it" } as const;
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// a count the Commission qualified itself: 7,836 recalls say "About", 56 "Approximately", 15 "More than"
const QUALIFIED_COUNT = /^(?:about|approximately|more than|up to|over|nearly|roughly|between|less than|fewer than|an estimated)\b/i;

/**
 * "1.7 million" → "about 1.7 million units"; "About 8,000 (in addition, …)" and "Approximately
 * 39,000" as the Commission wrote them, which read "about Approximately 39,000 units" before batch 111.
 */
export const unitsOf = (units: string) =>
  QUALIFIED_COUNT.test(units) ? units.charAt(0).toLowerCase() + units.slice(1) : `about ${units}${/\bunits?\b/i.test(units) ? "" : " units"}`;
const noticeOf = (r: CpscRecall) => r.url ?? `https://www.cpsc.gov/Recalls?search_api_fulltext=${encodeURIComponent(r.number)}`;

/**
 * The recalls naming the company, as timeline events, from `from`, its first price. One a recall
 * the company made, imported or distributed — its recalls of one day one row — and, for a recall
 * it only sold, a row a month when a month holds two or more.
 *
 * A month's sold recalls are kept under the month's key from the first (batch 100, the audit of
 * batches 94–99, finding 2): a month read when it held one, and again when it held two, updates
 * one row, where a lone recall stored under its day stayed on the page beside the month's row
 * once a second arrived. A row stored under the old day key moves onto the month's
 * (`legacyDedupBasis`): the month's first recall's day, when no recall of the company's own is
 * that day.
 */
export function cpscEvents(recalls: readonly CpscRecall[], namesIn: (year: number) => string[], { cik, from = "" }: { cik?: number | string; from?: string } = {}): TimelineEvent[] {
  const tag = cik === undefined ? "" : `${Number(cik)}`;
  const own = new Map<string, { r: CpscRecall; role: keyof typeof ROLE }[]>();
  const sold = new Map<string, CpscRecall[]>();
  const cache = new Map<number, { names: string[]; keys: string[] }>();
  for (const r of recalls) {
    if (r.day < from) continue;
    const year = Number(r.day.slice(0, 4));
    let held = cache.get(year);
    if (!held) {
      const n = namesIn(year);
      held = { names: n, keys: [...new Set([...n.flatMap(andSpellings).map(letters).filter((k) => k.length >= 2), ...(cik === undefined ? [] : unitKeysOf(cik))])] };
      cache.set(year, held);
    }
    const all = lettersOf(r);
    if (!held.keys.some((k) => all.includes(k))) continue;
    const role = roleIn(r, held.names, cik);
    if (!role) continue;
    if (role === "seller") sold.set(r.day.slice(0, 7), [...(sold.get(r.day.slice(0, 7)) ?? []), r]);
    else own.set(r.day, [...(own.get(r.day) ?? []), { r, role }]);
  }
  const events: TimelineEvent[] = [];
  const what = (x: { r: CpscRecall; role: keyof typeof ROLE }) =>
    `${x.r.title} — the company ${ROLE[x.role]}${x.r.units ? `; ${unitsOf(x.r.units)}` : ""}${x.r.hazard ? `. ${x.r.hazard}` : ""}`;
  for (const [day, rows] of own) {
    const sorted = [...rows].sort((a, b) => a.r.number.localeCompare(b.r.number));
    const lead = sorted[0];
    const more = sorted.length > 1 ? ` (and ${sorted.length - 1} more recall${sorted.length > 2 ? "s" : ""} that day)` : "";
    events.push({
      id: `cpsc-${tag}-${day}`,
      date: day,
      type: "regulation",
      title: `${lead.r.title}${more}`,
      source: "CPSC",
      url: noticeOf(lead.r),
      description: sorted.map(what).join(" · ").slice(0, 600),
      sourceKey: "cpsc_recalls",
      externalId: sorted.map((x) => x.r.number).join(","),
      dedupBasis: `cpsc:${tag}@${day}`,
    });
  }
  for (const [month, rows] of sold) {
    const sorted = [...rows].sort((a, b) => b.day.localeCompare(a.day) || a.number.localeCompare(b.number));
    const [y, m] = month.split("-");
    const first = sorted[sorted.length - 1].day;
    const moved = own.has(first) ? {} : { legacyDedupBasis: `cpsc:${tag}@${first}` };
    const kept = { id: `cpsc-${tag}-${month}-sold`, type: "regulation" as const, source: "CPSC", url: noticeOf(sorted[0]), sourceKey: "cpsc_recalls" as const, externalId: sorted.map((r) => r.number).join(","), dedupBasis: `cpsc:${tag}@${month}:sold`, ...moved };
    if (rows.length === 1)
      events.push({ ...kept, date: rows[0].day, title: `Sold in its stores: ${rows[0].title}`, description: what({ r: rows[0], role: "seller" }).slice(0, 600) });
    else
      events.push({
        ...kept,
        date: `${month}-01`,
        precision: "month",
        title: `CPSC: ${rows.length} recalls of products sold in its stores, ${MONTH[Number(m) - 1]} ${y}`,
        description: `${rows.length} recalls this month of other makers' products the company sold, grouped into one row: ${sorted.slice(0, 3).map((r) => `"${r.title}"`).join("; ")}${rows.length > 3 ? `; and ${rows.length - 3} more` : ""}. The link opens the newest.`,
      });
  }
  return events.sort((a, b) => b.date.localeCompare(a.date));
}

export interface RecallsAnswer {
  recalls: CpscRecall[];
  outcome: "ok" | "throttled" | "error";
  httpStatus?: number;
  detail?: string;
}

/** Every recall, in one answer. A short answer is a broken one: the service held 10,070 (2026-11-05). */
export async function fetchRecalls(): Promise<RecallsAnswer> {
  try {
    const res = await fetch(RECALLS_URL, { headers: { ...UA, Accept: "application/json" }, signal: AbortSignal.timeout(180_000) });
    if (res.status === 403 || res.status === 429 || res.status === 503) return { recalls: [], outcome: "throttled", httpStatus: res.status };
    if (!res.ok) return { recalls: [], outcome: "error", httpStatus: res.status };
    const recalls = parseRecalls(await res.json());
    if (recalls.length < 9_000) return { recalls: [], outcome: "error", httpStatus: res.status, detail: `only ${recalls.length} recalls read` };
    return { recalls, outcome: "ok", httpStatus: res.status };
  } catch (err) {
    return { recalls: [], outcome: "error", detail: String(err).slice(0, 200) };
  }
}
