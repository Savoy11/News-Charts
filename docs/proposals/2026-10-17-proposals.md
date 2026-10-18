# Opportunity proposals — 2026-10-17

**Commit:** 3f2ef671549393d5b1071722d268bc49d2b2d9f8 (NC ledger batch 9 — the survey began on 10fdc54 and was re-checked against batch 9's diff, which touches none of the areas below) · **Reviewed:** `CLAUDE.md`, `README.md`, `docs/MASTER-CHECKLIST.md` (whole file, batches 2–9 included), `docs/audits/nc-task-queue-2026-09-28.json` (all 170 items), `docs/OWNER-ACTIONS.md`, `docs/COVERAGE-MAP.md`, `docs/EVENTS-SCHEMA.md`, `docs/decisions/2026-09-28-business-decisions.md`, `docs/IMPROVEMENT-AGENT-SETUP.md`, `docs/proposals/2026-07-30-proposals.md`; code — `lib/sec.ts`, `lib/wiki.ts`, `lib/wikidata.ts`, `lib/federalregister.ts`, `lib/signals.ts`, `lib/resolveSearch.ts`, `lib/store/read.ts`, `lib/page-data.ts`, `scripts/ingest.ts`, `scripts/refresh.ts`, `app/api/signals/route.ts`, the company / topic / industry / explore pages, `CompanyExplorer`, `TopicExplorer`, `EventList`, `BiggestMoves`, `SearchBox`, `SignalPanel`; `data/edgar-tickers.json` (counted offline) · **Proposals:** 10

> The uncapped run NC-037 asks for; the 2026-07-30 run was capped at two by instruction.
>
> - `docs/audits/rejected-proposals.md` does not exist, so there is no rejection log to check
>   against. Both 2026-07-30 proposals shipped; neither was rejected.
> - **Anchors** are the five in `docs/IMPROVEMENT-AGENT-SETUP.md:45-50`. The fourth (a competitor
>   capability from a written analysis) is unavailable: the repo holds no competitive analysis, so
>   every proposal below uses one of the other four.
> - **No live calls were made** — this container's proxy refuses every outside source. Index
>   counts were computed offline from the committed `data/edgar-tickers.json` (synced 2026-08-12).
>   Where a proposal needs a live answer before it can be built or judged, it says so.
> - **Nothing here needs a key, a licence or a paid tier.** Every source named is already on the
>   ingest path and cleared `commercialOk` (SEC EDGAR, Federal Register, Wikipedia under CC BY-SA).
> - Ranked by importance, securities coverage first:
>   1 · 8-K item labels and foreign-issuer earnings — 2 · the material forms EDGAR already sends —
>   3 · "did you mean" from the committed index — 4 · Federal Register documents naming the
>   company — 5 · the company Wikipedia lede — 6 · sector-relative performance — 7 · topic → security
>   routes — 8 · fund siblings — 9 · EDGAR former names — 10 · Biggest moves on priced topics.

Mark each proposal below: `APPROVED`, `REJECTED`, or `DEFERRED`, and add a
reason for anything rejected. Then run the scout in FILE mode.

---

## 1. Read what EDGAR already says about each filing — name the 8-K item, and count foreign issuers' annual reports as earnings · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** PENDING — mark `APPROVED` / `REJECTED` / `DEFERRED`
**Owner's reason (if rejected):**

**Anchor:** data already ingested but never shown (the 8-K items) · a capability present for one
subject type and missing for a comparable one (domestic filers have earnings events, foreign
private issuers cannot).

**What:** Title each 8-K by its item from the SEC's fixed Form 8-K item list — "Ford Motor Co:
Officer or director change (8-K 5.02)" instead of "Ford Motor Co: 8-K filing" — and type 20-F and
40-F annual reports as `earnings`, the way a 10-K already is. Admit 40-F, which the form filter
drops today.

**Grounded in:**
- **Stored, rendered, unreadable.** `lib/sec.ts:425` writes each 8-K's item codes as its
  description (`Items: 5.02,9.01`), and `components/EventList.tsx:76` prints that string under the
  row. The title is `` `${form} filing` `` (`lib/sec.ts:406`) for every 8-K except item 2.02, which
  already gets "Earnings announcement (8-K)" (`:405`). The codes are fetched, stored and shown —
  as numbers a reader has to look up.
- **The checks already picture the labelled form:** `scripts/check-ai.ts:76` uses
  `"8-K: Item 5.02 departure of an officer"` as a fixture title — a title the adapter never writes.
- **The asymmetry.** `lib/sec.ts:397` makes `earnings` mean 10-K, 10-Q or 8-K 2.02 (plus fund
  shareholder reports). 20-F is in `wanted` (`:365-370`) but can only ever be a `filing`. 40-F is
  not in `wanted` at all, although `EventList.tsx:318` (`FORM_RE`) already parses it. Foreign
  private issuers in the committed index include BABA, TSM, ASML, SAP, TM, SONY and SHOP. BABA is
  `check:feeds`' default subject; its 2026-09-28 live run returned 362 SEC rows (NC-031), none of
  which can be typed `earnings`.

**Who benefits and how:**
- **Every company-page reader.** The 8-K is the form that announces things: an officer change, a
  material contract, a completed acquisition, an auditor change, a restatement warning (4.02), a
  bankruptcy (1.03). Today each reads "8-K filing", and a run of them collapses into a filing stack
  summarised as "8-K ×4" (`EventList.tsx:321-331`). This is the README's stated job — "so analysts
  can spot what sparked a move" (`README.md:3-5`) — on data already in the database.
- **Readers of foreign issuers** get an Earnings chip and earnings markers. `BiggestMoves` gives
  `earnings` the highest priority of any company event kind when pairing a move with a catalyst
  (`components/BiggestMoves.tsx:34`); on a 20-F filer that rank is never used.

**Cost:** none — no key, licence or recurring charge.
**Effort:** small, about half a session.
- A table of the current Form 8-K item codes (1.01–9.01) mapped to plain labels. The most material
  item leads the title, 9.01 (exhibits) never does, and the raw codes stay in the description for
  traceability.
- Pre-2004 8-Ks used a different item numbering; a code outside the table keeps today's
  "8-K filing" rather than being guessed at.
- 20-F and 40-F become "Annual report (…)" typed `earnings`. **6-K stays a `filing`:** the
  submissions list does not say whether a given 6-K carries results, and claiming it would be a
  guess.
- Cases in `check:parsers` (or a new `check:sec-forms`).
- The title is part of the content hash, so the next scheduled refresh re-titles stored rows, as
  NC-155 did for dividends. Explanations citing a re-titled 8-K regenerate on the next
  `npm run explain` — a few cents under the $1 cap.

**Depends on:** nothing. Pairs naturally with proposal 2.

**Buildable by:** a cloud session, fully offline. The `items` field is already proven live — the
8-K 2.02 earnings rule depends on it and worked in the 2026-08-12 and 2026-09-28 live runs. A
`check:live` assertion that a real 40-F carries that form string can be added for the production
host.

*Importance:* high — makes the most informative filing on every company page readable, and gives
foreign issuers earnings parity · *Efficiency:* very high — one function (`filingsFromBlock`), data
already stored · *Practicality:* high — offline, additive, and the re-ingest heals stored rows

---

## 2. Keep the material forms EDGAR already sends — amendments, M&A, ownership stakes, offerings, delistings · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** PENDING — mark `APPROVED` / `REJECTED` / `DEFERRED`
**Owner's reason (if rejected):**

**Anchor:** data already ingested but never shown · an explicit gap named in a strategy document.

**What:** Widen the form filter in `filingsFromBlock` from its 17 forms to a curated set of the
material forms already present in each submissions record, choosing the set from a one-off live
count of which forms those records actually carry.

**Grounded in:**
- **Fetched, then mostly thrown away.** `lib/sec.ts:446-448` records that, beyond Ford's recent
  block, "two shards hold 3,431 more filings going back to 1994". The measured result after the
  shard work is **937 filings kept** (`docs/MASTER-CHECKLIST.md:631`). Roughly three rows in four
  of a record the scheduler already downloads are dropped by `wanted` (`lib/sec.ts:365-370`) and
  never stored.
- **The UI was built for forms the adapter never admits.** `EventList.tsx:318` parses 13D/G, 424B,
  40-F and S-/F- registrations to summarise filing stacks; of those, only S-1 can arrive.
- **The scope says to.** "Post as many reports and articles as the sources honestly allow for
  publicly traded companies, mutual funds, ETFs, and other exchange-traded securities"
  (`docs/MASTER-CHECKLIST.md:566-567`). These are the company's own primary documents, from a
  public-domain source already cleared and on the ingest path, at zero extra requests.
- **Candidates to test against the count:**
  - amendments: 10-K/A, 10-Q/A, 8-K/A (a 10-K/A is often a restatement);
  - 10-K405, the annual-report variant used until 2002 — which the deep shards reach;
  - M&A: S-4, DEFM14A, SC TO-T, SC 14D9;
  - activist stakes: SC 13D(/A), if EDGAR lists them under the issuer (the count will tell);
  - offerings: 424B*, S-3;
  - exits: 25-NSE (delisting), 15-12B (deregistration).

**Who benefits and how:** Readers of long-history companies — the case `docs/COVERAGE-MAP.md:55-62`
describes — get restatements, mergers, activist stakes and offerings on the timeline: among the
most price-relevant documents a company files, sitting in a response already paid for.

**Cost:** none — no key, licence or recurring charge.
**Effort:** small to medium.
1. A count script tallying `form` across a handful of real records (F, AAPL, BABA, SHOP, VOO, SPY;
   the recent block plus shards).
2. The owner picks the list. **The one real decision is Forms 3/4/5 and 144 (insider trades):**
   probably the bulk of what is discarded and genuinely informative, but they would swamp a
   timeline. Exclude them, or admit them under their own chip or aggregated by week — a separate
   call.
3. Labels, `earnings`/`filing` typing and `check:parsers` cases. The existing filing-stack
   condensation absorbs the extra rows.

**Depends on:** step 1 needs a host that reaches data.sec.gov. Proposal 1 landing first, so new
8-K/A rows inherit the item labels.

**Buildable by:** split. The count needs the owner's host or a cloud session whose proxy allows
sec.gov (the 2026-09-28 sessions could; this one cannot). Everything after it is offline cloud
work. The step-2 list is an owner decision.

*Importance:* high — the largest zero-cost depth gain left in the securities corpus ·
*Efficiency:* high — same response, same function · *Practicality:* medium — blocked on one live
count and one owner choice

---

## 3. "Did you mean": fuzzy-match the committed EDGAR index when a search finds nothing · proposed `P1` · target section: Initiative: Search accuracy · `P1`

**Status:** PENDING — mark `APPROVED` / `REJECTED` / `DEFERRED`
**Owner's reason (if rejected):**

**Anchor:** a capability present for one subject type and missing for a comparable one (held
subjects get fuzzy matching; not-yet-held securities do not) · a dead-end user path.

**What:** When a query resolves to nothing, offer up to three near matches from the committed
EDGAR index — companies and fund series — through the chooser NC-039 already built. Never route
on resemblance alone. Treat "&" and "and" as the same.

**Grounded in:**
- **Fuzzy matching exists only for what we already hold.** `findCandidates`
  (`lib/store/read.ts:169`, `word_similarity` at `:195`, db/020) recovers "forde" → Ford — but only
  when Ford is in the corpus.
- **The committed index is matched exactly or by prefix only** (`lib/sec.ts:156-177`, `:208-228`),
  and that index is where every security not yet ingested is found.
- **Counted offline in `data/edgar-tickers.json`: 352 of 10,387 company titles contain "&"** —
  "JOHNSON & JOHNSON", "PROCTER & GAMBLE Co", "ELI LILLY & Co", "AT&T INC.". "Johnson and Johnson"
  matches nothing unless JNJ is already held; nor does any misspelling of a company not yet
  ingested.
- **Where those queries end:** `resolvedBy: "unresolved"` (`lib/resolveSearch.ts:168-178`) and the
  generic "That didn't match a listed security" (`components/SearchBox.tsx:58`) — a dead end at the
  front door, for a security the site could have answered.
- **Extends NC-039 and NC-040.** NC-039's chooser lists only held candidates. NC-040 left
  "S&P 500" falling through to S&P Global (SPGI), and the checklist says that "needs on-screen
  disambiguation (NC-039) or an owner decision on an alias" (`docs/MASTER-CHECKLIST.md:112-114`).
  New here: when the fund-name rung finds several funds (`lib/sec.ts:218`), offer them rather than
  falling through to prefix salvage.

**Who benefits and how:** First-time visitors typing a name the way people say it. Each such
query is a lost visit on the main entry point today, and `npm run search-report` already counts
them, so the effect is measurable after launch.

**Cost:** none — no key, licence or recurring charge.
**Effort:** small to medium, one session.
- Trigram or word similarity in-process over about 29,500 names (10,387 company titles, 19,141
  series names) — milliseconds per unresolved query. In-process keeps today's property that the
  index answers with the database down.
- A `suggested` search rung: one migration shaped like db/025.
- Cases in `check:tickers` (still no request made) and `check:search-log`, plus a `check:ui` case
  for the offered list.

**Depends on:** nothing. Improves as NC-051 keeps the index fresh.

**Buildable by:** a cloud session, fully offline — the index is committed, and the chooser and its
checks exist.

*Importance:* high — the front door, on securities the site can answer · *Efficiency:* high —
reuses the chooser and the committed index · *Practicality:* high — offline, and because it
suggests rather than routes, a weak match costs one extra click instead of a wrong page

---

## 4. Federal Register documents that name the company, on the company's page · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** PENDING — mark `APPROVED` / `REJECTED` / `DEFERRED`
**Owner's reason (if rejected):**

**Anchor:** a capability present for one subject type and missing for a comparable one (industries
have Federal Register events, companies have none of their own).

**What:** Add `federal_register` to the company sources. Search for the company's common name and
keep only documents whose **title** names the company — an ITC investigation naming it as
respondent, an FTC or SEC order, an export-control listing, a FERC or NRC order on a utility, an
airworthiness directive on a manufacturer's aircraft.

**Grounded in:**
- **Only industries call it.** The adapter runs from `ingestIndustry` alone
  (`scripts/ingest.ts:581-609`; `check:wiring` records that single call site at
  `scripts/check-wiring.ts:61`). `COMPANY_SOURCES` (`scripts/ingest.ts:62-70`) does not include it.
- **Everything else exists.** The adapter, its 24-hour window (`lib/ingest/refresh.ts:31`) and its
  quota note (`lib/ingest/quota.ts:41`) are in place. Its payload was confirmed live on 2026-08-12
  (60 rows) and 2026-09-28 (19 rows for BABA's sector).
- **This does not reopen a decided point.** `README.md:56-58` attaches *sector keyword* hits to the
  industry — "an export-control rule is a semiconductor event that happens to matter to Nvidia,
  not an Nvidia event". A document whose title names Nvidia *is* an Nvidia event.
- **Title-naming also keeps these out of the deliberately-unscored bucket** (`README.md:64-68`):
  the relevance layer's existing mention rules (`lib/enrich/relevance.ts`) can score them
  deterministically. A full-text-only hit is dropped, not stored unscored.

**Who benefits and how:** Readers of regulated companies get dated regulatory actions about this
company, from a public-domain source, at no cost. **I cannot size it per company without a live
query:** for aircraft makers, utilities and frequent ITC respondents it will be many documents,
for most companies few.

**Cost:** none — no key, licence or recurring charge. The Federal Register publishes no cap, and
this is ingest only, never the anonymous visitor path.
**Effort:** medium.
- A per-company query, the title filter and a per-run cap.
- Read company and sector events by event id, so a document linked to both is listed once on the
  company page. `lib/page-data.ts:187-193` merges `loadEvents` and `loadSectorEvents`, which key
  the same row differently.
- An updated `check:wiring` reason and a `check:live` case.
- **The owner decision is materiality:** airworthiness directives alone could run to hundreds a
  year on one manufacturer. Cap them, give them their own chip, or exclude the agency.

**Depends on:** nothing in code. Noise can only be measured live.

**Buildable by:** a cloud session builds and checks it offline against fixtures in the existing
adapter's shape. The noise and volume measurement needs live Federal Register access (the owner's
host), and the materiality rule is an owner decision.

*Importance:* high — a new class of company-specific primary-source events · *Efficiency:*
medium-high — adapter, window and scorer exist; the new work is the filter · *Practicality:* medium
— a live measurement and a materiality rule before it ships

---

## 5. Company pages show the Wikipedia lede their ingest already fetches · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** PENDING — mark `APPROVED` / `REJECTED` / `DEFERRED`
**Owner's reason (if rejected):**

**Anchor:** data already ingested but never shown · a capability present for one subject type and
missing for a comparable one.

**What:** Store the summary and article title the company's Wikipedia pass already returns, and
render them above the company timeline with the existing, credited `TopicSummary` component. Add
the summary to the page's JSON-LD `description`.

**Grounded in:**
- **Fetched, then discarded.** `ingestCompany` calls `getTopicTimeline(name)`
  (`scripts/ingest.ts:442`), which returns `summary` and `title` (`lib/wiki.ts:121-128`; computed at
  `:513-517`). Only `found.events` is used (`scripts/ingest.ts:459-466`). The company upsert
  (`:369-377`) never receives a summary or a Wikipedia title.
- **Every other subject kind stores one:** topics (`:310`), sectors (`:632`), crypto assets
  (`:653`). `loadSubject` already reads `summary` for every subject (`lib/store/read.ts:232`).
- **Only topic pages render it**, with its CC BY-SA credit (`app/topic/[slug]/page.tsx:83`,
  NC-047). `CompanyPageData` has no field for it (`lib/page-data.ts:51-59`), and the company page
  carries no prose at all — name, price, timeline (`app/company/[ticker]/page.tsx:81-138`).

**Who benefits and how:**
- Readers get one paragraph of "what is this company" before forty filings.
- Search engines get the only unique prose on the site's most numerous page type — the README's
  stated purpose is to "drive traffic and ad revenue" (`README.md:7`).

**Cost:** none — no key, licence or recurring charge. The CC BY-SA credit comes with the component.
**Effort:** small. **One honest caveat:** `getTopicTimeline` prefers a "History of …" article, so
the lede will often be the first paragraph of "History of Ford Motor Company" rather than of "Ford
Motor Company". The credit names the article it came from, which keeps it truthful; the owner may
want it framed as history. Store it only when the title passes
`articleAnswersSlug(commonName, title)` (`lib/wiki.ts:451`). The company path applies no such
check before using the story today, and a prominent lede would make a wrong match far more visible
than a buried history row.

**Depends on:** nothing.

**Buildable by:** a cloud session, offline — the seed, `check:ui` (credit present, as for topics)
and `check:index`. Looking at a few real ledes needs Wikipedia, so the owner's host.

*Importance:* medium — on every company page, and an SEO lever · *Efficiency:* very high —
fetched already, component exists · *Practicality:* high — additive; with no summary the page is
today's page

---

## 6. Sector-relative performance on company and sector pages · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** PENDING — mark `APPROVED` / `REJECTED` / `DEFERRED`
**Owner's reason (if rejected):**

**Anchor:** a capability present for one subject type and missing for a comparable one (the sector
page has signals, the company page has none) · data already computed but never shown.

**What:**
- **On a company page:** its return against the sector median over a stated window, with the
  member count beside it, and each peer linked to `/compare?a=<ticker>&b=<peer>`. Plus the
  company's own news-volume spikes, through the existing `SignalPanel`.
- **On the sector page:** every member's return against the median, not only the single outlier.

**Grounded in:**
- **Computed for everyone, published for one.** `priceDivergence` returns every member's return
  over a common window; `computeSignals` publishes only the worst
  (`lib/signals.ts:284-301`). The README's flagship output, "INTC lagged the sector by 172.3
  points" (`README.md:176`), therefore appears only on `/industry/sic-3674` — never on
  `/company/INTC`.
- **The panel exists, the API accepts a ticker, the company page does not mount it.**
  `SignalPanel` is on the industry page (`app/industry/[slug]/page.tsx:93`) and custom groups
  (`components/GroupView.tsx:99`). `/api/signals` already takes `tickers=`
  (`app/api/signals/route.ts:22-27`, `:59-66`), so a one-ticker scope already works.
- The company page names its sector and "N tracked" (`app/company/[ticker]/page.tsx:101-114`) but
  offers no comparison against it.

**Who benefits and how:** An analyst on a company page, whose first question after "what
happened" is "was it the stock or the sector". The peer links also give the company page a route
into `/compare`, which is reachable today only from the site header.

**Cost:** none — no key, licence or recurring charge.
**Effort:** small to medium.
- Return the per-member figures from `computeSignals` (or a new field on `/api/signals`).
- A company-page row plus `SignalPanel tickers={[ticker]}`; a member table on the sector page.
- Data honesty: the existing three-member rule withholds the figure below three members, and the
  member count and window travel with every number, so "the sector" never silently means two
  companies. The seed needs a third `sic-3711` member to exercise it.

**Depends on:** nothing.

**Buildable by:** a cloud session, offline against a seeded Postgres (`check:signals`, `check:ui`).

*Importance:* medium — answers a core analyst question with a number the code already computes ·
*Efficiency:* high · *Practicality:* high

---

## 7. Route topic pages to the securities they share events with · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08), beside NC-008

**Status:** PENDING — mark `APPROVED` / `REJECTED` / `DEFERRED`
**Owner's reason (if rejected):**

**Anchor:** data already ingested but never shown · a dead-end user path.

**What:** On a topic page, a "Securities in these stories" line built from the topic's events that
are also linked to a held company (relevance-gated on both links). Each entry goes to the company
page and to the existing topic-over-price compose, `/compare?a=<topic>&b=<ticker>`. Mirror it on
company pages as "Topics that share events".

**Grounded in:**
- **Stored, counted, never read.** Cross-subject links live in `event_subjects` and are measured —
  "280 events carry 351 subject links" (`README.md:480-482`) — but no page reads an event's
  *other* subjects.
- **The dead end.** The topic page offers no route to any security
  (`app/topic/[slug]/page.tsx:83-85`: summary, explorer, sources, ads). Under the scope refocus,
  that is the wrong place for topic traffic to stop.
- **The landing already exists.** The compose these links would open was built for exactly this
  question ("Topic timeline pegged to a company's stock price", `docs/MASTER-CHECKLIST.md:2340`).
  Today it is reachable only from the dormant FocusBar or by typing both names into `/compare`.
- **Related to NC-008, not part of it.** NC-008 makes *search* produce a security narrowed by a
  concern. This is a navigational entry to the same intersection, from stored links, with no
  parsing.

**Who benefits and how:** Topic visitors get a route to securities pages, where the product's
core value and most of its ad slots are. **Worth building, but I cannot size it:** the overlap
depends on how many relevance-passing events carry both kinds of link. One SQL count on the
production database answers that before any UI is built.

**Cost:** none — no key, licence or recurring charge.
**Effort:** small to medium — one grouped query, one strip per page, a shared event in the seed.

**Depends on:** a production count confirming the overlap is worth showing.

**Buildable by:** a cloud session builds and verifies it offline on a seeded database. The
go/no-go count needs the owner's database.

*Importance:* medium, uncertain until counted · *Efficiency:* high · *Practicality:* high

---

## 8. Fund pages name their sibling funds · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** PENDING — mark `APPROVED` / `REJECTED` / `DEFERRED`
**Owner's reason (if rejected):**

**Anchor:** data already ingested but never shown · a dead-end user path.

**What:** On a fund's page, list the other series filed by the same registrant — "Other funds from
Vanguard Index Funds: VTI, VTV, VUG, VO, VB, …". Held funds are plain links; funds not yet held are
marked as such and carry `rel="nofollow"`.

**Grounded in:**
- **In the committed index, read only for resolution.** `seriesCiks` gives every series' registrant
  (written by `npm run sync:tickers`; read only at `lib/sec.ts:208-228`). Counted offline: **829 of
  1,163 registrants have more than one series**, and VOO's registrant (CIK 36405) has 11 siblings —
  VTV, VXF, VUG, VV, VO, VB, VBK, VBR, VTI, VOT, VOE.
- **The page raises the question and stops.** Every fund filing tells the reader it "may concern a
  sibling fund" (`lib/sec.ts:423`, NC-139) and never says which funds those are.
- **The only related-subject route is the Sector line** (`app/company/[ticker]/page.tsx:101-114`),
  which needs an SIC code from EDGAR. Whether fund trusts carry one I could not confirm from here;
  the sibling list does not depend on it.

**Who benefits and how:** ETF and mutual-fund readers — a named part of the scope — get the one
honest "related" relationship the data supports: same registrant, per EDGAR. Not "similar funds",
which would be a judgement.

**Cost:** none — no key, licence or recurring charge.
**Effort:** small. Unheld siblings are marked honestly, per the checklist's own lesson that "a
suggestion is a promise about what is here" (`docs/MASTER-CHECKLIST.md:1387-1393`); `nofollow`
keeps crawlers from walking the index into first-visit gathers, which the attempt ledger bounds
anyway.

**Depends on:** nothing.

**Buildable by:** a cloud session, fully offline (committed index, a seeded fund).

*Importance:* low-medium · *Efficiency:* high · *Practicality:* high

---

## 9. EDGAR's own former names — dated rename events and search aliases · proposed `P2` · target section: Search engine — first-visit ingest, recall, relevance (2026-08-07), beside the alias-harvesting item (NC-004)

**Status:** PENDING — mark `APPROVED` / `REJECTED` / `DEFERRED`
**Owner's reason (if rejected):**

**Anchor:** data already ingested but never shown.

**What:** Read `formerNames` from the submissions record the scheduler already downloads. Write
each former name as a subject alias — so "Facebook" finds a held META — and add a dated
"Renamed from …" event.

**Grounded in:**
- **Parsed, then dropped.** `getFilingsDeep` and `getIndustry` fetch
  `data.sec.gov/submissions/CIK….json` (`lib/sec.ts:327`, `:460`) and read only `name`, `sic`,
  `sicDescription` and the filing arrays (`:333-334`, `:470`).
- **Extends NC-004** (aliases from Wikidata; aliases are otherwise written only from searched slugs
  and the demo seed). New here: this source is already in hand at zero requests, authoritative (the
  registrant's own filing history) and dated — and needs no Wikidata, so it is unaffected by
  Wikidata being unreachable.
- ⚠ **The field is not referenced anywhere in this repo**, so its shape is my knowledge of the SEC
  API, not something the code has seen. Per the 2026-08-12 lesson — "a fixture written from an
  assumption can only confirm that assumption" — step one is pinning a fixture from a real record.

**Who benefits and how:**
- Searchers who type the name people remember (Facebook, Square, CenturyLink, Anthem), for
  companies already held.
- Readers, who see a rename as the corporate event it is, instead of filing titles silently
  switching names partway down the timeline.
- Limit: a rename that came with a new CIK (Google → Alphabet) is not covered.

**Cost:** none — no key, licence or recurring charge. (A sync-time harvest for companies not yet
held would cost about 10,000 requests per sync, and is out of scope here.)
**Effort:** small. The owner picks the event kind — `corporate_action` would mean renaming the
"Splits & dividends" chip.

**Depends on:** one real record from data.sec.gov.

**Buildable by:** the owner's host, or a cloud session that reaches sec.gov, for the fixture; the
rest offline. The event kind is an owner decision.

*Importance:* low-medium · *Efficiency:* high · *Practicality:* medium — unverified field

---

## 10. "Biggest moves" on priced topic pages (crypto) · proposed `P2` · target section: Initiative: On-chain events in the timeline engine · `P1` (Cross-cutting)

**Status:** PENDING — mark `APPROVED` / `REJECTED` / `DEFERRED`
**Owner's reason (if rejected):**

**Anchor:** a capability present for one subject type and missing for a comparable one.

**What:** Mount `BiggestMoves` in `TopicExplorer` when the topic has prices, as `CompanyExplorer`
does.

**Grounded in:**
- `TopicExplorer` renders the price chart for priced topics (`components/TopicExplorer.tsx:293`)
  but not `BiggestMoves`, which only `CompanyExplorer` mounts (`components/CompanyExplorer.tsx:223`).
- **The panel was written for crypto too.** Its catalyst table carries `exploit: 6` ("if a protocol
  was exploited near a big move, that is the explanation"), `onchain: 3` and `governance: 3`
  (`components/BiggestMoves.tsx:40-45`). Those kinds never occur on a company page, so that logic
  is unreachable today.

**Who benefits and how:** Readers of BTC, ETH and other priced crypto topics get the same "what was
happening around each big move" panel stock readers have.

**Cost:** none — no key, licence or recurring charge.
**Effort:** tiny — one mount and a `check:ui` case.

**Depends on:** an owner call on scope. This is topic infrastructure, which the 2026-08-08 refocus
ranks behind securities work. **`DEFERRED` is a reasonable answer**; it is listed because it is
anchored and nearly free.

**Buildable by:** a cloud session, offline.

*Importance:* low (outside the current scope) · *Efficiency:* very high · *Practicality:* high

---

## Considered and cut

- **An earnings-reaction figure on each earnings row** (the close-to-close move across the report).
  Computable from stored prices, but beside a filing it reads as cause — the very copy NC-169
  removed — and `BiggestMoves` already covers the move-to-event direction. No anchor beyond
  preference.
- **Flagging unusual trading-volume days.** Volume is ingested *and shown* (the off-by-default
  overlay, `docs/MASTER-CHECKLIST.md:2079`), so it fails "never shown"; picking days from it is a
  preference no document asks for.
- **SEC XBRL financial facts (EPS, revenue) on earnings rows.** Same cleared host, but a new
  endpoint and a new data product — financials, not reports or articles — and no document names it.
- **The attestation count as a ranking input** (`docs/EVENTS-SCHEMA.md:52-55` calls it "a ranking
  input the AI layer gets for free"). Only two news feeds are ingested, so counts above one are
  rare. Worth revisiting if a licensed feed is bought (NC-013–NC-020).
- **Storing `wikidata_qid`.** The schema column is never written, and `getOfficialDomain` fetches
  the QID and drops it (`lib/wikidata.ts:16`). Genuinely unsurfaced, but it is plumbing for NC-004
  rather than anything a reader sees; it belongs in NC-004's build.
- **A growth-of-100 chart of every sector member.** `PriceOverlay` is a two-line component;
  proposal 6's table answers the same question without a rewrite.
- **Server-side AI explanations of a company's big moves.** Spend that `docs/OWNER-ACTIONS.md`
  ("What I can keep building without you") advises holding, and it overlaps NC-079.
- **A forward earnings calendar.** No strategy or competitor document names it, and the dates
  would be estimates.
- **`/explore` filing ETFs and funds under "Companies".** Cosmetic.
- **Re-prioritisations.** None proposed. NC-051 (index re-sync) and NC-080 (macro overlay) are the
  open items closest to securities coverage; both are tracked with clear next actions, and both
  need network this session does not have.
- **Anything touching another product.** Nothing here reads, references or connects to another
  product's repository.

*One closing note, not a proposal* — noticed in passing, not investigated: `scripts/refresh.ts:93`
refreshes only `kind IN ('company','topic')`, so `ingestIndustry` (sector Federal Register rules)
never runs on schedule and `check:wiring` does not flag it; `docs/MASTER-CHECKLIST.md:1334` still
lists on-screen disambiguation as an open `P1` although NC-039 shipped it (line 367); and the
company page's JSON-LD types every security, funds included, as `Corporation`
(`app/company/[ticker]/page.tsx:74`).
