# Opportunity proposals — 2026-10-26

**Commit:** 5e2a1f72df2b7d6fa719ace8d17477940ca0c4f6 (main, after batch 61) · **Reviewed:** `CLAUDE.md`, `README.md` (ingest, sources, relevance and page-reading sections), `docs/MASTER-CHECKLIST.md` (the NC ledger batches 11–61, Scope refocus, Search engine, Search accuracy, article resurfacing, external-review ideas, owner backlog, and every open box), `docs/COVERAGE-MAP.md`, `docs/OWNER-ACTIONS.md`, `docs/EVENTS-SCHEMA.md`, `docs/decisions/2026-09-28-business-decisions.md`, `docs/IMPROVEMENT-AGENT-SETUP.md`, `docs/proposals/2026-07-30-proposals.md`, `2026-10-17-proposals.md` and `2026-10-22-news-sources.md`, the closing notes of both 2026-10-26 audits; code — `lib/sec.ts`, `lib/secForms.ts`, `lib/secHeadlines.ts`, `lib/ingest/headlines.ts`, `lib/frCompany.ts`, `lib/federalregister.ts`, `lib/focus.ts`, `lib/recalls.ts`, `lib/fdaRecalls.ts`, `lib/edgarSeries.ts`, `scripts/sync-tickers.ts`, `scripts/ingest.ts` (company ingest), `scripts/fr-company-report.ts`, `components/BiggestMoves.tsx`, `components/EventList.tsx`; data — `data/edgar-tickers.json`, `data/company-aliases.json`, `scripts/fixtures/sec-headlines.json`, and the local `chronolens`, `chronolens_b42` and `chronolens_b48` databases (read-only) · **Proposals:** 8

> - **No rejection log exists** (`docs/audits/rejected-proposals.md`), and nothing has been
>   rejected: all ten 2026-10-17 proposals were approved and built (batches 11–16), #7 then shelved
>   by the owner after `npm run overlap-report` found 0 of 22 topics sharing a story. No item was
>   deferred, so none carries forward. CPSC recalls still await the owner's call on the
>   2026-10-22 shortlist and are not re-proposed. Insider-trade forms stay out, as decided on
>   2026-10-18.
> - **Measured live on 2026-10-26 from this container**, every figure below unless it says
>   otherwise. Requests: SEC EDGAR about 110, paced at three a second or fewer, sent with the
>   project's own declared User-Agent (`lib/sec.ts:13`), which carries the owner's contact address
>   — EDGAR answered 403 to one without a contact; Federal Register about 45; openFDA about 300
>   (inside its keyless 1,000 a day); data.transportation.gov about 40; federalreserve.gov 9;
>   Wikidata 2; Wikipedia 14, 10 of them refused (429). GDELT was not asked. The local Postgres
>   cluster was down; I started it for read-only queries and stopped it again.
> - **Nothing here needs a key, a paid tier or a recurring charge.** Two proposals, #4 and #7, add
>   a dataset the site does not read today; they are written as decisions for the owner, with the
>   licence quoted. The other six use sources already on the ingest path.
> - Ranked by importance, securities depth first:
>   1 · the Federal Register back to 1994, and past the newest forty — 2 · a results release is an
>   earnings event whatever form carried it — 3 · the forms the 2026-10-18 list missed (foreign
>   IPOs, large-company shelves, late-filing notices, proxy fights) — 4 · NHTSA defect
>   investigations (a source decision) — 5 · a fund's page carries its own fund's filings —
>   6 · when a filing came out, before the open or after the close — 7 · Federal Reserve
>   enforcement actions on bank pages (a source decision) — 8 · FDA recalls for the next
>   health-care makers.

Mark each proposal below: `APPROVED`, `REJECTED`, or `DEFERRED`, and add a
reason for anything rejected. Then run the scout in FILE mode.

**Marked 2026-10-26 by the owner: all eight approved, none rejected or deferred.**

---

## 1. Reach the Federal Register back to 1994, and past the newest forty · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-10-26. Which routine rail-board and FERC notices count is asked when it is built.
**Owner's reason (if rejected):**

**Anchor:** data the source holds that our own query declines — a floor `docs/COVERAGE-MAP.md:100-101`
calls "a choice, not a limit" · an explicit gap in a strategy document, the 1963–2017 stretch the
coverage map calls "the single biggest hole in the corpus" (`docs/COVERAGE-MAP.md:86-89`).

**What:** Ask the company Federal Register feed for every year back to 1994, each past year once,
and store every title-naming document it finds rather than the newest forty. Search a company's own
EDGAR former names for the years they were in use.

**Grounded in:**
- **The floor:** `FR_COMPANY_SINCE = "2015-01-01"` (`lib/frCompany.ts:194`). The API answers from
  1994; every pre-2015 count below came from it.
- **The forty:** `.slice(0, FR_COMPANY_CAP)`, cap 40, newest first, on every run
  (`lib/frCompany.ts:191`, `:238`). Each run asks for the same newest documents, so a company's
  41st-newest title-naming document never reaches its page, however many runs go by.
- **Measured** with the repo's own `frSearchTerm`, `titleNamesCompany` and
  `isAirworthinessDirective`, directives left out as the owner ruled on 2026-10-18:

  | Ticker | 1994–2014 | Since 2015 | What the feed keeps (≤ 40) |
  |---|---:|---:|---:|
  | F | 100 | 32 | 32 |
  | GM | 225 | 51 | 40 |
  | BA | ≥18 (3,000 of 6,500 hits read) | 107 | 40 |
  | GE | ≥121 (3,000 of 3,795 read) | 35 | 35 |
  | XOM | 55 | 18 | 18 |
  | PFE | 32 | 22 | 22 |
  | IBM | 25 | 0 | 0 |
  | AAPL | 23 | 14 | 14 |
  | JPM | 11 | 3 | 3 |
  | DAL | 3 | 14 | 14 |
  | WMT | 1 (5 under "Wal-Mart Stores") | 0 | 0 |
  | UNP | 663 | 120 | 40 |
  | CSX | 430 | 141 | 40 |
  | DUK | 461 | 184 | 40 |

  Across these fourteen, the feed as built can carry at most 338 documents; the source holds 2,909
  that the feed's own rule accepts. Without the two railroads and the utility, 218 against 910.
- **The older years hold what the feed already carries:** NHTSA inconsequential-noncompliance
  petitions and theft-standard exemptions (Ford 1995, 1999, 2010), FTC consent orders (Wal-Mart
  Stores 1999 and 2002), Labor Department trade-adjustment determinations at named plants (Ford
  Louisville 2008, GM Massena 2008), FERC complaints (ExxonMobil v. Entergy, 2005), an SEC delisting
  notice (GM, 2006), a joint-research notice (Ford and Toyota, 2011).
- **Former names:** under "Walmart" the source finds 1 document before 2015; under its EDGAR former
  name "Wal-Mart Stores" (until 2018), 5. The renames are already stored (batch 15, `renamesFrom`,
  `lib/sec.ts:967`), and `data/company-aliases.json` holds nothing for Walmart's CIK.

**Who benefits and how:** Readers of regulated companies — carmakers, railroads, utilities,
airlines, drugmakers, oil companies — get two more decades of dated government actions naming the
company, in the stretch the coverage map names as thinnest, from a source already cleared and on
the ingest path.

**Cost:** none — no key, licence or recurring charge. About 21 requests per company once, one per
past year, then today's one a day. The Federal Register publishes no cap.
**Effort:** medium.
- A year walk per company, each closed year kept in a table shaped like `gdelt_windows`
  (db/030) and never asked again; the current year stays on today's daily ask.
- A closed year stores all its title-naming documents. The forty stays as a per-run ceiling on the
  daily ask only.
- Former names searched only for dates before the rename.
- ⚠ **The materiality call returns, as it did for airworthiness directives.** UNP's 663 and CSX's
  430 are nearly all Surface Transportation Board line notices ("Union Pacific Railroad
  Company-Abandonment Exemption-in Wright County, Iowa"), and Duke's 461 FERC dockets. Exclude
  them, group them a row a month as prospectuses are (`pageFilings`, `lib/secForms.ts:175`), or
  keep them. Records are never cut by the page budget; news is (`lib/pageNews.ts`), so a page with
  600 more records carries fewer stories.
- The sector feed has the same 2015 floor (`lib/federalregister.ts:19`); the same change applies,
  at lower priority.

**Verified by:** new cases in `check:wiring`, where the feed's checks already live, against a
stand-in Federal Register: a 2003 title-naming Ford document reaches the page; a company with 60
title-naming documents since 2015 has all 60 once its years are walked; a closed year is not asked
twice; Walmart's 1999 "Wal-Mart Stores, Inc.; Analysis to Aid Public Comment" counts through the
former name, which is not asked for years after the rename. On main the first two fail (the floor
and the slice) and the others cannot run. A `check:live` case: Ford has documents before 2015.

**Depends on:** nothing in code. The owner's call on rail and utility notices before it ships.

**Buildable by:** a cloud session — the Federal Register answers from here, and every case runs
offline against a stand-in.

*Importance:* high — the largest depth gain left on an approved source, in the years the corpus is
thinnest · *Efficiency:* high — same adapter, same match rule · *Practicality:* medium-high — one
owner call on routine notices

---

## 2. A results release is an earnings event, whatever form carried it · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-10-26. Whether a profit alert counts as earnings is asked when it is built.
**Owner's reason (if rejected):**

**Anchor:** a capability present for one subject type and missing for a comparable one — a US
company's results 8-K is typed `earnings` by EDGAR's item 2.02, a foreign company's results 6-K
never is · data already stored and never used for typing (the release's headline).

**What:** When a filing's stored press-release headline announces a reporting period's results —
"NIO Inc. Reports Unaudited Fourth Quarter and Full Year 2025 Financial Results", "Boeing Reports
1997 2nd Quarter Results" — type it `earnings`, as an 8-K 2.02 is. It applies to 6-Ks, and to 8-Ks
without item 2.02: every one before August 2004, and the occasional preliminary-results 8-K since.

**Grounded in:**
- **The reason it was left out no longer holds.** "A 6-K stays a filing: it carries anything a home
  market required, and the submissions list does not say which" (`lib/sec.ts:849-852`, batch 11).
  Since batches 43–44 the headline reader does say which: it reads each 6-K, keeps its headline in
  `sec_headlines` (db/029), and already recognises a results headline (`RESULTS_HEADLINE`,
  `lib/secHeadlines.ts:833`).
- **Stored and mistyped,** in the batch 42 and 48 scratch databases: NIO has 32 quarterly-results
  6-Ks (and a profit alert) typed `filing`, and 8 earnings events, its 20-F annual reports. Novartis, GSK and Lloyds the
  same in smaller numbers. Boeing's results 8-Ks for 1997 Q2, 2003 Q2 and Q3 and 2004 Q1, filed
  before item 2.02 existed, are `filing`.
- **What it costs them:** no Earnings chip, no earnings marker, and Biggest moves ranks the release
  as a filing (4) rather than earnings (5) when it picks the catalyst for a move
  (`components/BiggestMoves.tsx:37-41`).
- **A first rule, tried on 1,079 real headlines** (960 stored in those two databases, 119 in the
  committed fixture) — a reporting period, a results word, and none of the words below:
  - it marks 196, and agrees with EDGAR's 2.02 on 120 of the 130 titled 2.02 releases; of the 10 it
    misses, 8 are not results releases at all (an acquisition closing, charges, a supply agreement,
    filed under 2.02);
  - of the 47 it newly types, 42 are results releases (NIO 32, Boeing 4, Novartis 3, GSK 2, Lloyds
    1) and 5 are not: a profit alert, a pre-announcement, a guidance update and two Takeda
    forecast-revision notices, which the owner should rule in or out;
  - real headlines it must keep out, all in the stored set: "Takeda Announces Phase 3 Topline
    Results…", "UBS Announces Results and Upsizing of its Cash Tender Offers", MUFG's
    "Risk-Adjusted Capital Ratio… for the First Quarter Ended June 30, 2026", Novartis's "…Condensed
    Interim Financial Report – Supplementary Data".
- **Not EDGAR's old 8-K item codes,** which looked like the cheaper route: see Considered and cut.

**Who benefits and how:** Readers of foreign issuers — every one of the 25 sampled for proposal 3
files 6-Ks, 15,509 between them (BABA, TSM, NIO, Novartis, Toyota, SAP, Sony…) — get their
quarterly results on the Earnings chip and as the catalyst Biggest moves prefers. Readers of
long-history US companies get their pre-2004 results the same way.

**Cost:** none — no key, licence or recurring charge, and no request: the headlines are stored.
**Effort:** small. One predicate beside `RESULTS_HEADLINE`, applied where a stored headline is put
on a filing (`lib/ingest/headlines.ts:75`), so the kind travels with the title. Stored rows re-type
on their next ingest, as titles do. The description says why ("a results release, counted as
earnings"). The owner's call: whether profit alerts and guidance updates count.

**Verified by:** cases in `check:sec-headlines` built from the real stored titles above: NIO's 32
and Boeing's four become earnings, the four traps and the edge cases stay filings, and the rule
still agrees with 2.02 on the 120. On main every one of them is a filing, so the new cases fail.

**Depends on:** nothing.

**Buildable by:** a cloud session, fully offline.

*Importance:* high — the catalyst kind the panel ranks first, on every foreign issuer's page ·
*Efficiency:* very high — stored data, one rule · *Practicality:* high

---

## 3. Keep the forms the 2026-10-18 list missed: foreign listings, large-company shelves, late-filing notices, proxy fights, tender results · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-10-26. The owner picks the forms from the list when it is built.
**Owner's reason (if rejected):**

**Anchor:** data already downloaded and dropped · a capability present for one subject type and
missing for a comparable one (S-1, S-3 and S-4 are kept; F-1, F-3, F-4 and S-3ASR are not) · a dead
end (search already knows "F-1").

**What:** Add to `MATERIAL_FORMS`, now that the live count batch 13 went without has been made:
- **offerings:** S-3ASR, F-3, F-3ASR and F-10 — and F-1, a foreign company's listing registration;
- **mergers and tenders:** F-4; SC TO-T/A (or only its final amendment, which reports the result);
  SC TO-I, an issuer's own tender or exchange offer;
- **late-filing notices:** NT 10-K, NT 10-Q, NT 20-F;
- **proxy fights:** PREC14A and DEFC14A, and the dissidents' DFAN14A grouped a row a month, as
  prospectuses are.

**Grounded in:**
- The filter is `lib/sec.ts:818`; the list `lib/secForms.ts:114-143`, where S-3 is kept (`:137`).
  The owner picked its groups on 2026-10-18 "without waiting for the live count" (batch 13).
- **Counted** across 45 submissions records — 20 large US companies and 25 foreign issuers.
  Their recent blocks hold 66,722 rows: 44,650 kept, 14,826 insider forms (left out, and not
  re-proposed), 7,246 others dropped. With the older shards of 28 of them:
  - **S-3ASR 123, in 18 records, against S-3's 95 kept.** Large seasoned issuers register shelves
    on the automatic form, so "Shelf registration" almost never fires for the companies most read.
  - **F-1, 9 foreign listings, none kept:** ARM 2023-08-21, BABA 2014-05-06, SPOT 2018-02-28, SHOP
    2015-04-14, NIO 2018-08-13, PDD 2018-06-29, JD 2014-01-30, BIDU 2005-07-12, SAP 1998-06-22. The
    US listings are kept: META 2012, TSLA 2010, GM 2010, AMZN 1997.
  - F-4 15 (BABA, TM, UBS, NVS, ASML…), F-10 22 (SHOP, SU, CNI), F-3 and F-3ASR 67.
  - **Late-filing notices, 8 even among these large companies:** Apple's NT 10-Q of 2006-08-11 and
    NT 10-K of 2006-12-15 (its options review), NVIDIA's NT 10-K of 2002-04-29, GM's of
    2010-03-29, Tesla's of 2013-03-04, NIO's NT 20-F of 2020-04-29. Across EDGAR in 2025, its
    full-text index counts 1,171 NT 10-Qs and 204 NT 20-Fs.
  - **Proxy fights:** PREC14A and DEFC14A 15 (Disney 2023 and 2024, GM 2017, Pfizer 1999, IBM 2009),
    and 195 DFAN14A, 134 of them Disney's.
  - **Tenders:** SC TO-T/A 299 against SC TO-T's 59 kept; SC TO-I 23 (Pfizer's 2013 Zoetis
    exchange offer, NIO's and PDD's offers).
- **The dead end:** focus and search treat F-1, F-3 and F-4 as form names (`lib/focus.ts:54`,
  batch 52), so "Arm F-1" opens ARM narrowed to its F-1s and finds none. `EventList`'s `FORM_RE`
  parses F- forms too (`components/EventList.tsx:412`).

**Who benefits and how:** Readers of foreign issuers get their listing day. Every reader gets
late-filing warnings, which tend to come before a restatement, and proxy fights, which move a
stock. Readers of large companies get the shelf registrations that precede an offering.

**Cost:** none — no key, licence or recurring charge, and no request: these rows are in the records
ingest already downloads.
**Effort:** small. Labels and typing in `MATERIAL_FORMS`, the monthly grouping reusing
`pageFilings`, cases in `check:sec-forms`. The owner picks the list, as on 2026-10-18. Optional:
SUPPL, a Canadian issuer's prospectus supplement (77 rows), grouped like 424B. Counted and not
proposed: 425, DEFA14A, PX14A6G and CORRESP/UPLOAD (see Considered and cut).

**Verified by:** cases in `check:sec-forms` built from real rows of these records: ARM's F-1 is
kept and labelled; Apple's NT 10-Q is kept as a late-filing notice; Disney's 2024 DFAN14As make one
row a month; S-3ASR reads as a shelf. On main each is dropped at `lib/sec.ts:818`, so they fail. A
`check:prompt` case: "Arm F-1" narrows to the F-1.

**Depends on:** nothing.

**Buildable by:** a cloud session, offline; the counts above were made live here.

*Importance:* high — material primary documents on the most-read pages · *Efficiency:* very high —
same response, same function · *Practicality:* high — one owner pick, the counts in hand

---

## 4. NHTSA defect investigations beside the recalls — a source for the owner to decide · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-10-26, the new source (NHTSA defect investigations) included.
**Owner's reason (if rejected):**

**Anchor:** a capability present for one kind of record and missing for a comparable one — a
carmaker's recall is on its page, the investigation that came before it is not · the 1963–2017
hole.

**What:** The owner's decision first. If yes: the investigations NHTSA's Office of Defects
Investigation opened — preliminary evaluations, engineering analyses, defect petitions, recall
queries — as dated events on the mapped carmakers' pages, from the same open-data portal and through
the same hand-checked maker map, `RECALL_MAKERS` (`lib/recalls.ts:56`).

**Licence:** the dataset "Investigations Data" (https://data.transportation.gov/resource/b3rp-be92),
published by NHTSA. Its licence field reads "Public Domain U.S. Government", linked to
https://www.usa.gov/government-works — the same field as the recalls dataset batch 30 built on
(`6axg-epim`, `lib/recalls.ts:18`). usa.gov: "Government work is something created by a U.S.
government officer or employee as part of their official duties." No key.

**Grounded in:**
- **Measured:** 4,053 investigations, opened 1975-03-27 to 2026-10-23. Each has an action number,
  the manufacturer as the recalls dataset writes it ("Ford Motor Company", "Chrysler (FCA US,
  LLC)"), a type, a subject line, a component, open and close dates, and the recall it led to.
- **Through the existing map and its dates:** 1,766 for 20 mapped companies, 1,579 of them before
  2017 — Ford 684 (163 engineering analyses), GM 651 (197), Toyota 114, Honda 113, Stellantis 50
  (from 2014-10-12, as for recalls), Blue Bird 39, Tesla 28, PACCAR 19, Winnebago 19,
  Harley-Davidson 15.
- **The kind of thing it is:** Toyota RQ10003, "Unintended and Uncontrolled Acceleration", opened
  2010-02-16; Tesla EA26002, "FSD Collisions in Reduced Roadway Visibility Conditions", 2026-03-18.

**Who benefits and how:** Carmaker readers. An investigation's opening is often the event a stock
reacts to, before any recall exists, and nearly 1,600 of these reach into the years the corpus is
thinnest.

**Cost:** none recurring — one request a day per mapped maker, on the portal ingest already calls.
**Effort:** medium-small; the adapter has the recall adapter's shape.
- Titles say what was opened and never a finding: "NHTSA opened an engineering analysis: Steering
  knuckle fracture".
- **The owner's calls:** which event kind (a regulation event, or the Recalls chip, or a kind of its
  own with a migration like db/028), and whether a closing is a second event.
- Ford's page gains 684 records, which the page budget pays for in news.

**Verified by:** a new `check:vehicle-investigations`, or cases in `check:vehicle-recalls`, on real
rows pinned from the dataset: Toyota's 2010 query lands on TM; a Chrysler investigation before
2014-10-12 is refused for Stellantis; another maker's row is refused; the source is registered,
licence-checked and credited (`check:wiring`, `check:commercial-mode`). On main it cannot run: the
adapter does not exist.

**Depends on:** the owner's yes.

**Buildable by:** a cloud session; the portal answers from here.

*Importance:* high for its 20 companies — decades of dated, primary, price-relevant actions ·
*Efficiency:* high — same portal, same map · *Practicality:* medium — the owner's yes first

---

## 5. A fund's page carries its own fund's filings · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-10-26.
**Owner's reason (if rejected):**

**Anchor:** data already fetched and dropped (EDGAR's series ids) · it revisits NC-139's premise
with a measurement.

**What:** Keep each fund series' EDGAR id in the committed index. At ingest, read the fund's own
filing list, in which EDGAR tags every fund filing with the series it covers. The fund's own filings
are titled with its name and score 1.0; a sibling's are not linked to it.

**Grounded in:**
- **The premise NC-139 recorded:** "EDGAR's submissions list does not say which series a filing
  covers, so filtering per fund would cost a request per filing" (`docs/MASTER-CHECKLIST.md:297-301`).
  So every trust filing goes on every series' page, titled with the registrant, scored 0.7, "may
  concern a sibling fund" (`lib/sec.ts:880-895`).
- **It costs a request per hundred filings, not per filing:**
  `browse-edgar?action=getcompany&CIK=S000002839&owner=include&count=100&output=atom` lists the
  filings tagged to VOO's series — 533 since 2006-02-16, in 6 requests.
- **Measured:** from 2022-12-05 to 2026-08-28 the Vanguard Index Funds trust (CIK 36405) filed 432
  filings of the kept fund forms, every one of which the code puts on VOO's page. 76 of them, 18%,
  are VOO's: NPORT-P 181 → 15, 497K 191 → 16, 497 39 → 29.
- **The id is already read and thrown away:** `parseSeriesPage` returns `seriesId`
  (`lib/edgarSeries.ts:57`); the sync's `collect` keeps the name, symbol and CIK and drops it
  (`scripts/sync-tickers.ts:177-187`).

**Who benefits and how:** Every fund reader — ETFs and mutual funds are named in the scope. VOO's
page loses some 356 sibling filings in that window alone, and the hedge on every row.

**Cost:** none — no key, licence or recurring charge. About one EDGAR request per hundred filings
per held fund at ingest, paced as the headline reader is; the index grows by one id per series
(19,540).
**Effort:** small to medium. When the series list cannot be read, today's behaviour stays.

**Verified by:** a `check:tickers` case (the index carries the id, and no request is made) and
`check:sec-forms` cases against pinned Atom pages: VOO keeps 76 of the window's 432; a sibling's
NPORT-P is not on VOO's page; an unreachable list leaves today's titles. On main the index has no
ids and every trust filing reaches every series, so they fail.

**Depends on:** one `npm run sync:tickers` to write the ids (owner's host or a cloud session; both
reach sec.gov).

**Buildable by:** a cloud session.

*Importance:* medium — precision on every fund page, not more rows · *Efficiency:* high ·
*Practicality:* high

---

## 6. When a filing came out: before the open, or after the close · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-10-26.
**Owner's reason (if rejected):**

**Anchor:** data collected but never surfaced — EDGAR's acceptance time, and a database column
built for it that nothing writes · the README's stated job, "spot what sparked a move"
(`README.md:3-5`).

**What:** Store each filing's EDGAR acceptance time in `events.occurred_at`. Say on its row "4:30 pm
ET, after the close". And Biggest moves never pairs a move with something published after that
session closed.

**Grounded in:**
- Every submissions record carries `acceptanceDateTime` for each filing; `FilingBlock` reads none of
  it (`lib/sec.ts:759-766`).
- `occurred_at timestamptz -- only when the source gives a real instant` (`docs/EVENTS-SCHEMA.md:134`).
  0 of 30,470 events in the batch 42 database have one. The schema deferred it "until the price
  series goes intraday" (`:346-347`). This is a different reason: the time decides which daily bar a
  release belongs to. Prices stay end of day.
- **Measured:** of 544 results 8-Ks filed since 2008 in the 45 sampled records, 290 (53%) were
  accepted after 16:00 ET and carry that day's date; 242 came before 9:30. All 45 of Apple's since
  2015 came after the close: the release day's median move is 0.7%, the next session's 3.7%, and
  33 of those 45 next sessions moved 2% or more. IBM: 0.7% against 5.1%.
- **Biggest moves knows the problem and guesses:** "an after-close 8-K/earnings moves the *next*
  session" (`components/BiggestMoves.tsx:32-34`). Its score puts the move's own day first
  (`:97`), so a 2%-plus move on a release day — 10 of Apple's 45, 10 of Ford's 29 — is captioned
  with a release that came out after it.

**Who benefits and how:** A reader lining an earnings release up with the bar that reacted to it,
and the panel's honesty about what came first.

**Cost:** none — no key, licence or recurring charge, and no request.
**Effort:** small: read the field, store it, carry it to the event, one rule in `nearestCatalyst`,
one phrase on the row. GDELT's `seendate` and Yahoo's `pubDate` could follow; not proposed here.

**Verified by:** a `check:sec-forms` case (Apple's 2026-07-30 release, accepted
"2026-07-30T20:30:00.000Z", stored as 16:30 ET, daylight saving handled) and a `nearestCatalyst`
case in `check:markers`: a move on the release day is not paired with that day's after-close
release, and the next session's move is. On main nothing is stored and the pairing is by day, so
both fail.

**Depends on:** nothing.

**Buildable by:** a cloud session, offline.

*Importance:* medium — on every company page's busiest event · *Efficiency:* high — the field is
in hand · *Practicality:* high — it revisits a written deferral, with a reason the deferral did not
weigh

---

## 7. Federal Reserve enforcement actions on bank pages — a source for the owner to decide · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-10-26, the new source (Federal Reserve enforcement actions) included.
**Owner's reason (if rejected):**

**Anchor:** a capability present for comparable companies and missing here — carmakers and drug,
device and food makers have their own regulator's actions on the page, banks have none of theirs ·
the 1963–2017 hole.

**What:** The owner's decision first. If yes: the Board's enforcement actions against a listed bank
holding company — cease-and-desist orders, written agreements, civil money penalties — as
regulation events, through a hand-checked map like `FDA_FIRMS`, never by name alone.

**Licence:** "Unless otherwise indicated, information on Board's website is in the public domain and
may be copied and distributed without permission. Please cite to the Board as the source of the
information." (https://www.federalreserve.gov/disclaimer.htm). The Board is already credited for
the FOMC statements (batch 21).

**Grounded in:**
- **Measured:** two keyless JSON files behind the Board's enforcement page —
  `/supervisionreg/ea-old.json`, 2,514 actions from 1989-09-25 to 2018-12-26, and
  `/supervisionreg/files/ea-cms-recent.json`, 385 from 2019-01-18 to 2026-10-08. Each has a date, a
  type, the organisation with its city, and a press-release link; 1,066 of the older ones are
  against a person.
- **For five large banks, 45 actions against the firm:** Wells Fargo's cease-and-desist
  order of 2018-02-02 (the asset cap), JPMorgan's $200 million penalty of 2013-09-18, the
  2015-05-20 orders on JPMorgan, Citigroup and Bank of America, Goldman Sachs's order of
  2020-10-22. Most fall before 2017.
- **Why a map:** matched by name alone, 152 actions land on 76 listed companies, and many belong to
  other banks of the same name: "Citizens Bancshares Co., Chillicothe, Missouri" is not Citizens
  Financial, "Huntington Bancshares, Inc., Huntington, Texas" is not Huntington, "Commerce
  Bancshares, Inc., Edina, Minnesota" is not Commerce of Kansas City.

**Who benefits and how:** Readers of large banks. JPMorgan's page in the batch 42 database carries
11,694 events, nearly all prospectuses, and none of the Board's actions against it. A few to a
dozen material events per bank. **I cannot size it past the large banks without building the
map.**

**Cost:** none — the older file (566 KB, closed at 2018) read once, the recent one (92 KB) daily.
**Effort:** medium: an adapter, a map for the 20 or so largest bank holding companies with a city
check, one event a day per company (a cease-and-desist and a penalty the same day are one case).

**Verified by:** a new `check:fed-actions` on real rows: Wells Fargo's 2018 order lands on WFC; the
three namesakes above are refused; an action against a person employed at JPMorgan is not the
bank's; two same-day orders make one event; the source is registered and credited. On main it
cannot run: the adapter does not exist.

**Depends on:** the owner's yes.

**Buildable by:** a cloud session; federalreserve.gov answers from here.

*Importance:* medium — material, but few per bank · *Efficiency:* medium — new adapter, hand map ·
*Practicality:* medium — the owner's yes first

---

## 8. FDA recalls for the next health-care makers · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-10-26.
**Owner's reason (if rejected):**

**Anchor:** a capability present for 38 companies and missing for comparable listed ones, on a
source the owner approved on 2026-10-24.

**What:** Extend `FDA_FIRMS` (`lib/fdaRecalls.ts:54`) to the listed device and drug makers with the
most Class I and II recalls not yet mapped, each date a firm joined or left taken from the
company's own SEC filing, as batch 41 did.

**Grounded in:**
- **Measured on openFDA** (Class I and II, distinct recalls under the firm name searched): Beckman
  Coulter 223 (Danaher's), Fresenius Medical Care 86, ICU Medical 78, Steris 57, Bausch 24, Amneal
  24, Perrigo 20, GlaxoSmithKline 18, Avanos 18, Insulet 15, Tandem 12, Sanofi 12, CooperVision 11
  (Cooper Companies), Dexcom 11 — about 650 across some twenty companies. Food and household makers
  add about 150 (Dole 26, TreeHouse 13, Church & Dwight 13, Unilever 11, Kimberly-Clark 11).
- **The look-alike pass batch 40 did is needed again:** "Bausch" is two listed companies; "Coca-Cola"
  (33) is mostly independent bottlers, one of them separately listed. Store-brand recalls by
  retailers (Kroger 41, Albertsons 20) are left out for the reason the CPSC note gives: they would
  fill a retailer's page with other makers' products
  (`docs/proposals/2026-10-22-news-sources.md:144-146`).

**Who benefits and how:** Readers of medical-device and drug companies outside the first 38.

**Cost:** none — 3–6 requests a day per company, inside openFDA's keyless 1,000 a day with room.
**Effort:** small to medium, most of it reading the acquisition dates (ICU Medical's Smiths Medical,
Steris's Cantel, the GSK consumer business that became Haleon).

**Verified by:** cases in `check:fda-recalls` on real openFDA records for each new company, on both
sides of each date, with the look-alikes refused. On main they fail: the firms are unmapped.

**Depends on:** nothing.

**Buildable by:** a cloud session; openFDA answers from here.

*Importance:* low-medium — nearly all are Class II, which rank as news (Beckman Coulter's records:
334 Class II, 5 Class I; ICU Medical's 647 and 22) · *Efficiency:* medium · *Practicality:* high

---

## Considered and cut

- **Drug approvals from Drugs@FDA** (openFDA, CC0). Large and deep — Pfizer 169 original NDA/BLA
  approvals, 74 of them new molecular entities, 149 before 2017, from 1950; Novartis 163, AbbVie
  133, Merck 101 — and the natural balance to a drugmaker's page of recalls. Cut because the
  sponsor field names today's holder, not the approval's: under PFIZER sit Provera (Upjohn, 1959),
  Flagyl (Searle, 1963) and Lopid (Parke-Davis, 1981). Putting those on Pfizer's 1959–1981 timeline
  breaks the rule that an acquisition's past is never the buyer's, and the dataset carries nothing
  to tell them apart. Worth reopening only with a per-application source of the original sponsor.
- **EDGAR's old 8-K item codes** (before August 2004), which would have titled hundreds of "8-K
  filing" rows and made item 12 an earnings event. All 683 such 8-Ks in fifteen records carry codes,
  but they disagree with the documents: Pfizer's 1999-11-08 8-K is listed as item 3, "Bankruptcy or
  receivership", and its document says "Item 5. Other Events" (the Warner-Lambert offer); its
  2001-02-02 one is listed as item 1 and is item 5; its 1999-12-08 one as item 4 and is item 5.
  `leadItem`'s refusal to guess (`lib/secForms.ts:74-79`) is right. Proposal 2 reaches the
  results releases among them by their headlines instead.
- **Wikidata's dated CEO successions** (P169 with a start date): 744 statements on 387 companies
  with a CIK, and since 2004 the 8-K 5.02 already carries them with a headline.
- **Wikipedia's daily "Current events" pages:** Pfizer appears on 263, Walmart 62, Enron 56, Lehman
  Brothers 15; Wikipedia refused 10 of my 14 asks, so how far back the pages go and how a bullet maps
  to a dated citation is unmeasured. Worth a measured note from the owner's host, not a proposal.
- **"Also on" links between held companies:** 2 events are linked to two held companies among the
  17 in the batch 42 database. Nothing to show.
- **Merger communications (425: 543 rows, RIO alone 178), additional proxy material (DEFA14A,
  409), exempt solicitations (PX14A6G, 319), SEC comment letters (CORRESP and UPLOAD, 863):**
  counted in proposal 3's sample and left out — volume without a dated event a reader needs; the
  425s repeat the S-4 and DEFM14A already kept.
- **Dividend changes ("up from $0.15"):** arithmetic on stored rows, but Yahoo dates the ex-day and
  a special dividend would read as a raise then a cut; the release headlines already say "Boeing
  Raises Dividend 10 Percent".
- **A period on each periodic report** ("for fiscal 2024", from EDGAR's `reportDate`): cosmetic; the
  filing date already sits beside the period.
- **The 2026-10-26 code audit's note to the scout** — `check:feeds` printing a sample of the
  headlines each filter keeps and drops: a good diagnostic, best built with the next filter change,
  not a coverage proposal. The scoring audit's note (`check:relevance` replaying a saved headline
  set) is already open in batch 61, behind a licensing look.
- **Re-prioritisations:** none. The open items nearest securities depth — the GDELT backfill's
  production watch, the 203 held-back everyday-word names, the paid-tier evidence — need the
  production host or a key.
- **Anything touching another product:** nothing here reads, references or connects to another
  product's repository.

*One closing note, not a proposal* — noticed in passing: `fetchCompanyRegulations` stores the same
newest forty title-naming documents on every run and never pages (`lib/frCompany.ts:238`), so
GM's 11, Boeing's 67, Union Pacific's 80, CSX's 101 and Duke's 144 since 2015 never reach their
pages; proposal 1 builds past it, but the `code-auditor` may want it on its own.
