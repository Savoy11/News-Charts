# Opportunity proposals — 2026-11-09

**Commit:** 80bfc3a85bc212609169c733d2797edcdcafa596 (`claude/lucid-goodall-6km6ea`, equal to `origin/main` after batch 124) · **Reviewed:** `CLAUDE.md`; `README.md` ("Data sources", "Sources evaluated and rejected"); `docs/COVERAGE-MAP.md`; `docs/OWNER-ACTIONS.md`; `docs/MASTER-CHECKLIST.md` (the batch 119–124 ledgers, Scope refocus and its open boxes, the legend; the batch 94, 100 and 101 ledgers for the Justice archive and the CPSC's units); `docs/proposals/2026-11-08-proposals.md` whole, and the "Considered and cut" sections of 2026-07-30, 10-17, 10-26, 10-28, 11-01, 11-02, 11-05, 11-06 and 11-07, and the 2026-10-22 shortlist's "Not shortlisted"; `docs/audits/2026-11-08-code-audit-b117-123.md` and `docs/audits/2026-11-07-code-audit-b108-115.md`; code: `lib/cpscRecalls.ts` (`UNITS`, `NOT_THE_COMPANY`, `roleIn`, `cpscEvents`), `lib/doj.ts` (`DESIGNATOR_WORD`, `releaseNamesParty`, `dojEvents`, `fetchJusticeReleases`), `lib/dojArchive.ts` (`ARCHIVE_FIRST_YEAR`, `parseArchiveMonth`), `lib/releaseNames.ts` (`BANK_UNITS`, `OPERATING_UNITS`, `RELEASE_NAMES`), `lib/fdaRecalls.ts` (`FDA_FIRMS`), `lib/epaCases.ts` (`readCases`' columns, `MANY_PARTIES`), `lib/prices.ts` (`fetchDailyPrices`, `corporateActions`), `lib/takenNames.ts` (`takenBefore`); `scripts/check-cpsc.ts` and `scripts/check-doj.ts` (their replays); data: `data/edgar-tickers.json`; fixtures: `cpsc-recalls.json.gz`, `doj-archive-months.json.gz` · **Proposals:** 4

> - **No rejection log exists** (`docs/audits/rejected-proposals.md`), and nothing has been
>   rejected. Every proposal of 2026-11-08 is approved and built (batches 120–123), and batch 124
>   fixed what the audit of batches 117–123 found. Nothing carries forward and nothing was deferred.
> - **Owner calls already open, not raised again:** DuPont's past on DD's page; "Drugs whose holder
>   changed" and its two hand lists; JCI's 2016 case and its 38 EPA rows on Tyco's record; GE Capital
>   Retail Bank on GE; PayPal's 2015 CFPB action on eBay; whether the Digest keeps the first-price
>   floor; the Digest's names older than EDGAR's; widening the suit-filed threshold (`MANY_PARTIES`).
>   The tracked waits are not proposals either: batch 123's six NHTSA makers and the audit's two
>   questions (Southern Natural Gas on Kinder Morgan, Babcock & Wilcox's 2015 row). Nor are the
>   recorded leftovers: FBP's 2007 litigation release, the 9 pre-2000 CPSC recalls naming plain
>   "Toro", BP Amoco Chemical's rows after the 2020 INEOS sale, Savannah Electric's and PSNH's four
>   cases, CMS's "Consumers Power", Kennecott's missing start day.
> - **Two parts of #3 reopen items earlier runs set aside,** and say what changed:
>   - #3(a), the Justice Department before 2001, cut on 2026-11-02 for two 404s. The years 1996–1997
>     live under another address. All 60 months of 1996–2000 were read here.
>   - #3(b), the FDA map's units in the release rules, cut on 2026-11-05 after an SEC-only measure.
>     The Justice archive is now committed (batch 94) and the API's title filter works again (batch
>     121). Both were measured here.
>   - #4 was a line in the 2026-11-07 file's grounding, never proposed or cut.
> - **Saved data used instead of the network:** batch 95's copy of EPA's case file (2026-10-31,
>   137,103 cases as `readCaseFile` reads them) and its extracted tables; the committed CPSC and
>   Justice fixtures; 627 first trading days saved by batch 120 and its EDGAR former names; batch
>   123's Mattel filing list. Each was read as data, with `python3 -I`, or through the repository's
>   own functions from scripts in the session scratchpad (`scout125/probes/`).
> - **Measured live on 2026-11-09 from this container.** Every figure below is measured unless it
>   says it is an estimate. Requests, by host:
>   - www.justice.gov 99: 72 to the archive (the 60 month pages of 1996–2000, the 1996 folder's
>     index, and 11 that answered 404 while finding the addresses), and 27 to the API by `title` (#3);
>   - query1.finance.yahoo.com 33: 24 first trading days, 3 fund series for capital gains (cut), 5
>     refused with 429 and one "no data" (404);
>   - data.transportation.gov 5: the catalog search, the FRA dataset's metadata, two counts and the
>     rows under the draft floor (#2).
>
>   That is 137 requests: 120 answered 200, 12 answered 404 and 5 answered 429. Each carried the
>   User-Agent `News Charts Research`, with no email address, and each began at least 1.3 s after
>   the one before ended. No www.sec.gov or data.sec.gov page was asked. Postgres was not used and
>   the app was not run. The log is in the session scratchpad (`scout125/requests.log`).
> - **Nothing here needs a key, a paid tier or a recurring charge.** #1 adds entries to a list a
>   built source reads. #2 is a new keyless dataset on the host NHTSA's recalls already come from.
>   #3 reads 56 closed month pages once and adds names to the release map. #4 reads two more columns
>   of the zip the monthly walk already downloads.
> - Ranked by importance, securities depth first:
>   1. the CPSC's recalls under the units listed companies own: American Honda on Honda, Fisher-Price
>      on Mattel, Kidde on RTX, GE Appliances on GE, Playskool on Hasbro;
>   2. railroad accidents from the Federal Railroad Administration, a new source: Union Pacific, CSX,
>      Norfolk Southern, BNSF on Berkshire, CN and CPKC, from 1975;
>   3. more of the Justice Department's releases: its archive's months of 1996–2000, and the drug and
>      device makers' own companies in the release map;
>   4. EPA's cost-recovery figure on the Superfund rows pages already hold.

Mark each proposal below: `APPROVED`, `REJECTED`, or `DEFERRED`, and add a
reason for anything rejected. Then run the scout in FILE mode.

---

## 1. The CPSC's recalls under the units listed companies own: American Honda on Honda, Fisher-Price on Mattel, Kidde on RTX, GE Appliances on GE, Playskool on Hasbro, Pottery Barn on Williams-Sonoma… · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-09 ("1. Product recalls by owned brands"). Built in batch 126: 81 units on 47 companies in the CPSC's `UNITS` (103 entries, one for each key), every bought or sold unit between the days data.sec.gov's filing lists give, or, where no 8-K reports the deal, the two filings EDGAR's full-text search finds around it. 402 recalls more on 47 pages from first prices, 246 before 2017, none fewer; 14 pages gain their first CPSC row. Two draft days were wrong and the filings corrected them: Viking Range is Middleby's from 2012-12-31, not 2013-12-31 (two recalls of 2013 more), and Baby Jogger is no Newell's in 2012 and 2013 (its filings name it first in 2015). Stanley Security Solutions' locksets end at the 2017 sale to dormakaba, not 2022. Fisher-Price, Hasbro's four brands, Carrier before 2020 and Lawn-Boy wait for `NEWS_CHARTS_CONTACT`, as drafted.
**Owner's reason (if rejected):**

**Raised before:** no. Batch 100 found the first unit, Graco Children's Products. Batch 101 built the
CPSC's `UNITS` with Graco alone, on the owner's call of 2026-11-06. No run has counted the others.

**What changed:** nothing; first raised here.

**Anchor:** a capability asymmetry between sources. EPA's `UNITS` reads the operating units of 95
companies (batches 104, 114 and 120). The release map reads the operating units of 74 (batch 121).
The FDA map reads the units of 73.
The CPSC's `UNITS` (`lib/cpscRecalls.ts`) holds one entry: Graco on Newell.
- The caption rule refuses a company's name followed by words that are not legal words, as it
  should. So "American Honda Motor Co., Inc.", "Home Depot U.S.A., Inc.", "Macy's Merchandising
  Group" and "Textron Specialized Vehicles" are no page's.
- On the committed fixture, counted as check:cpsc counts (without EDGAR's former names), 13 pages
  have no CPSC row of any kind and would gain some: Honda, RTX, Sony, Philips, Disney, Clarus,
  Edgewell, Trane, Middleby, VF, RPM, Helen of Troy and Masco.

**What:** a list like EPA's: about 90 entries on 48 companies, each between the days its owner held
the unit. The caption rule, the namesake list, the first-price floor and the "Sold at" grouping stay
as they are.
- **Units named after the company,** counted from its first price and to a sale where there was one:
  Home Depot U.S.A., Macy's Merchandising Group, Sony Electronics, Textron Specialized Vehicles,
  Generac Power Systems, Acuity Brands Lighting, The William Carter Company, NIKE USA, Walt Disney
  Parks and Resorts. GE Appliances ends at its sale to Haier (2016-06-06), and "GE Appliances, a
  Haier company" is refused.
- **Units bought, or held under their own names,** each from the day the owner's filing gives:
  Fisher-Price, Playskool, Kidde, Maytag, Black & Decker (U.S.) and DeWALT, Arctic Cat, Lawn-Boy and
  Exmark, Fred Meyer, Little Tikes, Calphalon, Jarden's Sunbeam, Coleman and Contigo, Black Diamond
  Equipment, Viking Range.
- One unit may be on two pages, never on the same day: Kidde is RTX's to 2020-04-01 and Carrier
  Global's after, as batch 123 split Carrier's NHTSA recalls.

| Company | Units (draft days, to be read at the build) | Recalls (before 2017) |
| --- | --- | --- |
| Honda | American Honda Motor (six spellings), Honda Power Equipment | 52 (30) |
| Mattel | Fisher-Price from its 1993 merger; American Girl from 1998 | 50 (38) |
| Textron | Textron Specialized Vehicles; E-Z-GO; Greenlee to 2018; Arctic Cat from 2017-03-06 | 33 (6) |
| GE | GE Appliances to 2016-06-05; GE Consumer & Industrial; GE Security and Interlogix to 2010; GE Lighting | 27 (26) |
| Hasbro | Playskool and Milton Bradley from 1984; Tonka and Kenner from 1991 | 25 (25) |
| Williams-Sonoma | Pottery Barn, Pottery Barn Kids, West Elm; Rejuvenation from 2011 | 22 (21) |
| Stanley Black & Decker | Black & Decker (U.S.) and DeWALT from 2010-03-12; MTD from 2021-12-01; Stanley Security Solutions to 2022 | 17 (6) |
| Acuity | Lithonia Lighting, Acuity Brands Lighting, Holophane | 17 (14) |
| RTX | Kidde from 2005 and Carrier from 1979, each to 2020-04-01 | 16 (10) |
| Home Depot, Newell, Toro | Home Depot U.S.A. and Product Authority; Little Tikes 1999-03-24 to 2006, Calphalon, Baby Jogger, Jarden's companies from 2016-04-15; Lawn-Boy from 1989, Exmark from 1997 | 15 (3), 15 (10), 15 (15) |
| Sony, Philips | Sony Electronics, Sony Energy Devices; Philips Lighting, Philips Consumer Lifestyle | 14 (13), 14 (12) |
| Generac, Macy's, Clarus, Disney, Emerson | Generac Power Systems; Macy's Merchandising Group, Bloomingdale's; Black Diamond Equipment from 2010-05-28; Disney Store, Walt Disney Parks and Resorts; White-Rodgers, Emerson Tool | 13 (0), 13 (9), 13 (6), 13 (10), 12 (9) |
| 29 more | Amazon.com Services 7, Maytag on Whirlpool 6, Carter's 6, Best Buy Purchasing 5, The Children's Place 5, Fred Meyer on Kroger 5, Brunswick 5, Playtex on Edgewell 5, Ross Procurement 5, Old Navy on Gap 4, Trane U.S. 4, Viking Range on Middleby 4, NIKE USA 4, and 16 with 1 to 3 | 98 (58) |

**Licence:** no new source. The recalls are the Commission's own work, a work of the U.S. Government
(17 U.S.C. § 105), approved on 2026-11-05 and quoted in `lib/cpscRecalls.ts`.

**Grounded in:**
- **The replay.** The committed fixture (10,070 recalls, the service's answer of 2026-11-05) went
  through `cpscEvents` with today's code and check:cpsc's names, before and after adding the draft
  entries to `UNITS`, each with its stored-row key. Before → after compares recall numbers on the
  company's own rows.
- **The gain:** 504 recalls.
  - From first prices where they were read (32 of the 48 pages; 9 read today, the rest saved by
    batch 120): 494 on 48 pages, 321 before 2017, 52 before 2001. The other 16 pages' gained rows
    begin in 1993 or later; their first prices were not read.
  - 449 are new to the page. 45 sit today in the company's "Sold in its stores" month row (Macy's 10,
    Home Depot 8, Amazon 7) and become its own row.
  - 10 fall before a read first price and stay off: Dollar General's 5 of 2007–2009 (relisted
    2009-11-13), Generac's 2 of 2006, Carter's 2 of 2000–2001, Bloomingdale's 1985 row.
  - No recall comes off any page.
- **What they include,** none of them on any page today:
  - Kidde's 37,800,000 fire extinguishers with plastic handles (2017-11-02), on RTX, which owned
    Kidde then;
  - Fisher-Price's Power Wheels, 10,000,000 (1998-10-22), and its Rock 'n Play sleepers, 4,700,000
    (2019-04-12), on Mattel;
  - Sony Energy Devices' notebook battery cells of 2006: Dell's 2,700,000 and Sony's own 3,080,000;
  - GE's 3,100,000 dishwashers (2000-12-14); Maytag's 2,300,000 dishwashers (2007-02-01, on
    Whirlpool); Contigo's 5,700,000 children's bottles (2019-08-27, on Newell);
  - American Honda's ATVs, mowers and generators: 52 recalls from 2000.
- **Read by hand:**
  - the firm names each pattern takes on the whole fixture; every gained row of the 20 patterns
    likeliest to take a namesake (Carrier, Kidde, E-Z-GO, White-Rodgers, Philips, GE's, Disney's);
    and a fixed random sample of 30 gains. Each names the owner's unit inside the draft days.
  - Two patterns were narrowed on the way. "E-Z Go Strollers Recalled By Century" (1988) is not
    Textron's E-Z-GO. Carrier's recalls of 1978 and 1979 predate United Technologies' purchase.

**Who benefits and how:** Readers of 48 consumer-goods, appliance, toy, tool and retail pages. Honda,
Mattel, Hasbro, GE, Williams-Sonoma and Textron gain their own product recalls, 321 of them before
2017. Each is the Commission's notice, filed under the unit that made, imported or distributed the
product.

**Risk:**
- **The days are my drafts.** About 45 are to be read from data.sec.gov's filing lists at the build,
  as batches 120 and 123 read theirs.
- **89 recalls wait for a 10-K's text,** for purchases older than EDGAR: Fisher-Price 49 (Mattel's
  first EDGAR filing is of 1994-02-03), Hasbro's four brands 25 (1984 and 1991), Carrier 8 (1979),
  Lawn-Boy 7 (1989). www.sec.gov serves a filing's text only with `NEWS_CHARTS_CONTACT` set. No gained
  recall falls within ten months of any of these purchases, so the exact day moves no row.
- **Three end days need care:** Philips Lighting after its 2016 listing as Signify (1 recall, of
  2017-03-01); the Disney Store while The Children's Place ran it, 2004 to 2008 (2 recalls of
  2008-05-22); Stanley Security Solutions' sale of 2022.

**Cost:** none. The service is already read once a week for every company.
**Effort:** medium:
- about 90 entries in `UNITS`, each with its key and its `why`;
- about 45 days to read from filing lists, and the names each pattern takes read by hand;
- check:cpsc's totals re-pinned, and new cases.

**How to check:** new `check:cpsc` cases on the fixture:
- American Honda's ATV recall 02509 (2001-11-30) lands on HMC;
- Fisher-Price's Rock 'n Play 19105 (2019-04-12) lands on MAT, and its 93102 (1993-08-12) on no page;
- Kidde's 18022 (2017-11-02) lands on RTX, and its 21130 (2021-05-06) on CARR;
- GE's dishwashers 01054 (2000-12-14) land on GE, and "GE Appliances, a Haier company" 22028
  (2021-12-08) on no page;
- Arctic Cat's 16768 (2016-08-23) lands on no page, and its 17748 (2017-06-06) on TXT;
- Black & Decker (U.S.)'s 07248 (2007-07-20) lands on no page, and its 10339 (2010-09-09) on SWK;
- Maytag's 05280 (2005-09-27) lands on no page, and its 07094 (2007-02-01) on WHR;
- Little Tikes' 09290 (2009-07-30) and "E-Z Go Strollers" 88111 (1988) land on no page.

On main the new cases fail: `UNITS` holds Graco alone.

**Depends on:** nothing. The 89 recalls that wait share the batch 123 item's wait for
`NEWS_CHARTS_CONTACT`.

**Buildable by:** a cloud session; the fixture and data.sec.gov are enough.

*Importance:* high — 494 recalls on 48 pages, 321 before 2017; 13 pages with no CPSC row today gain
some · *Efficiency:* high — entries in a list a built source already reads · *Practicality:* medium
— about 45 days to read, and 89 rows wait for a 10-K's text

---

## 2. Railroad accidents from the Federal Railroad Administration, a new source on NHTSA's host: derailments, collisions and hazardous releases since 1975 on Union Pacific, CSX, Norfolk Southern, BNSF on Berkshire, CN and CPKC · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-09 ("2. Railroad accidents (new source)"), with the floor as drafted ("Draft cut-off (Recommended)"): a death, an evacuation or $5,000,000 of damage, and a crossing collision only with an evacuation or that damage. Built in batch 127 (`lib/railAccidents.ts`): on the dataset's answer of 2026-11-09, each page from its first price, 476 accidents on six pages, 395 before 2017, 131 before 1993 (CSX 161, Union Pacific 155, Norfolk Southern 65, CN 36, Berkshire Hathaway 35, CPKC 24). Every railroad's day is read from a filing; two read on the way differ from the draft: Illinois Central is CN's from 1998-06-05 (its Form 15), and the Chicago, Central & Pacific from CN's 6-K of 2002, the first filing that names it. Missouri Pacific (1982) and the Delaware & Hudson (1991), bought before EDGAR, wait for `NEWS_CHARTS_CONTACT`.
**Owner's reason (if rejected):**

**Raised before:** no. No document in the repository names the FRA.

**What changed:** nothing; first raised here.

**Anchor:** a capability asymmetry between sectors on one host.
- Carmakers' pages carry NHTSA's recalls since 1966 and its investigations since 1975, read from
  data.transportation.gov (batches 30 and 66).
- The same host publishes FRA's Rail Equipment Accident/Incident Data (Form 54, dataset
  `85tf-25kj`), under the same licence label. No page reads it.
- Before EDGAR, a railroad's page holds little but Yahoo's dividends and splits (COVERAGE-MAP, "The
  gaps worth knowing about").

**What:** an adapter like `lib/recalls.ts`, in four parts.
- **The read:** keyless SoQL on data.transportation.gov, by railroad code, under a floor.
- **The row:** each accident on its day. It gives the type, place, killed, injured, evacuated and
  hazardous-material cars released, and the damage in whole dollars, kept numeric. It links FRA's own
  PDF of the report (the dataset's `url` field).
- **The floor,** the owner's to set. My draft: a derailment, collision or other train accident with
  a death, an evacuation, or $5,000,000 of damage. A highway-rail crossing collision counts only with
  an evacuation or $5,000,000 of damage.
- **A map of railroad codes to companies** (`RAIL_OWNERS`), each on its days. My draft:
  - UP itself; Missouri Pacific from 1982-12-22; Southern Pacific and Cotton Belt from 1996-09-11;
    Chicago & North Western from 1995-04-25: Union Pacific;
  - CSX Transportation, and B&O, C&O, Seaboard Coast Line, L&N and Seaboard System from 1980-11-01:
    CSX;
  - NS, and Norfolk & Western and Southern from 1982-06-01: Norfolk Southern;
  - BNSF from 2010-02-12, batch 120's day: Berkshire Hathaway;
  - Grand Trunk Western; Illinois Central from 1999; Wisconsin Central from 2001-10-09; DM&IR and
    B&LE from 2004-05-10: CN;
  - Soo Line and CP; Kansas City Southern from 2023-04-14: CPKC.

  A predecessor's past is never the buyer's: Burlington Northern's, Santa Fe's and Conrail's are no
  page's.

**Licence:** "Public Domain U.S. Government" in the dataset's own licence field, with its terms link
usa.gov/government-works (`/api/views/85tf-25kj.json`, read 2026-11-09). It is the label NHTSA's
recalls carry, approved on 2026-10-22. This is a new source, so it needs the owner's yes.

**Grounded in:**
- **The dataset today.** For 27 railroad codes, 1,708 accidents have a death, an evacuation or
  $5,000,000 of damage, from 1975-01-12 to 2026-07-22.
  - 673 of them qualify only by a death in a crossing collision, most often a motorist's. The draft
    floor leaves those out and keeps 1,035.
  - A looser count, for scale (a death, an evacuation or $1,000,000): UP 1,072 from 1975, BNSF 792,
    CSX 389, NS 255.
- **On pages,** from first prices (Yahoo's first trading days: UNP 1980-01-02, CSX 1980-11-03, NSC
  1982-06-02, BRK-B 1996-05-09, CNI 1996-11-26, CP 1983-12-30): 461 accidents on 6 pages, 388 before
  2017, 191 before 2001, 132 before 1993.

  | Page | Accidents (before 2017; before 1993) | With a death / an evacuation / $5M of damage |
  | --- | --- | --- |
  | Union Pacific | 161 (124; 39) | 54 / 94 / 23 |
  | CSX | 156 (138; 74) | 24 / 127 / 7 |
  | Norfolk Southern | 61 (55; 12) | 9 / 51 / 3 |
  | Berkshire Hathaway | 35 (27; 0) | 7 / 18 / 11 |
  | CN | 27 (24; 0) | 5 / 20 / 4 |
  | CPKC | 21 (20; 7) | 4 / 19 / 1 |

- **On no page:** 553 accidents of railroads no listed company held that day: Conrail 80, Southern
  Pacific before 1996 74, Burlington Northern 66, BNSF before 2010 60, Santa Fe 45. 21 more fall
  before a first price.
- **For example:**
  - Norfolk Southern at Graniteville, South Carolina, 2005-01-06: 9 killed, 292 injured, 5,200
    evacuated;
  - Norfolk Southern at East Palestine, Ohio, 2023-02-03: 18 injured, 2,100 evacuated, 8 hazardous
    cars released;
  - CSX in Baltimore's tunnel, 2001-07-18: 50,000 evacuated;
  - the Soo Line at Minot, North Dakota, 2002-01-18: 1 killed, 1,000 injured, on CPKC's page;
  - Union Pacific at Macdona, Texas, 2004-06-28: 3 killed, 79 injured;
  - CSX at Crofton, Kentucky, 1988-06-22: 107 injured, 4,000 evacuated; Union Pacific at San
    Antonio, 1986-06-08: 2 killed, 2,500 evacuated.

**Who benefits and how:** Readers of six large railroads' pages. They gain 132 dated events before
1993, where these pages hold almost nothing, and 256 more from 1993 to 2016. A derailment that empties
a town is a dated event on the railroad's own regulatory record, with a document to cite.

**Risk:**
- **The floor is my draft.** Damage is in the dollars of its year, so a fixed floor favours recent
  years. The death count is everyone the accident killed, crew and public.
- **Days to read:** Southern Pacific's and Chicago & North Western's from Union Pacific's 8-Ks;
  Illinois Central's, Wisconsin Central's and Great Lakes Transportation's from CN's filings; Kansas
  City Southern's from CPKC's. Missouri Pacific's merger of 1982 predates EDGAR and needs a 10-K's
  text. Conrail's split of 1999 needs no entry: CSX and NS report their parts under their own codes.
- **Two railroads in one accident file two reports.** Each is a row on its own owner's page.
- **The report is the railroad's own filing to its regulator,** not a finding of fault. The row says
  so.

**Cost:** none. No key; "no published cap without an app token", as for NHTSA. One request a day per
company, or one monthly read of the roughly 1,800 rows under the floor.
**Effort:** medium:
- an adapter and its row in `SOURCES` (`commercialOk: true`);
- the map, about 25 codes and 8 days;
- titles, a fixture of real rows, and `check:rail-accidents` in the check chain;
- the coverage map's and README's lines.

**How to check:** `check:rail-accidents` on committed rows:
- Graniteville (NS 019414, 2005-01-06) and East Palestine (NS 152207, 2023-02-03) land on NSC;
- Baltimore (CSX 070122014, 2001-07-18) lands on CSX;
- Minot (SOO 170488, 2002-01-18) lands on CP;
- Weyauwega (WC G2895, 1996-03-04), before CN bought Wisconsin Central, lands on no page, and so does
  Southern Pacific's Macdona (U5725, 1985-09-14);
- BNSF's NC1096105 (1996-10-27) lands on no page, and its GC0210105 (2010-02-18) on BRK-B;
- a crossing collision with one death and no evacuation lands on no page.

On main they fail: no reader exists.

**Depends on:** the owner's approval of a new source.

**Buildable by:** a cloud session; data.transportation.gov answered all 5 requests from here.

*Importance:* high — 461 accidents on six large railroads' pages, 388 before 2017 and 132 before
EDGAR · *Efficiency:* medium-high — one keyless dataset on a host already read · *Practicality:* high
— measured; the floor and eight days to settle

---

## 3. More of the Justice Department's releases: its archive's months of 1996–2000, and the drug and device makers' own companies in the release map · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-09 ("3. More Justice Dept releases"), with the routine notices in U.S. v. Microsoft grouped a row a month ("Group a row a month (Recommended)"). Built in batch 128: (a) the archive's months from May 1996 (January to April 1996 list no days), 2,608 releases, 67 on 40 pages from first prices, Microsoft's eight deposition notices shown as two month rows; (b) `HEALTH_UNITS` in `lib/releaseNames.ts`, 27 names on 13 companies, 33 releases on 10 pages, 20 before 2017, with "LP" read as a legal word for AstraZeneca Pharmaceuticals LP's plea of 2003.
**Owner's reason (if rejected):**

**Raised before:** yes, both parts.
- (a) The 2026-11-02 file's cut list: "The Justice Department before 2001: two guessed month
  addresses answered 404, and the archive's index sat behind a bot check. A follow-up to #2 from the
  owner's host." Batch 94 left "a pre-2001 archive: the proposal measured 404s for 1994–1995".
- (b) The 2026-11-05 file's cut list: "The FDA and vehicle maps' units in the release rules". On the
  SEC's rows they gave 1 new day, and "The Justice Department's releases are likelier to name the
  drugmakers' units, but none is saved for a unit and I did not ask."

**What changed:**
- (a) Measured from here. The months of 1996–1997 live under another address,
  `/archive/opa/pr/1997/July97/`. The 1996 folder's index lists irregular names: `Jun96/`,
  `Sept96/`, `Oct96/`. The months of 1998–2000 use 2001's own shape. July 1994 and July 1995 answer
  404 under the `July95/` shape, as 1994 and 1995 did under the other on 2026-11-02, and the 1995
  folder answers 404 too. All 60 months of 1996–2000 answered 200.
- (b) The archive of 2001–2008 is now committed (batch 94), and the API's title filter works again
  (batch 121). Both were measured here.

**Anchor:**
- (a) A floor that is the reader's, not the Department's: `ARCHIVE_FIRST_YEAR = 2001`
  (`lib/dojArchive.ts`). The 2001–2004 list parser reads "#309: 06-30-98 - TITLE" once the year is
  read as 19xx and the dash after the day is dropped.
- (b) A capability asymmetry. `OPERATING_UNITS` holds EPA's units of 74 companies. The FDA map's
  units of 73 companies, each day already read from a filing, reach no release rule. The title rule's
  legal words (`DESIGNATOR_WORD`, `lib/doj.ts`) hold "Laboratories" and "Health" but not
  "Pharmaceuticals", so "Novartis Pharmaceuticals Corp. to Pay More Than $420 Million" is no page's.

**What:** two parts, each approvable alone.
- **(a) The 56 dated month pages of 1996-05 to 2000-12,** read once and kept in db/036's tables, as
  the months of 2001–2008 are. The parser needs four changes, its rule otherwise unchanged:
  - a 19xx century;
  - the dash after the day;
  - a day written with spaces ("06 23 98") or as "1996-05-31";
  - the two address shapes.

  January to April 1996 list no day (152 releases) and are left out.
- **(b) About 45 names in the release map, on their days.**
  - The FDA map's units: Ethicon, DePuy, Janssen, LifeScan to 2018-10-01 and Synthes from 2012-06-14
    on J&J; Covidien on Medtronic from 2015-01-26; St. Jude Medical and Alere on Abbott; Genzyme on
    Sanofi from 2011-04-08; Sandoz and Alcon on Novartis; Actavis on Teva; Biomet on Zimmer Biomet.
  - The drugmakers' own US companies: Novartis Pharmaceuticals, AstraZeneca Pharmaceuticals LP, Teva
    Pharmaceuticals USA, Sanofi US and Sanofi Pasteur, Merck Sharp & Dohme.
  - A few with days of their own: Aventis on Sanofi from 2004-08-20; Guidant on Boston Scientific from
    2006-04-21; Caremark (2007-03-22), Omnicare (2015-08-18) and Aetna (2018-11-28) on CVS; Express
    Scripts on Cigna (2018-12-20).

**Licence:** no new source. The Department's releases are public domain: "Unless otherwise indicated,
information on Department of Justice websites is in the public domain and may be copied and
distributed without permission" (justice.gov/legalpolicies, quoted in `lib/doj.ts`).

**Grounded in:**
- **(a) The months.** 2,605 dated releases on 56 pages, 20 to 73 a month. They were parsed by a copy
  of `parseArchiveMonth`'s list rule with the four changes.
  - **The replay:** every index company through `dojEvents`, as check:doj's `replayArchive` does: its
    names, check:doj's two former-name entries, the release map, and the table of taken names.
  - **Before first prices:** 80 releases on 51 companies.
  - **From first prices** (651 first trading days, saved or read today): 66 on 39 pages. By year:
    1996 3, 1997 12, 1998 19, 1999 19, 2000 13.
  - **What the 66 hold:** 9 are routine notices in U.S. v. Microsoft ("NOTICE OF UPCOMING
    DEPOSITIONS", 8 in 1999). 5 are Alcoa's on AA (closing note). 1 is DuPont's 1997 suit, under the
    owner's open DD call. The other 51 are on 37 pages.
  - **For example:** ADM "to Pay Largest Criminal Antitrust Fine Ever" (1996-10-15); the antitrust
    suit against Microsoft (1998-05-18); GE's Housatonic settlements, $200 million (1998-09-24) and
    $250 million (1999-10-07); American Honda's $267 million Clean Air Act settlement and Ford's
    (1998-06-08); the suit to block Lockheed Martin's purchase of Northrop Grumman (1998-03-23);
    Toyota's Clean Air Act suit (1999-07-12); FMC's record RCRA settlement (1998-10-16); Duke Energy's
    Clean Air Act suit (2000-12-22).
  - **The guards hold.** Prudential plc's ADR, first priced 2000-06-29, does not take "Aetna's
    Acquisition of Prudential HealthCare" (1999), a namesake. National Bank Holdings, Horizon Bancorp
    (Indiana), Outdoor Holding and Mastercard are kept off by their first prices. AT&T Corp.'s three
    releases of 1998–2000 are kept off by the taken-names table.
- **(b) The units.**
  - **The archive of 2001–2008** (committed), through `dojEvents` with 136 names on 43 companies,
    the FDA map's and the drugmakers' own US companies', as batch 121 measured its units: 3 releases
    on 3 pages. AstraZeneca Pharmaceuticals LP's $355 million plea (2003-06-20); LifeScan's
    $15 million (2001-11-14, J&J); Aventis's $190 million (2007-09-10, Sanofi).
  - **The API's years:** 27 names asked by `title`, one request each. 28 more releases on 9 pages,
    15 of them before 2017:
    - Merck Sharp & Dohme's Vioxx plea, "Nearly One Billion Dollars" (2011-11-22), and its sentencing
      (2012-04-19);
    - Novartis Pharmaceuticals' $420 million (2010-09-30), $370 million (2015-11-20) and three
      filings of 2013–2014;
    - Guidant's charge, plea and sentence (2010–2011), on Boston Scientific;
    - Sanofi US's $109 million (2012-12-19), and Genzyme's $22.28 million (2013) and $32.5 million
      (2015);
    - Janssen Pharmaceuticals' plea (2013-01-03); Teva Pharmaceuticals USA's penalty (2013) and its
      $450 million (2024-10-10);
    - Aetna's $117.7 million (two releases, 2026-03-10 and 2026-03-11) and Omnicare's three, on
      CVS; St. Jude Medical's $27 million (2021) and Alere's three, on Abbott; Covidien's two, on
      Medtronic.
  - **Asked, and no title held them:** Sandoz, Actavis, Ortho-McNeil, Ethicon, Hospira, Express
    Scripts.
  - **Not measured:** the other names' API years, and the SEC's and the CFTC's rules on the same
    names.
- **Together:** 97 releases on 49 pages; 66 before 2001 and 18 more before 2017.

**Who benefits and how:**
- (a) Readers of 39 pages in every sector, for 1996–2000, years the Justice API never held.
- (b) Readers of 10 drug, device and health-insurance pages, where some of the Department's largest
  settlements of 2003–2015 sit on no page today.

**Risk:**
- **(a) The Microsoft notices:** the rule takes them. The build could group them a row a month, as
  the Federal Register's routine notices are, or leave them. That is a call for the owner.
- **(a) About 40 rows give no readable day** ("02--5-97", "#332:" with no date). They are left
  unread, as the 2001–2004 parser leaves its own.
- **(b) A unit's name inside other words:** "Alcon" matched 22 titles holding "Falcon", and none
  passed the rule. Each name is read against its answers at the build.
- **(b) A former name between the company and its verb** stays refused: "Medtronic Spine, Formerly
  Kyphon Inc., to Pay" (2008). No name in the map changes that.

**Cost:** none.
- (a) 56 pages read once; the archive is closed.
- (b) About 45 more API asks a day across the companies that hold the names, at the source's own
  pace.

**Effort:** small:
- (a) the parser's four changes and the address shapes, a walk of 56 months, and its fixture;
- (b) about 45 release-map entries, their days from the FDA map's cited filings, and about 8 more
  days to read.

**How to check:** new `check:doj` cases:
- (a) on the committed pages:
  - ADM's 1996-10-15 release lands on ADM, Microsoft's 1998-05-18 suit on MSFT, and Honda's of
    1998-06-08 on HMC;
  - "Aetna's Acquisition of Prudential HealthCare" (1999-06-21) lands on no page from first prices,
    and AT&T Corp.'s merger approval of 1998-12-30 on no page;
  - a month of 1996 is read from its `MonthYY/` address.
- (b) on real titles:
  - "Novartis Pharmaceuticals Corp. to Pay More Than $420 Million" (2010-09-30) lands on NVS;
  - the AstraZeneca Pharmaceuticals LP plea (2003-06-20) lands on AZN;
  - Merck Sharp & Dohme's of 2011-11-22 lands on MRK;
  - Guidant's plea of 2010-04-05 lands on BSX, and a Guidant title before 2006-04-21 on no page;
  - Covidien's of 2019-03-11 lands on MDT.

On main the new cases fail.

**Depends on:** nothing. (b) reuses the FDA map's days.

**Buildable by:** a cloud session; www.justice.gov answered all 60 months and the API from here.

*Importance:* medium-high — 97 releases on 49 pages, 66 before 2001 and 18 more before 2017, among
them some of their years' largest corporate cases · *Efficiency:* high — one source's rule, already
written · *Practicality:* high — measured; one owner call on the Microsoft notices

---

## 4. EPA's cost-recovery figure on the rows pages already hold: what a Superfund settlement pays back · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-09 ("4. EPA cleanup-cost figures"). To be built in batch 129.
**Owner's reason (if rejected):**

**Raised before:** as a line. The 2026-11-07 file's #1 counted "cost recovery on 2,460 rows,
supplemental projects on 155" and proposed only the penalty and the work ordered, which batch 113
built.

**What changed:** measured on EPA's whole file with today's rows, after batches 120 and 122.

**Anchor:** data collected and never surfaced.
- `readCases` reads the settlements' federal and state penalties and the work ordered
  (`lib/epaCases.ts:302`). It does not read their `COST_RECOVERY_AWARDED_AMT`, nor the case's own
  `TOTAL_COST_RECOVERY_AMT`.
- On many Superfund decrees EPA records no penalty and no work ordered, only a cost recovery: what
  the parties pay back for EPA's cleanup. Such a row reads "EPA consent decree (Superfund law
  (CERCLA))" with no figure.

**What:**
- Read the two columns, money kept numeric, `numeric(16, 2)` as the other figures are.
- The row names the cost recovery beside the penalty and the work ordered. A case split by settlement
  (batch 122) takes each settlement's own figure.
- A settlement of several parties says "among N parties", as the work ordered does.
- A suit's filing row keeps no money.
- A migration adds the settlements' figure. The next run reads EPA's file whole, as db/043 and db/044
  made it do.

**Licence:** no new source. EPA's case file was approved on 2026-11-05 with EPA's terms quoted in
`lib/epaCases.ts`.

**Grounded in:**
- **The replay:** EPA's whole file of 2026-10-31 (137,103 cases). Every index company went through
  `epaEvents` with today's code, before first prices: 9,155 rows on 690 companies, the coverage map's
  count. 8,827 of them are day rows.
- **The rows it changes:**
  - 3,126 day rows that are not a suit's filing carry an EPA cost-recovery figure. 2,045 of them show
    no money at all today.
  - Of those 2,045: 1,810 are before 2017 and 901 before 2001; 1,227 are of $1 million or more, by
    case totals.
  - 246 are cases of three defendants or fewer. 1,799 have more, mostly Superfund, where the figure
    is the whole settlement's.
- **For example:**
  - Ford's decree of 1993-08-25 (05-1991-0214): $55,513,499 of cost recovery; its row shows no
    figure;
  - GE's of 2006-09-20 (01-2006-0214): $13,103,095; its summary says "a cost recovery case" and gives
    no figure;
  - GE's Pittsfield and Housatonic settlement of 1999-10-07: $71,000,000 beside its $500,000,000 of
    work; the Hudson River decree of 2005-10-06: $26,000,000 beside $150,000,000;
  - General Motors' of 2012-01-30 (03-2009-7032): $12,501,182.
- **Supplemental projects** (`SEP_AMT`): 244 day rows carry one, and 23 of them show no money. They
  could be read in the same pass; alone they are too few to propose.

**Who benefits and how:** Readers of GE, Ford, GM, Honeywell, ExxonMobil and the other pages with
Superfund rows. 1,810 rows before 2017 gain EPA's own figure for what was paid back.

**Risk:**
- **On a multi-party decree the figure is the whole settlement's,** not the company's share. The row
  must say "among N parties".
- **Split cases count differently:** the counts above use case totals; the build uses each
  settlement's.

**Cost:** none.
**Effort:** small:
- two columns in `readCases` and the walk, and a migration;
- the slice gains the two columns, and the totals are re-pinned.

**How to check:** new `check:epa-cases` cases on the slice:
- Ford's 05-1991-0214 row gives $55,513,499 of cost recovery;
- GE's 01-2000-0035 row of 1999-10-07 gives $71,000,000 beside its $500,000,000 of work;
- a suit's filing row gives none;
- the 225-party decree of 1998-05-08 (02-1989-0358) says "among 225 parties".

On main the new cases fail: no cost recovery is read.

**Depends on:** nothing.

**Buildable by:** a cloud session, offline.

*Importance:* medium-low — a figure on 2,045 rows, 1,810 before 2017, and no new event ·
*Efficiency:* high — two columns of a table already read · *Practicality:* high — measured on the
saved file

---

## Considered and cut

- **Funds' capital-gain distributions from Yahoo (measured, cut).** Yahoo's chart gave no
  capital-gain events for Fidelity Contrafund (FCNTX) or The Growth Fund of America (AGTHX), under
  either spelling of the parameter (3 requests). Its "dividends" already carry the whole
  distribution: AGTHX's $8.604 of 2025-12-17 is 9.8% of the close before, against a fall of 11.3%.
  So the markers exist; only their label, "Cash dividend", understates a fund's. A label, not depth.
  Not proposed.
- **FRA's fatal crossing collisions and its grade-crossing file (Form 57):** 673 crossing collisions
  qualify for #2 only by a death, most often a motorist's. They are left out by the draft floor; the
  owner may widen it.
- **The Justice archive's January–April 1996:** 152 releases listed with no day. One matches, a
  city's namesake (Hayward). Left out.
- **The Justice Department before 1996:** no month page found under either address shape (July 1994
  and July 1995 tried here), and the 1995 folder answers 404. Not reachable from here.
- **Not measured:**
  - a fourth round of EPA's units;
  - non-US regulators (the European Commission's competition decisions, the UK's FCA): neither host
    was tried, and no licence was read;
  - OSHA and MSHA enforcement (the Labor Department's bulk files, hundreds of megabytes, with
    establishment names full of namesakes).
- **Not retried:** the FTC, the OCC and FSIS (unreachable on 2026-11-05); the FDIC's failed-bank list
  (no licence wording); PHMSA and FERC (403 on 2026-11-08); the NRC (needs a script); the NTSB (an
  Access database).
- **Owner decisions and tracked waits, not raised:** listed in the header.
- **Re-prioritisations:** none proposed. One count for the owner's queue, though: setting
  `NEWS_CHARTS_CONTACT` (OWNER-ACTIONS §2) now gates the Digest walk (about 9,500 issues), batch
  123's six makers (31 recalls and 13 investigations), the audit's two questions, and the days of
  #1's 89 recalls. It is already the first step of §2.
- **Anything touching another product:** nothing here reads, references or connects to another
  product's repository.

*One closing note, not a proposal* — noticed in passing. AA's page takes old Alcoa Inc.'s Justice
releases. AA's record is Alcoa Corp.'s of 2016 (CIK 1675149); old Alcoa Inc.'s record is Howmet's
(CIK 4281). Yet check:doj's first-price table gives AA 1962-01-02, so the archive's "Clean Air Act …
Settlement with Alcoa" (2003-04-09) is on AA. Under #3(a), 5 more of 1997–2000 would be. Neither
`TAKEN_NAMES` nor `lib/predecessors.ts` has an entry for AA. It is the same class as DD's open call;
the `code-auditor` may want it. Separately, `DESIGNATOR_WORD` reads "L.P." but not "LP", which is
why AstraZeneca Pharmaceuticals LP's 2003 plea needs its full name in #3(b).
