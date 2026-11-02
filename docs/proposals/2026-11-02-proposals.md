# Opportunity proposals — 2026-11-02

**Commit:** 5defee6b1dddc792de2e999d657297485d1cd3ef (`claude/lucid-goodall-6km6ea`, equal to `origin/main` after batch 85) · **Reviewed:** `CLAUDE.md`; `README.md` (searched, not read whole); `docs/MASTER-CHECKLIST.md` (the batch 79–85 ledgers, Scope refocus's open boxes and its 2026-11-01 entries, the legend); `docs/COVERAGE-MAP.md`; `docs/audits/2026-11-01-code-audit.md` (summary, set-asides, what it found sound); all six files in `docs/proposals/` (2026-11-01 and 2026-10-22 whole; the cut lists of 2026-10-17, 10-26 and 10-28); code — `lib/releaseNames.ts`, `lib/fedActions.ts` (`FED_BANKS`), `lib/fedPress.ts`, `lib/secCases.ts` (header), `lib/doj.ts` (header, `dojEvents`), `lib/predecessors.ts` (header), `lib/ingest/frBackfill.ts` (`namesForYear`), `lib/ingest/store.ts` (`SOURCES`), and the full replays in `scripts/check-fed-press.ts` and `scripts/check-sec-cases.ts`; data — `data/edgar-tickers.json`, `scripts/fixtures/sec-cases-all.json.gz`, `scripts/fixtures/fed-press-feed.json.gz`, `scripts/fixtures/sec-press-listing.json`, and the local `chronolens_b73` database (read-only) · **Proposals:** 5

> - **No rejection log exists** (`docs/audits/rejected-proposals.md`), and nothing has been
>   rejected: all five 2026-11-01 proposals were approved and built (batches 80–84), and batch 85
>   fixed the five findings of the 2026-11-01 audit. No item was deferred, so none carries forward.
>   Insider-trade forms stay out, as decided on 2026-10-18.
> - **Owner calls raised before and still open.**
>   - The ~25 Board orders filed under a listed company's own bank (batch 84) and Popular, Inc. in
>     `FED_BANKS` (batch 74): ranked as #4, with what is new — the same firms' broker and adviser
>     units in the SEC's cases, measured.
>   - CPSC recalls (the 2026-10-22 shortlist): still awaiting the owner. Nothing new measured; not
>     re-proposed.
>   - JCI's 2016 case on Tyco's record (batch 85's set-aside): not ranked; a note at the end with
>     what the record's former names show.
> - **Measured live on 2026-11-02 from this container**, every figure below unless it says it was
>   read from the checklist, the saved fixtures or the local database. Requests, by host:
>   - www.sec.gov 8: six SEC News Digest issues (1965, 1970, 1975, 1980, 1985, 1990), the Digest's
>     1985 archive page, and the licence page;
>   - www.federalreserve.gov 14: the press-release page, its archive page, one page that answered
>     404, the ten yearly release pages for 1996–2005, and one 1998 order's own page;
>   - www.consumerfinance.gov 9: the enforcement feed, the seven list pages for 2012–2016, and the
>     website policy;
>   - www.justice.gov 5: two archive month pages (2005-01, 2001-06), two older month guesses that
>     answered 404, and the archive's index page, which answered with a bot check;
>   - www.fdic.gov 3: the failed-bank page, its CSV, and the website policies;
>   - data.sec.gov 3: the submissions records of Ameriprise, Johnson Controls and Wells Fargo.
>
>   42 in all, each with the User-Agent `News Charts Research marcusowens94@gmail.com`; sec.gov
>   hosts paced at about one a second. GDELT, Wikipedia, Wikidata, Yahoo, the Federal Register,
>   openFDA and NHTSA were not asked. Postgres 16 was running; I ran read-only queries on
>   `chronolens_b73` (and listed the databases) and left it running.
> - **Nothing here needs a key, a paid tier or a recurring charge.** Two proposals, #1 and #5,
>   read datasets the site does not read today; each is written as a decision for the owner, with
>   its licence quoted from the source's own page. #2 and #3 read older years of releases two
>   adapters already read, under their licences. #4 is the owner's open call.
> - Ranked by importance, securities depth first:
>   1 · the SEC News Digest, the SEC's daily record of companies' filings and cases from 1956 to
>   the mid-1990s, before EDGAR (a source decision, with a count first) — 2 · the Justice
>   Department's releases of 2001–2008, from its archive — 3 · the Federal Reserve Board's orders
>   of 1996–2005, from its yearly pages — 4 · the listed banks' and brokers' own units: their
>   banks in the Board's orders, their broker-dealers and advisers in the SEC's cases (the owner's
>   open call) — 5 · the CFPB's enforcement actions, from 2012 (a source decision).
> - Five, not eight. What else I looked at, and why it was cut, is at the end.

Mark each proposal below: `APPROVED`, `REJECTED`, or `DEFERRED`, and add a
reason for anything rejected. Then run the scout in FILE mode.

---

## 1. The SEC News Digest, 1956 to the mid-1990s: the SEC's own daily record before EDGAR — a source for the owner to decide, and a count first · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-02: yes to the source, with the count first. Whether the Digest keeps the first-price floor stays open until the count shows what it removes.
**Owner's reason (if rejected):**

**Anchor:** the gap the coverage map calls "the single biggest hole in the corpus"
(`docs/COVERAGE-MAP.md:90-94`) · a capability present for one era and missing for the one before
it. The SEC's cases begin in 1995 because "1994 lists none" (`lib/secCases.ts:40-41`), and
companies' EDGAR filings begin in 1993–94. The Digest is the SEC's daily summary of the same
business before that: the same release numbers (LR-3247 in 1965, Rel. 34-21599 in 1985), the 8-K
reports filed, the registration statements, the 13D and 14D-1 filings, and the delistings. It is
on sec.gov, a host the site already reads, and nothing reads it.

**What:** The owner's decision first. If yes, two steps:
- **A count, before any ingest.** `npm run digest-report -- <year>` reads one year's issues once,
  takes each PDF's text layer, splits it into its sections, and prints, per index company and
  section, the entries that name it under its names and EDGAR former names. Nothing is stored. This
  is how batch 13's `fr-company-report` sized the Federal Register before it was built.
- **Then, only if the count holds:** a year walk in the shape of the SEC press-release walk,
  entries stored once, matched at each company's ingest. Each event is typed by section and linked
  to the issue's PDF. The 8-K entries are grouped a row a month, as routine Federal Register
  notices are.

**Licence:** "Information presented on sec.gov is considered public information and may be copied
or further distributed by users of the web site without the SEC's permission. Please consider
appropriate citation to the SEC as the source." (www.sec.gov/about/privacy-information, re-read
2026-11-02; the same words `lib/secCases.ts` quotes.) No key.

**Grounded in:**
- **What those decades hold on a page today** (`chronolens_b73`): IBM's 1963–1993 is 127 events,
  every one a Yahoo dividend or split. Before 1995 Pfizer has 92 Yahoo rows and 8 EDGAR filings,
  and Apple 32 and 9; EDGAR's electronic record starts in 1993.
- **The archive:** `www.sec.gov/news/digest/digarchives/digarchYYYY.shtml` for every year from
  1956 to 2013; the 1985 page lists 251 issues. Each issue is a PDF of 4 to 8 pages, 370–874 KB in
  the six fetched, and each carries a text layer. `pdftotext` read 15–60 KB of text from each:
  1965-06-15, 1970-06-15, 1975-06-16, 1980-06-16, 1985-01-02 and 1990-06-15.
- **What an issue holds,** from the six:
  - enforcement: "GOLDEN SANDS CORP., OTHERS ENJOINED … (LR-3248)" (1965); administrative
    proceedings under Rel. 34-21599 (1985);
  - the Holding Company and Investment Company Act orders: "An order has been issued exempting
    Deutsche Bank AG and Deutsche Bank Financial Inc. … (Rel. IC-14293 - Dec. 28, 1984)"; Georgia
    Power, "subsidiary of The Southern Company";
  - Securities Act registrations, by registrant, with address, file number and day ("HUMANA INC …
    File 2-53919 June 11", 1975);
  - **the 8-K reports filed, by company, with their items and month.** The 1975-06-16 issue lists
    247, among them "ABBOTT LABORATORIES 14 05/75", "PEPSICO INC 11 05/75", "SOUTHERN CO 11,14
    05/75" and "MINNESOTA MINING MANUFACTURING CO 11 05/75";
  - the 13D and 14D-1 filings, by the company bought and the buyer: five on Hasbro by the
    Hassenfeld family (1990-05-17), and GE Capital's 35.7% of Star Technologies;
  - listing and delisting orders: the NYSE's delisting of McGraw-Hill's 3 7/8% debentures (1990).
- **Index companies in the six, read by hand** (by the record's name or an EDGAR former name):
  - 1965: Curtiss-Wright and John Wiley & Sons;
  - 1970: none;
  - 1975: Abbott, PepsiCo, Southern Co, Curtiss-Wright, 3M (as Minnesota Mining), Humana,
    Portland General Electric and TransCanada PipeLines. Caterpillar (as Caterpillar Tractor) and
    Duke Power appear under names older than EDGAR's;
  - 1980: none. Its Morgan Stanley & Co. is an underwriter, and on my reading that firm was not
    yet on today's MS record;
  - 1985: Southern Co and Georgia Power, Deutsche Bank AG, and Middle South Utilities (Entergy,
    under a name older than EDGAR's);
  - 1990: Hasbro, STAAR Surgical, and McGraw-Hill (S&P Global's old name).

  That is 0 to 10 an issue, about 3 on average.
- **An estimate, not a count:** about 250 issues a year at about 3 gives on the order of 750
  entries a year on index companies, roughly 25,000–30,000 over 1956–1993 before grouping, most of
  them 8-K reports and registrations. Six issues cannot size it better; that is what the count step
  is for.
- **What the rule must refuse or cannot reach,** all seen in the six:
  - an underwriter or depositor named inside another company's registration ("Underwriter: Morgan
    Stanley & Co. Incorporated", 1980);
  - a record younger than the name: McGraw Hill (MH) listed in 2025 and carries the 1990 name, so
    the first-price floor must keep it off;
  - names older than EDGAR's former names (Caterpillar Tractor, Middle South Utilities, Duke
    Power): out of reach without a hand map like `lib/predecessors.ts`;
  - OCR noise in the column tables ("FLEET FINANCIAL G.UWP INC"). That costs matches, not
    accuracy. The prose sections read cleanly.
- **The first-price floor sets the practical start:** Yahoo's daily data begins 1962-01-02 at the
  earliest (IBM, GE, KO), and Ford's in 1972 (`docs/COVERAGE-MAP.md`, the Yahoo row). Under
  today's floor, rows before a company's first price are dropped. Whether the Digest keeps that
  floor is the owner's choice.

**Who benefits and how:** Readers of every company listed before 1994 whose record, or the former
names EDGAR keeps for it, reaches back: utilities, industrials, drugmakers, consumer companies.
Their 1960s–1980s years get the first primary-source events beyond dividends: the reports they
filed, their offerings, the SEC's orders and actions on them, and who took stakes in them. This
is worth building, but I cannot size it past six issues.

**Cost:** none recurring — the archive is closed (1956–2013), read once, no key. The one-time
read for 1956–1993 is about 9,500 PDFs at about 0.57 MB each (the six averaged), so ~5.4 GB and
about 2.6 hours at a second apart. The count step reads one year: ~250 requests, ~140 MB.
**Effort:** small for the count; large for the whole:
- a PDF text reader on the ingest path — a new dependency (`pdfjs-dist`, Apache-2.0) or poppler's
  `pdftotext` on the host (present in this container);
- sections in two layouts: the 1960s run-in paragraphs under capital headings, and the columns of
  the 1970s–90s;
- names by year with EDGAR's former names, and the first-price floor;
- the 8-K entries grouped a row a month;
- optionally, a hand map for names older than EDGAR, as `lib/predecessors.ts` is one.

**Verified by:** a new check on the six issues' text, committed as a fixture:
- Abbott's 8-K of May 1975 (item 14) lands on ABT on 1975-06-16;
- 3M's lands under its EDGAR former name, and Humana's S-16 registration on HUM;
- Deutsche Bank AG's IC-14293 lands on DB;
- Hasbro's five 13D rows make one row;
- the 1980 underwriter lands on no page, and McGraw-Hill's 1990 delisting is not on MH.

On main it cannot run: the reader does not exist.

**Depends on:** the owner's yes. Nothing else; the hand map for older names is optional.

**Buildable by:** a cloud session; sec.gov answers from here (measured), and `pdftotext` is
installed.

*Importance:* high — the only primary record found for 1956–1993, in every sector · *Efficiency:*
medium — one source, but a large one-off read and a PDF reader · *Practicality:* low-medium — OCR,
names older than EDGAR, and the count first

---

## 2. The Justice Department's releases of 2001–2008, from its own archive · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** PENDING
**Owner's reason (if rejected):**

**Anchor:** a floor that is the API's, not the Department's. The coverage map dates the source
"2009, the oldest releases the API holds" (`docs/COVERAGE-MAP.md:36`; `lib/doj.ts:8`, "from 2009
on"). The Department keeps the earlier releases on month pages,
`www.justice.gov/archive/opa/pr/YYYY/Month/`, each linked to an "Index of Pre-January 2009 Press
Releases".

**What:** Read each month page of 2001–2008 once (the archive is closed) and store its rows: day,
release number, title, link. Store them as `sec_press_years` stores the SEC's years. At each
company's ingest, match them through the rule already written (`releaseNamesParty`), with the
company's names for that year and the release map. Optionally, read a matched release's own page
for its first paragraph, as the API's teaser gives today. It is the same source, `doj_press`.

**Licence:** today's adapter's: "Unless otherwise indicated, information on Department of Justice
websites is in the public domain and may be copied and distributed without permission"
(justice.gov/legalpolicies, quoted at `lib/doj.ts:11-13`; not re-read this run). These are the same
releases from older years, not a new dataset, so I do not write it as a source decision. The walk
is new requests, though, and the owner may want to say yes first.

**Grounded in:**
- **Two months read,** in two layouts:
  - 2005-01: 38 releases, in mixed case, with a day heading over each title;
  - 2001-06: 55 releases, in capitals, "#301: 06-29-01 TITLE".
- **Replayed with the repo's own rule** (`releaseNamesParty`, every index company's present names
  and the release map): 3 of the 93 titles make a listed company the party:
  - "American Electric Power, Inc. To Pay $30 Million Penalty To Resolve Criminal Allegations"
    (2005-01-26, AEP);
  - "U.S. Reaches Settlement With Weyerhaeuser Company To Clean Up Paper Mill And Landfill Along
    The Kalamazoo River" (2005-01-03, WY);
  - "DUTCH CHEMICAL GIANT, AKZO NOBEL, AGREES TO PLEAD GUILTY AND PAY $12 MILLION FINE…"
    (2001-06-27, AKZOY).
- **Under former names, two more pass the same rule** (each tested):
  - "U.S. REACHES WATER POLLUTION SETTLEMENT WITH WAL-MART" (2001-06-07), as "Wal-Mart";
  - "JUSTICE DEPARTMENT REQUIRES BB&T CORPORATION AND F&M NATIONAL CORPORATION TO MAKE
    DIVESTITURES…" (2001-06-19), as BB&T, Truist's name until 2019.
- **The rule's present limits, unchanged:**
  - "STATEMENTS REGARDING THE MICROSOFT DECISION" (2001-06-28) is refused, rightly;
  - so are "…FILES LAWSUIT TO BLOCK 3D SYSTEMS' PROPOSED ACQUISITION OF DTM CORPORATION" and
    "Settlement Between U.S., Texas, And Chevron Provides Restoration Projects…". A reader might
    call both company events; I left the rule as it is.
- **An estimate from two months:** 5 of 93 titles, about 45 releases a month, gives 25–30 a year,
  so roughly 200–250 over 2001–2008, in every sector (utilities, paper, chemicals, retail, banks).
  Today's adapter gives "a few to ten per large company" from 2009.
- **Not reached here:**
  - before 2001, the same URL shape for 1994 and 1995 answered 404;
  - the archive's index page answered with a bot check (an Akamai interstitial), so I could not
    see which years it holds. The two month pages answered plainly.
- **Dates:** a day only, no time.

**Who benefits and how:** Readers of companies in every sector. They get the Department's pleas,
settlements, suits and merger cases for 2001–2008, the eight years before the API's floor, inside
the stretch the coverage map calls thin. AEP's $30 million criminal penalty of 2005 is on no page
today.

**Cost:** none recurring — the archive is closed, no key. Once: 96 month pages (~1 MB), a second
apart, and optionally ~250 release pages for the matched rows' first paragraphs.
**Effort:** small to medium:
- a month-page parser for the two layouts;
- a walk and its table, and matching at ingest beside the API's rows, keyed by release number;
- **titles in capitals** (2001–2003): the batch 59 rule "an everyday word names a company only
  with its capital" cannot work in an all-caps title. There, a one-word everyday name ("TARGET")
  should need a legal word. One rule and its case.

**Verified by:** `check:doj` cases on the two saved months:
- AEP's penalty of 2005-01-26 lands on AEP, and Weyerhaeuser's settlement on WY;
- Wal-Mart's of 2001-06-07 lands on WMT under its former name, and BB&T's of 2001-06-19 on TFC;
- the Microsoft statements land on no page, and nor does an all-caps "TARGET" title without a
  legal word;
- a closed month is not asked twice.

On main they fail: nothing reads the archive.

**Depends on:** nothing.

**Buildable by:** a cloud session; the month pages answer from here (measured). If the bot check
spreads to them, the owner's host.

*Importance:* medium-high — every sector, 2001–2008 · *Efficiency:* high — about 100 small pages
once, a rule already written · *Practicality:* medium-high — two layouts, and a bot check on the
index page

---

## 3. The Federal Reserve Board's orders of 1996–2005, from its yearly pages · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** PENDING
**Owner's reason (if rejected):**

**Raised before:** as unmeasured, in the 2026-11-01 cut list ("a follow-up to #5 if approved") and
batch 84's open line, "The Board's orders before 2006, on its yearly pages, are not read"
(`docs/MASTER-CHECKLIST.md:1172`). What is new: every yearly page read, and the orders replayed.

**Anchor:** a capability present from 2006 and missing for the decade before it, the decade of the
bank mergers that made today's largest banks.

**What:** Read the ten yearly pages once (`/newsevents/press/all/1996all.htm` … `2005all.htm`,
linked from the Board's press-release archive) and keep the rows filed under orders (`bhc` to 2002,
`orders` after). Read each order's own page once for the applicant's city and what it acquires.
Match through `orderParties`, which must also read "of" where the older titles write it
("Approval of proposal of Norwest Corporation"), with the names each company had that year. It is
the same source, `fed_press`.

**Licence:** the Board's, as batch 84 re-read it on 2026-11-01: "Unless otherwise indicated,
information on Board's website is in the public domain and may be copied and distributed without
permission" (`lib/fedPress.ts:22-24`). The same releases from older years, so no source decision.

**Grounded in:**
- **Measured:**
  - the ten pages hold 1,738 releases, 469 of them orders; 1996's page holds only 37, the first of
    1996-01-31;
  - replayed with present names through the repo's `fedPressEvents`, "of" read as "by", they give
    **117 matches on 55 companies**: 1996 1, 1997 12, 1998 15, 1999 9, 2000 11, 2001 13, 2002 7,
    2003 15, 2004 17, 2005 17.
- **The most:** Wells Fargo 7 and Royal Bank of Canada 7; BB&T (Truist), JPMorgan and Citigroup 5
  each; Westamerica, UBS, CIBC and Popular 4 each. Among them:
  - "Approval of proposal by J.P. Morgan Chase & Co." (2004-06-14);
  - "Approval of proposal by Bank of America Corp." (2004-03-08);
  - Citigroup's of 2001-07-02 and 2001-07-16;
  - Capital One's of 2004-07-06, and Schwab's of 2000-05-01.
- **Under EDGAR former names, about 22 more,** counted by title:
  - NationsBank 7 (BAC's record's name until 1998), Norwest 6 (WFC: "NORWEST CORP" until
    1998-10-21, read from data.sec.gov), Chase Manhattan 4 (JPM), Travelers Group 3 (C), PNC Bank
    Corp 1, and Southern National 1 (BB&T's record in 1997);
  - I checked only Norwest's against its record. Firstar's 3 count if Firstar is USB's record; I
    did not check.
- **Each order's own page names the parties.** Read here: "…its approval of the proposal of Norwest
  Corporation, Minneapolis, Minnesota, to acquire Wells Fargo & Company, San Francisco, California"
  (1998-10-14, 2,950 bytes). The yearly titles name only the applicant, so the page gives the event
  its description and a city to tell namesakes apart.
- **To read by hand:**
  - "First Financial Corporation" (1998-02-23) and "Eagle Bancorp, Inc." (1998-06-01): names more
    than one bank has had;
  - Regions' 1998 orders, before RF's record began in 2004. The release map already counts old
    Regions as RF's (Morgan Keegan from 2001-03-30);
  - UBS AG's of 1998–1999, and Citizens Financial Group's of 2001-11-09, against their first
    prices.
- **The policy and other releases of those years** (793 rows) give no match through
  `boardActsOn`; enforcement comes from the Board's own files (batch 69).
- **Times:** each page has a "Last update" time ("October 14, 5:30 PM"). It is not necessarily the
  release's, and I would not read it as one.

**Who benefits and how:** Readers of about 55 listed banks. The approvals of the mergers that made
today's largest banks land on the acquirer's page, on the day the Board let each proceed:
- NationsBank and BankAmerica, Norwest and Wells Fargo, Travelers and Citicorp;
- J.P. Morgan Chase and Bank One, and Bank of America and FleetBoston;
- and many regional banks' deals.

That roughly doubles the Board's releases before 2017 (126 today).

**Cost:** none recurring — the archive is closed, no key. Once: 10 yearly pages and 469 order
pages (~1.5 MB), a second apart.
**Effort:** small:
- a parser for the yearly pages;
- "of" in `orderParties`' applicant pattern;
- the order page's first sentence for what is bought and the city;
- a hand read of about 140 matches.

**Verified by:** `check:fed-press` cases on saved pages:
- Norwest's approval of 1998-10-14 lands on WFC under NORWEST CORP, its description naming Wells
  Fargo & Company;
- NationsBank's of 1998-08-17 lands on BAC, and J.P. Morgan Chase's of 2004-06-14 on JPM;
- Citizens Financial Group's of 2001-11-09 is refused by its first price;
- a closed year is not asked twice, and the replay is pinned.

On main they fail: nothing reads the yearly pages.

**Depends on:** nothing; it extends batch 84's source.

**Buildable by:** a cloud session; federalreserve.gov answers from here (measured).

*Importance:* medium — the 1990s on bank pages · *Efficiency:* high — a closed archive of small
pages, the rule written · *Practicality:* high — the same source and licence

---

## 4. The listed banks and brokers by their units' names: their banks in the Board's orders, their broker-dealers and advisers in the SEC's cases — the owner's open call · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-02, with the calls: (a) yes, widen the maps; (b) yes, American Express Financial Advisors' cases before the 2005 spin-off go on both pages, American Express's (its unit then) and Ameriprise's (its own record's former name); (c) Prudential Securities goes on Prudential Financial (PRU), not Prudential plc (PUK).
**Owner's reason (if rejected):**

**Raised before:**
- The orders filed under a listed company's own bank, about two dozen. Batch 84 says "A map row per
  bank would give them; that widens batch 69's map, so it is left for a decision"
  (`docs/MASTER-CHECKLIST.md:1160-1166`).
- Popular, Inc. missing from `FED_BANKS` (batch 74, `:1854-1856`; batch 84, `:1167-1169`).
- The 2026-11-01 audit saw both again.

What is new: the same firms' broker-dealer and adviser units in the SEC's cases, measured on the
saved rows (62 company days, none on a page today), and Popular's orders of 1998–2004, which #3
would give by its own name.

**Anchor:** a capability present for eleven banks (`RELEASE_NAMES`, `lib/releaseNames.ts:36`) and
missing for the other listed banks, brokers and asset managers.

**What:** Rows in the release rules' map, and in `FED_BANKS` for the Board's orders. Each unit
counts while the company owned it, each day read from the company's filings, as batch 82 dated its
banks. Two groups:
- **the own banks** of batch 84's list: Regions Bank, Frost Bank, Origin Bank, Centennial Bank,
  PlainsCapital Bank, Simmons Bank, Green Dot Bank, Five Star Bank, Equity Bank, Banco de Crédito
  del Perú, National Westminster Bank, ING Bank and Lloyds Bank Corporate Markets; and Popular's
  Banco Popular de Puerto Rico, Banco Popular North America and Popular Securities;
- **the broker-dealers and advisers named after their parents** in the table below.

Three calls inside:
- (a) widen the maps at all, batch 84's call;
- (b) American Express Financial Advisors before the 2005 spin-off. It was American Express's
  unit, and it is also Ameriprise's own record: AMP's EDGAR former names are "AMERICAN EXPRESS
  FINANCIAL ADVISORS" (1995-10-25 to 2003-03-10) and "AMERICAN EXPRESS FINANCIAL CORP" (to
  2005-07-26). Both pages, or one?
- (c) Prudential Securities (2000–2003) on Prudential Financial (PRU), not Prudential plc (PUK).

**Grounded in:**
- **Measured** on `scripts/fixtures/sec-cases-all.json.gz` (30,747 rows), each unit's rows replayed
  through `secCaseEvents` with the company's present names and today's map. In every row below,
  none of the days is on the company's page today:

  | Company | Unit as the captions write it | Days | Before 2017 |
  |---|---|---:|---:|
  | AMP | Ameriprise Financial Services; American Express Financial Advisors and Corporation "(now known as Ameriprise…)" | 15 | 8 |
  | RF | Regions Bank, 2008–2010 (one "AmSouth Bank, N.A. (now known as Regions Bank)") | 3 | 3 |
  | USB | U.S. Bancorp Piper Jaffray, 2002–2003, before the spin-off | 3 | 3 |
  | FHN | FTN Financial Securities (2011); First Horizon Advisors (2024) | 3 | 2 |
  | TFC · HTH | BB&T Securities · Hilltop Securities | 4 · 4 | 1 · 1 |
  | FITB | Fifth Third Securities (2002, 2023) | 3 | 1 |
  | BLK | BlackRock Advisors (2015, 2023) | 2 | 1 |
  | AXP | American Express Financial Advisors (2004-02-12) | 1 | 1 |
  | NDAQ | "NASDAQ Stock Market, LLC and NASDAQ Execution Services, LLC" (2013-05-29) | 1 | 1 |
  | FISV · LAZ · OPY | Fiserv Securities (2005) · Lazard Capital Markets (2008) · Oppenheimer Asset Management (2013) | 3 | 3 |
  | 11 others | KeyBanc Capital Markets, Huntington Investment Co., PNC Investments and Capital Markets, Nomura Securities International, Invesco Advisers, Voya Financial Advisors, Hancock Whitney Investment Services, Franklin Advisers, BOK Financial Securities, WisdomTree Asset Management, Popular Securities | 20 | 0 |
  | **24 companies** | | **62** | **25** |

- **Six of Ameriprise's 15 name the company itself by its former legal name:** "American Express
  Financial Corporation (now known as AmeripriseFinancial, Inc.)", 2005-12-01 to 2019-04-15. The
  rule counts that name only until 2005-07-26.
- **How the list was made:**
  - every index company's everyday name was read before a unit word (Securities, Bank, Advisors,
    Asset Management, Capital Markets…) in all 30,747 rows. That gave 63 days on 30 companies off
    their pages, which I read by hand;
  - 12 of those companies' rows are namesakes: Southern Financial Services on SO, Reliance
    Financial Advisors on RS, Prudential Securities on PUK, Seaboard Investment Advisers on SEB,
    Meridian Securities on MRBK and MRDN, and others. Pershing Square Capital Management (2017, PS)
    is a first-price question;
  - a second, targeted list found the units whose parent's name keeps a holding word ("Fifth Third
    Bancorp", "U.S. Bancorp"). Schwab's 6 days are already on its page, and ING's one.
- **After a spin-off, a unit's rows are not the old parent's.** The 2005-09-02 and 2010-03-19
  captions name "U.S. Bancorp Piper Jaffray" after Piper's spin-off at the end of 2003, so they are
  not USB's under the rule. Its day is to be read from USB's filings.
- **The Board's orders:** batch 84's list of about 25 (Regions Bank 4, Frost Bank 3, Origin Bank 3,
  Centennial Bank 2, PlainsCapital Bank 2, one each for the rest), and Popular's 3 (2010-04-30,
  two of 2015-02-27). One `FED_BANKS` row for Popular also serves its three enforcement actions
  (batch 74).
- **What else the same rows serve:**
  - #5: about 20 of the CFPB's 34 company days in 2012–2016 are filed under a unit (Capital One
    Bank, U.S. Bank, Regions Bank, Fifth Third Bank, Manufacturers and Traders Trust, American
    Express Centurion Bank…);
  - the FDIC's failed-bank list, at the end.

**Who benefits and how:** Readers of about 35 listed banks, brokers and asset managers, Ameriprise,
BlackRock, Nasdaq, Invesco and Franklin among them. Their units' SEC cases (62 days, 25 before
2017) and their own banks' Board orders (about 28) reach their pages. Nasdaq's page gains the SEC's
order of 2013-05-29 against its exchange and execution units (the Facebook offering, on my
reading).

**Cost:** none recurring — the rows are saved. Dating the rows needs EDGAR reads, a filing or two
per row (~70 requests once).
**Effort:** small to medium: about 35 map rows, each day from a filing, and the three calls.

**Verified by:** `check:sec-cases` cases on the saved rows:
- Regions Bank's case of 2009-09-21 lands on RF, and Fifth Third Securities' of 2002-06-18 on FITB;
- U.S. Bancorp Piper Jaffray's of 2002-11-05 lands on USB, and its 2005-09-02 does not;
- Ameriprise Financial Services' of 2009-07-10 lands on AMP, Hilltop Securities' of 2016-02-02 on
  HTH, and Nasdaq's of 2013-05-29 on NDAQ;
- Reliance Financial Advisors lands on no page, and Prudential Securities is not on PUK;
- the full replay is re-pinned (1,047 company days today).

And in `check:fed-press`: Frost Bank's approval of 2019-06-20 lands on CFR, and Popular's of
2010-04-30 on BPOP. On main the unit cases fail.

**Depends on:** the owner's calls (a) to (c).

**Buildable by:** a cloud session: the replays offline, the days from EDGAR.

*Importance:* medium — tens of cases on many financial pages, a third of them before 2017 ·
*Efficiency:* high — no new source, saved rows · *Practicality:* medium — the owner's call, and a
day per row from filings

---

## 5. The Consumer Financial Protection Bureau's enforcement actions, from 2012 — a source for the owner to decide · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-02: yes to the source.
**Owner's reason (if rejected):**

**Raised before:** in the 2026-11-01 cut list, "its list holds 386 actions", with one page read and
its licence not. What is new: the five years before 2017 read whole, and the licence.

**Anchor:** a regulator of the banks' and lenders' consumer business with no source here. The Board's
actions reach holding companies (`FED_BANKS`), and the SEC's cases reach broker-dealers. A card
issuer's or a national bank's consumer case reaches neither.

**What:** The owner's decision first. If yes:
- read the Bureau's list once (`/enforcement/actions/?page=N`, 25 actions a page), then its feed
  (`/enforcement/actions/feed/`, the newest 25) once a day, one read for every company;
- keep an action on a company's page when its title, which names the respondents, names the
  company or a unit #4's map gives it, by the caption rule (`captionParty`);
- one event a company a day.

**Licence:** "Information created by the CFPB is in the public domain and you may reproduce,
publish, or otherwise use it without the Bureau's permission. Please consider appropriate citation
to the Bureau as the source." (www.consumerfinance.gov/privacy/website-privacy-policy/, "Legal
notices", read 2026-11-02.) No key.

**Grounded in:**
- **Measured:** 2012–2016 holds 164 actions ("164 filtered results", seven pages read). The first is
  of 2012-07-17.
- **Read by hand, 34 company days on 27 listed companies.** They are COF, AXP (2), MTG, GNW, RDN,
  AIG, USB (2), JPM (3), WAFD, ORI, ONIT, ALLY, PNC, BAC, MTB, WFC (3), RF, VZ, HMC, C (2), CFG,
  ECPG, PRAA, FITB, EZPW, TM and SAN. Among them:
  - "Capital One Bank" (2012-07-18), and American Express Centurion Bank, American Express Bank
    and Travel Related Services (2012-10-01, 2013-12-24);
  - "JPMorgan Chase Bank, N.A.; and Chase Bank USA, N.A." (2013-09-09), and "Bank of America, N.A.
    and FIA Card Services, N.A." (2014-04-09);
  - "Citibank, N.A.; Department Stores National Bank; and Citicorp Credit Services" (2015-07-21);
  - the four mortgage insurers of 2013-04-04 (MGIC's, Genworth's, Radian's and AIG's United
    Guaranty);
  - "Wells Fargo Bank, N.A." (2016-08-22 and 2016-09-08).
- **About 14 of the 34 match by names the rules already hold.** Ally Financial, Encore Capital,
  EZCORP and Citizens Financial Group are in captions under their own names; Ocwen and Washington
  Federal under what I take to be their former names (not checked against their records); Wells
  Fargo Bank, JPMorgan Chase Bank and Citibank, N.A. through the map. **About 20 need #4's
  units.**
- **Not their own:**
  - Discover Bank (2012, 2015), Sprint (2014), Hudson City Savings Bank (2015) and Flagstar Bank
    (2014): companies bought later, each an acquisition's past. Flagstar's is the trap, since
    today's FLG carries the name;
  - **ownership calls:** GE Capital Retail Bank (2013-12-10) and Synchrony Bank (2014-06-19),
    before Synchrony's listing of 2014-07-31; PayPal (2015-05-19), eBay's until its spin-off that
    July.
- **Little overlap:** of six large actions checked against the saved SEC releases, SEC cases and
  Board releases, four fall on a day none names the company: Wells Fargo 2016-09-08, Citibank
  2015-07-21, Bank of America 2014-04-09 and JPMorgan 2013-09-09. The Board's enforcement files
  and the Justice Department were not checked.
- **Not read:** the 222 actions of 2017–2026 (386 in all, per the 2026-11-01 count). The feed's
  newest is of 2025-08-21.

**Who benefits and how:** Readers of the largest card issuers, banks, mortgage insurers, debt
buyers and lenders. They get the Bureau's orders and suits on the day each was announced: Capital
One's, American Express's, JPMorgan's, Citibank's, Bank of America's and Wells Fargo's of
2012–2016, and those of the years since. The reach before 2017 is five years, 2012–2016.

**Cost:** none recurring beyond one feed request a day; no key. Once: 16 list pages.
**Effort:** small, given #4. Without #4's units, about 14 of the 34 days.
- a parser for the list and the feed;
- the caption rule on each title;
- registered in `SOURCES`, credited, and scored without the model.

**Verified by:** a new check on the saved list pages:
- Wells Fargo Bank's action of 2016-09-08 lands on WFC, and Citibank's of 2015-07-21 on C;
- with #4, Capital One Bank's of 2012-07-18 lands on COF;
- Discover Bank's lands on no page, and Flagstar Bank's of 2014 is not on FLG;
- Synchrony Bank's of 2014-06-19 is refused by SYF's first price;
- a day's three American Express actions make one event.

On main it cannot run: the adapter does not exist.

**Depends on:** the owner's yes; #4 for most of its banks.

**Buildable by:** a cloud session; consumerfinance.gov answers from here (measured).

*Importance:* medium-low — 2012 onward, financial pages · *Efficiency:* high — a few pages, then
one a day · *Practicality:* medium — the owner's yes, and #4 first

---

## Considered and cut

- **The FDIC's failed-bank list** (`www.fdic.gov/bank-failures/download-data.csv`, 46 KB). It holds
  578 failures from 2000 to 2026, 545 of them before 2017, with the bank that took each over:
  - First-Citizens 14 (under three spellings), U.S. Bank 14, Ameris Bank 10, Centennial Bank 7,
    Bank of the Ozarks 7, Simmons First 4;
  - Regions, M&T, BB&T, Banco Popular and Huntington 2 each.

  Cut for now, for two reasons. The acquirers are banks, which need #4's map first. And the FDIC's
  website policies page states no licence for its own content; it says only that linked sites' may
  be copyrighted. A federal agency's work is generally not under copyright, but that is my reading,
  not the FDIC's words. It is worth reopening with #4.
- **Not measured, so not proposed:**
  - S&P 500 index changes (a Wikipedia table, secondary and incomplete before about 2000);
  - the Treasury's TARP capital purchases (2008–2009, hundreds of banks);
  - the SEC's trading suspensions (mostly shells);
  - the OCC's enforcement search, which refused this container on 2026-10-28 and was not retried.
- **The Justice Department before 2001:** two guessed month addresses answered 404, and the
  archive's index sat behind a bot check. A follow-up to #2 from the owner's host.
- **The Digest after the mid-1990s:** EDGAR and the SEC's own listings cover those years.
- **Raised before, not ranked:**
  - CPSC recalls: still the owner's call on the 2026-10-22 shortlist; nothing new;
  - Fresenius Vial's recall and the Form 25 / 25-NSE labels, unchanged since the 2026-11-01 file.
- **Re-prioritisations:** none. The open items nearest securities depth (the GDELT backfill's
  production watch, the 203 held-back everyday-word names, the paid-tier evidence) still need the
  production host or a key.
- **Anything touching another product:** nothing here reads, references or connects to another
  product's repository.

*JCI's 2016 case, a note for the owner's open call (batch 85's set-aside):*
- **The record's former names:** JCI's record (CIK 833444) lists TYCO INTERNATIONAL plc, TYCO
  INTERNATIONAL LTD and ADT LIMITED as its names until 2016-09-07 (data.sec.gov).
- **Tyco's own history is there, as the rule wants:** replayed on the saved cases with those names,
  its page takes Tyco's two cases (2006-04-17 and 2012-09-24) and Tyco's press releases.
- **The 2016 case is the old company's:** the proceeding of 2016-07-11 against "Johnson Controls,
  Inc." names the company that merged into Tyco's record on 2016-09-02. JCI is not in
  `lib/predecessors.ts`, whose rule leaves a merger into another record out. It reaches the page
  only because a record's present name counts in every year (`namesForYear`,
  `lib/ingest/frBackfill.ts:56-58`).
- **It is the only such row:** replayed, it is the only row the present name gives JCI's page from
  before 2016-09-07. Wells Fargo's present name gives none before Norwest took it in 1998.

The call stays the owner's.

*One closing note, not a proposal* — noticed in passing: a record's present name counts in years
before the record took it (`namesForYear`), and a caption naming a company by a former legal name
after that name's last day (Ameriprise's six) is missed; the `code-auditor` may want both.
