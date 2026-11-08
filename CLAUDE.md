# News Charts — Claude Code Project Guide

This file is auto-loaded by Claude Code at session start. It orients a session before it
touches anything; the deep documentation lives in `README.md` and `docs/`.

---

## ⛔ Scope rule — read this first

**This repository is `Savoy11/News-Charts` (for a time `Savoy11/chronolens`): a standalone
product.** It shares an owner — and nothing else — with the other products. Both names resolve
to this one repo; `scripts/check-boundary.ts` accepts either, and a further rename means adding
the new name to its `THIS_REPO_NAMES`.

1. **Never touch another product's repository from a session here.** Crypto-Stuff / CAEP /
   "Finance Now" (and its free-edition copy, `Savoy11/Finance-Now-Free`) are separate projects
   with their own repos, their own checklists, and their own sessions. This repo has exactly one
   git remote (`Savoy11/News-Charts`), no submodules, and no workflow that checks out another
   repository. Keep it that way — do not add a remote, a submodule, or a `repository:` override
   to reach a sibling project.
2. **No shared code, no runtime coupling.** The `Scope & independence` section of
   `docs/MASTER-CHECKLIST.md` rules the projects independent; this repo must build and run with
   the others absent. As of 2026-08-08 there is **no cross-promotion either** — the CAEP promo
   banner was removed and its slots now hold blank `AdSlot` placeholders, so nothing in the UI
   references a sibling product. Cross-promotion would be marketing rather than coupling and is
   not barred by the scope rule, but re-introducing it is an explicit owner decision, as is any
   deeper cross-project connection — never something to assume or add in passing.
3. **The work log for this repo is [`docs/MASTER-CHECKLIST.md`](docs/MASTER-CHECKLIST.md)** —
   prioritised backlog plus done log. Check the box in the same change that ships the work.
4. **This boundary is enforced by test, not just prose:** `npm run check:boundary`
   (`scripts/check-boundary.ts`, part of `npm run check`) fails if a submodule, foreign remote,
   cross-repo checkout, escaping import, or a stale path into another product's checkout
   appears. If you find an absolute Windows path in any doc here, it is a stale pointer
   inherited from another project's layout — treat it as a bug and fix it, don't follow it.

---

## What this is

**Exchange-traded securities on a timeline** — publicly traded companies, ETFs, and mutual
funds, with news, SEC filings, and earnings pegged to the price chart so analysts can spot what
sparked a move. The build scope (refocused 2026-08-08) is depth of coverage for listed
securities: as many reports and articles per security as the sources honestly allow. Topic
pages still exist for subjects already held (crypto assets, sector themes), but search resolves
securities, and new enhancement work targets securities coverage first — see "Scope refocus"
in the checklist. Built to drive traffic and ad revenue supporting the CAEP desktop app — a
business relationship, not a code one (see the scope rule). Business decisions made in Finance
Now sessions that bear on this repo (US-only, the D22 launch trigger, the affiliate stance, the
working pricing plan) are summarised in
[`docs/decisions/2026-09-28-business-decisions.md`](docs/decisions/2026-09-28-business-decisions.md)
— a summary, not the record.

**Prompt search is live (v2, 2026-10-20).** A question that names a security and a concern —
"how did covid affect Best Buy's stock price" — opens BBY's page with `?focus=covid`, its
timeline narrowed and ranked by the concern. `lib/resolveSearch.ts` runs `parseSearchPrompt`
(`lib/prompt.ts`) before the ladder, but never on a query that is already a security's or a held
subject's name ("Jack in the Box"); `lib/focus.ts` grades events by the focus words and reads
years as a date window; FocusBar and BestMatches show it. Other words for a common concern
("covid" → pandemic, lockdown) come from the curated list in `lib/concepts.ts` — read its rules
before adding to it; a loose synonym fills a narrowed page with unrelated events. A company's
other names — "Google" for Alphabet, "Facebook" for Meta, "P&G" — come from Wikidata through the
committed `data/company-aliases.json` (`npm run sync:aliases`); every rule about what may become a
name is in `lib/companyAliases.ts`, and an exact EDGAR title always outranks an alias. News may use
only the strongest of them — the company's own former names and a predecessor whose ticker it
carries, never an acquisition's or a loose alias (`newsNamesFor`): Sun's 1990s news is not Oracle's.
"Google" scores Alphabet's headlines but is never put in a GDELT query, which matches it in page
furniture everywhere (`gdeltNames` in `lib/news.ts`). The Federal Register company feed searches the
same names in one request and keeps a title only when it names one (`lib/frCompany.ts`); each year
back to 1994, or to the company's first price if later, is read once, under the EDGAR former names in use
that year (`lib/ingest/frBackfill.ts`),
and routine rail-board, FERC and NRC notices are grouped a row a month on the page. Every path
that scores a company's headlines — ingest, a first visit, `npm run score`, the backfill — takes its
names from one place, `companyScoringAliases` in `lib/scoringNames.ts`; build no second list. The
SEC's and the Justice Department's release rules, the SEC's case captions (`lib/secCases.ts`),
the Federal Reserve Board's releases (`lib/fedPress.ts`; its orders of 1996–2005 from the committed
`data/fed-orders-1996-2005.json`, each with its page's sentence naming every party, batch 99) and the CFPB's actions (`lib/cfpb.ts`) alone also read `lib/releaseNames.ts`: the securities units a bank owned, each between the days its
filings give (Merrill Lynch is Bank of America's from 2009-01-01), the other listed banks', brokers' and
managers' own banks, broker-dealers and advisers (`BANK_UNITS`, batch 88: Regions Bank, Ameriprise
Financial Services, Franklin Advisers…; batch 89: the units the CFPB charges, Capital One Bank, the
mortgage insurers…), and the notes records that take no release. Every one of these rules reads a
company from its first price on; the only names read before it are the units marked `beforeListing`
(the owner's calls b and c, batch 90; the owner's rule of 2026-11-05 that a case goes on every
company it involves, batch 93). It is not a scoring list; keep it that way. A whole name two different listed companies hold, as
everyday or legal name, names neither anywhere (`listedCompaniesNamed`, batch 109): `companyNames`
gives such a company its own legal name instead, or none ("Independent Bank", INDB's and IBCP's), and
headlines name it by its ticker; one group's two records keep theirs (`ONE_GROUP` in
`lib/sharedNames.ts`), and check:shared-names lists the twelve held now. A legal name is read in both
spellings of its form, "TORO CO" as "TORO Company" (`legalSpellings`, batch 111), and the two count as one
name. A caption names a company only by its name or its legal name with legal words after it; the namesakes that rule cannot tell apart were read by
hand and are listed by CIK in `NOT_THE_COMPANY` (one list each in `lib/secCases.ts`, `lib/fedPress.ts`,
`lib/cfpb.ts`, `lib/epaCases.ts`, `lib/cftc.ts` and `lib/cpscRecalls.ts`; batch 100 read every CPSC firm by hand). EPA and
the CPSC hold their own `UNITS` lists instead of the release map: a unit filed under its own name, on its owner's page
between the days the owner held it, each day read from a filing (Sunoco, Inc. on Energy Transfer, Graco Children's Products on Newell, batch 101;
EPA's operating units of 34 more companies, Chevron U.S.A. to Union Carbide, batch 104, with a branded station never the brand's unit and a joint venture no one's; the utilities' operating companies, Georgia Power to PSE&G, on 33 companies, batch 114; BNSF on Berkshire to Kennecott on Rio Tinto, 28 more companies' units, batch 120, a unit sold to another listed company on that company's page from the day, each day read from data.sec.gov's filing lists). A name holding "&" is read with "and" too by the caption rule every one of these sources shares (`andSpellings`, batch 120), and the table of taken names reads "AT AND T" as "AT&T". A fund's series is never a party to any of these five rules (`FUND_SERIES`): its page knows only its
series name, and "Growth Fund, Ltd." is a Ponzi scheme's fund, not American Century's. The
Justice Department's releases of 2001–2008, which its API does not hold, come from its archive's
month pages, each read once and kept (`lib/dojArchive.ts`, batch 94), under the same rule; a one-word
name that is an everyday word ("CITY", "TARGET") needs its legal word in a title written in
capitals, and as an object is the word after "the" or before "of" (`isEverydayWord`). EPA's
civil enforcement cases come from its whole case file, a zip read once a month (`lib/epaCases.ts`,
`lib/zip.ts`); a defendant is the company by the same caption rule, with two guards of its own ("…
Power and Light Company" is one name; "RETHERFORD, DANA" is a person), and money stays numeric. A
case EPA gives no penalty total takes its one settlement's, the row names the work ordered ("among N
parties" on a settlement of several) and carries EPA's own summary when it says something (batch
113, `summaryOf`); text is stored without control characters, since a NUL made Postgres refuse the
whole month's read. The
CPSC's recalls (`lib/cpscRecalls.ts`) go on every listed company a recall names: its makers,
importers and distributors by the caption rule, its stores as whole items of the "Sold at" line, a
store's recalls of other makers' products grouped a row a month. The
CFTC's actions (`lib/cftc.ts`) are read by the Justice rule with the release map's units, plus the
Commission's object form ("CFTC Orders UBS to Pay") and four guards of its own; read its header first.

The SEC News Digest of 1956–1993 (`lib/secDigest.ts`, batch 102) is read once, issue by issue, into
db/040's tables (`lib/ingest/secDigestWalk.ts`), and each company's own entries are found there at
its ingest. Its names are dated by the committed `data/digest-records.json` (`npm run
sync:digest-records`): a company is in the Digest only under the names its EDGAR record, or a
mapped predecessor's, had by 1996, and an entry two companies' names claim on its day is neither's.
The walk needs `NEWS_CHARTS_CONTACT` and poppler's `pdftotext` on the host.

The FDA's new-drug approvals since 1985 (`lib/fdaApprovals.ts`, batch 105) come from a committed
workbook read once a year (`npm run sync:fda-approvals`, `lib/xlsx.ts`): an approval is the page of
the company that applied, by the caption rule, the recall map's firms (`FDA_FIRMS`) or the names only
approvals use (`APPLICANT_NAMES`), each on its days; an acquisition's past is never the buyer's.
Their later efficacy supplements (`lib/fdaSupplements.ts`, batch 115) come from Drugs@FDA through
openFDA, a committed file read monthly (`npm run sync:fda-supplements`): a supplement is a page's only
where the drug's holder never left the company (`holderKept`: today's sponsor is the applicant by
name, a name of the company, or one of `SPONSOR_SPELLINGS`), then by the same rule on its own day;
its title says only "an efficacy supplement", never "new indication".

A row of one of the eight multi-party sources (DOJ, the SEC's two, the Board's, CFPB, EPA, CPSC,
CFTC) says which other held company pages carry the same case: "Also on Ford Motor, General Motors
and 25 more" (`lib/alsoOn.ts`, batch 106). A case is the same source's same number, compared as a set
for a grouped row (db/041's index, with no pending list since db/042, batch 111: a GIN index's queue made
every lookup read it); a release held once on several pages counts too. A page's links are found by
db/042's `event_subjects (subject_id)` index; the key begins with the event. It is read
beside `loadEvents` and never breaks a page; adding a multi-party source means adding it to
`ALSO_ON_SOURCES`, `ALSO_ON_SOURCE_IDS` and db/041's list, which check:also-on holds together. A row
whose case numbers are joined (EPA, CPSC, CFTC, SEC cases, CFPB, the Digest's months) is stored again
when its list grows, so its versions count once in "· N sources" (`GROUPED_ROW_SOURCES` in
`lib/corroboration.ts`, batch 107); a new source that joins numbers goes there too, and check:also-on
finds one that does not.

A ticker whose company moved to a new SEC record — a holding-company reorganisation or redomicile
(XOM in 2026, Alphabet in 2015, Disney in 2019) — reads its earlier filings from the predecessor's
record up to the handover day, through the hand-checked map in `lib/predecessors.ts`; read its
header before adding an entry. Merck's is a merger the other way round (batch 108): MRK's record was
Schering-Plough's until it took old Merck's name and ticker on 2009-11-03, so old Merck's record is
MRK's history; the record's own past before it, Schering-Plough's filings, cases, approvals and
Digest entries, stays on the page labelled as Schering-Plough's (`OWN_RECORD_FROM`,
`ownPastLabelled` at read time, batch 110, the owner's call); Stratasys's and Waste Connections's are
the same (batch 118: Objet's and Progressive Waste's records took their names and tickers, and the
charts are the old companies', as Yahoo's splits show). The reverse, a record that took another
company's name, never takes that company's past: one table, `TAKEN_NAMES` in `lib/takenNames.ts`
(batches 117–118: 32 records; SBC's took AT&T's name, ACE's Chubb's, Norwest's Wells Fargo's, TGC's
Dawson's…, each day read from a filing), refuses a row before the day that names only the taken name
and none of the record's own names of then. Every caption rule reads it (`takenBefore`), ingest
drops such rows from every source found by name, news and the Federal Register included
(`withoutTakenNames`), a page and its "Also on" leave stored ones off (`hiddenAsTaken`), and the
Federal Register's years and GDELT's months before the day are asked under the record's own name
of then (`thenNameIn`; a record with none of its own, Linde plc's, keeps the present name,
`noOwnNameBefore`); the record's own filings and prices are never read this way
(`OWN_RECORD_SOURCES`). Add a takeover there, never as one source's entry; check:taken-names holds it
to the committed scan of 173 renamed records (`scripts/fixtures/taken-names-scan.json`). A case
source's answer is complete when it is built from data kept whole (`FetchResult.complete`), and a
run then takes the company off that source's stored rows its rules no longer give it (`unlinkGone`,
check:unlink); an answer from a capped API or a live feed is not.

A fund's CIK is its trust's, and the trust files for every fund it sells. Which filings are a fund's
own comes from the filing list EDGAR keeps for its series (`lib/fundSeries.ts`; the id is in
`data/edgar-tickers.json`), read at ingest: a sibling's are not linked to the fund. The stored row
keeps the trust's name, since one row serves every sibling's page; the fund's page shows its own
under its name, at read time (`loadEvents`). The lists begin in February 2006, so older trust
filings keep their hedge.

## Stack & layout

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router, React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS 4 — v3's colours, fonts and line heights pinned in `app/globals.css` |
| Database | Postgres via `pg` — plain SQL migrations in `db/` (`npm run db:migrate`) |
| Charts | lightweight-charts + hand-rolled SVG timelines |

```
app/          # pages: /, /company/[ticker], /topic/[slug], /industry/[slug],
              #   /group/[name], /compare, /explore, /following + app/api/* routes
components/   # HorizontalTimeline, PriceTimeline, PriceOverlay, EventList, …
lib/          # data layer: prices, sec (EDGAR), signals, suggestions, markers,
              #   onchain/*, ai/*, store/*
db/           # numbered SQL migrations (001_…)
scripts/      # ingest / score / signals / backup + the check-*.ts suite
docs/         # MASTER-CHECKLIST.md (work log), EVENTS-SCHEMA.md, COVERAGE-MAP.md,
              #   OWNER-ACTIONS.md, audits/, proposals/
```

## Commands

```bash
npm run dev              # http://localhost:3000
npm run check            # full offline check suite (parsers, dates, markers, …, boundary)
npm run check:boundary   # repo-boundary checks alone
npm run db:migrate       # apply db/*.sql in order
npm run ingest -- …      # pull events for a subject (see README)
npm run sync:aliases     # rebuild data/company-aliases.json from Wikidata (after sync:tickers)
npm run sync:word-names  # rebuild data/english-word-names.json and data/shared-name-words.json (after sync:tickers)
npm run sync:digest-records # rebuild data/digest-records.json from EDGAR's 1993–1996 indexes (after sync:tickers)
npm run sync:fda-approvals  # rebuild data/fda-nme-approvals.json from the FDA's workbook (once a year, in the spring)
npm run sync:fda-supplements # rebuild data/fda-supplements.json from openFDA's Drugs@FDA file (monthly, and after sync:fda-approvals)
```

The `check-*.ts` scripts in the `check` chain are offline by construction (network/fetch is
mocked where needed) — safe anywhere, including CI. When adding a verification, follow that
pattern: a `scripts/check-<thing>.ts` wired into the `check` chain in `package.json`. Three are
deliberately outside the chain because they need more than the code: `check:live` and
`check:feeds` call the real services, and `check:ui` drives a browser against a running server.

## Key invariants

- **Licensing:** several news sources are on non-commercial free tiers. `COMMERCIAL_MODE=true`
  withholds them (enforced by `check:commercial-mode`); it must be on in any environment
  someone other than the owner can load — a private preview included — before the first such
  page load (D22, applied 2026-10-19; open `P0` in the checklist).
- **Events schema:** `docs/EVENTS-SCHEMA.md` is the spec — subjects, events, documents are
  three separate axes; enrichments degrade pages, never break them.
- **Money is numeric, never float** — same rule as the schema doc states.
- **The checklist is the single work log.** A checklist that overstates what is left is as
  misleading as one that overstates what is done.
