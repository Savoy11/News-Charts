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
  /** the successor's notice-of-succession date: the predecessor's filings before it are the company's */
  until: string;
  /** that notice's accession number */
  notice: string;
  /**
   * the day the record became this business, where it began as a shell: a blank-check company the
   * business merged into, or a shell a reverse merger used. Its filings before are the shell's.
   */
  since?: string;
  /** names headlines use for the company that its present name is not */
  news?: string[];
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
  // TAOP — Taoping Inc. (redomiciled from Nevada as China Information Technology); a shell, Irish Mag, before 2007
  1552670: [
    { cik: 1350684, name: "China Information Technology, Inc.", until: "2012-10-31", notice: "0001062993-12-004382", since: "2007-02-08" },
  ],
  // PW — Power REIT (a new parent)
  1532619: [{ cik: 78838, name: "Pittsburgh & West Virginia Railroad", until: "2011-12-05", notice: "0001144204-11-068243" }],
  // ATLC — Atlanticus Holdings Corp (a new parent, then renamed); CompuCredit before
  1464343: [{ cik: 1068199, name: "CompuCredit Corporation", until: "2009-07-07", notice: "0001193125-09-145053", news: ["CompuCredit"] }],
  // OTTR — Otter Tail Corp (a new parent)
  1466593: [{ cik: 75129, name: "Otter Tail Corporation", until: "2009-07-01", notice: "0000950123-09-019633" }],
  // BLDP — Ballard Power Systems Inc. (a new parent)
  1453015: [{ cik: 933777, name: "Ballard Power Systems Inc.", until: "2009-01-02", notice: "0000912282-09-000004" }],
  // BTE — Baytex Energy Corp. (a trust from 2004 to 2010)
  1279495: [{ cik: 1046182, name: "Baytex Energy Ltd.", until: "2004-02-19", notice: "0000950142-04-000530" }],
  // CCK — Crown Holdings, Inc. (a new parent)
  1219601: [
    { cik: 25890, name: "Crown Cork & Seal Company, Inc.", until: "2003-02-26", notice: "0000950168-03-000549", news: ["Crown Cork"] },
  ],
};

/** The records a company's history continues under, newest first; none for most companies. */
export function predecessorsOf(cik: number | string): Predecessor[] {
  return PREDECESSORS[Number(cik)] ?? [];
}
