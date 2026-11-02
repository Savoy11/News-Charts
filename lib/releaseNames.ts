/**
 * The names the SEC's and the Justice Department's releases give a listed company beyond those
 * its own record carries, read only by the release rules: the SEC's press releases
 * (`lib/secPress.ts`) and the Justice Department's (`lib/doj.ts`), and since batches 83 and 84 the
 * SEC's case captions (`lib/secCases.ts`) and the Federal Reserve Board's releases
 * (`lib/fedPress.ts`). Batch 82, the 2026-11-01 proposal 4, approved by the owner on 2026-11-01.
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
}

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

/** Every one of them, whatever its days: what a search that knows no dates is asked for. */
export const releaseNamesAsked = (cik: number | string): string[] => (RELEASE_NAMES[Number(cik)]?.names ?? []).map((n) => n.name);

/** Whether the record is a bank's notes record, which takes no release (`NOTES_RECORDS`). */
export const isNotesRecord = (cik: number | string): boolean => Number(cik) in NOTES_RECORDS;
