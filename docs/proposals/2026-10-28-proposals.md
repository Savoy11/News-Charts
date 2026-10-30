# Opportunity proposals — 2026-10-28

**Commit:** 3243d713a054fc25bcf0c09afbbaeab1bb32f6c6 (`claude/lucid-goodall-6km6ea`, equal to `origin/main` after batch 71) · **Reviewed:** `CLAUDE.md`, `README.md` (the adapters' sections, How pages read, Data sources), `docs/MASTER-CHECKLIST.md` (the batch 62–71 ledgers, batches 30–31, Scope refocus, and every open box), `docs/COVERAGE-MAP.md`, `docs/decisions/2026-09-28-business-decisions.md`, `docs/audits/2026-10-28-code-audit.md`, all four files in `docs/proposals/`; code — `lib/fedActions.ts`, `lib/fdaRecalls.ts`, `lib/recalls.ts`, `lib/investigations.ts`, `lib/doj.ts`, `lib/sec.ts` (the form filter, fund forms, filing titles), `lib/secForms.ts`, `lib/federalregister.ts`, `lib/news.ts`, `lib/newsExtra.ts`, `lib/page-data.ts`, `lib/store/read.ts`, `lib/suggestions.ts`, `lib/predecessors.ts` (header), `components/BiggestMoves.tsx`; data — `data/edgar-tickers.json`, and the local `chronolens`, `chronolens_b68` and `chronolens_b69` databases (read-only) · **Proposals:** 5

> - **No rejection log exists** (`docs/audits/rejected-proposals.md`), and nothing has been
>   rejected: all eight 2026-10-26 proposals were approved and built (batches 63–70), and the three
>   findings of batch 71's audit are fixed. No item was deferred, so none carries forward. CPSC
>   recalls still await the owner's call on the 2026-10-22 shortlist and are not re-proposed.
>   Insider-trade forms stay out, as decided on 2026-10-18.
> - **Measured live on 2026-10-28 from this container**, every figure below unless it says it was
>   read from the checklist. Requests, by host: www.sec.gov 28 (23 press-release year pages, the
>   site's dissemination policy and its redirect, three filing documents); data.sec.gov 17
>   (submissions records); api.fda.gov 8; data.transportation.gov 3; www.federalreserve.gov 2 (the
>   two enforcement files); apps.occ.gov 2 (both answered with a "Security Redirect");
>   www.consumerfinance.gov 1; www.fsis.usda.gov 1 attempted, refused by this container's egress
>   proxy. Every one carried the project's User-Agent, which holds the owner's contact address;
>   EDGAR was paced at about one a second. GDELT, Wikidata, Wikipedia, Yahoo, the Federal Register
>   and justice.gov were not asked. The local Postgres cluster was down; I started it for read-only
>   queries and stopped it again.
> - **Nothing here needs a key, a paid tier or a recurring charge.** One proposal, #1, reads a
>   dataset the site does not read today; it is written as a decision for the owner, with the
>   licence quoted. #4 carries two owner calls on a mapping rule and #5 one. #2 and #3 need none.
> - Ranked by importance, securities depth first:
>   1 · the SEC's own press releases naming a company as the party, from 1998 (a source decision)
>   — 2 · the Federal Reserve's actions against the 14 foreign banks with pages here — 3 · QQQ's 22
>   annual reports, filed on a form the fund list drops — 4 · FDA recalls for Siemens Healthineers
>   and Fresenius SE (two owner calls) — 5 · the vehicle brands Ford and GM owned, while they owned
>   them (one owner call).
> - Five, not eight. What else I looked at, and why it was cut, is at the end.

Mark each proposal below: `APPROVED`, `REJECTED`, or `DEFERRED`, and add a
reason for anything rejected. Then run the scout in FILE mode.

---

## 1. The SEC's own press releases about a company, from 1998 — a source for the owner to decide · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-10-29, the new source (the SEC's press releases) included.
**Owner's reason (if rejected):**

**Anchor:** a capability present for one regulator and missing for a comparable one — the Justice
Department's releases that make a company the party are on its page from 2009 (`lib/doj.ts`), the
SEC's are on no page from any year · the 1963–2017 hole (`docs/COVERAGE-MAP.md:86-91`), in every
sector rather than one.

**What:** The owner's decision first. If yes: read each year's list of SEC press releases once,
back to the oldest year the newsroom lists, and keep a release on a company's page when its title
makes that company the party ("SEC Charges Goldman Sachs With Fraud…", "Morgan Stanley Pays $50
Million To Settle SEC Action"), through the Justice Department adapter's party rule, taught the
SEC's own phrasing.

**Licence:** "Information presented on sec.gov is considered public information and may be copied
or further distributed by users of the web site without the SEC's permission. Please consider
appropriate citation to the SEC as the source." (https://www.sec.gov/about/privacy-information,
"Website Dissemination", read 2026-10-28). The same host EDGAR is read from; no key.

**Grounded in:**
- **What changed since the 2026-10-22 note.** "SEC enforcement releases" were not shortlisted
  because "finding a company means reading every year's pages, and the latest page of litigation
  releases named individuals and small firms only" (`docs/proposals/2026-10-22-news-sources.md:170-172`).
  Two things differ. This is the press-release series, not the litigation releases. And reading
  each past year once is now a built pattern: batch 63's Federal Register year walk
  (`lib/ingest/frBackfill.ts`, `fr_windows`).
- **Measured:** `https://www.sec.gov/newsroom/press-releases?year=YYYY&month=All` lists 25
  releases a page, each with its title, its link and a dated `<time>`. 2010 holds 258 releases on
  11 pages, 2003 holds 185 on 8. The 1998 and 1999 pages list releases; the 1996 page lists none
  (1997 was not asked).
- **Two whole years, read by hand:**
  - **2010:** 8 releases make a company with a page here the party. Goldman Sachs twice (the CDO
    charge, then "Goldman Sachs to Pay Record $550 Million to Settle SEC Charges…"), Citigroup,
    General Electric (FCPA), State Street, ABB, Daimler AG and Innospec. 3 more name a firm that
    may be a unit of one (Banc of America Securities, Morgan Keegan, General Re); each would need
    its owner on that day read from a filing.
  - **2003:** 10 releases. CIBC's Enron settlement, Alliance Capital's $250 million, Invesco Funds
    Group, Morgan Stanley's $50 million, J.P. Morgan Securities' $25 million, AIG's $10 million,
    Goldman Sachs (the 30-year bond case), UBS PaineWebber, Deutsche Bank's advisory unit, and "SEC
    Settles Enforcement Proceedings against J.P. Morgan Chase and Citigroup" (Enron).
  - The rest are rules, appointments, statements, and cases against people and small firms.
    Real titles the rule must refuse: "SEC Charges Former Carter's Executive With Fraud and Insider
    Trading", "SEC Charges Two Individuals for Roles in Innospec FCPA Scheme", "SEC Proposes New
    Measures to Help Investors in Target Date Funds".
- **The rule exists and needs the SEC's phrasing.** `releaseNamesParty` (`lib/doj.ts:127`), run
  unchanged on the 443 titles of those two years with the names of 18 companies, keeps 4 of them
  (Goldman's 2010 settlement and the Morgan Stanley, AIG and CIBC releases of 2003) and nothing
  else. It reads a company as the party when it pays or settles, not when "SEC Charges" or "SEC
  Sues" it.

**Who benefits and how:** Readers of every sector, most of all of large banks, brokers, insurers
and multinationals. They get the SEC's charges and settlements against the company itself, which
the Justice Department's releases (2009 on) do not carry, reaching 1998–2016, the stretch the
coverage map calls thinnest. **I cannot size it per company past the two years read.** If they are
typical (8 and 10 releases a year), it is about 250 events across the index for 1998–2025 before
units, concentrated on the largest financial companies: Goldman Sachs had 3 in those two years.

**Cost:** none — no key, licence fee or recurring charge. 2003 took 8 pages and 2010 took 11, so
reading 1998–2025 once is about 220 to 310 requests at those rates, a second apart, once for all
companies, not per company. Then the current year's first page or two a day.
**Effort:** medium.
- A year walk in the shape of `lib/ingest/frBackfill.ts`: each closed year kept and never asked
  again, its titles stored once and matched against each held company at its ingest.
- The party rule taught the SEC's phrasing ("SEC Charges X", "SEC Sues X", "SEC Brings … Action
  Against X", "Commission Settles … Against X"), using the names every scoring path takes
  (`companyScoringAliases`) and the DOJ adapter's look-alike guards.
- A unit named for the company ("J.P. Morgan Securities", "Banc of America Securities") counts as
  the DOJ adapter's units do. A firm bought later does not, by the rule every map follows: Merrill
  Lynch's 2003 Enron case is not Bank of America's.
- Registered in `SOURCES` (public domain, commercial use), credited in the footer and the Terms
  page, scored without the model as a Justice Department release is.
- The listing's `<time>` is a day ("2010-12-27T07:00:00Z"), not an instant, so it sets no
  `occurred_at`.

**Verified by:** a new `check:sec-press` on the pinned 2003 and 2010 titles. Goldman's 2010 charge
and settlement land on GS. The 2003 J.P. Morgan Chase and Citigroup release lands on both. The
Innospec individuals', Carter's executive's and Target Date Funds releases land on no company. A
closed year is not asked twice. The source is registered, licence-checked (`check:commercial-mode`)
and credited. On main it cannot run: the adapter does not exist.

**Depends on:** the owner's yes.

**Buildable by:** a cloud session; sec.gov answers from here (measured).

*Importance:* high — dated, primary actions against the company in every sector, reaching the thin
stretch · *Efficiency:* medium-high — a host already called, a rule already written ·
*Practicality:* medium — the owner's yes first, and a title rule to tune on the two years read

---

## 2. The Federal Reserve's actions against the foreign banks with pages here · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-10-29.
**Owner's reason (if rejected):**

**Anchor:** a capability present for 25 US bank holding companies and missing for comparable listed
banks, on a source already approved and read · the next step batch 69 left open: "Foreign banks'
US arms … whose penalties are among the largest, are not mapped" (`docs/MASTER-CHECKLIST.md:1207-1209`).

**What:** Add the foreign banks that have a page here to `FED_BANKS` (`lib/fedActions.ts:53`), each
row checked by eye as batch 69 did, under the same rule: a bank's own history and its US arms
count, and an acquisition's past never does.

**Grounded in:**
- **Measured** on the Board's two files (2,899 rows, 1,562 of them against an organisation rather
  than a person), read 2026-10-28. 37 days of actions fall on 14 foreign banks in the company
  index, 27 of them before 2017:

  | Ticker | Days with an action | Before 2017 | Penalties of $100 million or more the file states |
  |---|---:|---:|---|
  | HSBC | 7 | 6 | $165M (2012), $131M (2016), $175.3M (2017) |
  | DB | 7 | 2 | $136.95M (2017) |
  | SAN | 4 | 3 | — |
  | UBS | 3 | 2 | $100M (2004), $342M (2015) |
  | NWG | 3 | 3 | $274M (2015, as The Royal Bank of Scotland) |
  | BCS | 2 | 2 | $342M (2015) |
  | SMFG | 2 | 1 | — |
  | MUFG | 2 | 2 | — |
  | BBVA | 2 | 2 | — |
  | RY, TD, BMO, BNS, CM | 1 each | 4 | — (TD's is 2024-10-09) |

  Four recent penalties carry no amount in the file (Deutsche Bank's of 2022 and 2023, UBS's of
  2023, TD's of 2024), as batch 69 found for others. Today's 25 banks carry 72 events (batch 69,
  read from the checklist); these 14 add 37.
- **What the map must refuse, all in the files:**
  - Bankers Trust's agreements of 1991 and 1994, from before Deutsche Bank bought it (the day to
    be read from a filing). Its US trust company counts under its later name, Deutsche Bank Trust
    Company Americas (2005, 2022).
  - Namesakes: "Community Bankers Trust Corporation, Glen Allen, Virginia" is not Deutsche Bank's;
    "City National Bancshares Corporation, Newark, New Jersey" is not RBC's City National;
    "Capital Commerce Bancorp" and "Tennessee Commerce Bancorp" are not TD's.
  - Credit Suisse's actions before UBS bought it. UBS's 2023 action names UBS Group AG beside
    Credit Suisse, and counts.
- **Not mappable, so left out:** the largest foreign-bank penalties in the files — BNP Paribas's
  $508 million (2014) and $246.4 million (2017), and Standard Chartered's, Société Générale's,
  Commerzbank's and ICBC's — fall on banks with no page in the company index.
- MUFG's 2004 row is against "Union Bank of California International", by its name a unit of
  UnionBanCal; its ownership on that day needs a filing.

**Who benefits and how:** Readers of 14 large foreign banks in the company index — HSBC, Deutsche
Bank, Barclays, UBS, NatWest, Santander, BBVA, MUFG, SMFG and the five Canadian banks. They get the
Board's orders and penalties against them, most before 2017, eight of $100 million or more.

**Cost:** none — and no request: the two files are already read once an ingest process, whatever
the number of banks (batch 69).
**Effort:** small to medium. Fourteen entries, each with its name and city check. Where a named
unit was bought ("Deutsche Bank Trust Company Americas", "RBC Centura Bank", "HSBC Finance
Corporation", "Santander Holdings USA"), the day it became the bank's comes from a filing, as batch
69 dated American Express's sale. UBS AG's 2004 and 2015 actions are read as the group's bank's,
as Goldman Sachs Bank USA's are Goldman's (`lib/fedActions.ts:63`).

**Verified by:** cases in `check:fed-actions` on rows pinned from both files. HSBC's 2012-12-11
order and $165 million penalty are one event on HSBC. Barclays' 2015-05-20 penalty lands on BCS.
Bankers Trust's 1994 agreement is refused for DB, and Deutsche Bank Trust Company Americas' 2005
agreement is not. The Newark City National and the two Commerce Bancorps are refused. UBS's 2023
action lands on UBS. Every new bank's count is pinned. On main they fail: the banks are unmapped.

**Depends on:** nothing.

**Buildable by:** a cloud session; federalreserve.gov answers from here.

*Importance:* medium — few per bank, but among the largest penalties in the files, on widely held
banks · *Efficiency:* high — rows on a built map, no new request · *Practicality:* high

---

## 3. QQQ's annual reports, filed on a form the fund list drops · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-10-29.
**Owner's reason (if rejected):**

**Anchor:** a capability present for comparable funds and missing for one of the most prominent:
SPY's, DIA's and MDY's annual reports are on their pages and QQQ's are not · the homepage's own
first chips lead to it.

**What:** Keep N-30B-2 among the fund forms (`lib/sec.ts:823-840`), labelled "Shareholder report
(N-30B-2)" and typed as the N-30D is.

**Grounded in:**
- **QQQ's record** (Invesco QQQ Trust, Series 1, CIK 1067839, read whole) holds 22 N-30B-2
  filings, filed 2005-05-16 to 2025-10-24, each with a report date of 30 September, 2004 to 2025:
  its annual reports as a unit investment trust (its record also holds the trust forms S-6 and
  N-8B-2). The fund list has no N-30B-2, so none reaches the page. The only shareholder report
  there is the N-CSRS of 2026-06-01.
- **The other three exchange-traded trusts read** file theirs as N-30D, kept and typed earnings
  (`lib/sec.ts:832`): SPY 48 in its record, DIA 51, MDY 25.
- **QQQ is one of the four securities in the homepage's first chips** (`INITIAL`,
  `lib/suggestions.ts:50-55`).
- **Optional, the owner's pick: the older forms of two the list keeps.** On Fidelity Contrafund's
  record N-Q runs to 2018-11-28 and NPORT-P begins 2019-11-26; NSAR-A and NSAR-B run to 2018 and
  N-CEN begins 2020-03-12. Counts: N-Q 29, NSAR-A 24, NSAR-B 25 on Contrafund's record; NSAR-U 21,
  19, 20 and 20 on SPY's, QQQ's, DIA's and MDY's. These are routine forms, so a page would gain
  years of the rows it already shows from 2019 and 2020.

**Who benefits and how:** Every reader who follows the homepage's QQQ chip. They get 21 years of
the fund's annual reports, on the Earnings chip where SPY's sit.

**Cost:** none — no key, licence or recurring charge, and no request: the rows are in the record
ingest already downloads.
**Effort:** small: one form and its label. The rows go through batch 67's series rule as any fund
filing does (QQQ's series id is S000101292); a filing from before its series list begins keeps the
trust's name and hedge.

**Verified by:** a `check:sec-forms` case on QQQ's real row of 2021-12-29 (report date 2021-09-30):
it is kept, labelled and typed earnings. On main it is dropped at the form filter, so the case
fails.

**Depends on:** nothing.

**Buildable by:** a cloud session, offline.

*Importance:* medium — 21 years of results documents on one of the site's most prominent fund pages
· *Efficiency:* very high — one form · *Practicality:* high

---

## 4. FDA recalls for Siemens Healthineers and Fresenius SE — two owner calls · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-10-29, with both calls: Siemens Healthineers' recalls count from its 2018 listing (option a), at most 313; and Fresenius SE's control of FMC counts, so FMC's recalls before 2023-11-30 are also Fresenius SE's.
**Owner's reason (if rejected):**

**Anchor:** a capability present for 71 companies and missing for the two whose recalls batch 70
counted and left out for a rule, not for lack of data (`docs/MASTER-CHECKLIST.md:1128-1132`).

**What:** Map Fresenius Kabi to Fresenius SE (FSNUY) now; it needs no new rule. Put two questions
to the owner:
- are FMC's recalls also Fresenius SE's while it controlled FMC without holding most of its shares?
- from when are Siemens Healthineers' recalls its own, given that no SEC filing dates its 2018
  listing?

**Grounded in:**
- **Siemens Healthineers** (SMMNY, CIK 1738519):
  - **The recalls:** 726 Class I and II recalls under "Siemens Medical Solutions USA" and "Siemens
    Healthcare Diagnostics" (1,459 records; 4 recalls with a Class I product). This is the same 726
    batch 70 counted. 413 began before 2018, 313 from 2018 on.
  - **The page today:** its EDGAR record holds six F-6EF filings, the first 2018-04-26, and nothing
    else, so its page has almost no events.
  - **The call:** the map takes every date from an SEC filing. It dates a unit spun off from a
    listed parent from its listing, as Kenvue's recalls are J&J's until Kenvue's IPO
    (`lib/fdaRecalls.ts:312-326`). Siemens AG has no page in the company index. The options:
    - (a) count from the listing, dated by the company's own annual report rather than an SEC
      filing: at most 313;
    - (b) count all 726, reading a parent with no page as Medline's private past is read
      (`lib/fdaRecalls.ts:369`);
    - (c) leave it out.
- **Fresenius SE** (FSNUY, CIK 904868):
  - **The recalls:** "Fresenius Kabi USA" and "Fresenius Kabi Compounding" have 58 recalls from
    2012-09-27, 25 of them with a Class I product. Batch 70 refused Kabi for FMC: "Fresenius Kabi
    belongs to Fresenius SE, another company" (`lib/fdaRecalls.ts:410`).
  - **The page today:** its EDGAR record holds 24 Schedule 13D filings and amendments about FMC.
    They carry no file number on its record, so the stake rule keeps them off its page
    (`lib/sec.ts:863`), and the page has almost nothing.
  - **The call:** its 13D/A filed 2023-12-07 says that on 2023-11-30 FMC converted from a KGaA to
    an AG "and Fresenius KGaA completed the deconsolidation of Fresenius Medical Care AG". Before
    that day it "owned 100% of the equity of the General Partner", and it held 32% of FMC's shares.
    The map's rule for a listed unit is "both companies' while the parent holds most of it"
    (Envista, Bausch + Lomb). Fresenius SE controlled FMC without holding most of it. If control
    counts, 65 of the 86 recalls filed under FMC's own name began before 2023-11-30. (Batch 70's 91
    for FMC include NxStage.)
- **Varian Medical Systems,** which Siemens Healthineers bought, has 31 recalls, the last of them
  2022-03-21. Only those after the purchase closed would count, so one at most.

**Who benefits and how:** Readers of two medical-technology groups whose pages carry almost nothing
from EDGAR. Kabi's 58 are 36 drug and 22 device recalls, with a high share of Class I (25 of 58).

**Cost:** none recurring. Six more openFDA requests a day, three per company, on the map's 213
(batch 70, read from the checklist), inside the keyless 1,000.
**Effort:** small, once the calls are made.

**Verified by:** cases in `check:fda-recalls` on real records:
- a Fresenius Kabi recall lands on FSNUY and not on FMS;
- by the owner's call, an FMC recall before 2023-11-30 is, or is not, also Fresenius SE's, and one
  after is not;
- Siemens Healthineers' recalls land on SMMNY from the day the owner picks;
- "Siemens Hearing Instruments" is refused.

On main they fail: neither company is mapped.

**Depends on:** the owner's two calls. Kabi alone needs neither.

**Buildable by:** a cloud session; openFDA answers from here.

*Importance:* low-medium — 784 recalls on two thin pages, nearly all of Siemens Healthineers' in
Class II, which ranks as news · *Efficiency:* high — rows on a built map · *Practicality:* medium —
two calls

---

## 5. The vehicle brands Ford and GM owned, on their pages while they owned them — one owner call · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-10-29, with the call: a brand Ford or GM owned counts for it until the day it sold the brand.
**Owner's reason (if rejected):**

**Anchor:** a capability present in two maps and missing in the third. The FDA and Federal Reserve
maps count a business a company sold until the day it left: "a business it spun off or sold stops
counting the day it left" (`lib/fdaRecalls.ts:78`), "A unit the company sold stops counting the day
it left" (`lib/fedActions.ts:51`). So J&J's Cordis counts for J&J until 2015-10-01
(`lib/fdaRecalls.ts:305`). The vehicle map cannot: `RecallMaker` has a `from` and no `to`
(`lib/recalls.ts:33-43`). Batch 31 left the question open: "whether a former subsidiary's recalls
belong on the seller's page is a question the rule does not settle"
(`docs/MASTER-CHECKLIST.md:3637-3641`).

**What:** The owner's call: does a brand a mapped carmaker owned count for it until it sold the
brand, as a sold business does in the other two maps? If yes, add `to` to `RecallMaker`. Then map
Volvo, Jaguar and Land Rover to Ford and Saab to GM for the years each owned them, each day read
from the company's own filings, as batch 31 read purchase dates. Investigations follow through the
same map (`lib/investigations.ts`).

**Grounded in:**
- **Measured** on the recalls dataset at the 10,000-vehicle floor, in sizing windows (the real
  days come from the filings):
  - "Volvo Car USA, LLC", the dataset's name for Volvo's recalls since 1968: 30 recalls from 1999-04
    to 2010-07, the largest 245,894 vehicles.
  - "Jaguar Cars, Ltd.": 11, and "Redundant JAGUAR ROVER TRIUMPH INC.": 2, from 1990 to 2008-05.
  - "Land Rover": 13 from 2000-07 to 2008-05, the largest 100,174 vehicles.
  - "SAAB CARS USA, INC.": 12 from 2000 to 2010-02, and 8 more in 1990–1999, whose ownership the
    filings would have to settle.
  - Defect investigations opened in the same windows: Volvo 17, Jaguar 5, Land Rover 6, Saab 9.
  - What stays out: Jaguar Land Rover North America's 41 large recalls and 3 investigations, all
    filed after the sale; Volvo's from before 1999 and after 2010. Aston Martin has none at the
    floor.
- **The gain:** Ford's page gains about 56 recalls and 28 investigations from 1990 to 2010, beside
  its 861 recalls (batch 30, read from the checklist). GM's gains about 12 recalls and 9
  investigations.

**Who benefits and how:** Ford's and GM's readers, in the years before GDELT reaches.

**Cost:** none — and no request: the makers join the same per-company query
(`manufacturer IN (…)`).
**Effort:** small: a `to` on `RecallMaker` and in both adapters' queries, four or five rows, and
the days from Ford's and GM's filings.

**Verified by:** cases in `check:vehicle-recalls` on pinned rows:
- a Volvo Car USA recall of 2003 lands on Ford, and one of 2016 does not;
- a Land Rover recall of 2004 lands on Ford, and a Jaguar Land Rover North America one of 2015
  does not;
- a 2004 Saab recall lands on GM;
- the same holds for an investigation of each.

On main they fail.

**Depends on:** the owner's call.

**Buildable by:** a cloud session; the portal answers from here.

*Importance:* low-medium — tens of rows on two pages, in the thin years · *Efficiency:* high — four
rows and one field · *Practicality:* medium-high — one call, which the other two maps already
answer

---

## Considered and cut

- **Distributors and others the FDA map left out** (`docs/MASTER-CHECKLIST.md:1135-1137`). Counted
  2026-10-28:
  - McKesson: 43 recalls (15 McKesson Medical-Surgical, 17 imaging and IT units of 2012–2018, 11
    drug and repackaging).
  - Cencora's PharMEDium: 24, 2015–2020.
  - Linde's Lincare: 1 recall, across 54 records.
  - IBM's Merge Healthcare: 84, 44 of them in 2016.

  These are small. Merge's imaging-software recalls would be nearly all of IBM's FDA rows, on a
  page about an IT company. McKesson and Cencora could follow #4, a row each, if wanted.
- **Two regulators for the same kind of gap, not measurable from here:**
  - The OCC's enforcement search, for the national banks under the Fed-mapped holding companies:
    apps.occ.gov answered both requests with a "Security Redirect".
  - USDA FSIS meat and poultry recalls: this container's egress refused the host. Tyson, Hormel,
    Pilgrim's Pride, Smithfield, Conagra and Seaboard are in the company index, and the FDA map
    cannot carry their meat recalls.

  Both are worth a measured note from the owner's host. The CFPB's enforcement list answered, but I
  did not count it.
- **Vehicle makers with little or nothing to add at the floor:** Cooper Tire's last recall in the
  dataset is of 2021-08-27, so at most its 2 large ones of 2021 could fall after Goodyear's
  purchase that year. Oshkosh Corporation has none of 10,000 vehicles or more. Allison
  Transmission has 2, both of 1981.
- **News publication times** (GDELT's `seendate`, Yahoo's `pubDate`), the follow-up batch 68 named.
  Not measurable here: GDELT refuses this container, and stored rows keep only the day. Noticed on
  the way: both are dated by their UTC day (`lib/news.ts:342`, `lib/newsExtra.ts:83`), so a story
  seen after 8 pm New York time (7 pm in winter) carries the next day's date. Worth settling before
  any timing rule is built on it.
- **Exchange listing registrations (8-A12B):** in eight large companies' recent records, most
  8-A12B and 25-NSE rows concern debt. Apple's 25-NSE of 2025-05-22 removed its "Senior Notes Due
  2025". The case a reader would want, an exchange move, is a labelling fault (closing note), not a
  coverage gain.
- **Dropping the sibling hedge on one-series trusts:** 328 of the 1,159 registrants in the index
  have one series, QQQ's trust among them. But the index lists today's series, not a trust's past
  ones, so it cannot show that a trust never had another. Cut until a source can.
- **Fund mergers and deregistrations** (N-14, N-8F): one N-14 each on Vanguard Index Funds' and
  Fidelity Contrafund's records, and no N-8F in the five fund records read. Too rare to size.
  QQQ's 2025 proxy: its DEF 14A is kept, and its 35 DEFA14As are the form the 2026-10-26 run
  counted and did not propose.
- **The sector Federal Register feed's 2015 floor** (open `P2`, `docs/MASTER-CHECKLIST.md:4728-4730`):
  its documents are keyword hits the scorer deliberately leaves unscored (`README.md:64-68`), so
  more years would mean more unjudged rows. Not re-prioritised.
- **Delisted and acquired companies** (Kellanova and WK Kellogg left the index,
  `docs/MASTER-CHECKLIST.md:3042-3043`): a scope question for the owner, with no measured demand.
  The local `chronolens` database's `search_resolutions` holds 80 unresolved queries, every one a
  test string.
- **The 2026-10-28 audit's note to the scout** (more 1990s titles in `check:fr-backfill`): batch 71
  pinned the run-together 1997 Conrail titles. A further case belongs to the next change to that
  rule; it is not a coverage proposal.
- **Re-prioritisations:** none. The open items nearest securities depth (the GDELT backfill's
  production watch, the 203 held-back everyday-word names, the paid-tier evidence) still need the
  production host or a key.
- **Anything touching another product:** nothing here reads, references or connects to another
  product's repository.

*One closing note, not a proposal* — noticed in passing. `"25"` is labelled "Delisting notice" and
`"25-NSE"` "Removed from an exchange" whatever class the form removes (`lib/secForms.ts:157-158`).
- Apple's 25-NSE of 2025-05-22 removed only its Senior Notes Due 2025. Its record holds four
  25-NSEs since 2022, and GE's four since 2020, which I did not read.
- Walmart's Form 25 of 2025-12-08 is a voluntary withdrawal of its stock from the NYSE. It was
  filed beside an 8-A12B the same day, which is dropped. SPY's record has the same pair on
  2009-02-23.

The `code-auditor` may want it.
