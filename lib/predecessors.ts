/**
 * The tickers whose company moved to a new SEC record, and the record its history stays under
 * (the 2026-10-25 audit). A holding-company reorganisation, a redomicile or a merger the company
 * survives gives the listed parent a new CIK, and EDGAR links the two records nowhere: ExxonMobil
 * Holdings Corp took XOM on 2026-07-01 and its record starts that day, while EXXON MOBIL CORP's
 * holds every filing back to 1994. Read from the new record alone, XOM's page carried 8 filings
 * where it should carry 581, Alphabet's began in October 2015, and Disney's in 2019.
 *
 * Each entry was checked by hand on 2026-10-25:
 *  - the successor's notice of succession (an 8-K12B or 8-K12G3, `notice`) names the predecessor
 *    and makes the successor its "successor issuer";
 *  - the predecessor's record carries no ticker now: its ticker passed to the successor;
 *  - `until` is the notice's date. The predecessor's filings before it are the company's; its
 *    later ones are a subsidiary's (debt filings, its deregistration) and are not.
 *
 * Only a ticker that carried on is here. A merger into a new company under a new ticker (Linde,
 * Nutrien, Restaurant Brands) is no succession of one company's history, and UBS AG is left out:
 * it lists hundreds of notes of its own, which would bury UBS Group's page. Of the 264 listed
 * companies that have filed a notice of succession since 2001, 115 have a record that starts at
 * most 18 months before it (a new parent registers its shares first); these are the clear ones
 * among them, and the rest are tracked in docs/MASTER-CHECKLIST.md.
 *
 * `news` is the predecessor's own name as headlines write it, where the successor's name is not
 * it: "Exxon Mobil" for ExxonMobil Holdings, "Cigna" for The Cigna Group. A name that is also an
 * everyday word or a common surname ("Apache", "Ferguson") is left out, as batch 34 left them out.
 */
export interface Predecessor {
  /** the predecessor's CIK */
  cik: number;
  /** its name when its ticker passed on */
  name: string;
  /** the successor's notice-of-succession date: the predecessor's filings before it are the company's */
  until: string;
  /** that notice's accession number */
  notice: string;
  /** names headlines use for the company that its present name is not */
  news?: string[];
}

export const PREDECESSORS: Record<number, Predecessor[]> = {
  // XOM — ExxonMobil Holdings Corp
  2115436: [{ cik: 34088, name: "Exxon Mobil Corporation", until: "2026-07-01", notice: "0001193125-26-291990", news: ["Exxon Mobil", "Exxon"] }],
  // BLK — BlackRock, Inc. ("New BlackRock"); the predecessor is now BlackRock Finance, Inc.
  2012383: [{ cik: 1364742, name: "BlackRock, Inc.", until: "2024-10-01", notice: "0001193125-24-229601" }],
  // FERG — Ferguson Enterprises Inc.; the predecessor is now Ferguson (Jersey) Ltd
  2011641: [{ cik: 1832433, name: "Ferguson plc", until: "2024-08-01", notice: "0001193125-24-190512" }],
  // BG — Bunge Global SA
  1996862: [{ cik: 1144519, name: "Bunge Limited", until: "2023-11-01", notice: "0001104659-23-113123", news: ["Bunge"] }],
  // HHH — Howard Hughes Holdings Inc.
  1981792: [{ cik: 1498828, name: "The Howard Hughes Corporation", until: "2023-08-11", notice: "0001104659-23-090466" }],
  // APO — Apollo Global Management, Inc.; the predecessor is now Apollo Asset Management, Inc.
  1858681: [{ cik: 1411494, name: "Apollo Global Management, Inc.", until: "2022-01-03", notice: "0001193125-22-000274" }],
  // MRVL — Marvell Technology, Inc.
  1835632: [{ cik: 1058057, name: "Marvell Technology Group Ltd.", until: "2021-04-20", notice: "0001193125-21-122938", news: ["Marvell"] }],
  // APA — APA Corporation
  1841666: [{ cik: 6769, name: "Apache Corporation", until: "2021-03-01", notice: "0001193125-21-063695" }],
  // XRX — Xerox Holdings Corporation
  1770450: [{ cik: 108772, name: "Xerox Corporation", until: "2019-07-31", notice: "0001193125-19-208837" }],
  // DIS — The Walt Disney Company; the predecessor is now TWDC Enterprises 18 Corp.
  1744489: [{ cik: 1001039, name: "The Walt Disney Company", until: "2019-03-20", notice: "0000950157-19-000301" }],
  // CI — The Cigna Group; the predecessor is now Cigna Holding Co
  1739940: [{ cik: 701221, name: "Cigna Corporation", until: "2018-12-20", notice: "0001140361-18-045479", news: ["Cigna"] }],
  // AVGO — Broadcom Inc., successor to Broadcom Limited, itself successor to Avago Technologies
  1730168: [
    { cik: 1649338, name: "Broadcom Limited", until: "2018-04-04", notice: "0001193125-18-107559" },
    { cik: 1441634, name: "Avago Technologies Limited", until: "2016-02-02", notice: "0001193125-16-446865" },
  ],
  // GOOGL — Alphabet Inc.
  1652044: [{ cik: 1288776, name: "Google Inc.", until: "2015-10-02", notice: "0001193125-15-336577" }],
  // MDT — Medtronic plc
  1613103: [{ cik: 64670, name: "Medtronic, Inc.", until: "2015-01-27", notice: "0001193125-15-021837" }],
  // ETN — Eaton Corporation plc
  1551182: [{ cik: 31277, name: "Eaton Corporation", until: "2012-12-04", notice: "0001193125-12-490737" }],
};

/** The records a company's history continues under, newest first; none for most companies. */
export function predecessorsOf(cik: number | string): Predecessor[] {
  return PREDECESSORS[Number(cik)] ?? [];
}
