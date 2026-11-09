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
   * record, or its parent of the time, held before it listed; and from batch 93 the owner's rule
   * of 2026-11-05 that a case goes on every company it involves (Synchrony Bank, PayPal). Read by
   * the SEC's two rules, the Bureau's and, from batch 94, the Justice Department's, whose archive
   * reaches back to 2001, before Ameriprise and Prudential Financial listed (none of its titles
   * names their units, measured 2026-11-05). The Board's feed (2006) never reads it.
   */
  beforeListing?: true;
}

/** Why an operating unit's name is its owner's: EPA's units hold it on the same days, each read from a filing there. */
const opWhy = (from?: string, to?: string): string =>
  `its operating unit, as EPA's UNITS read it (lib/epaCases.ts)${from ? `, from ${from}` : ""}${to ? `, to ${to}` : ""}: each day there from the owner's or the other party's filing (batch 121)`;
const op = (name: string, from?: string, to?: string): ReleaseName => ({ name, ...(from ? { from } : {}), ...(to ? { to } : {}), why: opWhy(from, to) });

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
      {
        name: "American Express Bank International",
        to: "2008-02-28",
        why: "its private bank, named after it, among its subsidiaries in its 10-K filed 2001-03-30, until it sold American Express Bank Ltd. (\"On February 29, 2008\" and \"American Express Bank Ltd. to Standard Chartered\", its 8-K filed 2008-02-29); the Justice Department's deferred prosecution of 2007-08-06 names it (batch 94)",
      },
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
    names: [
      { name: "American Honda Finance", why: "its US lender, American Honda Finance Corporation, named after it, as its 20-F filed 2015-06-26 names it, which the CFPB's actions of 2015 and 2025 name (batch 89)" },
      // batch 121: its operating units, here since a company is in one map only (check:sec-cases)
      op("American Honda"),
      op("Honda of America"),
    ],
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
  1601712: {
    ticker: "SYF",
    names: [
      {
        name: "Synchrony Bank",
        beforeListing: true,
        why: "its bank, named after it, which the CFPB's action of 2014-06-19 names, six weeks before the company's first price of 2014-07-31 (batch 89). The owner's rule of 2026-11-05 puts a case on every company it involves, so the action reaches this page as well as GE's, its owner then (batch 93); the name was given in 2014, so it reaches nothing older",
      },
    ],
  },
  40545: {
    ticker: "GE",
    names: [
      {
        name: "GE Capital Retail Bank",
        to: "2015-11-16",
        why: "its consumer bank, named after it, until the split-off of Synchrony (\"On November 17, 2015\", its 8-K filed 2015-11-23, and \"completed the split-off\", its 8-K filed 2015-11-30): the owner's rule of 2026-11-05, which puts the CFPB's action of 2013-12-10 on GE's page (batch 93)",
      },
      { name: "Synchrony Bank", to: "2015-11-16", why: "the same bank under its name from 2014, GE's until the same split-off, so the CFPB's action of 2014-06-19 is on GE's page as well as Synchrony's (batch 93)" },
    ],
  },
  1065088: {
    ticker: "EBAY",
    names: [
      {
        name: "PayPal",
        from: "2002-10-03",
        to: "2015-07-16",
        why: "its payments business from its purchase (\"On October 3, 2002\", its 8-K filed that day) until the spin-off (\"On July 17, 2015\", its 8-K filed 2015-07-20): the owner's rule of 2026-11-05, which puts the CFPB's action of 2015-05-19 on eBay's page (batch 93)",
      },
    ],
  },
  1633917: {
    ticker: "PYPL",
    names: [
      {
        name: "PayPal",
        from: "2015-02-25",
        beforeListing: true,
        why: "the company's own business, from its own record's registration (its Form 10 filed 2015-02-25) to its first price of 2015-07-06: the owner's rule of 2026-11-05 puts the CFPB's action of 2015-05-19 here as well as on eBay's page (batch 93)",
      },
    ],
  },
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


/**
 * The operating units EPA files cases under (`UNITS`, lib/epaCases.ts, batches 104, 114 and 120), by
 * their own names as the Justice Department's titles write them, on the same days (batch 121, the
 * 2026-11-08 proposal 1(c), approved by the owner that day). The Department settles with the unit:
 * "Pratt & Whitney and PCC Airfoils to Pay More Than $52 Million" (2008), "Firstenergy Nuclear Operating
 * Company to Pay $28 Million" (2006), "Commonwealth Edison Agrees to Pay $200 Million" (2020),
 * "PacifiCorp Agrees to Pay $575M" (2026), and the caption rule refuses a company's name followed by
 * words that are not legal ones, so those sat on no page. A unit sold to another listed company is
 * that company's from the day (Otis Elevator, Keystone, Trunkline, Gulf Power, Narragansett Electric),
 * and a unit bought is its buyer's only from the day it was bought: Sikorsky's settlement of 2014 is
 * RTX's, Raytheon Company's of 2024 too, Atlantic Richfield's of 1999 no page's. Sunoco, Inc. is left
 * out: its name is Sunoco LP's own, and EPA's refusal of it on SUN's page (`NOT_THE_COMPANY`) has no
 * counterpart in the release rules yet. Read by every release rule, as the banks' units are.
 */
export const OPERATING_UNITS: Readonly<Record<number, { ticker: string; names: readonly ReleaseName[] }>> = {
  1276187: { ticker: "ET", names: [op("Panhandle Eastern Pipe Line", "2012-03-23"), op("Trunkline Gas", "2012-03-23")] },
  93410: {
    ticker: "CVX",
    names: [
      op("Chevron U.S.A."),
      op("Texaco", "2001-10-09"),
      op("Unocal", "2005-08-10"),
      op("Union Oil Company of California", "2005-08-10"),
    ],
  },
  1306965: { ticker: "SHEL", names: [op("Shell Oil", "2005-07-20")] },
  313807: {
    ticker: "BP",
    names: [
      op("BP Products North America"),
      op("BP Exploration"),
      op("BP America"),
      op("BP West Coast Products", undefined, "2013-05-31"),
      op("Amoco", "1998-12-31"),
      op("Atlantic Richfield", "2000-04-18"),
    ],
  },
  2115436: { ticker: "XOM", names: [op("Mobil", "1999-11-30"), op("ExxonMobil Oil"), op("Exxon Mobil Oil")] },
  100885: { ticker: "UNP", names: [op("Union Pacific Railroad")] },
  277948: { ticker: "CSX", names: [op("CSX Transportation")] },
  702165: { ticker: "NSC", names: [op("Norfolk Southern Railway")] },
  717423: { ticker: "MUR", names: [op("Murphy Oil USA", undefined, "2013-08-29")] },
  1573516: { ticker: "MUSA", names: [op("Murphy Oil USA", "2013-08-30")] },
  1133421: {
    ticker: "NOC",
    names: [
      op("Northrop Grumman Ship Systems", undefined, "2011-03-30"),
      op("Northrop Grumman Shipbuilding", undefined, "2011-03-30"),
    ],
  },
  1501585: { ticker: "HII", names: [op("Northrop Grumman Ship Systems", "2011-03-31"), op("Northrop Grumman Shipbuilding", "2011-03-31")] },
  1751788: { ticker: "DOW", names: [op("Dow Chemical", "2019-04-01"), op("Union Carbide", "2019-04-01")] },
  922224: {
    ticker: "PPL",
    names: [
      op("PPL Montana", undefined, "2015-05-31"),
      op("Louisville Gas and Electric", "2010-11-01"),
      op("Kentucky Utilities", "2010-11-01"),
      op("Narragansett Electric", "2022-05-25"),
      op("Rhode Island Energy", "2022-05-25"),
    ],
  },
  797468: { ticker: "OXY", names: [op("Occidental Chemical")] },
  1047862: { ticker: "ED", names: [op("Consolidated Edison Company of New York"), op("Orange and Rockland", "1999-07-08")] },
  60667: { ticker: "LOW", names: [op("Lowe's Home Centers")] },
  1326160: {
    ticker: "DUK",
    names: [
      op("Duke Energy Carolinas"),
      op("Duke Energy Progress"),
      op("Duke Energy Florida"),
      op("Duke Energy Indiana"),
      op("Duke Energy Ohio"),
      op("Duke Energy Kentucky"),
      op("Duke Power"),
      op("Cinergy", "2006-04-03"),
      op("PSI Energy", "2006-04-03"),
      op("Cincinnati Gas & Electric", "2006-04-03"),
      op("Progress Energy", "2012-07-02"),
      op("Carolina Power & Light", "2012-07-02"),
      op("Florida Power Corporation", "2012-07-02"),
      op("Texas Eastern Transmission", "1997-06-18", "2007-01-01"),
      op("Algonquin Gas Transmission", "1997-06-18", "2007-01-01"),
      op("Panhandle Eastern Pipe Line", "1997-06-18", "1999-03-28"),
      op("Trunkline Gas", "1997-06-18", "1999-03-28"),
    ],
  },
  92122: {
    ticker: "SO",
    names: [
      op("Alabama Power"),
      op("Georgia Power"),
      op("Mississippi Power"),
      op("Southern Company Services"),
      op("Southern Nuclear"),
      op("Southern Power Company"),
      op("Savannah Electric", "1994-03-28"),
      op("Gulf Power", undefined, "2018-12-31"),
      op("Southern Company Gas", "2016-07-01"),
      op("Atlanta Gas Light", "2016-07-01"),
      op("Nicor Gas", "2016-07-01"),
    ],
  },
  753308: {
    ticker: "NEE",
    names: [
      op("Florida Power & Light"),
      op("Florida Power and Light"),
      op("FPL Energy"),
      op("NextEra Energy Resources"),
      op("Gulf Power", "2019-01-01"),
    ],
  },
  4904: {
    ticker: "AEP",
    names: [
      op("Appalachian Power"),
      op("Ohio Power"),
      op("Columbus Southern Power"),
      op("Indiana Michigan Power"),
      op("Kentucky Power"),
      op("AEP Ohio"),
      op("AEP Texas"),
      op("Wheeling Power"),
      op("Kingsport Power"),
      op("Southwestern Electric Power", "2000-06-15"),
      op("Central Power and Light", "2000-06-15"),
      op("West Texas Utilities", "2000-06-15"),
      op("Public Service Company of Oklahoma", "2000-06-15"),
    ],
  },
  1031296: {
    ticker: "FE",
    names: [
      op("Ohio Edison"),
      op("Cleveland Electric Illuminating"),
      op("Toledo Edison"),
      op("Pennsylvania Power Company"),
      op("FirstEnergy Nuclear Operating", undefined, "2018-03-30"),
      op("FirstEnergy Solutions", undefined, "2018-03-30"),
      op("FirstEnergy Generation", undefined, "2018-03-30"),
      op("Jersey Central Power & Light", "2001-11-07"),
      op("Metropolitan Edison", "2001-11-07"),
      op("Pennsylvania Electric Company", "2001-11-07"),
      op("Monongahela Power", "2011-02-25"),
      op("Potomac Edison", "2011-02-25"),
      op("West Penn Power", "2011-02-25"),
      op("Allegheny Energy", "2011-02-25"),
    ],
  },
  715957: {
    ticker: "D",
    names: [
      op("Virginia Electric and Power"),
      op("Dominion Virginia Power"),
      op("Dominion Exploration & Production"),
      op("Dominion Transmission"),
      op("Dominion Energy Brayton Point"),
      op("East Ohio Gas", "2000-01-28"),
      op("CNG Transmission", "2000-01-28"),
      op("Consolidated Natural Gas", "2000-01-28"),
      op("South Carolina Electric & Gas", "2019-01-01"),
      op("SCANA", "2019-01-01"),
    ],
  },
  72903: {
    ticker: "XEL",
    names: [
      op("Northern States Power"),
      op("Public Service Company of Colorado", "2000-08-18"),
      op("Southwestern Public Service", "2000-08-18"),
    ],
  },
  1109357: {
    ticker: "EXC",
    names: [
      op("Commonwealth Edison", "2000-10-20"),
      op("PECO Energy", "2000-10-20"),
      op("Exelon Generation", "2000-10-20", "2022-01-31"),
      op("Baltimore Gas and Electric", "2012-03-12"),
      op("Potomac Electric Power", "2016-03-23"),
      op("Delmarva Power", "2016-03-23"),
      op("Atlantic City Electric", "2016-03-23"),
    ],
  },
  1868275: { ticker: "CEG", names: [op("Exelon Generation", "2022-02-01"), op("Constellation Energy Generation", "2022-02-01")] },
  788784: { ticker: "PEG", names: [op("Public Service Electric and Gas"), op("PSE&G"), op("PSEG Fossil"), op("PSEG Power"), op("PSEG Nuclear")] },
  827052: { ticker: "EIX", names: [op("Southern California Edison")] },
  1004980: { ticker: "PCG", names: [op("Pacific Gas and Electric"), op("Pacific Gas & Electric")] },
  1032208: { ticker: "SRE", names: [op("San Diego Gas & Electric", "1998-06-26"), op("Southern California Gas", "1998-06-26")] },
  1002910: {
    ticker: "AEE",
    names: [
      op("Union Electric", "1997-12-31"),
      op("Central Illinois Public Service", "1997-12-31"),
      op("Central Illinois Light", "2003-01-31"),
      op("Illinois Power", "2004-10-01"),
    ],
  },
  936340: {
    ticker: "DTE",
    names: [
      op("Detroit Edison"),
      op("DTE Electric"),
      op("DTE Gas"),
      op("Michigan Consolidated Gas", "2001-05-31"),
      op("MichCon", "2001-05-31"),
    ],
  },
  811156: { ticker: "CMS", names: [op("Consumers Energy"), op("Consumers Power")] },
  1111711: {
    ticker: "NI",
    names: [
      op("Northern Indiana Public Service"),
      op("NIPSCO"),
      op("Columbia Gas of Ohio", "2000-11-01"),
      op("Columbia Gas of Pennsylvania", "2000-11-01"),
      op("Columbia Gas of Virginia", "2000-11-01"),
      op("Columbia Gas of Kentucky", "2000-11-01"),
      op("Columbia Gas of Maryland", "2000-11-01"),
      op("Columbia Gas of Massachusetts", "2000-11-01", "2020-10-08"),
    ],
  },
  783325: {
    ticker: "WEC",
    names: [
      op("Wisconsin Electric Power"),
      op("We Energies"),
      op("Wisconsin Gas", "2000-04-26"),
      op("Wisconsin Public Service", "2015-06-29"),
      op("Peoples Gas Light and Coke", "2015-06-29"),
      op("North Shore Gas", "2015-06-29"),
    ],
  },
  352541: {
    ticker: "LNT",
    names: [
      op("Wisconsin Power and Light"),
      op("Interstate Power and Light", "1998-04-21"),
      op("IES Utilities", "1998-04-21"),
    ],
  },
  1711269: {
    ticker: "EVRG",
    names: [
      op("Kansas City Power & Light", "2018-06-04"),
      op("Westar Energy", "2018-06-04"),
      op("Kansas Gas and Electric", "2018-06-04"),
    ],
  },
  72741: {
    ticker: "ES",
    names: [
      op("Connecticut Light and Power"),
      op("Connecticut Light & Power"),
      op("Western Massachusetts Electric"),
      op("Public Service Company of New Hampshire", "1994-02-09"),
      op("NSTAR", "2012-04-10"),
      op("Boston Edison", "2012-04-10"),
      op("Commonwealth Electric", "2012-04-10"),
      op("Cambridge Electric", "2012-04-10"),
    ],
  },
  1004315: {
    ticker: "NGG",
    names: [
      op("Niagara Mohawk", "2002-01-31"),
      op("New England Power", "2000-03-22"),
      op("Massachusetts Electric", "2000-03-22"),
      op("New England Electric System", "2000-03-22"),
      op("Narragansett Electric", "2000-03-22", "2022-05-24"),
      op("KeySpan", "2007-08-24"),
      op("Brooklyn Union Gas", "2007-08-24"),
    ],
  },
  764622: { ticker: "PNW", names: [op("Arizona Public Service")] },
  1130310: {
    ticker: "CNP",
    names: [
      op("Houston Lighting & Power"),
      op("CenterPoint Energy Houston Electric"),
      op("CenterPoint Energy Resources"),
      op("Vectren", "2019-02-01"),
      op("Southern Indiana Gas and Electric", "2019-02-01"),
    ],
  },
  1021635: { ticker: "OGE", names: [op("Oklahoma Gas and Electric")] },
  1057877: { ticker: "IDA", names: [op("Idaho Power")] },
  1108426: { ticker: "TXNM", names: [op("Public Service Company of New Mexico")] },
  1161728: { ticker: "MGEE", names: [op("Madison Gas and Electric")] },
  874761: { ticker: "AES", names: [op("Indianapolis Power & Light", "2001-03-27"), op("Dayton Power and Light", "2011-11-28")] },
  1692819: { ticker: "VST", names: [op("Luminant"), op("TXU Energy"), op("Dynegy", "2018-04-09")] },
  1067983: {
    ticker: "BRK-B",
    names: [
      op("BNSF Railway", "2010-02-12"),
      op("Burlington Northern Santa Fe", "2010-02-12"),
      op("PacifiCorp", "2006-03-21"),
      op("MidAmerican Energy", "2006-02-09"),
      op("Northern Natural Gas", "2006-02-09"),
      op("Kern River Gas", "2006-02-09"),
      op("Nevada Power", "2013-12-19"),
      op("Sierra Pacific Power", "2013-12-19"),
      op("Lubrizol", "2011-09-16"),
      op("Shaw Industries", "2001-01-10"),
      op("Johns Manville", "2001-02-24"),
      op("Precision Castparts", "2016-01-29"),
      op("Fruit of the Loom", "2002-05-02"),
    ],
  },
  1060391: { ticker: "RSG", names: [op("Allied Waste", "2008-12-05"), op("Browning-Ferris", "2008-12-05")] },
  101829: {
    ticker: "RTX",
    names: [
      op("Pratt & Whitney"),
      op("Pratt and Whitney"),
      op("Hamilton Sundstrand"),
      op("Sikorsky Aircraft", undefined, "2015-11-05"),
      op("Otis Elevator", undefined, "2020-04-01"),
      op("Carrier Corporation", undefined, "2020-04-01"),
      op("Goodrich Corporation", "2012-07-26"),
      op("Rockwell Collins", "2018-11-26"),
      op("Raytheon Company", "2020-04-02"),
    ],
  },
  1781335: { ticker: "OTIS", names: [op("Otis Elevator", "2020-04-02")] },
  1506307: {
    ticker: "KMI",
    names: [
      op("El Paso Natural Gas", "2012-05-24"),
      op("El Paso Corporation", "2012-05-24"),
      op("Tennessee Gas Pipeline", "2012-05-24"),
      op("Southern Natural Gas", "2012-05-24"),
      op("Colorado Interstate Gas", "2012-05-24"),
      op("SFPP"),
      op("Kinder Morgan Energy Partners"),
      op("Kinder Morgan Liquids Terminals"),
    ],
  },
  107263: {
    ticker: "WMB",
    names: [
      op("Transcontinental Gas Pipe Line", "1995-01-18"),
      op("Northwest Pipeline"),
      op("Williams Field Services"),
      op("Williams Production", undefined, "2011-12-29"),
    ],
  },
  895728: {
    ticker: "ENB",
    names: [
      op("Enbridge Energy"),
      op("Texas Eastern Transmission", "2017-02-27"),
      op("Algonquin Gas Transmission", "2017-02-27"),
      op("Spectra Energy", "2017-02-27"),
    ],
  },
  1232384: {
    ticker: "TRP",
    names: [
      op("ANR Pipeline", "2007-02-27"),
      op("Columbia Gas Transmission", "2016-07-01"),
      op("Columbia Gulf Transmission", "2016-07-01"),
      op("TransCanada Keystone Pipeline", undefined, "2024-09-30"),
    ],
  },
  2019061: { ticker: "SOBO", names: [op("TransCanada Keystone Pipeline", "2024-10-01")] },
  1035002: {
    ticker: "VLO",
    names: [
      op("Valero Refining"),
      op("Valero Marketing"),
      op("Ultramar Diamond Shamrock", "2001-12-31"),
      op("Diamond Shamrock Refining", "2001-12-31"),
      op("Premcor", "2005-09-01"),
    ],
  },
  1307954: { ticker: "HUN", names: [op("Huntsman Petrochemical"), op("Huntsman International"), op("Huntsman Advanced Materials")] },
  1262823: {
    ticker: "WLK",
    names: [
      op("Westlake Vinyls"),
      op("Westlake Polymers"),
      op("Westlake Petrochemicals"),
      op("Axiall", "2016-08-31"),
      op("Georgia Gulf", "2016-08-31"),
    ],
  },
  1489393: { ticker: "LYB", names: [op("Equistar"), op("Lyondell"), op("Houston Refining"), op("Millennium Petrochemicals")] },
  879764: { ticker: "TTE", names: [op("Total Petrochemicals"), op("Total E&P USA")] },
  831259: { ticker: "FCX", names: [op("Phelps Dodge", "2007-03-19"), op("Cyprus Amax", "2007-03-19"), op("Climax Molybdenum", "2007-03-19")] },
  863064: { ticker: "RIO", names: [op("Kennecott"), op("U.S. Borax")] },
  1285785: {
    ticker: "MOS",
    names: [
      op("Mosaic Fertilizer", "2004-10-22"),
      op("Mosaic Phosphates", "2004-10-22"),
      op("IMC Phosphates", "2004-10-22"),
      op("Cargill Fertilizer", "2004-10-22"),
    ],
  },
  764065: { ticker: "CLF", names: [op("AK Steel", "2020-03-13"), op("ArcelorMittal USA", "2020-12-07")] },
  87347: {
    ticker: "SLB",
    names: [
      op("Schlumberger Technology"),
      op("Smith International", "2010-08-27"),
      op("Cameron International", "2016-04-01"),
    ],
  },
  78003: {
    ticker: "PFE",
    names: [
      op("Warner-Lambert", "2000-06-19"),
      op("Parke-Davis", "2000-06-19"),
      op("Pharmacia", "2003-04-16"),
      op("Upjohn", "2003-04-16"),
      op("Wyeth", "2009-10-15"),
    ],
  },
  100493: { ticker: "TSN", names: [op("Tyson Fresh Meats"), op("Tyson Poultry"), op("IBP", "2001-09-28"), op("Hillshire Brands", "2014-08-28")] },
  77476: { ticker: "PEP", names: [op("Frito-Lay"), op("Quaker Oats", "2001-08-02"), op("Pepsi Bottling Group", "2010-02-26")] },
  24545: { ticker: "TAP", names: [op("Coors Brewing"), op("MillerCoors", "2016-10-11")] },
  1668717: { ticker: "BUD", names: [op("Anheuser-Busch", "2008-11-18")] },
  64803: { ticker: "CVS", names: [op("CVS Pharmacy")] },
  315189: { ticker: "DE", names: [op("John Deere")] },
  217346: { ticker: "TXT", names: [op("Bell Helicopter"), op("Cessna Aircraft", "1994-03-30"), op("E-Z-GO")] },
};

/**
 * The drug, device and health makers' own companies, by their own names (batch 128, the 2026-11-09
 * proposal 3(b), approved by the owner that day). The Justice Department settles with the unit that
 * did the business: "Novartis Pharmaceuticals Corp. to Pay More Than $420 Million", "AstraZeneca
 * Pharmaceuticals LP Pleads Guilty", "Merck Sharp & Dohme … Nearly One Billion Dollars". The caption
 * rule refuses a company's name followed by words that are not legal ones ("Pharmaceuticals" is not),
 * so those sat on no page. A unit bought counts from the day its filings give and a unit sold to the
 * day it left, as the FDA map reads the same units (`FDA_FIRMS`, lib/fdaRecalls.ts), whose days these
 * repeat; the rest were read from data.sec.gov's filing lists on 2026-11-09, or, where none reports
 * the deal, the first filing EDGAR's full-text search finds naming the unit as the owner's, with no
 * release naming it between the deal and that day. Read by every release rule, as the other units are.
 */
const healthWhy = (what: string) => `${what} (batch 128)`;
export const HEALTH_UNITS: Readonly<Record<number, { ticker: string; names: readonly ReleaseName[] }>> = {
  200406: {
    ticker: "JNJ",
    names: [
      { name: "Ethicon", why: healthWhy("its surgical company, as the FDA map reads it") },
      { name: "Janssen Pharmaceuticals", why: healthWhy("its pharmaceutical company, as the FDA map reads Janssen") },
      { name: "Ortho-McNeil", why: healthWhy("its pharmaceutical company before it took Janssen's name (Ortho-McNeil-Janssen Pharmaceuticals)") },
      {
        name: "DePuy",
        from: "2001-03-14",
        why: healthWhy("its orthopaedics company, bought in 1998: J&J's 8-K of 2001-03-14 is the first filing EDGAR's full-text search finds naming it, and no release names DePuy before 2009"),
      },
      { name: "LifeScan", to: "2018-10-01", why: healthWhy("its diabetes-care company until the sale to Platinum Equity, which J&J announced complete on 2018-10-02 (its 8-K), as the FDA map reads it") },
      { name: "Synthes", from: "2012-06-14", why: healthWhy("bought 2012-06-14 (J&J's 8-K of that day), as the FDA map reads it; Synthes's cases of 2009–2011 are its own") },
    ],
  },
  1613103: {
    ticker: "MDT",
    names: [{ name: "Covidien", from: "2015-01-26", why: healthWhy("bought 2015-01-26 (Medtronic plc's 8-K filed 2015-01-27), as the FDA map reads it") }],
  },
  1800: {
    ticker: "ABT",
    names: [
      { name: "St. Jude Medical", from: "2017-01-04", why: healthWhy("bought 2017-01-04 (Abbott's 8-K filed 2017-01-05), as the FDA map reads it") },
      { name: "Alere", from: "2017-10-03", why: healthWhy("bought 2017-10-03 (Abbott's 8-K of that day), as the FDA map reads it") },
    ],
  },
  1121404: {
    ticker: "SNY",
    names: [
      { name: "Sanofi US", why: healthWhy("its U.S. company") },
      { name: "Sanofi Pasteur", why: healthWhy("its vaccines company, named after it") },
      { name: "Genzyme", from: "2011-04-08", why: healthWhy("Sanofi's from the merger of 2011-04-08 (Genzyme's Form 25 of that day), as the FDA map reads it") },
      {
        name: "Aventis",
        from: "2005-04-11",
        why: healthWhy("bought by Sanofi-Synthélabo's offer of 2004: its 20-F for 2004, filed 2005-04-11, is the first filing EDGAR's full-text search finds reporting the acquisition done, and no release names Aventis before 2007"),
      },
    ],
  },
  1114448: {
    ticker: "NVS",
    names: [
      { name: "Novartis Pharmaceuticals", why: healthWhy("its U.S. pharmaceutical company, named after it") },
      { name: "Sandoz", to: "2023-10-03", why: healthWhy("its generics business until the spin-off on 2023-10-04 (Novartis's 6-K of that day), as the FDA map reads it") },
      {
        name: "Alcon",
        from: "2010-08-26",
        to: "2019-04-08",
        why: healthWhy("its eye-care business from Novartis's purchase of Nestlé's majority (Alcon's 6-K of 2010-08-26) until the spin-off on 2019-04-09, as the FDA map reads it"),
      },
    ],
  },
  818686: {
    ticker: "TEVA",
    names: [
      { name: "Teva Pharmaceuticals USA", why: healthWhy("its U.S. company, named after it") },
      { name: "Actavis", from: "2016-08-02", why: healthWhy("Allergan's generics business, bought 2016-08-02 (Teva's 6-K of that day), as the FDA map reads it") },
    ],
  },
  1136869: {
    ticker: "ZBH",
    names: [{ name: "Biomet", from: "2015-06-24", why: healthWhy("bought 2015-06-24 (Zimmer Biomet's 8-K filed 2015-06-26), as the FDA map reads it") }],
  },
  901832: { ticker: "AZN", names: [{ name: "AstraZeneca Pharmaceuticals", why: healthWhy("its U.S. company, named after it") }] },
  310158: {
    ticker: "MRK",
    names: [{ name: "Merck Sharp & Dohme", why: healthWhy("old Merck's own company, whose record is MRK's history (lib/predecessors.ts), Merck & Co.'s since") }],
  },
  885725: {
    ticker: "BSX",
    names: [{ name: "Guidant", from: "2006-04-21", why: healthWhy("bought 2006-04-21 (Boston Scientific's 8-K reporting that day, item 2.01; Guidant's Form 15 of that day)") }],
  },
  64803: {
    ticker: "CVS",
    names: [
      { name: "Caremark", from: "2007-03-22", why: healthWhy("from the merger with Caremark Rx (CVS's 8-K reporting 2007-03-22, item 2.01; Caremark's Forms 25 and 15 of that day); Caremark's case of 2005 is its own") },
      { name: "Omnicare", from: "2015-08-18", why: healthWhy("bought 2015-08-18 (CVS's 8-K of that day, item 2.01; Omnicare's, items 2.01 and 5.01)") },
      { name: "Aetna", from: "2018-11-28", why: healthWhy("bought 2018-11-28 (CVS's 8-K of that day, item 2.01; Aetna's, items 2.01 and 5.01); Aetna's cases before are its own") },
    ],
  },
  1739940: {
    ticker: "CI",
    names: [{ name: "Express Scripts", from: "2018-12-20", why: healthWhy("bought 2018-12-20 (Express Scripts' 8-K of that day, items 2.01 and 5.01)") }],
  },
  78003: {
    ticker: "PFE",
    names: [{ name: "Hospira", from: "2015-09-03", why: healthWhy("bought 2015-09-03 (Pfizer's 8-K of that day), as the FDA map reads it") }],
  },
};

/** The maps together, by CIK: a company in two of them carries both lists, the earlier map's first. */
const joined = (...maps: Readonly<Record<number, { ticker: string; names: readonly ReleaseName[] }>>[]) => {
  const out: Record<number, { ticker: string; names: readonly ReleaseName[] }> = {};
  for (const m of maps)
    for (const [cik, entry] of Object.entries(m)) {
      const was = out[Number(cik)];
      out[Number(cik)] = was ? { ticker: was.ticker, names: [...was.names, ...entry.names] } : entry;
    }
  return out;
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
  104169: {
    ticker: "WMT",
    names: [
      {
        name: "Wal-Mart",
        why: "its own short name before it became Walmart Inc. in 2018 (\"Wal-Mart Stores, Inc. (\"Wal-Mart\"\", its 10-K filed 2001-04-10), which the Justice Department's titles of 2001–2008 write alone, \"Settlement With Retail Giant Wal-Mart\" (batch 94); its EDGAR record carries only WAL MART STORES INC",
      },
    ],
  },
  // batch 88's units, each company in one map or the other (check:sec-cases)
  ...BANK_UNITS,
  // batch 121's operating units, none of whose companies is in either map above (check:sec-press),
  // and batch 128's health units, CVS's and Pfizer's after their operating units
  ...joined(OPERATING_UNITS, HEALTH_UNITS),
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
