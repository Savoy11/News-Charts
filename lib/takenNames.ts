import type { SourceKey } from "./types";

/**
 * The records that took a name another company had held (batch 117, the 2026-11-07 audit of
 * batches 108–115, its proposal): one table, read by every rule that finds a company by its name.
 *
 * A company's present EDGAR name is read in every year, so where its record took the name of a
 * company it bought, merged with or shares a name with, that company's past reached the page: AT&T
 * Corp.'s cases on T's page, whose prices before 2005 are SBC's; old Chubb's on CB's, whose prices
 * before 2016 are ACE's. Batches 108, 115 and 116 refused three such names one source at a time
 * (Waste Management in EPA's file, Biogen in the FDA's approvals, AT&T in EPA's and the CPSC's).
 * This table replaces those entries and reaches every source.
 *
 * Before `from`, a row that names the taken name (`name`) and none of the record's own names of
 * the time (`then`) is another company's, and is not the record's:
 *  - every caption rule refuses it as a party (SEC cases, the Board's releases, CFPB, EPA, CPSC,
 *    CFTC and the FDA's approvals, `takenBefore`);
 *  - ingest drops it from every source that finds a company by name, the news included, before it
 *    is stored (`withoutTakenNames`, scripts/ingest.ts, the Federal Register's and GDELT's walks);
 *  - a page leaves off a stored row of it, and another page's "Also on" does not name the record
 *    for it (`hiddenAsTaken`, lib/store/read.ts);
 *  - the Federal Register's yearly search asks a year that ends before `from` under the record's
 *    own name of that year, not the taken one (`yearSearchNames`).
 * The record's own sources (its EDGAR filings, its prices) are never read this way: a filing of
 * SBC's own titled "AT&T Shareholders Approve Merger" is SBC's.
 *
 * Each entry was read by hand on 2026-11-07 from the record's filing list on data.sec.gov: `from`
 * is the day of the filing's event (the 8-K's report date, or the day it names), `filing` its
 * accession number. Where a name was taken in steps (II-VI bought Coherent on 2022-07-01 and took
 * its name on 2022-09-08), `from` is the first: from that day the name is a unit the record owns.
 *
 * Which records were read comes from a scan of every listed company's EDGAR record against every
 * other record EDGAR has held its present name under (`scripts/fixtures/taken-names-scan.json`):
 * 173 companies whose present name another, older record had carried. check:taken-names holds each
 * of them to a reading: in this table, or one of the reasons a name is the record's own (a new
 * parent, the company's own unit, a name that was new, a blank-check company's business, the
 * ticker's own history). It is not every case there could be: the scan matches names as EDGAR
 * writes them, so a namesake EDGAR never filed under is not in it, nor a name written another way
 * (DowDuPont's "DuPont de Nemours" took E. I. du Pont's, whose past on DD is the owner's open call).
 */
export interface TakenName {
  ticker: string;
  /** the name it took, as a row writes it */
  name: RegExp;
  /** the record's own names before `from`: a row naming one of them is the record's */
  then: RegExp;
  /** the day the name became the record's; a row before it naming only the name is another company's */
  from: string;
  /** the accession number of the filing that gives the day */
  filing: string;
  /** bought: the record bought the company; merged: a merger the record survived; namesake: neither */
  kind: "bought" | "merged" | "namesake";
  why: string;
}

export const TAKEN_NAMES: Readonly<Record<number, TakenName>> = {
  // batch 116's EPA and CPSC entries
  732717: {
    ticker: "T",
    name: /\bAT\s*&\s*T\b/i,
    then: /\bSBC\b|\bSouthwestern\s+Bell\b|\bPacific\s+(?:Bell|Telesis)\b|\bAmeritech\b|\bNevada\s+Bell\b|\bSouthern\s+New\s+England\s+Tel|\bSNET\b|\bCingular\b/i,
    from: "2005-11-18",
    filing: "0000950123-05-013901",
    kind: "bought",
    why:
      "SBC Communications, T's record, bought AT&T Corp. (EDGAR CIK 5907) and took its name: its 8-K filed 2005-11-21 reports the merger and the new name on " +
      "2005-11-18 (items 2.01 and 5.03). T's prices from 1983 are SBC's",
  },
  // batch 108's EPA entry
  823768: {
    ticker: "WM",
    name: /\bWaste\s+Management\b/i,
    then: /\bUSA\s+Waste\b/i,
    from: "1998-07-16",
    filing: "0000947871-98-000218",
    kind: "bought",
    why:
      "USA Waste Services, WM's record, bought Waste Management, Inc. (WMX Technologies to 1997, EDGAR CIK 104938) and took its name: its 8-K of 1998-07-16 " +
      "reports the acquisition (items 2, 5 and 7)",
  },
  // batch 115's FDA entry
  875045: {
    ticker: "BIIB",
    name: /\bBiogen\b/i,
    then: /\bIDEC\b/i,
    from: "2003-11-12",
    filing: "0001047469-03-037053",
    kind: "bought",
    why:
      "IDEC Pharmaceuticals, BIIB's record, bought Biogen, Inc. (EDGAR CIK 714655) and became Biogen Idec: its 8-K of 2003-11-12 reports the merger " +
      "(items 2, 5 and 7). The page's prices from 1991 are IDEC's",
  },
  72971: {
    ticker: "WFC",
    name: /\bWells\s+Fargo\b/i,
    then: /\bNorwest\b/i,
    from: "1998-10-21",
    filing: "0000898822-98-000977",
    kind: "merged",
    why:
      "Norwest Corporation, WFC's record, merged with Wells Fargo & Company (EDGAR CIK 105598) and took its name: the record's filings are NORWEST CORP's " +
      "until 1998-10-21, when its 8-K reports the acquisition (item 2) and it registered its shares under the new name (form 8-A)",
  },
  70858: {
    ticker: "BAC",
    name: /\bBank\s*America\b|\bBank\s+of\s+America\b/i,
    then: /\bNations\s*Banc?k?\b/i,
    from: "1998-09-30",
    filing: "0000009672-98-000073",
    kind: "merged",
    why:
      "NationsBank, BAC's record, merged with BankAmerica Corporation and took its name (Bank of America Corporation from 1999): the merger closed on " +
      "1998-09-30, after its last filing as NATIONSBANK CORP (1998-09-28), and its 8-K of 1998-10-09 reports it (items 2, 5 and 7)",
  },
  896159: {
    ticker: "CB",
    name: /\bChubb\b/i,
    // as names write it, "ACE" or "Ace" ("Ace to Buy Chubb"), never the word "ace"
    then: /\bACE\b|\bAce\b/,
    from: "2016-01-14",
    filing: "0001193125-16-430900",
    kind: "bought",
    why:
      "ACE Limited, CB's record, bought The Chubb Corporation (EDGAR CIK 20171) and took its name: its 8-K filed 2016-01-15 reports both on 2016-01-14 " +
      "(items 2.01 and 5.03)",
  },
  36104: {
    ticker: "USB",
    name: /\bU\.?\s?S\.?\s+Bancorp\b|\bUS\s?Bancorp\b/i,
    then: /\bFirst\s+Bank\s+System\b|\bFBS\b/i,
    from: "1997-08-01",
    filing: "0000903423-97-000131",
    kind: "bought",
    why:
      "First Bank System, USB's record, bought U.S. Bancorp of Portland, Oregon (EDGAR CIK 101542) and took its name: its 8-K of 1997-08-01 reports the " +
      "merger (items 2, 5 and 7)",
  },
  91576: {
    ticker: "KEY",
    name: /\bKey\s?Corp\b/i,
    then: /\bSociety\s+(?:Corp(?:oration)?|National\s+Bank|Bank)\b/i,
    from: "1994-03-01",
    filing: "0000950152-94-000169",
    kind: "merged",
    why:
      "Society Corporation, KEY's record, merged with KeyCorp of Albany (EDGAR CIK 36208) and took its name on 1994-03-01: it registered its shares as " +
      "KeyCorp's on 1994-02-23 (form 8-A), and its filings carry SOCIETY CORP until 1994-04-12",
  },
  820318: {
    ticker: "COHR",
    name: /\bCoherent\b/i,
    then: /\bII-VI\b/i,
    from: "2022-07-01",
    filing: "0001193125-22-186770",
    kind: "bought",
    why:
      "II-VI, COHR's record, bought Coherent, Inc. (EDGAR CIK 21510) on 2022-07-01 (its 8-K of that day; the 8-K/A of 2022-08-04 files the bought " +
      "company's accounts) and took its name on 2022-09-08 (item 5.03)",
  },
  1590895: {
    ticker: "CZR",
    name: /\bCaesars\b/i,
    then: /\bEldorado\b/i,
    from: "2020-07-17",
    filing: "0001193125-20-196232",
    kind: "bought",
    why:
      "Eldorado Resorts, CZR's record, bought Caesars Entertainment Corporation (EDGAR CIK 858339) and took its name: its 8-K filed 2020-07-21 reports " +
      "both (items 2.01 and 5.03), the first of its events on 2020-07-17",
  },
  1699150: {
    ticker: "IR",
    name: /\bIngersoll[-\s]+Rand\b/i,
    then: /\bGardner\s+Denver\b/i,
    from: "2020-02-28",
    filing: "0001140361-20-004816",
    kind: "merged",
    why:
      "Gardner Denver Holdings, IR's record, merged with Ingersoll-Rand plc's industrial business and took the Ingersoll Rand name: its 8-K filed " +
      "2020-03-04 reports both (items 2.01 and 5.03), the first of its events on 2020-02-28. Ingersoll-Rand plc itself is Trane Technologies, TT's page",
  },
  866829: {
    ticker: "HOS",
    name: /\bHornbeck\b/i,
    then: /\bHelix\b|\bCal\s+Dive\b/i,
    from: "2026-08-28",
    filing: "0001193125-26-378529",
    kind: "merged",
    why:
      "Helix Energy Solutions, HOS's record (Cal Dive International to 2006), merged with Hornbeck Offshore Services and took its name: its 8-K filed " +
      "2026-09-01 reports both (items 2.01 and 5.03), the first of its events on 2026-08-28. The page's prices from 1997 are Helix's",
  },
  1525221: {
    ticker: "VTOL",
    name: /\bBristow\b/i,
    then: /\bEra\s+(?:Group|Helicopters|Aviation)\b|\bSEACOR\b/i,
    from: "2020-06-11",
    filing: "0001140361-20-014075",
    kind: "merged",
    why:
      "Era Group, VTOL's record, merged with Bristow Group Inc. (EDGAR CIK 73887) and took its name: its 8-K filed 2020-06-17 reports both on " +
      "2020-06-11 (items 2.01 and 5.03). The page's prices from 2013 are Era's",
  },
  1707925: {
    ticker: "LIN",
    name: /\bLinde\b/i,
    then: /\bPraxair\b/i,
    from: "2018-10-31",
    filing: "0001193125-18-313073",
    kind: "merged",
    why:
      "Praxair and Linde AG combined under Linde plc, LIN's record, which took Linde's name: its 8-K of 2018-10-31 reports the merger (items 2.01 and " +
      "5.03). The page's prices before it are Praxair's; Linde was Linde AG's",
  },
  1999001: {
    ticker: "FUN",
    name: /\bSix\s+Flags\b/i,
    then: /\bCedar\s+(?:Fair|Point)\b/i,
    from: "2024-07-01",
    filing: "0001193125-24-173290",
    kind: "merged",
    why:
      "Cedar Fair and Six Flags combined under FUN's record, which took Six Flags' name: its notice of succession (8-K12B) of 2024-07-01 reports the " +
      "merger and the name (items 2.01 and 5.03). The page's prices before it are Cedar Fair's; Six Flags was Six Flags Entertainment Corporation's " +
      "(EDGAR CIK 701374)",
  },
  1045609: {
    ticker: "PLD",
    name: /\bPro[Ll]ogis\b/i,
    // the capitals only: "amb" is in no word, but AMB is how its releases wrote it
    then: /\bAMB\b/,
    from: "2011-06-02",
    filing: "0000950123-11-057596",
    kind: "merged",
    why:
      "AMB Property Corporation, PLD's record, merged with ProLogis (EDGAR CIK 899881) and took its name: its 8-K filed 2011-06-08 reports both " +
      "(items 2.01 and 5.03), the first of its events on 2011-06-02. The page's prices from 1997 are AMB's",
  },
  791963: {
    ticker: "OPY",
    name: /\bOppenheimer\b/i,
    then: /\bFahnestock\b/i,
    from: "2003-01-02",
    filing: "0000791963-03-000003",
    kind: "bought",
    why:
      "Fahnestock Viner Holdings, OPY's record, bought CIBC Oppenheimer's US brokerage (EDGAR CIK 728848 carried the name) on 2003-01-02 (its 8-K " +
      "filed 2003-01-17, item 2) and took the Oppenheimer name in 2003",
  },
  109177: {
    ticker: "SPB",
    name: /\bSpectrum\s+Brands\b/i,
    then: /\bZapata\b|\bHarbinger\b|\bHRG\b/i,
    from: "2011-01-07",
    filing: "0000950123-11-001506",
    kind: "bought",
    why:
      "Harbinger Group (Zapata to 2009), SPB's record, took a majority of Spectrum Brands Holdings on 2011-01-07 (its 8-K of that day, item 2.01) " +
      "and its name in 2018 (HRG Group to 2018-07-02). Before 2011, Spectrum Brands was another company's (EDGAR CIK 1028985, Rayovac to 2005)",
  },
  1838987: {
    ticker: "SPWR",
    name: /\bSun\s?Power\b/i,
    then: /\bComplete\s+Solaria\b|\bFreedom\s+Acquisition\b/i,
    from: "2024-09-30",
    filing: "0001213900-24-084077",
    kind: "bought",
    why:
      "Complete Solaria, SPWR's record, bought SunPower Corporation's business (EDGAR CIK 867773) on 2024-09-30 (its 8-K filed 2024-10-01, items " +
      "1.01 and 2.01) and took its name in 2025",
  },
  1210708: {
    ticker: "STRR",
    name: /\bStar\s+Equity\b/i,
    then: /\bHudson\s+(?:Global|Highland)\b/i,
    from: "2025-08-22",
    filing: "0001193125-25-185799",
    kind: "merged",
    why:
      "Hudson Global, STRR's record, merged with Star Equity Holdings (EDGAR CIK 707388, Digirad before) on 2025-08-22 (its 8-K of that day, item " +
      "2.01) and took its name on 2025-09-02 (item 5.03)",
  },
  1084048: {
    ticker: "ZD",
    name: /\bZiff[-\s]+Davis\b/i,
    then: /\bj2\b/i,
    from: "2012-11-09",
    filing: "0001072613-12-000654",
    kind: "bought",
    why:
      "j2 Global, ZD's record, bought Ziff Davis, Inc. on 2012-11-09 (its 8-K filed 2012-11-13, item 2.01) and took the name for itself in 2021. " +
      "Before 2012, Ziff Davis was other companies' (EDGAR CIK 1055131 among them)",
  },
  1279715: {
    ticker: "IWSH",
    name: /\bWright\s+Investors['’]?\s*Service\b/i,
    then: /\bNational\s+Patent\b/i,
    from: "2012-12-19",
    filing: "0001214659-12-005608",
    kind: "bought",
    why:
      "National Patent Development, IWSH's record, bought the Wright Investors' Service business on 2012-12-19 (its 8-K filed 2012-12-21, item 2.01) " +
      "and took its name on 2013-01-31; EDGAR CIK 108572 carried it before",
  },
  860748: {
    ticker: "KMPR",
    name: /\bKemper\b/i,
    then: /\bUnitrin\b/i,
    from: "2011-08-25",
    filing: "0000860748-11-000109",
    kind: "namesake",
    why:
      "Unitrin, KMPR's record, took the name Kemper on 2011-08-25 (its 8-K filed 2011-08-29, item 5.03), a name its auto and home insurers had used; " +
      "before, Kemper was another record's, Kemper Corporation (EDGAR CIK 55195)",
  },
  1552275: {
    ticker: "SUN",
    name: /\bSunoco\b/i,
    then: /\bSusser\b|\bStripes\b/i,
    from: "2014-10-27",
    filing: "0001104659-14-074067",
    kind: "namesake",
    why:
      "Susser Petroleum Partners, SUN's record, took the name Sunoco LP on 2014-10-27 (its 8-K filed 2014-10-28, item 5.03); before, Sunoco was " +
      "Sunoco, Inc.'s (EDGAR CIK 95304), the refiner Energy Transfer bought in 2012, as EPA's list holds",
  },
  1126956: {
    ticker: "SR",
    name: /\bSpire\b/i,
    then: /\bLaclede\b|\bAlagasco\b/i,
    from: "2016-04-28",
    filing: "0001126956-16-000104",
    kind: "namesake",
    why:
      "The Laclede Group, SR's record, took the name Spire on 2016-04-28 (its 8-K filed 2016-05-03, item 5.03); before, Spire was Spire Corporation's " +
      "(EDGAR CIK 731657), another company",
  },
  945841: {
    ticker: "POOL",
    name: /\bPool\s+(?:Corp(?:oration)?|Co(?:mpany)?)\b|\bPool\s+Energy\b/i,
    then: /\bSCP\b/,
    from: "2006-05-16",
    filing: "0000945841-06-000064",
    kind: "namesake",
    why:
      "SCP Pool, POOL's record, took the name Pool Corporation on 2006-05-16 (its 8-K filed 2006-05-19, item 5.03); before, Pool Company was another " +
      "record's (EDGAR CIK 79483), the Houston oil-service company",
  },
  315852: {
    ticker: "RRC",
    name: /\bRange\s+Resources\b/i,
    then: /\bLomak\b|\bDomain\s+Energy\b/i,
    from: "1998-08-25",
    filing: "0000950134-98-007457",
    kind: "namesake",
    why:
      "Lomak Petroleum, RRC's record, merged with Domain Energy and took the name Range Resources on 1998-08-25 (its 8-K filed 1998-09-09, items 2 " +
      "and 7); before, Range Resources Ltd. was another record's (EDGAR CIK 818862)",
  },
  18926: {
    ticker: "LUMN",
    name: /\bLumen\b/i,
    then: /\bCentury\s*(?:Link|Tel)\b|\bCentury\s+Telephone\b|\bLevel\s*3\b|\bQwest\b|\bEmbarq\b/i,
    from: "2020-09-11",
    filing: "0001193125-20-244126",
    kind: "namesake",
    why:
      "CenturyLink, LUMN's record, took the brand Lumen Technologies in September 2020 and the legal name in January 2021 (its 8-K filed 2021-01-26, " +
      "item 5.03); the day is its first 8-K of that September. Before, Lumen Technologies, Inc. was another record's name (EDGAR CIK 1008114, BEC Group before)",
  },
};

/**
 * Whether `text`, on `day`, names the name `cik`'s record took before it took it, and none of the
 * record's own names of the time: another company's, not the record's.
 */
export function takenBefore(cik: number | string | null | undefined, day: string, text: string): boolean {
  const t = cik == null ? undefined : TAKEN_NAMES[Number(cik)];
  return t !== undefined && day < t.from && t.name.test(text) && !t.then.test(text);
}

/**
 * The sources that are the record's own, never read by name: its EDGAR filings, its prices, the
 * macro and on-chain feeds that know no company name, and the Wikipedia article chosen for it.
 * Every other source finds a company by its name. check:taken-names holds the two lists to
 * `SOURCES` in lib/ingest/store.ts, so a new source is read one way or the other.
 */
export const OWN_RECORD_SOURCES: readonly SourceKey[] = ["wikipedia", "sec_edgar", "onchain", "snapshot", "defillama", "yahoo_prices", "fed_fomc", "bls_cpi"];

/** Their ids in `sources`, written out so the read path needs no ingest code (as `ALSO_ON_SOURCE_IDS` are). */
export const OWN_RECORD_SOURCE_IDS: readonly number[] = [1, 4, 15, 17, 18, 19, 20, 21];

/** A source's rows, without the ones another company's before the record took its name. */
export function withoutTakenNames<T extends { date: string; title: string; description?: string }>(
  events: T[],
  cik: number | string | null | undefined,
  sourceKey: SourceKey,
): T[] {
  if (cik == null || !TAKEN_NAMES[Number(cik)] || OWN_RECORD_SOURCES.includes(sourceKey)) return events;
  return events.filter((ev) => !takenBefore(cik, ev.date, `${ev.title} ${ev.description ?? ""}`));
}

/**
 * Whether a stored row is left off the record's page: a row no own source attests, dated before
 * the record took the name, naming only it. Rows stored before batch 117 are read this way, and so
 * are those of a source whose answer is never complete, which no run takes off.
 */
export function hiddenAsTaken(
  cik: number | string | null | undefined,
  day: string,
  text: string,
  attestedBy: readonly (number | string)[] | null | undefined,
): boolean {
  if (!takenBefore(cik, day, text)) return false;
  return !(attestedBy ?? []).some((id) => OWN_RECORD_SOURCE_IDS.includes(Number(id)));
}

/**
 * The names a Federal Register year is searched under. A year that ends before the record took
 * its name is searched under the record's own name of that year, its EDGAR former name then in use,
 * and the taken name is left out of the other names; a year it took the name in keeps both, and
 * its rows are read by `withoutTakenNames`. Without a former name of the time, the year keeps its
 * present names, and the same reading leaves the taken ones off.
 */
export function yearSearchNames(
  cik: number | string | null | undefined,
  year: number,
  edgarName: string,
  names: readonly string[],
  former: readonly { name: string; until: string }[],
): { edgarName: string; names: string[] } {
  const t = cik == null ? undefined : TAKEN_NAMES[Number(cik)];
  if (!t || `${year}-12-31` >= t.from) return { edgarName, names: [...names] };
  const then = former
    .filter((f) => f.until >= `${year}-01-01` && !t.name.test(f.name))
    .sort((a, b) => a.until.localeCompare(b.until))[0];
  if (!then) return { edgarName, names: [...names] };
  return { edgarName: then.name, names: names.filter((n) => !t.name.test(n)) };
}
