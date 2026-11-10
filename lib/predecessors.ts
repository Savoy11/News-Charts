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
 * Only one company's history carrying on is here: a holding-company reorganisation or a redomicile,
 * where the successor holds the predecessor's whole business and the predecessor's shareholders
 * hold the successor — whether or not the ticker changed with it (Encana became
 * Ovintiv, ECA became OVV, batch 55). A merger of two companies into a new one (Linde, Nutrien,
 * Restaurant Brands) is neither one's history, and UBS AG is left out: it lists hundreds of notes of
 * its own, which would bury UBS Group's page. Of the 264 listed
 * companies that have filed a notice of succession since 2001, 115 have a record that starts at
 * most 18 months before it (a new parent registers its shares first). Batches 53 and 55 read every
 * one: these 70 are one company's history, and the reasons each of the other 45 is not (a SPAC, a
 * merger into a new company, a bank whose old filings went to its bank regulator, …) are in
 * docs/MASTER-CHECKLIST.md.
 *
 * That search missed notices inside its own years (batch 132, from the 2026-11-09 proposals' #1):
 * Comcast's 8-K12G3 of 2002, CenterPoint's and MGE Energy's of 2002, Regions' of 2004, Oracle's and
 * Duke's of 2006, Vulcan's of 2007 and Trane's of 2009 are on the companies' own filing lists
 * (data.sec.gov), most on an older page of the list, and in none of its 264 results. Batch 132 maps 17
 * pages from those lists, 20 records, and its entries rest on the lists' evidence rather than on the
 * notices' text, which www.sec.gov serves only with `NEWS_CHARTS_CONTACT` set: the owner's call of
 * 2026-11-10 ("Use the filing lists"). For each, the successor's list holds the filing of the handover,
 * with its form, day and accession number, and the two records' names hold the change; the slice the
 * checks read is `scripts/fixtures/predecessor-lists-b132.json`.
 *  - Ten have a notice of succession (8-K12B or 8-K12G3), and `until` is its day, as above. Devon's and
 *    Lamar's, of 1999, are before the search's years.
 *  - Ten have none, and rest on the 8-K that reports the handover, as Merck's does (below): the
 *    successor's own (Berkshire's of 1999-01-05, Northrop's of 2001-04-17, NiSource's of 2000-11-01,
 *    Alkermes's, Cracker Barrel's, ONEOK's, Ashland's two, the old Houston Industries' of 1997, filed
 *    under both records) or, for Ingersoll-Rand Company's move to Bermuda at the end of 2001, the
 *    predecessor's own of 2002-01-02, the day its shares were deregistered. `until` is that 8-K's day,
 *    but ONEOK's: the old ONEOK filed its last annual report, for the year to 1997-08-31, on
 *    1997-11-28, two days after the handover, so its `until` is the day after that report.
 *  - A record that was the company's only from a later day says so with `since`: the record CenterPoint
 *    took over from was Houston Lighting & Power, the utility, until the old Houston Industries merged
 *    into it on 1997-08-06, so it is the company's from that day and the old Houston Industries' record
 *    before it; the record Ashland took over from in 2016 was a shell (New EXM Inc.) until 2005-06-30.
 *    The SEC News Digest's names are dated the same way (`digestNamesOn`).
 *  - Not mapped: Amcor (a merger of Amcor Limited and Bemis into a new company, neither one's history,
 *    as Linde's).
 *
 * Batch 133 read the rest, on the same evidence. It scanned every listed company's filing list on
 * data.sec.gov, every older page included (8,024 records, in place of the full-text search), for a notice
 * of succession filed within 18 months of the record's first filing: an 8-K12B or 8-K12G3, or before 1997
 * the older form of it, an 8-B12B or 8-B12G. Of 182 such records, 80 were mapped and 50 were batch 53's;
 * of the other 52, 16 are one company's history and are mapped (PPL, DTE, PG&E, OGE, United Rentals,
 * T. Rowe Price, Nabors, Fresenius Medical Care, KB Financial, Transocean, Accenture, Intercontinental
 * Exchange, Zillow, PennyMac, Mercer, Graphic Packaging). The other 36 are not: 11 banks over a bank whose
 * filings went to its bank regulator, 6 mergers into a new company (Lockheed Martin, ConocoPhillips,
 * Evergy, Exterran, USA Mobility, and CoreCivic's of 1999), 3 SPACs, 6 shells or reverse mergers, 6
 * records that held their own filings from EDGAR's first year, and four kept for a filing's text: RGC
 * Resources (Roanoke Gas's record not found by name), B2Gold (an acquired company's registration), Sunoco
 * (Sunoco LP still lists its own units) and Biogen (IDEC's California record not found by name). The
 * records batch 117 read as the company's own were read again with the scan's first filing of each, and
 * 14 more pages are mapped by hand: Con Edison, TDS, IDACORP, Spire, Newmont, Host, Valero, Simon,
 * Enviri, Choice Hotels, Mega Matrix (its notice 19 months after its record began), Lennar, Healthcare
 * Realty and Iron Mountain. The last three are Merck's kind: the record took the listed company's name
 * and ticker at a merger, so its own past is labelled (`OWN_RECORD_FROM`). On the evidence:
 *  - a notice of the older form (PG&E's, OGE's, DTE's and PPL's 8-B12B) is a notice of succession;
 *  - where neither record filed a notice or an 8-K on the day, the filings that did the handover:
 *    Newmont's new parent registered its shares (8-A12B) the day the old record deregistered its own, and
 *    the old Valero deregistered (15-12B) the day after its spin-off and merger;
 *  - Zillow's `until` is the day after its notice, as ONEOK's is: the old Zillow filed its annual report
 *    for 2014 on the handover day.
 * Left out, each read: TXNM (Public Service of New Mexico's record still lists its preferred, PNMXO, a
 * page of its own), Leidos (the old SAIC had no listed shares to pass on), Digimarc's step of 2008 (the old
 * record deregistered on 2008-08-14 and the spin-off listed on 2008-10-16, a gap a filing's text must
 * explain), Community West Bancshares (whose chart it is, Central Valley's or Community West's, to be read).
 *
 * One entry rests on a merger's 8-Ks instead of a notice: Merck's (batch 108, the 2026-11-07 audit's
 * question 1). Schering-Plough bought Merck on 2009-11-03 and took its name and its ticker, so MRK's
 * EDGAR record is Schering-Plough's, and old Merck's record, 64978, became a subsidiary with no
 * ticker. No notice of succession was filed. MRK's price history is old Merck's, back to 1962, and
 * under this project's rules a predecessor whose ticker the company carries is its history while an
 * acquisition's past is never the buyer's: old Merck's record is MRK's to the merger. The record's
 * own past before it, Schering-Plough's, stays on the page labelled as Schering-Plough's, the
 * owner's call of 2026-11-07 (`OWN_RECORD_FROM`, batch 110). `notice` is the
 * successor record's 8-K of the merger (items 2.01 and 5.03), filed 2009-11-04; old Merck's own 8-K
 * that day reports its delisting and the change of control (items 3.01 and 5.01).
 *
 * Two more rest on the same reading (batch 118, from batch 117's scan of renamed records): a record
 * that took another company's name and ticker, whose page's prices before are that company's, as
 * Yahoo's splits show. Objet's record took Stratasys, Inc.'s at the merger of 2012-12-01 (its 6-K
 * filed 2012-12-04; Stratasys's splits of 2003 and 2007 are in SSYS's history), and Progressive Waste
 * Solutions' took Waste Connections, Inc.'s at the merger of 2016-06-01 (its 8-K filed 2016-06-07,
 * items 2.01 and 5.03; Waste Connections's 3:2 splits of 2004, 2007 and 2010 are in WCN's). Dawson
 * Geophysical is not one: TGC Industries' record took its name and ticker in 2015, but DWSN's prices
 * before are TGC's (its 5% stock dividends, its reverse split), so old Dawson's past is a taken
 * name's (lib/takenNames.ts).
 *
 * `news` is the predecessor's own name as headlines write it, where the successor's name is not
 * it: "Exxon Mobil" for ExxonMobil Holdings, "Cigna" for The Cigna Group. A name that is also an
 * everyday word or a common surname ("Apache", "Ferguson") is left out, as batch 34 left them out.
 * So is a name whose brand left with a business sold or spun off, as Motorola's went to Lenovo
 * (`KNOWN_NOT_NEWS`): Great Elm's "Openwave" went to Openwave Mobility in 2012 and its "Unwired
 * Planet" to Optis in 2016, and "Aaron's" to The Aaron's Company in 2020 (batch 58).
 */
export interface Predecessor {
  /** the predecessor's CIK */
  cik: number;
  /** its name when its ticker passed on */
  name: string;
  /**
   * the successor's notice-of-succession date, or, where none was filed, the day of the 8-K that
   * reports the handover (see the header): the predecessor's filings before it are the company's
   */
  until: string;
  /** that notice's accession number, or that 8-K's */
  notice: string;
  /**
   * the day the record became this business, where it began as a shell: a blank-check company the
   * business merged into, or a shell a reverse merger used. Its filings before are the shell's. Also
   * where the record was a subsidiary before, under another record that was the listed company
   * (CenterPoint's Houston Lighting & Power, batch 132): its filings before are the subsidiary's. Or
   * where it was another company until it took the listed one's name (Riverwood Holding's record before
   * Graphic Packaging's, batch 133): its filings before are that company's, and stay off the page.
   */
  since?: string;
  /** names headlines use for the company that its present name is not */
  news?: string[];
  /**
   * the predecessor's filings after `until` that are still the company's, by accession: a quarterly
   * report for a quarter that ended before the handover, filed under the old record after it, where
   * the successor filed none of its own for that quarter (PPL's for the quarter to 1995-03-31, filed
   * 1995-05-04; the 2026-11-10 audit, batch 137). ONEOK's and Zillow's annual reports, filed just
   * after their days, are kept by moving `until` instead; here the record filed other things in between.
   */
  after?: string[];
}

export const PREDECESSORS: Record<number, Predecessor[]> = {
  // UROY — Uranium Royalty Corp. (a new parent)
  2143673: [{ cik: 1711570, name: "Uranium Royalty Corp.", until: "2026-07-28", notice: "0001493152-26-034947" }],
  // CLBK — Columbia Financial, Inc. (its mutual holding company's second step)
  2115119: [{ cik: 1723596, name: "Columbia Financial, Inc.", until: "2026-07-21", notice: "0001193125-26-309602" }],
  // XPRO — Expro Ltd (redomiciled from the Netherlands)
  2126198: [{ cik: 1575828, name: "Expro Group Holdings N.V.", until: "2026-07-13", notice: "0001104659-26-083106" }],
  // XOM — ExxonMobil Holdings Corp
  2115436: [{ cik: 34088, name: "Exxon Mobil Corporation", until: "2026-07-01", notice: "0001193125-26-291990", news: ["Exxon Mobil", "Exxon"] }],
  // CBAT — CBAK Energy Technology Ltd (redomiciled from Nevada); China BAK Battery before 2017
  2086841: [
    { cik: 1117171, name: "CBAK Energy Technology, Inc.", until: "2026-06-23", notice: "0001213900-26-071131", since: "2005-02-14" },
  ],
  // DMRC — Digimarc Corp (a new parent)
  2119322: [{ cik: 1438231, name: "Digimarc Corporation", until: "2026-05-18", notice: "0001437749-26-017527" }],
  // KHOBF — KHEOBA Ltd (redomiciled from Nevada)
  2084698: [{ cik: 1909770, name: "KHEOBA Corp.", until: "2026-01-15", notice: "0001683168-26-000352" }],
  // PNFP — Pinnacle Financial Partners, Inc., with Synovus (the ticker carried on)
  2082866: [{ cik: 1115055, name: "Pinnacle Financial Partners, Inc.", until: "2026-01-02", notice: "0001140361-26-000050" }],
  // VNOM — Viper Energy, Inc., with Sitio Royalties (the ticker carried on)
  2074176: [{ cik: 1602065, name: "Viper Energy, Inc.", until: "2025-08-19", notice: "0001193125-25-183036" }],
  // LOGC — ContextLogic Holdings Inc. (a new parent); Wish's ContextLogic before
  2064307: [{ cik: 1822250, name: "ContextLogic Inc.", until: "2025-08-07", notice: "0000950170-25-104267" }],
  // UNIT — Uniti Group Inc., with Windstream (the ticker carried on)
  2020795: [{ cik: 1620280, name: "Uniti Group Inc.", until: "2025-08-01", notice: "0000950103-25-009718" }],
  // CIB — Grupo Cibest S.A., Bancolombia's new parent
  2058897: [{ cik: 1071371, name: "Bancolombia S.A.", until: "2025-05-16", notice: "0001193125-25-121701", news: ["Bancolombia"] }],
  // BLK — BlackRock, Inc. ("New BlackRock"); the predecessor is now BlackRock Finance, Inc.
  2012383: [{ cik: 1364742, name: "BlackRock, Inc.", until: "2024-10-01", notice: "0001193125-24-229601" }],
  // FERG — Ferguson Enterprises Inc.; the predecessor is now Ferguson (Jersey) Ltd
  2011641: [{ cik: 1832433, name: "Ferguson plc", until: "2024-08-01", notice: "0001193125-24-190512" }],
  // SMC — Summit Midstream Corp (converted from a partnership)
  2024218: [{ cik: 1549922, name: "Summit Midstream Partners, LP", until: "2024-08-01", notice: "0001013762-24-003515" }],
  // CLMT — Calumet, Inc. (converted from a partnership)
  2013745: [{ cik: 1340122, name: "Calumet Specialty Products Partners, L.P.", until: "2024-07-10", notice: "0001193125-24-177313" }],
  // SNT — Senstar Technologies Corp (redomiciled from Israel); Magal Security Systems before 2021
  1993727: [{ cik: 896494, name: "Senstar Technologies Ltd.", until: "2024-03-18", notice: "0001178913-24-000978" }],
  // SBET — SharpLink, Inc. (redomiciled from Israel); MER Telemanagement Solutions before the 2021 merger
  1981535: [{ cik: 1025561, name: "SharpLink Gaming Ltd.", until: "2024-02-13", notice: "0001493152-24-006221", since: "2021-07-27" }],
  // BLMH — Blum Holdings, Inc. (a new parent); Unrivaled Brands and Terra Tech before
  1996210: [{ cik: 1451512, name: "Unrivaled Brands, Inc.", until: "2024-01-16", notice: "0001477932-24-000196", since: "2012-02-09" }],
  // TE — T1 Energy Inc. (redomiciled from Luxembourg as FREYR Battery)
  1992243: [{ cik: 1844224, name: "FREYR Battery", until: "2024-01-02", notice: "0001992243-24-000003", news: ["FREYR"] }],
  // BG — Bunge Global SA
  1996862: [{ cik: 1144519, name: "Bunge Limited", until: "2023-11-01", notice: "0001104659-23-113123", news: ["Bunge"] }],
  // AESI — Atlas Energy Solutions Inc. (a new parent)
  1984060: [{ cik: 1910950, name: "Atlas Energy Solutions Inc.", until: "2023-10-03", notice: "0001193125-23-249501" }],
  // NWE — NorthWestern Energy Group, Inc. (a new parent)
  1993004: [{ cik: 73088, name: "NorthWestern Corporation", until: "2023-10-02", notice: "0001628280-23-033388" }],
  // AU — AngloGold Ashanti PLC (redomiciled from South Africa)
  1973832: [{ cik: 1067428, name: "AngloGold Ashanti Limited", until: "2023-09-25", notice: "0000950157-23-000992" }],
  // HHH — Howard Hughes Holdings Inc.
  1981792: [{ cik: 1498828, name: "The Howard Hughes Corporation", until: "2023-08-11", notice: "0001104659-23-090466" }],
  // CLB — Core Laboratories Inc. (redomiciled from the Netherlands)
  1958086: [{ cik: 1000229, name: "Core Laboratories N.V.", until: "2023-05-01", notice: "0001193125-23-130765" }],
  // ALRTF — ALR Technologies SG Ltd. (redomiciled from Nevada)
  1930419: [{ cik: 1087022, name: "ALR Technologies Inc.", until: "2022-11-10", notice: "0001903596-22-000770" }],
  // ZYME — Zymeworks Inc. (redomiciled from British Columbia)
  1937653: [{ cik: 1403752, name: "Zymeworks Inc.", until: "2022-10-13", notice: "0001193125-22-261838" }],
  // NE — Noble Corp plc, with Maersk Drilling (the ticker carried on); Noble's Swiss and UK parent from 2009, through its 2021 restructuring; its Cayman parent from 2002
  1895262: [
    { cik: 1458891, name: "Noble Corporation", until: "2022-09-30", notice: "0001193125-22-254859" },
    { cik: 1169055, name: "Noble Corporation", until: "2009-03-27", notice: "0000950129-09-001018" },
  ],
  // QDEL — QuidelOrtho Corp, with Ortho Clinical Diagnostics (the ticker carried on)
  1906324: [{ cik: 353569, name: "Quidel Corporation", until: "2022-05-27", notice: "0001193125-22-161806", news: ["Quidel"] }],
  // DKNG — DraftKings Inc., with Golden Nugget Online Gaming (the ticker carried on); a SPAC, Diamond Eagle, before April 2020
  1883685: [{ cik: 1772757, name: "DraftKings Inc.", until: "2022-05-05", notice: "0001104659-22-056134", since: "2020-04-24" }],
  // NCNO — nCino, Inc., with SimpleNexus (the ticker carried on)
  1902733: [{ cik: 1566895, name: "nCino, Inc.", until: "2022-01-10", notice: "0001193125-22-005239" }],
  // APO — Apollo Global Management, Inc.; the predecessor is now Apollo Asset Management, Inc.
  1858681: [{ cik: 1411494, name: "Apollo Global Management, Inc.", until: "2022-01-03", notice: "0001193125-22-000274" }],
  // XERS — Xeris Biopharma Holdings, Inc., with Strongbridge (the ticker carried on)
  1867096: [{ cik: 1346302, name: "Xeris Pharmaceuticals, Inc.", until: "2021-10-05", notice: "0001193125-21-292100" }],
  // MRVL — Marvell Technology, Inc.
  1835632: [{ cik: 1058057, name: "Marvell Technology Group Ltd.", until: "2021-04-20", notice: "0001193125-21-122938", news: ["Marvell"] }],
  // APA — APA Corporation
  1841666: [{ cik: 6769, name: "Apache Corporation", until: "2021-03-01", notice: "0001193125-21-063695" }],
  // GEG — Great Elm Group, Inc. (a new parent); Phone.com, Openwave and Unwired Planet before, names
  // whose businesses it sold (8-Ks 0001193125-12-212068, 0001193125-16-532468), so no news names
  1831096: [{ cik: 1082506, name: "Great Elm Capital Group, Inc.", until: "2020-12-29", notice: "0001140361-20-029666" }],
  // LQDA — Liquidia Corp, with RareGen (the ticker carried on)
  1819576: [{ cik: 1330436, name: "Liquidia Technologies, Inc.", until: "2020-11-18", notice: "0001104659-20-126838" }],
  // PRG — PROG Holdings, Inc., the legal successor of Aaron's, Inc.; the brand went with The Aaron's Company it spun off
  1808834: [{ cik: 706688, name: "Aaron's, Inc.", until: "2020-10-16", notice: "0001193125-20-271107" }],
  // TIMB — TIM S.A., which absorbed its parent
  1826168: [{ cik: 1066116, name: "TIM Participações S.A.", until: "2020-09-29", notice: "0001292814-20-003678" }],
  // BNTC — Benitec Biopharma Inc. (redomiciled from Australia)
  1808898: [{ cik: 1552795, name: "Benitec Biopharma Ltd", until: "2020-04-15", notice: "0001564590-20-016820" }],
  // OVV — Ovintiv Inc. (redomiciled from Canada and renamed; ECA became OVV)
  1792580: [{ cik: 1157806, name: "Encana Corporation", until: "2020-01-24", notice: "0001193125-20-014164", news: ["Encana"] }],
  // HESM — Hess Midstream LP, with Hess Infrastructure Partners (the ticker carried on)
  1789832: [{ cik: 1619739, name: "Hess Midstream Partners LP", until: "2019-12-17", notice: "0001193125-19-315651" }],
  // XRX — Xerox Holdings Corporation
  1770450: [{ cik: 108772, name: "Xerox Corporation", until: "2019-07-31", notice: "0001193125-19-208837" }],
  // AAMI — Acadian Asset Management Inc. (redomiciled from the UK as BrightSphere)
  1748824: [{ cik: 1611702, name: "BrightSphere Investment Group plc", until: "2019-07-15", notice: "0001748824-19-000032" }],
  // ARCT — Arcturus Therapeutics Holdings Inc. (redomiciled from Israel); Alcobra before the 2017 merger
  1768224: [{ cik: 1566049, name: "Arcturus Therapeutics Ltd.", until: "2019-06-14", notice: "0001193125-19-173808", since: "2017-11-13" }],
  // DIS — The Walt Disney Company; the predecessor is now TWDC Enterprises 18 Corp.
  1744489: [{ cik: 1001039, name: "The Walt Disney Company", until: "2019-03-20", notice: "0000950157-19-000301" }],
  // CI — The Cigna Group; the predecessor is now Cigna Holding Co
  1739940: [{ cik: 701221, name: "Cigna Corporation", until: "2018-12-20", notice: "0001140361-18-045479", news: ["Cigna"] }],
  // NWN — Northwest Natural Holding Co (a new parent)
  1733998: [{ cik: 73020, name: "Northwest Natural Gas Company", until: "2018-10-01", notice: "0001193125-18-288466" }],
  // SOHU — Sohu.com Ltd (redomiciled from Delaware)
  1734107: [{ cik: 1104188, name: "Sohu.com Inc.", until: "2018-05-31", notice: "0001193125-18-180405" }],
  // BH-A — Biglari Holdings Inc. (a new parent); Steak n Shake before 2010
  1726173: [{ cik: 93859, name: "Biglari Holdings Inc.", until: "2018-04-30", notice: "0001193125-18-143824" }],
  // AVGO — Broadcom Inc., successor to Broadcom Limited, itself successor to Avago Technologies
  1730168: [
    { cik: 1649338, name: "Broadcom Limited", until: "2018-04-04", notice: "0001193125-18-107559" },
    { cik: 1441634, name: "Avago Technologies Limited", until: "2016-02-02", notice: "0001193125-16-446865" },
  ],
  // CEF — Sprott Physical Gold and Silver Trust (converted from Central Fund of Canada)
  1726122: [{ cik: 784959, name: "Central Fund of Canada Limited", until: "2018-01-16", notice: "0001104659-18-002263" }],
  // DK — Delek US Holdings, Inc., with Alon USA (the ticker carried on)
  1694426: [{ cik: 1351541, name: "Delek US Holdings, Inc.", until: "2017-07-03", notice: "0001694426-17-000036" }],
  // SWX — Southwest Gas Holdings, Inc. (a new parent)
  1692115: [{ cik: 92416, name: "Southwest Gas Corporation", until: "2017-01-03", notice: "0001193125-17-000274" }],
  // BUD — Anheuser-Busch InBev SA/NV, with SABMiller (the ticker carried on)
  1668717: [{ cik: 1140467, name: "Anheuser-Busch InBev SA/NV", until: "2016-10-11", notice: "0001193125-16-734655" }],
  // ASH — Ashland Inc. (Ashland Global Holdings to 2022), a new parent of 2016; the record it took over
  // from, now Ashland LLC, began as a shell (New EXM Inc.) and became Ashland at the parent of 2005,
  // whose own predecessor is the old Ashland Inc. (Ashland Oil to 1995); batch 132, no notice of
  // succession: the 8-Ks of the two handovers, see the header
  1674862: [
    { cik: 1305014, name: "Ashland Inc.", until: "2016-09-20", notice: "0001193125-16-714093", since: "2005-06-30" },
    { cik: 7694, name: "Ashland Inc.", until: "2005-06-30", notice: "0001305014-05-000007" },
  ],
  // WCN — Waste Connections, Inc.: Progressive Waste Solutions' record took old Waste Connections's
  // name and ticker at the merger of 2016-06-01 (batch 118); no notice of succession, see the header
  1318220: [{ cik: 1057058, name: "Waste Connections, Inc.", until: "2016-06-07", notice: "0001144204-16-107288" }],
  // CPHC — Canterbury Park Holding Corp (a new parent)
  1672909: [{ cik: 926761, name: "Canterbury Park Holding Corporation", until: "2016-07-14", notice: "0000897101-16-002658" }],
  // GOOGL — Alphabet Inc.
  1652044: [{ cik: 1288776, name: "Google Inc.", until: "2015-10-02", notice: "0001193125-15-336577" }],
  // RMCF — Rocky Mountain Chocolate Factory, Inc. (redomiciled from Colorado)
  1616262: [{ cik: 785815, name: "Rocky Mountain Chocolate Factory, Inc.", until: "2015-03-02", notice: "0001437749-15-003716" }],
  // MDT — Medtronic plc
  1613103: [{ cik: 64670, name: "Medtronic, Inc.", until: "2015-01-27", notice: "0001193125-15-021837" }],
  // WFRD — Weatherford International plc (redomiciled from Switzerland, before that Bermuda and Delaware)
  1603923: [
    { cik: 1453090, name: "Weatherford International Ltd.", until: "2014-06-17", notice: "0001603923-14-000013" },
    { cik: 1170565, name: "Weatherford International Ltd.", until: "2009-02-26", notice: "0000950134-09-003813" },
    { cik: 32908, name: "Weatherford International, Inc.", until: "2002-06-27", notice: "0000950129-02-003286" },
  ],
  // LBTYA — Liberty Global Ltd., with Virgin Media (the tickers carried on)
  1570585: [{ cik: 1316631, name: "Liberty Global, Inc.", until: "2013-06-07", notice: "0001193125-13-251863" }],
  // ETN — Eaton Corporation plc
  1551182: [{ cik: 31277, name: "Eaton Corporation", until: "2012-12-04", notice: "0001193125-12-490737" }],
  // SSYS — Stratasys Ltd.: Objet's record took old Stratasys's name and ticker at the merger of
  // 2012-12-01 (batch 118); no notice of succession, see the header
  1517396: [{ cik: 915735, name: "Stratasys, Inc.", until: "2012-12-04", notice: "0001104659-12-081872" }],
  // TAOP — Taoping Inc. (redomiciled from Nevada as China Information Technology); a shell, Irish Mag, before 2007
  1552670: [
    { cik: 1350684, name: "China Information Technology, Inc.", until: "2012-10-31", notice: "0001062993-12-004382", since: "2007-02-08" },
  ],
  // PW — Power REIT (a new parent)
  1532619: [{ cik: 78838, name: "Pittsburgh & West Virginia Railroad", until: "2011-12-05", notice: "0001144204-11-068243" }],
  // ALKS — Alkermes plc, the new parent of 2011 formed for Elan Drug Technologies; the predecessor is
  // Alkermes, Inc. (batch 132; no notice of succession: the parent's 8-K of the day, see the header)
  1520262: [{ cik: 874663, name: "Alkermes, Inc.", until: "2011-09-16", notice: "0000903423-11-000460" }],
  // ATLC — Atlanticus Holdings Corp (a new parent, then renamed); CompuCredit before
  1464343: [{ cik: 1068199, name: "CompuCredit Corporation", until: "2009-07-07", notice: "0001193125-09-145053", news: ["CompuCredit"] }],
  // OTTR — Otter Tail Corp (a new parent)
  1466593: [{ cik: 75129, name: "Otter Tail Corporation", until: "2009-07-01", notice: "0000950123-09-019633" }],
  // TT — Trane Technologies plc (Ingersoll-Rand plc to 2020), redomiciled from Bermuda in 2009; Ingersoll-Rand
  // Company Limited, the Bermuda parent of 2001, before; Ingersoll-Rand Company of New Jersey before that
  // (batch 132; the 2001 step has no notice of succession: Ingersoll-Rand Company's own 8-K of the day)
  1466258: [
    { cik: 1160497, name: "Ingersoll-Rand Company Limited", until: "2009-07-01", notice: "0001193125-09-142260" },
    { cik: 50485, name: "Ingersoll-Rand Company", until: "2002-01-02", notice: "0000950134-02-000013" },
  ],
  // BLDP — Ballard Power Systems Inc. (a new parent)
  1453015: [{ cik: 933777, name: "Ballard Power Systems Inc.", until: "2009-01-02", notice: "0000912282-09-000004" }],
  // VMC — Vulcan Materials Company, a new parent of 2007 formed for Florida Rock; the predecessor is now Legacy Vulcan Corp. (batch 132)
  1396009: [{ cik: 103973, name: "Vulcan Materials Company", until: "2007-11-16", notice: "0000950123-07-015677" }],
  // DUK — Duke Energy Corporation, a new parent of 2006 formed for Cinergy; the predecessor, Duke Power
  // to 1997, is now Duke Energy Carolinas, LLC (batch 132)
  1326160: [{ cik: 30371, name: "Duke Energy Corporation", until: "2006-04-04", notice: "0001193125-06-072085" }],
  // ORCL — Oracle Corporation, a new parent of 2006 formed for PeopleSoft; the predecessor is now Oracle Systems (batch 132)
  1341439: [{ cik: 777676, name: "Oracle Corporation", until: "2006-02-06", notice: "0001193125-06-020874" }],
  // RF — Regions Financial Corporation, a new parent of 2004 formed for Union Planters; the predecessor,
  // First Alabama Bancshares to 1994, kept its name (batch 132)
  1281761: [{ cik: 36032, name: "Regions Financial Corporation", until: "2004-07-01", notice: "0000950144-04-006742" }],
  // BTE — Baytex Energy Corp. (a trust from 2004 to 2010)
  1279495: [{ cik: 1046182, name: "Baytex Energy Ltd.", until: "2004-02-19", notice: "0000950142-04-000530" }],
  // MRK — Merck & Co., Inc.: Schering-Plough's record took old Merck's name and ticker at the merger
  // of 2009-11-03 (batch 108); no notice of succession, see the header
  310158: [{ cik: 64978, name: "Merck & Co., Inc.", until: "2009-11-04", notice: "0001193125-09-223917" }],
  // CCK — Crown Holdings, Inc. (a new parent)
  1219601: [
    { cik: 25890, name: "Crown Cork & Seal Company, Inc.", until: "2003-02-26", notice: "0000950168-03-000549", news: ["Crown Cork"] },
  ],
  // batch 132: the older records of 17 companies the full-text search missed, from their filing lists
  // (the owner's call of 2026-11-10, see the header)
  // CMCSA — Comcast Corporation, a new parent of 2002 formed for AT&T Broadband; the predecessor is now Comcast Holdings Corp.
  1166691: [{ cik: 22301, name: "Comcast Corporation", until: "2002-11-18", notice: "0000950103-02-001194" }],
  // CNP — CenterPoint Energy, Inc., a new parent of 2002; the predecessor, Reliant Energy (Houston
  // Industries to 1999), is now CenterPoint Energy Houston Electric. It was Houston Lighting & Power, the
  // utility, until the old Houston Industries merged into it on 1997-08-06, so it is the company's from
  // that day, and the old Houston Industries' record before it
  1130310: [
    { cik: 48732, name: "Reliant Energy, Incorporated", until: "2002-09-06", notice: "0000950129-02-004524", since: "1997-08-06" },
    { cik: 202131, name: "Houston Industries Incorporated", until: "1997-08-08", notice: "0000950129-97-003142" },
  ],
  // MGEE — MGE Energy, Inc., a new parent of 2002; the predecessor is Madison Gas and Electric Company, its utility
  1161728: [{ cik: 61339, name: "Madison Gas and Electric Company", until: "2002-08-12", notice: "0000950137-02-004291" }],
  // NOC — Northrop Grumman Corporation, a new parent of 2001 formed for Litton; the predecessor is now
  // Northrop Grumman Systems Corp. (no notice of succession: the parent's 8-K, see the header)
  1133421: [{ cik: 72945, name: "Northrop Grumman Corporation", until: "2001-04-17", notice: "0000898430-01-500160" }],
  // NI — NiSource Inc., a new parent of 2000 formed for Columbia Energy; the predecessor, NIPSCO
  // Industries to 1999, is now Old NiSource Inc. (no notice of succession: the parent's 8-K)
  1111711: [{ cik: 823392, name: "NiSource Inc.", until: "2000-11-01", notice: "0000895813-00-000475" }],
  // LAMR — Lamar Advertising Company, a new parent of 1999; the predecessor is now Lamar Media Corp.
  1090425: [{ cik: 899045, name: "Lamar Advertising Company", until: "1999-08-20", notice: "0000950134-99-007733" }],
  // DVN — Devon Energy Corporation, a new parent of 1999 formed for PennzEnergy; the predecessor is Devon Energy Corporation (Oklahoma)
  1090012: [{ cik: 837330, name: "Devon Energy Corporation", until: "1999-08-18", notice: "0000899243-99-001820" }],
  // CBRL — Cracker Barrel Old Country Store, Inc. (CBRL Group to 2008), a new parent of 1998; the
  // predecessor is its restaurant company (no notice of succession: the parent's 8-K)
  1067294: [{ cik: 25373, name: "Cracker Barrel Old Country Store, Inc.", until: "1999-01-15", notice: "0000906318-99-000002" }],
  // BRK-B — Berkshire Hathaway Inc., a new parent of 1998 formed for General Re; the predecessor is now
  // OBH LLC (no notice of succession: the parent's 8-K)
  1067983: [{ cik: 109694, name: "Berkshire Hathaway Inc.", until: "1999-01-05", notice: "0000898430-99-000021" }],
  // OKE — ONEOK Inc., a new parent of 1997 formed for Western Resources' gas business; the predecessor
  // is the old ONEOK Inc. Its last annual report, for the year to 1997-08-31, was filed 1997-11-28, two
  // days after the handover, and is the company's, so `until` is the day after it (the parent's 8-K)
  1039684: [{ cik: 74154, name: "ONEOK Inc.", until: "1997-11-29", notice: "0000950130-97-005339" }],
  // batch 133: the rest of the population, from the scan of every listed company's filing list and
  // the reading by hand of the records batch 117 had read as the company's own (see the header)
  // ED — Consolidated Edison, Inc., a new parent of 1998; the predecessor is its utility, Consolidated Edison of New York
  1047862: [{ cik: 23632, name: "Consolidated Edison Company of New York, Inc.", until: "1998-01-02", notice: "0001047862-98-000001" }],
  // PCG — PG&E Corporation, a new parent of 1997; the predecessor is its utility (an 8-B12B, the older form of the notice)
  1004980: [{ cik: 75488, name: "Pacific Gas and Electric Company", until: "1996-12-23", notice: "0000929624-96-000339" }],
  // OGE — OGE Energy Corp., a new parent of 1997; the predecessor is its utility (an 8-B12B)
  1021635: [{ cik: 74145, name: "Oklahoma Gas and Electric Company", until: "1996-12-16", notice: "0001021635-96-000006" }],
  // TDS — Telephone and Data Systems, Inc., reincorporated in Delaware in 1998 (the parent's 8-K)
  1051512: [{ cik: 96966, name: "Telephone and Data Systems, Inc.", until: "1998-05-22", notice: "0001047469-98-021621" }],
  // IDA — IDACORP, Inc., a new parent of 1998; the predecessor is its utility, Idaho Power (the parent's 8-K).
  // Its 10-Q for the quarter to 1998-09-30 was filed under the utility's record on 1998-11-06, and IDACORP
  // filed none of its own for that quarter (batch 137)
  1057877: [{ cik: 49648, name: "Idaho Power Company", until: "1998-10-01", notice: "0000898080-98-000234", after: ["0000049648-98-000024"] }],
  // SR — Spire Inc. (The Laclede Group to 2016), a new parent of 2001; the predecessor, Laclede Gas, is now Spire Missouri (the parent's 8-K)
  1126956: [{ cik: 57183, name: "Laclede Gas Company", until: "2001-10-01", notice: "0001068800-01-500266" }],
  // NEM — Newmont Corporation, a new parent of 2002 formed for Franco-Nevada and Normandy; the predecessor
  // is now Newmont USA Limited (no notice or 8-K: the parent registered its shares, 8-A12B, the day the
  // predecessor deregistered its own, 15-12B)
  1164727: [{ cik: 71824, name: "Newmont Mining Corporation", until: "2002-02-15", notice: "0000898822-02-000283" }],
  // HST — Host Hotels & Resorts, Inc., the REIT Host Marriott became at the end of 1998; the predecessor
  // is the old Host Marriott, Marriott Corporation to 1993 (the parent's 8-K)
  1070750: [{ cik: 314733, name: "Host Marriott Corporation", until: "1998-12-29", notice: "0000950109-98-005554" }],
  // GPK — Graphic Packaging Holding Company, a new parent of 2008 formed for Altivity; the record it took
  // over from was Riverwood Holding's until it took Graphic Packaging's name at their merger of
  // 2003-08-08, so it is the company's from that day; the company's record before it is Graphic
  // Packaging International's (ACX Technologies to 2000), whose prices GPK's chart carries
  1408075: [
    { cik: 886239, name: "Graphic Packaging Corporation", until: "2008-03-10", notice: "0000950144-08-001785", since: "2003-08-08" },
    { cik: 892793, name: "Graphic Packaging International Corporation", until: "2003-08-08", notice: "0001104659-03-017270" },
  ],
  // VLO — Valero Energy Corporation, the refining company old Valero spun off in 1997 with its name and
  // ticker before it merged into PG&E; old Valero's record is its history to then (no notice or 8-K: the
  // old record's deregistration, 15-12B)
  1035002: [{ cik: 21271, name: "Valero Energy Corporation", until: "1997-08-01", notice: "0000021271-97-000020" }],
  // SPG — Simon Property Group, Inc., the parent of 1998 over Simon DeBartolo Group, now SPG Properties
  // (the parent's 8-K of the Corporate Property Investors merger)
  1063761: [{ cik: 912564, name: "Simon DeBartolo Group, Inc.", until: "1998-10-09", notice: "0000950123-98-008890" }],
  // MERC — Mercer International Inc., converted from a Washington business trust in 2006
  1333274: [{ cik: 75659, name: "Mercer International Inc.", until: "2006-03-02", notice: "0000945234-06-000156" }],
  // NVRI — Enviri Corporation (Enviri II to 2026), spun off with the name and ticker as the old Enviri,
  // Harsco to 2023, changed hands; the old record is its history to then (the parent's 8-K)
  2104052: [{ cik: 45876, name: "Enviri Corporation", until: "2026-06-01", notice: "0001193125-26-251752" }],
  // CHH — Choice Hotels International, Inc., the franchising company the old Choice Hotels spun off in
  // 1997 with its name and ticker, the old one becoming Sunburst Hospitality (the parent's 8-K)
  1046311: [{ cik: 1018146, name: "Choice Hotels International, Inc.", until: "1997-10-29", notice: "0000928385-97-001718" }],
  // MPU — Mega Matrix Inc., redomiciled to the Cayman Islands in 2024; AeroCentury to 2022
  1953021: [{ cik: 1036848, name: "Mega Matrix Corp.", until: "2024-11-14", notice: "0001213900-24-098539" }],
  // LEN — Lennar Corporation: Pacific Greystone's record took old Lennar's name and ticker at their merger
  // of 1997 (see OWN_RECORD_FROM); old Lennar's own 8-K reports the change of control
  920760: [{ cik: 58696, name: "Lennar Corporation", until: "1997-11-17", notice: "0000950123-97-009726" }],
  // HR — Healthcare Realty Trust: Healthcare Trust of America's record took old Healthcare Realty's name
  // and ticker at their merger of 2022 (see OWN_RECORD_FROM); old Healthcare Realty's own 8-K reports it
  1360604: [{ cik: 899749, name: "Healthcare Realty Trust Incorporated", until: "2022-07-21", notice: "0001193125-22-199274" }],
  // IRM — Iron Mountain: Pierce Leahy's record took old Iron Mountain's name and ticker at their merger
  // of 2000 (see OWN_RECORD_FROM; the parent's 8-K)
  1020569: [{ cik: 1004317, name: "Iron Mountain Incorporated", until: "2000-02-01", notice: "0000912057-00-003377" }],
  // PPL — PPL Corporation (PP&L Resources to 2000), a new parent of 1995; the predecessor is its utility (an 8-B12B).
  // Its 10-Q for the quarter to 1995-03-31 was filed under the utility's record on 1995-05-04, and PP&L
  // Resources filed none of its own for that quarter (batch 137)
  922224: [{ cik: 317187, name: "Pennsylvania Power & Light Company", until: "1995-04-27", notice: "0000893750-95-000086", after: ["0000317187-95-000022"] }],
  // DTE — DTE Energy Company, a new parent of 1996; the predecessor is its utility, Detroit Edison (an 8-B12B)
  936340: [{ cik: 28385, name: "The Detroit Edison Company", until: "1996-01-02", notice: "0000950124-96-000012" }],
  // URI — United Rentals, Inc., a new parent of 1998; the predecessor is now United Rentals (North America)
  1067701: [{ cik: 1047166, name: "United Rentals, Inc.", until: "1998-08-07", notice: "0000950130-98-003859" }],
  // TROW — T. Rowe Price Group, Inc., a new parent of 2000; the predecessor is its adviser, T. Rowe Price
  // Associates, whose stakes in other companies stay off the page as every filer's do
  1113169: [{ cik: 80255, name: "T. Rowe Price Associates, Inc.", until: "2000-12-29", notice: "0000950109-00-005100" }],
  // NBR — Nabors Industries Ltd., redomiciled to Bermuda in 2002
  1163739: [{ cik: 798943, name: "Nabors Industries, Inc.", until: "2002-06-26", notice: "0000950129-02-003248" }],
  // FMS — Fresenius Medical Care AG (& Co. KGaA from 2006 to 2023), converted in 2006
  1333141: [{ cik: 1019600, name: "Fresenius Medical Care AG", until: "2006-02-13", notice: "0000950123-06-001563" }],
  // KB — KB Financial Group Inc., a new parent of 2008 over Kookmin Bank
  1445930: [{ cik: 1143680, name: "Kookmin Bank", until: "2008-09-30", notice: "0001193125-08-203634" }],
  // RIG — Transocean Ltd., redomiciled from the Cayman Islands to Switzerland in 2008; Transocean Inc.
  // (Transocean Sedco Forex to 2002) before, the Cayman company of 1999, whose record began as a shell;
  // Transocean Offshore Inc. of Delaware (Sonat Offshore Drilling to 1996) before that (its 8-K)
  1451505: [
    { cik: 1083269, name: "Transocean Inc.", until: "2008-12-19", notice: "0001193125-08-257194", since: "1999-05-17" },
    { cik: 314047, name: "Transocean Offshore Inc.", until: "1999-05-17", notice: "0000950129-99-002306" },
  ],
  // ACN — Accenture plc, redomiciled from Bermuda to Ireland in 2009
  1467373: [{ cik: 1134538, name: "Accenture Ltd", until: "2009-09-01", notice: "0001193125-09-185098" }],
  // ICE — Intercontinental Exchange, Inc., a new parent of 2013 formed for NYSE Euronext; the predecessor
  // is now Intercontinental Exchange Holdings
  1571949: [{ cik: 1174746, name: "IntercontinentalExchange, Inc.", until: "2013-11-13", notice: "0001193125-13-440066" }],
  // ZG — Zillow Group, Inc., a new parent of 2015 formed for Trulia. The old Zillow filed its annual
  // report for 2014 on the handover day, 2015-02-17, and it is the company's, so `until` is the day after
  1617640: [{ cik: 1334814, name: "Zillow, Inc.", until: "2015-02-18", notice: "0001193125-15-050788" }],
  // PFSI — PennyMac Financial Services, Inc., a new parent of 2018; the predecessor is now PNMAC Holdings
  1745916: [{ cik: 1568669, name: "PennyMac Financial Services, Inc.", until: "2018-11-01", notice: "0001104659-18-065435" }],
};

/**
 * A successor record that was another company until the day it took the listed company's name and
 * ticker (batch 108). Its own past before that day is that other company's: its filings, the cases
 * and approvals its names then give, its Digest entries. The company's history is its predecessor's
 * (old Merck's, above), and the record's own past stays on the page beside it, each row labelled as
 * the other company's (`ownPastLabelled`): the owner's call of 2026-11-07, "Add Schering-Plough,
 * labelled" (batch 110).
 *
 * A row before the day is the other company's when it is one of the record's own filings, or when
 * its text names the other company (`names`) and not the listed one (`unless`): a case against
 * Schering-Plough alone is its; one against Merck, or against both, is old Merck's history too.
 */
export interface OwnRecordPast {
  ticker: string;
  /** the day the record became the listed company */
  from: string;
  why: string;
  /** the other company, as a filing's title names it: "Schering-Plough: Annual report (10-K)" */
  name: string;
  /** what a row of its past says it is */
  label: string;
  /** words that name it, or the units it owned then, in a row's text */
  names: RegExp;
  /** the listed company's own name: a row naming it is the listed company's history */
  unless: RegExp;
}

export const OWN_RECORD_FROM: Readonly<Record<number, OwnRecordPast>> = {
  310158: {
    ticker: "MRK",
    from: "2009-11-04",
    why:
      "Schering-Plough Corporation's record (former name SCHERING PLOUGH CORP to 2009-10-29) until it took Merck & Co.'s name and ticker at the merger of 2009-11-03: " +
      "its 8-K filed 2009-11-04 reports the merger completed (items 2.01 and 5.03), and its name is Merck & Co. Inc. from that day",
    name: "Schering-Plough",
    label: "Schering-Plough, before its 2009 merger with Merck",
    // Organon was Schering-Plough's from 2007-11-19 (lib/fdaApprovals.ts)
    names: /\b(?:schering|organon)\b/i,
    unless: /\bmerck\b/i,
  },
  // batch 118: the same, on the record's own past as Objet's and as Progressive Waste's, labelled as Merck's is
  1517396: {
    ticker: "SSYS",
    from: "2012-12-04",
    why:
      "Objet Ltd.'s record (former name OBJET LTD to 2012-12-03) until it took Stratasys, Inc.'s name and ticker at the merger of 2012-12-01: its 6-K " +
      "filed 2012-12-04 reports it, and its name is Stratasys Ltd. from that day",
    name: "Objet",
    label: "Objet, before its 2012 merger with Stratasys",
    names: /\bobjet\b/i,
    unless: /\bstratasys\b/i,
  },
  1318220: {
    ticker: "WCN",
    from: "2016-06-07",
    why:
      "Progressive Waste Solutions Ltd.'s record (IESI-BFC to 2011, BFI Canada before) until it took Waste Connections, Inc.'s name and ticker at the " +
      "merger of 2016-06-01: its 8-K filed 2016-06-07 reports both (items 2.01 and 5.03)",
    name: "Progressive Waste Solutions",
    label: "Progressive Waste Solutions, before its 2016 merger with Waste Connections",
    // its units of then: IESI Corporation in the United States, BFI Canada in Canada
    names: /\b(?:progressive\s+waste|iesi(?:-bfc)?|bfi\s+canada)\b/i,
    unless: /\bwaste\s+connections\b/i,
  },
  // batch 133: three more, each read from data.sec.gov's filing lists. The chart is the old company's,
  // since its first price is before the record's own company listed: Lennar's of 1980 before Pacific
  // Greystone's offering of 1996, Healthcare Realty's of 1993 before Healthcare Trust of America's listing
  // of 2012, Iron Mountain's of 1996 before Pierce Leahy's of 1997
  920760: {
    ticker: "LEN",
    from: "1997-11-17",
    why:
      "Pacific Greystone Corporation's record (PACIFIC GREYSTONE CORP /DE/ to 1997-09-26) until it took Lennar Corporation's name and ticker at their merger " +
      "of 1997: old Lennar's 8-K filed 1997-11-17 reports the change of control (items 1 and 2), and its Form 15 followed on 1997-11-21",
    name: "Pacific Greystone",
    label: "Pacific Greystone, before its 1997 merger with Lennar",
    names: /\bpacific\s+greystone\b/i,
    unless: /\blennar\b/i,
  },
  1360604: {
    ticker: "HR",
    from: "2022-07-21",
    why:
      "Healthcare Trust of America, Inc.'s record (NNN Healthcare/Office REIT to 2007, Grubb & Ellis Healthcare REIT to 2009) until it took Healthcare " +
      "Realty Trust's name and ticker at their merger of 2022: old Healthcare Realty's 8-K filed 2022-07-21 reports it (items 2.01, 3.01 and 5.01), the day " +
      "its shares were delisted and its record became HRTI, LLC",
    name: "Healthcare Trust of America",
    label: "Healthcare Trust of America, before its 2022 merger with Healthcare Realty",
    names: /\b(?:healthcare\s+trust\s+of\s+america|grubb\s*(?:&|and)\s*ellis\s+healthcare|nnn\s+healthcare)\b/i,
    unless: /\bhealthcare\s+realty\b/i,
  },
  1020569: {
    ticker: "IRM",
    from: "2000-02-01",
    why:
      "Pierce Leahy Corp.'s record (PIERCE LEAHY CORP to 1999) until it took Iron Mountain Incorporated's name and ticker at their merger of 2000: its 8-K " +
      "filed 2000-02-01 reports the merger (items 2 and 7)",
    name: "Pierce Leahy",
    label: "Pierce Leahy, before its 2000 merger with Iron Mountain",
    names: /\bpierce\s+leahy\b/i,
    unless: /\biron\s+mountain\b/i,
  },
};

/** The day a company's own record became the company, where it was another before; null for nearly all. */
export function ownRecordFrom(cik: number | string): string | null {
  return OWN_RECORD_FROM[Number(cik)]?.from ?? null;
}

/**
 * A page's row as the other company's, where it is one of the record's own past (batch 110): its
 * source says whose, and a filing is titled with that company's name, not the listed one's, which
 * EDGAR's record now carries ("Merck & Co., Inc.: Annual report (10-K)" was Schering-Plough's).
 */
export function ownPastLabelled<T extends { date: string; title: string; source: string; url?: string; description?: string }>(ev: T, cik: number | string | null | undefined): T {
  const past = cik == null ? undefined : OWN_RECORD_FROM[Number(cik)];
  if (!past || ev.date >= past.from) return ev;
  const n = Number(cik);
  // a filing or a rename under the record itself: EDGAR's archive path or its company page
  const ownFiling = new RegExp(String.raw`/edgar/data/${n}/|[?&]CIK=0*${n}(?:&|$)`, "i").test(ev.url ?? "");
  const text = `${ev.title} ${ev.description ?? ""}`;
  if (!ownFiling && !(past.names.test(text) && !past.unless.test(text))) return ev;
  return {
    ...ev,
    // "Merck & Co., Inc.: Annual report (10-K)" → "Schering-Plough: Annual report (10-K)"; a title of
    // its own, a press release's headline, stays as it is
    title: ownFiling ? ev.title.replace(/^[^:]{2,80}?(?=:\s)/, (prefix) => (past.unless.test(prefix) ? past.name : prefix)) : ev.title,
    source: `${ev.source} · ${past.label}`,
  };
}

/** The records a company's history continues under, newest first; none for most companies. */
export function predecessorsOf(cik: number | string): Predecessor[] {
  return PREDECESSORS[Number(cik)] ?? [];
}
