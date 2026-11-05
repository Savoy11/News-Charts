/**
 * The names the SEC's and the Justice Department's releases give a listed company beyond those
 * its own record carries, read only by the release rules: the SEC's press releases
 * (`lib/secPress.ts`) and the Justice Department's (`lib/doj.ts`), and since batches 83, 84 and 89
 * the SEC's case captions (`lib/secCases.ts`), the Federal Reserve Board's releases
 * (`lib/fedPress.ts`) and the CFPB's actions (`lib/cfpb.ts`). Batch 82, the 2026-11-01 proposal 4,
 * approved by the owner on 2026-11-01.
 *
 * The SEC charges a bank's securities units by their own names — "Banc of America Securities",
 * "Merrill Lynch", "Morgan Keegan" — and the rules knew a company only by the names its record
 * carries, so those cases sat on no page. The rule is the one the Federal Reserve, FDA and NHTSA
 * maps follow (`FED_BANKS`, `FDA_FIRMS`, `RECALL_MAKERS`): a unit counts while the company owned
 * it, each day from the company's own filings, and an acquisition's past never does. Merrill
 * Lynch's Enron charge of 2003 is Merrill Lynch's, not Bank of America's.
 *
 * This is not a list of names to score headlines by: news and scoring take a company's names
 * from one place, `companyScoringAliases` (lib/scoringNames.ts), and none of these reach it. A
 * name added to `newsNamesFor` would reach news, scoring and the Federal Register as well.
 *
 * The owner's three calls of 2026-11-01, raised in batches 73 and 78, are here too: (a) "J.P.
 * Morgan" and "JPMorgan" are JPMorgan Chase's; (b) a bare "UBS" is UBS Group's, and Credit Suisse
 * is from the day UBS bought it; (c) the banks' notes records, UBS AG's and Credit Suisse AG's
 * (`NOTES_RECORDS`), take no release, as batch 74 kept the Board's actions off them.
 */

export interface ReleaseName {
  /** As the releases write it: "Banc of America Securities", "J.P. Morgan". Its legal words ("LLC", "Inc.", "Securities") may follow. */
  name: string;
  /** The first day a release naming it is the company's (YYYY-MM-DD). */
  from?: string;
  /** The last day it is. */
  to?: string;
  /** Why it is the company's, and why from or to that day. */
  why: string;
  /**
   * Whether its rows count before the company's first price too, which every other name of the
   * company's waits for (batch 90): the owner's calls (b) and (c), whose units the company's own
   * record, or its parent of the time, held before it listed. Read by the SEC's two rules alone,
   * whose listings begin in 1995 and 1997; the Board's feed (2006), the Justice Department's
   * (2009) and the Bureau's (2012) begin after both companies listed.
   */
  beforeListing?: true;
}

/**
 * The listed banks', brokers' and asset managers' own units (batch 88, the 2026-11-02 proposal 4,
 * approved by the owner with three calls): their banks, which the Board's orders name, and their
 * broker-dealers and advisers, which the SEC's case captions name. A unit named after the company
 * counts with its name, from the company's first price; one it bought or sold counts between the
 * days its own filings give. Read from the filings through EDGAR's full-text search, which says
 * which filing holds a sentence: "On November 30, 2012" (Hilltop's 8-K filed 2012-12-05), "On
 * September 30, 2005, the Company completed" (American Express's 10-Q filed 2005-11-09).
 *
 * Refused, as their filings say: Lazard Capital Markets, "a subsidiary of LFCM Holdings" (Lazard's
 * proxy filed 2008-03-24), a company its working members owned, so its case of 2008 is not
 * Lazard's; and Fiserv Securities' case of 2005-04-21, after Fiserv sold it.
 *
 * Batch 89 added the units the Consumer Financial Protection Bureau charges (lib/cfpb.ts): the card
 * banks, national banks, mortgage insurers, carmakers' lenders and debt buyers its actions name
 * where the company is their owner. A bank the company bought counts from the day it did: National
 * City Bank's action of 2013 is PNC's, and Hudson City Savings Bank's of 2015-09-24, before M&T
 * bought it, Discover Bank's before Capital One did, and Flagstar Bank's of 2014 are no listed
 * company's.
 */
export const BANK_UNITS: Readonly<Record<number, { ticker: string; names: readonly ReleaseName[] }>> = {
  39263: { ticker: "CFR", names: [{ name: "Frost Bank", why: "its bank, named after it, which the Board's orders of 2016, 2017 and 2019 name" }] },
  1516912: { ticker: "OBK", names: [{ name: "Origin Bank", why: "its bank, named after it, of Choudrant, Louisiana, as the Board's order of 2016-05-05 gives it" }] },
  1331520: {
    ticker: "HOMB",
    names: [
      {
        name: "Centennial Bank",
        from: "2008-01-01",
        why: "Centennial Bancshares' bank, bought 2008-01-01 (\"On January 1, 2008\", its 8-K filed 2008-01-02; \"acquisition of Centennial Bancshares\", its 10-K filed 2008-03-05), of Conway, Arkansas, as the Board's orders of 2010 and 2015 give it",
      },
    ],
  },
  1265131: {
    ticker: "HTH",
    names: [
      {
        name: "PlainsCapital Bank",
        from: "2012-11-30",
        why: "PlainsCapital Corporation's bank, the company's from the merger of 2012-11-30 (\"On November 30, 2012\", its 8-K filed 2012-12-05; \"PlainsCapital Merger\", its 10-K filed 2013-03-15)",
      },
      { name: "Hilltop Securities", why: "its broker-dealer, named after it" },
    ],
  },
  90498: { ticker: "SFNC", names: [{ name: "Simmons Bank", why: "its bank, named after it, of Pine Bluff, Arkansas, as the Board's order of 2021 gives it" }] },
  1386278: { ticker: "GDOT", names: [{ name: "Green Dot Bank", why: "its bank, named after it, of Provo, Utah, as the Board's order of 2013 gives it" }] },
  862831: {
    ticker: "FISI",
    names: [
      {
        name: "Five Star Bank",
        from: "2005-11-04",
        why: "its bank, of Warsaw, New York, as the Board's order of 2012 gives it, first named in the company's filings in its 10-Q filed 2005-11-04 (none of 2001–2004 names it); Five Star Bancorp's bank in California (FSBC) is another",
      },
    ],
  },
  1227500: { ticker: "EQBK", names: [{ name: "Equity Bank", why: "its bank, named after it, of Andover, Kansas, as the Board's order of 2019 gives it" }] },
  1001290: {
    ticker: "BAP",
    names: [
      { name: "Banco de Credito del Peru", why: "its bank, which the company's own 6-K filed 2002-11-19 reports, as the Board writes it" },
      { name: "Banco de Crédito del Perú", why: "the same, with its accents" },
    ],
  },
  844150: {
    ticker: "NWG",
    names: [
      {
        name: "National Westminster Bank",
        from: "2000-03-06",
        why: "bought 2000-03-06 (\"6 March 2000\" and \"acquisition of NatWest\", its 20-F filed 2002-04-12)",
      },
    ],
  },
  1039765: {
    ticker: "ING",
    names: [
      {
        name: "ING Bank",
        why: "its bank, named after it: ING Bank N.V., and ING Bank, fsb until Capital One bought it in 2012, which the Board's notices of 2011 and 2012 name as what Capital One buys",
      },
    ],
  },
  1160106: { ticker: "LYG", names: [{ name: "Lloyds Bank Corporate Markets", why: "its bank, named after it (its 20-F filed 2018-03-09)" }] },
  763901: {
    ticker: "BPOP",
    names: [
      { name: "Banco Popular de Puerto Rico", why: "its bank, named after it, which the Board's orders of 2010 and 2015 name; Banco Popular Español and Banco Popular de Ecuador are others" },
      { name: "Banco Popular North America", why: "its US bank, named after it, which the Board's order of 2015 names" },
      { name: "Popular Securities", why: "its broker-dealer, named after it" },
    ],
  },
  820027: {
    ticker: "AMP",
    names: [
      { name: "Ameriprise Financial Services", why: "its broker-dealer, named after it" },
      {
        name: "American Express Financial Advisors",
        why: "the same broker-dealer before it took the company's name in 2005, a unit of the company's own record, American Express Financial Corporation's: the owner's call (b), 2026-11-02, gives its cases before the spin-off to this page as well as American Express's, the case of 2004-02-12 among them, 19 months before the company's first price of 2005-09-15",
        beforeListing: true,
      },
      {
        name: "American Express Financial Corporation",
        why: "the company's own legal name until 2005 (its record's former name, to 2005-07-26), which captions of 2005–2019 write \"(now known as AmeripriseFinancial, Inc.)\", the company's name run together",
      },
    ],
  },
  4962: {
    ticker: "AXP",
    names: [
      {
        name: "American Express Financial Advisors",
        to: "2005-09-29",
        why: "the owner's call (b), 2026-11-02: its unit until Ameriprise's spin-off (\"On September 30, 2005, the Company completed\" and \"completed the spin-off of Ameriprise\", its 10-Q filed 2005-11-09)",
      },
      { name: "American Express Centurion Bank", why: "its card bank, named after it, which the CFPB's actions of 2012, 2013 and 2017 name (batch 89)" },
      { name: "American Express Bank", why: "its savings bank, American Express Bank, FSB, named after it, which the CFPB's actions of 2012, 2013 and 2017 name (batch 89)" },
      { name: "American Express Travel Related Services", why: "its card issuer, named after it, which the CFPB's actions of 2012 and 2013 name (batch 89)" },
    ],
  },
  36104: {
    ticker: "USB",
    names: [
      {
        name: "U.S. Bancorp Piper Jaffray",
        to: "2003-12-30",
        why: "its securities firm until Piper Jaffray's spin-off (\"December 31, 2003, the Company completed the distribution\" and \"distribution of Piper Jaffray\", its 10-K filed 2004-02-27): the captions of 2005 and 2010 that still write the name are Piper Jaffray's",
      },
      { name: "U.S. Bank National Association", why: "its bank, named after it, which the CFPB's actions of 2013, 2014, 2022 and 2023 name in full (batch 89)" },
    ],
  },
  36966: {
    ticker: "FHN",
    names: [
      { name: "FTN Financial Securities", why: "its securities firm, named after its own former name, First Tennessee National" },
      { name: "First Horizon Advisors", why: "its adviser, named after it" },
    ],
  },
  92230: { ticker: "TFC", names: [{ name: "BB&T Securities", why: "its broker-dealer, named after the company's own name until 2019, BB&T" }] },
  35527: {
    ticker: "FITB",
    names: [
      { name: "Fifth Third Securities", why: "its broker-dealer, named after it" },
      { name: "Fifth Third Bank", why: "its bank, named after it, which the CFPB's actions of 2015, 2020 and 2024 name (batch 89)" },
    ],
  },
  2012383: { ticker: "BLK", names: [{ name: "BlackRock Advisors", why: "its fund adviser, named after it" }] },
  1120193: {
    ticker: "NDAQ",
    names: [
      { name: "NASDAQ Stock Market", why: "its exchange, named after it, and the company's own name until 2006, The Nasdaq Stock Market, Inc." },
      { name: "NASDAQ Execution Services", why: "its routing broker, named after it" },
    ],
  },
  798354: {
    ticker: "FISV",
    names: [
      {
        name: "Fiserv Securities",
        to: "2004-12-31",
        why: "its broker-dealer until it was sold in the first quarter of 2005 (\"Company sold FSI\", its 10-Q filed 2005-04-29; its 10-K filed 2005-02-25 still lists \"Fiserv Securities, Inc. (FSI)\"): the last day the filings show it the company's",
      },
    ],
  },
  791963: {
    ticker: "OPY",
    names: [
      {
        name: "Oppenheimer Asset Management",
        from: "2003-01-03",
        why: "bought from CIBC 2003-01-03 (\"On January 3, 2003\" and \"Oppenheimer Asset Management\", its 8-K filed 2003-01-06); OppenheimerFunds, MassMutual's, was never the company's",
      },
    ],
  },
  91576: { ticker: "KEY", names: [{ name: "KeyBanc Capital Markets", why: "its securities firm, named after it" }] },
  49196: {
    ticker: "HBAN",
    names: [
      { name: "Huntington Investment Company", why: "its broker-dealer, named after it" },
      { name: "Huntington Securities", why: "its broker-dealer, named after it" },
    ],
  },
  713676: {
    ticker: "PNC",
    names: [
      { name: "PNC Investments", why: "its broker-dealer, named after it" },
      { name: "PNC Capital Markets", why: "its securities firm, named after it" },
      {
        name: "National City Bank",
        from: "2008-12-31",
        why: "National City's bank, the company's from its purchase of National City (\"On December 31, 2008, PNC\" and \"completed its acquisition of National City\", its 8-K filed 2009-01-02), so the CFPB's action of 2013-12-23 against it is PNC's (batch 89)",
      },
    ],
  },
  1163653: { ticker: "NMR", names: [{ name: "Nomura Securities International", why: "its US securities firm, named after it" }] },
  914208: { ticker: "IVZ", names: [{ name: "Invesco Advisers", why: "its fund adviser, named after it" }] },
  1535929: { ticker: "VOYA", names: [{ name: "Voya Financial Advisors", why: "its broker-dealer, named after it" }] },
  750577: { ticker: "HWC", names: [{ name: "Hancock Whitney Investment Services", why: "its broker-dealer, named after it" }] },
  38777: { ticker: "BEN", names: [{ name: "Franklin Advisers", why: "its fund adviser, named after it" }] },
  875357: { ticker: "BOKF", names: [{ name: "BOK Financial Securities", why: "its broker-dealer, named after it" }] },
  880631: { ticker: "WT", names: [{ name: "WisdomTree Asset Management", why: "its fund adviser, named after it" }] },
  927628: { ticker: "COF", names: [{ name: "Capital One Bank", why: "its card bank, named after it, which the CFPB's first order, of 2012-07-18, names (batch 89)" }] },
  876437: {
    ticker: "MTG",
    names: [{ name: "Mortgage Guaranty Insurance", why: "its mortgage insurer, Mortgage Guaranty Insurance Corporation, MGIC, the company's name in initials, which the CFPB's action of 2013-04-04 names (batch 89)" }],
  },
  1276520: {
    ticker: "GNW",
    names: [{ name: "Genworth Mortgage Insurance", why: "its mortgage insurer, named after it, as its 10-K filed 2013-02-28 lists it, which the CFPB's action of 2013-04-04 names (batch 89)" }],
  },
  890926: { ticker: "RDN", names: [{ name: "Radian Guaranty", why: "its mortgage insurer, named after it, which the CFPB's action of 2013-04-04 names (batch 89)" }] },
  5272: {
    ticker: "AIG",
    names: [
      {
        name: "United Guaranty",
        to: "2016-12-30",
        why: "its mortgage insurer, United Guaranty Corporation, until it was sold to Arch (\"On December 31, 2016\" and \"completed the sale of United Guaranty\", its 8-K filed 2017-01-03), which the CFPB's action of 2013-04-04 names (batch 89)",
      },
    ],
  },
  74260: {
    ticker: "ORI",
    names: [{ name: "Republic Mortgage Insurance", why: "its mortgage insurer, Republic Mortgage Insurance Company, as its 10-K filed 2013-03-01 lists it, which the CFPB's action of 2013-11-15 names (batch 89)" }],
  },
  36270: {
    ticker: "MTB",
    names: [{ name: "Manufacturers and Traders Trust", why: "its bank, Manufacturers and Traders Trust Company, M&T, the company's name in initials, which the CFPB's action of 2014-10-09 names (batch 89)" }],
  },
  732712: {
    ticker: "VZ",
    names: [
      { name: "Cellco Partnership", why: "its wireless business, Verizon Wireless, on the company's own record (Bell Atlantic's, which took Verizon's name in 2000), which its 8-K filed 2014-01-30 names, and the CFPB's action of 2015-05-12 (batch 89)" },
      { name: "Verizon Wireless", why: "the same business, named after it (batch 89)" },
    ],
  },
  715153: {
    ticker: "HMC",
    names: [{ name: "American Honda Finance", why: "its US lender, American Honda Finance Corporation, named after it, as its 20-F filed 2015-06-26 names it, which the CFPB's actions of 2015 and 2025 name (batch 89)" }],
  },
  1094517: {
    ticker: "TM",
    names: [{ name: "Toyota Motor Credit", why: "its US lender, Toyota Motor Credit Corporation, named after it, as its 20-F filed 2015-06-24 names it, which the CFPB's actions of 2016 and 2023 name (batch 89)" }],
  },
  759944: { ticker: "CFG", names: [{ name: "Citizens Bank", why: "its bank, Citizens Bank, N.A., named after it, which the CFPB's action of 2020-01-30 names; the company's first price, of 2014, bounds it (batch 89)" }] },
  891478: {
    ticker: "SAN",
    names: [
      { name: "Santander Bank", why: "its US bank, named after it (Sovereign Bank, renamed in 2013), which the CFPB's action of 2016-07-14 names (batch 89)" },
      { name: "Santander Consumer USA", why: "its US auto lender, named after it, as its 6-Ks of 2018 name it, which the CFPB's actions of 2018 and 2020 name (batch 89)" },
    ],
  },
  811830: {
    ticker: "SNUS-PI",
    names: [{ name: "Santander Bank", why: "its own bank, Santander Bank, N.A., as its 10-Q filed 2013-11-08 names it (Sovereign Bank, on Sovereign Bancorp's record, renamed in 2013), which the CFPB's action of 2016-07-14 names (batch 89)" }],
  },
  1185348: {
    ticker: "PRAA",
    names: [{ name: "Portfolio Recovery Associates", why: "its debt buyer, named after the company's own name until 2014, as its 10-K filed 2014-02-28 lists it, which the CFPB's actions of 2015 and 2023 name (batch 89)" }],
  },
  936528: { ticker: "WAFD", names: [{ name: "Washington Federal Bank", why: "its bank, named after the company's own name until 2023, Washington Federal, which the CFPB's action of 2020-10-27 names (batch 89)" }] },
  947263: { ticker: "TD", names: [{ name: "TD Bank", why: "its US bank, TD Bank, N.A., named after it, which the CFPB's actions of 2020 and 2024 name (batch 89)" }] },
  1601712: { ticker: "SYF", names: [{ name: "Synchrony Bank", why: "its bank, named after it, which the CFPB's action of 2014-06-19 names, before the company's first price of 2014-07-31 (batch 89)" }] },
  36146: { ticker: "TRMK", names: [{ name: "Trustmark National Bank", why: "its bank, named after it, which the CFPB's action of 2021-10-22 names (batch 89)" }] },
  883948: { ticker: "AUB", names: [{ name: "Atlantic Union Bank", why: "its bank, named after it, which the CFPB's action of 2023-12-07 names (batch 89)" }] },
  1584207: {
    ticker: "OMF",
    names: [
      {
        name: "OneMain Financial Holdings",
        from: "2015-11-15",
        why: "bought from Citigroup (\"On November 15, 2015\" and \"OneMain Financial Holdings\", its 8-K filed 2015-11-17), so the CFPB's action of 2023-05-31 is the company's (batch 89)",
      },
      { name: "OneMain Financial Group", from: "2015-11-15", why: "the same business's lender, from the same day (batch 89)" },
    ],
  },
  1552033: {
    ticker: "TRU",
    names: [{ name: "Trans Union", why: "its credit bureau, Trans Union LLC, named after it, as its 10-K filed 2015-03-30 lists it, which the CFPB's actions of 2022 and 2023 name (batch 89)" }],
  },
  1805284: {
    ticker: "RKT",
    names: [{ name: "Rocket Homes Real Estate", why: "its real-estate brokerage, named after it, as its prospectus filed 2020-08-07 names it, which the CFPB's suit of 2024-12-23 names (batch 89)" }],
  },
  1141391: {
    ticker: "MA",
    names: [{ name: "Mastercard International", why: "its operating company, Mastercard International Incorporated, named after it, as its 10-K filed 2016-02-12 lists it (exhibit 21), which the CFPB's action of 2017-02-01 names (batch 90)" }],
  },
  1677703: {
    ticker: "CNDT",
    names: [
      { name: "Conduent Business Services", why: "its services business, named after it, as its 8-K filed 2017-04-11 names it, which the CFPB's order of 2017-11-20 names (batch 90)" },
      { name: "Conduent Education Services", why: "its student-loan servicer, named after it, as its 10-K filed 2018-03-01 lists it (exhibit 21.1), which the CFPB's settlement of 2019-05-01 names (batch 90)" },
    ],
  },
  832988: {
    ticker: "SIG",
    names: [
      {
        name: "Sterling Jewelers",
        from: "2003-04-24",
        why: "its US jeweller, from the first filing EDGAR's full-text search finds naming it, its 20-F filed 2003-04-24 (exhibit 8.1), as its 10-K filed 2018-04-02 still lists it; the CFPB's action of 2019-01-16 names it (batch 90)",
      },
    ],
  },
  933036: {
    ticker: "UPBD",
    names: [
      {
        name: "Acima Holdings",
        from: "2021-02-17",
        why: "bought by the company, then Rent-A-Center (\"On February 17, 2021\" and \"completed the acquisition of Acima\", its 8-K filed 2021-02-17), so the CFPB's suit of 2024-07-26 is the company's (batch 90)",
      },
      { name: "Acima Digital", from: "2021-02-17", why: "the same business's lender, bought the same day, as its 10-K filed 2023-02-24 lists it (exhibit 21.1) (batch 90)" },
    ],
  },
  1137774: {
    ticker: "PRU",
    names: [
      {
        name: "Prudential Securities",
        why: "the owner's call (c), 2026-11-02: its securities firm, which kept the company's ownership as Prudential Equity Group after its retail brokerage went into Wachovia Securities (\"On July 1, 2003, we completed\" the \"combination of our retail securities brokerage\", its 10-Q filed 2003-08-13), so its cases are Prudential Financial's, not Prudential plc's; the call names its cases of 2000–2003, three of them before the company's first price of 2001-12-13",
        beforeListing: true,
      },
      { name: "Prudential Equity Group", why: "the same firm from 2003, named after it, which captions write \"f/k/a Prudential Securities Inc.\"" },
    ],
  },
};

export const RELEASE_NAMES: Readonly<Record<number, { ticker: string; names: readonly ReleaseName[] }>> = {
  70858: {
    ticker: "BAC",
    names: [
      { name: "Banc of America Securities", why: "its securities unit, named after it" },
      { name: "Banc of America Investment Services", why: "its brokerage unit, named after it" },
      { name: "Banc of America Capital Management", why: "its fund adviser, named after it" },
      { name: "BofA Securities", why: "its securities unit, named after it, which a case caption names in full (batch 85, the 2026-11-01 audit's finding 2)" },
      {
        name: "Merrill Lynch",
        from: "2009-01-01",
        why: "bought 2009-01-01 (\"the acquisition of Merrill Lynch on January 1, 2009\", its 10-K filed 2009-02-27): its Enron charge of 2003 and its auction-rate settlement of 2008 are Merrill Lynch's",
      },
    ],
  },
  72971: {
    ticker: "WFC",
    names: [
      {
        name: "Wachovia",
        from: "2008-12-31",
        why: "bought 2008-12-31 (\"Successfully closed Wachovia acquisition on December 31, 2008\", its 8-K filed 2009-01-28): Wachovia's settlements of 2004 and 2008 are Wachovia's",
      },
      { name: "Wachovia Securities", from: "2008-12-31", why: "Wachovia's securities firm, from the same day, named in full (batch 83)" },
      { name: "Wells Fargo Bank", why: "its unit, named after it, which the SEC's litigation releases and proceedings name in full (batch 83)" },
      { name: "Wells Fargo Advisors", why: "its unit, named after it, which the SEC's litigation releases and proceedings name in full (batch 83)" },
      { name: "Wells Fargo Advisors Financial Network", why: "its unit, named after it, which the SEC's litigation releases and proceedings name in full (batch 83)" },
      { name: "Wells Fargo Brokerage Services", why: "its unit, named after it, which the SEC's litigation releases and proceedings name in full (batch 83)" },
      { name: "Wells Fargo Clearing Services", why: "its unit, named after it, which the SEC's litigation releases and proceedings name in full (batch 83)" },
      { name: "Wells Fargo Securities", why: "its unit, named after it, which the SEC's litigation releases and proceedings name in full (batch 83)" },
    ],
  },
  19617: {
    ticker: "JPM",
    names: [
      {
        name: "J.P. Morgan",
        from: "2000-12-31",
        why: "the owner's call (a), 2026-11-01, with J.P. Morgan Securities: J.P. Morgan & Co. merged into Chase Manhattan, the company's own record, on 2000-12-31 (its 8-K of that day); before, \"J.P. Morgan\" was that company's",
      },
      { name: "JPMorgan", from: "2000-12-31", why: "the owner's call (a), 2026-11-01: the same name without its stops" },
      {
        name: "JPMorgan Chase",
        from: "2000-12-31",
        why: "the company's own name as it writes it, from the merger of 2000-12-31; a caption writes it \"JP Morgan Chase & Co.\" (34-79335, 2016) and the pattern reads both (batch 85)",
      },
      { name: "J.P. Morgan Securities", from: "2000-12-31", why: "its securities firm from the merger of 2000-12-31, named in full, as a caption names it (batch 83)" },
      { name: "J.P. Morgan Investment Management", from: "2000-12-31", why: "its fund adviser from the merger of 2000-12-31, named in full (batch 83)" },
      { name: "JPMorgan Chase Bank", why: "its unit, named after it, which the SEC's litigation releases and proceedings name in full (batch 83)" },
      { name: "Chase Bank USA", why: "its card bank, named after it, which the CFPB's actions of 2013 and 2015 name (batch 89)" },
      { name: "Chase BankCard Services", why: "its card servicer, named after it, which the CFPB's action of 2015-07-08 names (batch 89)" },
      {
        name: "Bear Stearns",
        from: "2008-05-31",
        why: "bought at 11:59 p.m. on 2008-05-30 (\"effective 11:59 p.m. EDT on May 30, 2008\", its 8-K filed 2008-06-02): Bear Stearns' charge of 2006 is Bear Stearns'",
      },
    ],
  },
  831001: {
    ticker: "C",
    names: [
      { name: "Citigroup Global Markets", why: "its securities unit, named after it" },
      { name: "Citigroup Alternative Investments", why: "its unit, named after it, which the SEC's litigation releases and proceedings name in full (batch 83)" },
      {
        name: "Citibank, N.A.",
        from: "1998-10-08",
        why: "Citicorp's bank, the company's from the merger \"At 12:01 a.m., Eastern time, on October 8, 1998\" (its 8-K of that day); before, Citicorp's. Named with its legal form, since the index lists \"Citibank,N.A./ADR\", its depositary record, whose longer name would own a bare \"Citibank\" (batch 85)",
      },
      {
        name: "Salomon Smith Barney",
        why: "its securities firm, formed on this record (Travelers Group's, Citigroup's from 1998) and renamed Citigroup Global Markets in 2003: the name was never another company's (batch 85)",
      },
      {
        name: "Smith Barney",
        to: "2009-05-30",
        why: "its brokerage, Travelers Group's on the same record before it took the name Citigroup in 1998, until it went into Morgan Stanley Smith Barney on 2009-05-31 (\"On May 31, 2009, Citigroup Inc. … and Morgan Stanley consummated\", its 8-K filed 2009-06-03)",
      },
      { name: "CitiMortgage", why: "its mortgage servicer, named after it, as its 10-Ks filed 2015–2017 list it, which the CFPB's action of 2017-01-23 names (batch 89)" },
      {
        name: "CitiFinancial Servicing",
        why: "its loan servicer, named after it, as its 10-Ks filed 2015 and 2016 list it and the CFPB's release of 2017-01-23 calls it, \"Citi Subsidiaries\" (batch 89)",
      },
    ],
  },
  895421: {
    ticker: "MS",
    names: [
      {
        name: "Morgan Stanley Smith Barney",
        from: "2009-05-31",
        why: "its venture with Citigroup's Smith Barney, formed 2009-05-31 (its 8-K filed 2009-06-01), 51 percent the company's from the start (the press release with it)",
      },
      { name: "Morgan Stanley Investment Management", why: "its unit, named after it, which the SEC's litigation releases and proceedings name in full (batch 83)" },
      {
        name: "Morgan Stanley DW",
        why: "its brokerage, Dean Witter Reynolds renamed, on this record (Dean Witter, Discover & Co.'s, which took Morgan Stanley's name in 1997) until it merged into Morgan Stanley & Co.: the name was never another company's (batch 85)",
      },
    ],
  },
  886982: {
    ticker: "GS",
    names: [
      { name: "Goldman Sachs Execution & Clearing", why: "its clearing firm, named after it, which a case caption names in full (batch 85)" },
      { name: "Goldman Sachs Asset Management", why: "its fund adviser, named after it, which a case caption names in full (batch 85)" },
      { name: "Goldman Sachs Bank USA", why: "its bank, named after it, which the CFPB's action of 2024-10-23 names (batch 89)" },
    ],
  },
  1281761: {
    ticker: "RF",
    names: [
      {
        name: "Morgan Keegan",
        from: "2001-03-30",
        to: "2012-04-01",
        why: "bought 2001-03-30 by the Regions the company was formed from with Union Planters in 2004 (that Regions' 8-K of the day; the company's S-4 filed 2004-02-27), as the company's own name in a release counts from its first price, and sold to Raymond James 2012-04-02 (the company's 8-K of that day)",
      },
      {
        name: "Regions Bank",
        why: "its bank, named after it: the SEC's case of 2009-09-21 and the Board's orders of 2014–2021 name it, and a caption of 2008 names AmSouth Bank \"(now known as Regions Bank)\" (batch 88)",
      },
    ],
  },
  1159508: {
    ticker: "DB",
    names: [
      { name: "Deutsche Bank Securities", why: "its unit, named after it, which the SEC's litigation releases and proceedings name in full (batch 83)" },
      {
        name: "Deutsche Bank Trust Company Americas",
        from: "1999-06-04",
        why: "Bankers Trust of New York, bought 1999-06-04 (its 20-F filed 2003-03-27), as the Board's map has it (batch 83)",
      },
    ],
  },
  312069: {
    ticker: "BCS",
    names: [
      { name: "Barclays Bank", why: "its bank, named after it, whose own record is a notes record (ATMP) (batch 83)" },
      { name: "Barclays Capital", why: "its investment bank, named after it (batch 83)" },
    ],
  },
  93751: { ticker: "STT", names: [{ name: "State Street Bank and Trust", why: "its bank, named after it, which the SEC's litigation releases and proceedings name in full (batch 83)" }] },
  1390777: {
    ticker: "BNY",
    names: [{ name: "BNY Mellon Securities", why: "its unit, named after it, which the SEC's litigation releases and proceedings name in full (batch 83)" }],
  },
  1610520: {
    ticker: "UBS",
    names: [
      {
        name: "UBS",
        why: "the owner's call (b), 2026-11-01: the bank, UBS AG, was the listed company until UBS Group AG took its place in the exchange offer of November 2014 (its 20-F filed 2015-03-13), and UBS AG's own record is its notes'",
      },
      {
        name: "Credit Suisse",
        from: "2023-06-12",
        why: "bought 2023-06-12 (Credit Suisse AG's 6-K of 2023-09-29), as the Board's map has it: Credit Suisse's releases before are Credit Suisse's",
      },
      { name: "UBS Securities", why: "its unit, named after it, which the SEC's litigation releases and proceedings name in full (batch 83)" },
      { name: "UBS Financial Services", why: "its unit, named after it, which the SEC's litigation releases and proceedings name in full (batch 83)" },
      { name: "UBS Financial Services Inc. of Puerto Rico", why: "its Puerto Rico brokerage, named after it, as the captions write it (batch 83)" },
      { name: "UBS Financial Services Incorporated of Puerto Rico", why: "the same, its legal form written out (batch 83)" },
    ],
  },
  // batch 88's units, each company in one map or the other (check:sec-cases)
  ...BANK_UNITS,
};

/**
 * The banks' notes records: the bank's own record, which lists its exchange-traded notes here,
 * not its shares. A release about the bank is its group's page's, or no page's, never its notes'
 * — the owner's call (c), 2026-11-01, as batch 74 kept the Board's actions off both.
 */
export const NOTES_RECORDS: Readonly<Record<number, { ticker: string; why: string }>> = {
  312070: {
    ticker: "ATMP",
    why: "Barclays Bank PLC, the bank, whose record lists its iPath notes: its cases are Barclays PLC's (batch 83, the owner's call (c) applied to a third notes record; it took 11 SEC cases, and no press release)",
  },
  1114446: { ticker: "AMUB", why: "UBS AG, the bank, whose record lists UBS's ETRACS notes: its releases are UBS Group's" },
  1053092: {
    ticker: "GLDI",
    why: "Credit Suisse AG, the bank, whose record lists its exchange-traded notes: its releases before UBS bought it sit on no page, Credit Suisse Group not being in the index, and those after are UBS Group's",
  },
};

const held = (n: ReleaseName, day: string) => (!n.from || day >= n.from) && (!n.to || day <= n.to);

/** The names a release of that day may give the company beyond its record's. */
export const releaseNamesOn = (cik: number | string, day: string): string[] =>
  (RELEASE_NAMES[Number(cik)]?.names ?? []).filter((n) => held(n, day)).map((n) => n.name);

/**
 * The units whose rows count on `day` though it is before the company's first price
 * (`beforeListing`): the only names a release rule reads such a row by.
 */
export const releaseNamesBefore = (cik: number | string, day: string): string[] =>
  (RELEASE_NAMES[Number(cik)]?.names ?? []).filter((n) => n.beforeListing && held(n, day)).map((n) => n.name);

/** Every one of them, whatever its days: what a search that knows no dates is asked for. */
export const releaseNamesAsked = (cik: number | string): string[] => (RELEASE_NAMES[Number(cik)]?.names ?? []).map((n) => n.name);

/** Whether the record is a bank's notes record, which takes no release (`NOTES_RECORDS`). */
export const isNotesRecord = (cik: number | string): boolean => Number(cik) in NOTES_RECORDS;
