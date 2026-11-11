# What needs you

**A view of `docs/MASTER-CHECKLIST.md`, not a second checklist.** Deliberately no checkboxes here
— items are ticked in the master checklist, and two lists that can disagree are worse than one
long one. This exists because that file is ~1,100 lines and mixes work that can be done in a
build container with work only you can do. This is the second kind, in the order I'd do it.

**Last updated:** 2026-11-05 (batch 100)

---

## 1. Verify, before deciding anything (~30 min)

Nothing below this line can be judged until this is done. **No adapter in the last 23 commits has
ever made a live request** — egress is blocked from the build container by policy, so every
payload shape comes from published documentation and is pinned against canned responses. The
checks prove the parsing, not the endpoints.

> **Partly overtaken by events, 2026-08-12.** Egress from the build container is now mostly open,
> and the keyless feeds have been exercised live for the first time: Yahoo **prices**, Wikipedia,
> SEC EDGAR, Federal Register, Internet Archive, Snapshot and DefiLlama all answer, and their
> payloads parse. Still blocked here: Yahoo's **news** RSS host, the Wayback CDX host, and
> Wikidata; GDELT answers but throttles hard. **It found a real defect on the first call** — every
> year-only Internet Archive item was being drawn on a specific 1 January — which is the argument
> for §1 rather than against it. Two things are unchanged and still yours: **the licensing half
> below is untouched by any of this**, and this should still be run **from the production host**,
> because several sources behave differently from datacenter IPs. See the correction table at the
> top of the master checklist.

```bash
npm run check:live -- --strict # pass/fail: each keyless source asked a question with a known answer
npm run check:feeds            # defaults to BABA
npm run check:feeds NVDA       # a second company
npm run check:feeds bicycle    # a topic — different code path
npm run verify:addresses       # the on-chain address book, against the chain
```

`check:live` is the one that can fail (NC-038). It sorts every source into PASS, FAIL (it
answered wrong: a bug or a changed API), UNREACHABLE (no connection or a throttle) or SKIPPED (a
key is not set). `--strict` makes anything but PASS fail the run. On the production host that is
the bar: a source that cannot be reached from where the site runs is a launch problem.
`check:feeds` stays the per-subject report of what each feed returns.

Run from the **production host, not a laptop** — several sources behave differently from
datacenter IPs, and that is a checklist item in its own right.

Each feed reports one of three things, and the distinction is the point: `✓ N articles`,
`⚠ 0 articles` (reachable but empty — key or plan wrong), or `— no KEY set` (deliberately off).

**Three specific things to look at:**

| What | Why it matters |
| --- | --- |
| **Stablecoin + USDT supply** | Now on Etherscan's V2 API (the V1 address they used was retired — every supply timeline was empty, NC-054). Needs `ETHERSCAN_API_KEY`; run the ingest once with it and confirm rows arrive. |
| **BYO feed keys** (NYT/Guardian) | Needs a browser, not `check:feeds`. Settings → News feed keys → paste a real key → load a company page. **A CORS rejection looks identical to a wrong key: no articles, no error.** |
| **Governance + USDT** | `check:feeds` reports per space and per token, so a zero is visible rather than assumed. A wrong Snapshot space id returns an empty list that reads as a quiet month. |

## 2. Turn on the scheduler (blocks everything)

**First, set the build's contact address** (2026-11-05, batch 92): `NEWS_CHARTS_CONTACT=<the address
made for this build>` in `.env.local` on every host that runs ingest. Every request to a public
service sends it in its User-Agent (`lib/contact.ts`). The SEC refuses EDGAR requests that carry no
contact, so without it filings, the SEC's releases and its cases stop arriving. Your personal
address was removed from the code at your request and is not used anywhere.

**And install poppler's `pdftotext`** on the same host (batch 102): the SEC News Digest's issues are
scanned PDFs, and the walk reads their text with it. Without it the walk asks nothing and the
Digest's step reports an error each run; every other source runs as before.

`npm run refresh`, hourly. Cron, a GitHub Actions workflow, or the host's scheduler.

**Nothing runs this automatically yet.** Pages read the database — the only fetch on the page path
is one bounded gather the first time a subject is visited — so this is the only thing that
refreshes a chart — and a scheduler that is not running looks exactly like a
quiet news week. Until it runs, the corpus only changes when you run it by hand.

Before the first run on a new deploy, apply the schema: `npm run db:migrate` (db/021–039: the
October ledger batches and the sources of November — the SEC's and the Justice Department's
releases, the Board's and the CFPB's actions, EPA's cases, the CPSC's recalls and the CFTC's
actions each keep their own tables; 031, from batch 63, keeps which past years of a company's
Federal Register documents have been read).

```bash
npm run refresh -- --dry-run   # what it would touch, spending nothing
npm run refresh                # for real
npm run cost-report            # what it actually spent, against each free tier
```

## 3. The licensing decisions (the real blocker)

**Every free tier you are on is non-commercial.** Nine calls, each with three possible answers:
upgrade, drop the key at launch, or — for NYT and the Guardian only — ship BYO-key. Six are
decided (the aggregators, dropped on 2026-10-19); NYT, the Guardian and Yahoo remain.

| Source | Options |
| --- | --- |
| Newsdata, GNews, Currents, Marketaux, EODHD, Finnhub | **Decided 2026-10-19: drop at launch** — keep their keys out of production |
| **Guardian** | Commercial key, drop, **or BYO-only** |
| **NYT** | No self-serve commercial tier — negotiate, drop, **or BYO-only** |
| **Yahoo Finance RSS** | Gray zone. Read the ToS and settle it — it is flagged `commercialOk: true` today, so it keeps fetching on the assumption you have decided |
| **Yahoo Finance chart** (prices) | The same question for the price chart, which every company page leads with. Its own registry row since October (`yahoo_prices`), also `commercialOk: true` |

Two things worth knowing before you spend:

- **`npm run cost-report` prices only what ingest actually calls.** The six aggregators are not
  on the ingest path, so it reports what wiring each *would* cost rather than a bill. On
  2026-08-12 that projection put EODHD at its whole free tier by about five subjects, GNews at
  ~25 and Marketaux at ~16 — subject capacity is the number that turns a quota into a decision.
- **`docs/COVERAGE-MAP.md`: the aggregators add breadth to the present, never depth to the past.**
  The 1963–2017 stretch is the biggest hole in the corpus, and none of these six fill it.

## 4. Legal review

The `commercialOk` flags encode my practical reading of published terms. **That is not legal
advice**, and it is load-bearing — it gates what `COMMERCIAL_MODE=true` withholds. Worth a real
review before revenue.

**North Carolina review for the planned referral board** (recorded 2026-08-12; nothing is built,
so this blocks that initiative rather than today's launch). A **North Carolina attorney** needs to
cover: **RPC 7.4** "Intermediary Organizations" — which names an "online marketing platform"
explicitly and caps what a participating lawyer may be required to pay at "a reasonable sum
representing a proportional share of the organization's administrative and advertising costs";
**N.C.G.S. § 58-33-82** on paying unlicensed persons in connection with insurance, together with
the **anti-rebating statutes §§ 58-33-85 and 58-63-15**, which have not been read yet; and the
**NC CPA Board's referral-fee rules**. The same review should confirm the deliberate exclusion of
investment advisers — the registration-per-adviser-solicited requirement is why they are out of
scope, and it is the load-bearing assumption of the whole design.

**The listing-fee cost justification is yours to produce, and it is a document, not a number.**
RPC 7.4 permits only a flat fee proportional to real administrative and advertising costs — no
per-referral, no per-lead, no share of the professional's fees — so the fee schedule needs a
written calculation tying it to actual costs, kept current as those costs change. Without it the
fee is indefensible even if the amount happens to be reasonable. Constraints and the rest of the
design sit under **Planned initiatives — free planner & referral board** in the master checklist.

## 5. Launch mechanics

- **Buy the domain.** The name is settled.
- **Set `COMMERCIAL_MODE=true` before anyone but you loads the site** — any host others can
  reach, a private preview included. Your D22 call, applied here on 2026-10-19: the trigger is
  the first outside page load, not the first dollar, so the feed decisions in §3 have to be
  settled by then too. Built and tested, off by default — right on your own machine only.
- **Beta launch** is blocked on §1 and §3 above, and on nothing else.

- **Before the first ad or affiliate link.** The ad slots are blank placeholders — no ad network
  script loads today. Before one does: switch on `COMMERCIAL_MODE` and settle §3. Visitors' own
  API keys are handled (NC-164, 2026-10-19): set the network's script as `NEXT_PUBLIC_AD_SCRIPT_URL`
  and it loads only in browsers holding no key — never load an ad script any other way. Add the
  frame and connect hosts the network documents to the CSP in `next.config.mjs` with it. The disclosure page the affiliate item calls for
  ("How we make money") is not built, and there are no privacy or terms pages yet; settle what
  is needed with the review in §4.

## 6. One-time steps after deploying the October ledger fixes

```bash
npm run db:migrate                  # db/021–025
npm run explain                     # regenerate AI explanations under prompt version 2
npm run rekey:gdelt -- --dry-run    # GDELT rows to re-key or merge into the same story
npm run rekey:gdelt
```

- **Purge junk topics** created before NC-157 under wording their article does not contain, and
  their aliases.
- **Add a host or WAF rate limit**, and make sure the host overwrites `X-Forwarded-For` — the
  in-app limiter counts per server instance and trusts that header (NC-162).
- **Re-sync the EDGAR ticker index about monthly.** From a host that reaches sec.gov:
  `npm run sync:tickers`, commit `data/edgar-tickers.json`, redeploy. The index is built into the
  site, so this needs a rebuild; `npm run refresh` prints a warning once the file is more than 35
  days old (NC-051). It was last synced on 2026-10-27, so it is due again by the start of December.
- **Re-sync the company alias index after the ticker index.** `npm run sync:aliases` reads
  Wikidata and writes `data/company-aliases.json` ("Google" → Alphabet, "Facebook" → Meta); it
  keeps only names for companies the ticker index lists, so run it second. Read the "overrides" it
  prints — names that will now find a different company — before committing (NC-004).
- **Then re-sync the everyday-word list.** `npm run sync:word-names` rebuilds
  `data/english-word-names.json`, which says whose GDELT name is an everyday word ("Target") and so
  is held back from the news backfill until measured, and which of the names headlines are scored
  by are words, counted only with their capital (batch 59). It also rebuilds
  `data/shared-name-words.json`, how many companies' names share each word (batch 60).
  `check:news-backfill` and `check:relevance` fail until it is rerun after a ticker sync, and a
  company it does not list is held back from the backfill meanwhile (batch 58).
- **Re-score stored headlines once** after deploying batches 59 to 61: `npm run score -- --rescore
  --limit 100000`. It works out the free scores again under the new rules, so "Cost of living rises"
  stops naming Costco, "IMF urges retaining 5 % inflation target" leaves Target's page, and
  "American Depositary Receipts" stops naming American Airlines. Since batch 61 it scores a company
  by the same names ingest does; before, it brought back names batch 58 had removed, so run it on
  batch 61 or later. A `--strict-headline` score is left alone unless the flag is given too. It costs
  nothing; the rows it no longer settles go back to the paid tier, which runs only with
  `ANTHROPIC_API_KEY` set and stops at its cap (`--max-usd`, $1 a subject by default).
- **Run Node 20.9 or later on the host**, and install fresh (`npm ci`) — Next.js 16 refuses
  older Node (NC-166).
- **Rehearse a restore** into a scratch database: `createdb -U postgres news_charts_restore`,
  then `RESTORE_TARGET_URL=… npm run db:verify-restore`. Never against the live database — the
  rehearsal refuses it now (NC-152).

---

## Decisions I can't make for you

Not blocking launch, but they shape what gets built next:

- **How far the request queue is worked per run** (`--requests`, default 10). Too low and demand
  backs up; too high and new subjects crowd out refreshing the ones already on the site. The
  right number depends on real demand, which does not exist yet.
- **Affiliate links** — whether at all, and if so the neutrality rule and per-link disclosure.
  Nothing is built; the checklist records the constraints.
- **Accounts, i18n, geo-access** — each is a product direction rather than a task.

Raised by the November batches, each recorded in the master checklist:

- ~~**The 2026-11-11 proposals** (batch 138, `docs/proposals/2026-11-11-proposals.md`): mark each
  `APPROVED`, `REJECTED` or `DEFERRED`, with a reason for a rejection. None needs a key, a paid tier or a
  recurring charge.~~ **Decided 2026-11-11: all three**, #1 on the death's row ("On the death's row
  (Recommended)"). #1 is built in batch 139: after deploying, apply db/048 (`npm run db:migrate`); the
  next ingest of a mapped company reads MSHA's two findings files once, and every page's next ingest
  gives its rows the finding. #2 is built in batch 140: after deploying, apply db/049 (`npm run
  db:migrate`); the next ingest of any company reads the FDA's warning-letter list once (eight requests),
  and every page's next ingest gives it its letters. #3 follows in batch 141.
  1. `P2` MSHA's own finding on the deaths pages already hold: the violations its investigation cited and
     the penalty it proposed, on 168 rows on 45 pages, 114 before 2017. **One call inside:** on the
     accident's row (recommended), or a row of its own on the penalty's day.
  2. `P2` the FDA's warning letters, 2021 on, a new source (public domain): 78 letters on 56 pages, none
     before 2017.
  3. `P2` EPA's supplemental environmental projects on the settlement rows pages already hold: 168 rows
     on 70 pages, 142 before 2017, $181.8 million.
- ~~**The second 2026-11-09 proposals** (batch 131, `docs/proposals/2026-11-09b-proposals.md`): mark each
  `APPROVED`, `REJECTED` or `DEFERRED`, with a reason for a rejection.~~ **Decided 2026-11-10: all
  four**, #1 on the filing lists' evidence ("Use the filing lists (Recommended)"), #2 with its licence
  read first ("Read it first, then build (Recommended)"), #4 both parts ("Both parts (Recommended)").
  #1 is built in batch 132 for the 17 pages, and its rest of the population in batch 133 (30 pages
  more, from a scan of every listed company's filing list; nothing to run; four handovers wait for a
  filing's text once `NEWS_CHARTS_CONTACT` is set: RGC Resources, Biogen, Digimarc's of 2008 and
  Community West Bancshares); then #2,
  #3 and #4 in batches 134, 135 and 136. Nothing to run after deploying batch 132: each of the 17
  pages' next ingest reads its older records (3,277 filings of 1994–2016), and its SEC News Digest
  entries from the issues already stored. The notices' own text can be read once `NEWS_CHARTS_CONTACT`
  is set (§2); nothing waits on it.
  1. `P1` the older SEC records of 17 companies that moved to a new parent (Comcast, Oracle, Duke,
     Trane, Regions, Vulcan, Ashland, Berkshire, Northrop…): 3,093 filings, all before 2017. **One call
     inside:** accept the filing lists' evidence (each succession notice's form and number, the names
     swapping on the day), or wait for `NEWS_CHARTS_CONTACT` to read the notices' text.
  2. `P2` fatal mine accidents from MSHA, a new source: 221 accidents on 51 pages, 139 before 2017. Its
     licence wording (the Labor Department's notice) answered 403 here and is to be read first.
     **Built in batch 134:** the notice was read through a browser and allows free reuse (public
     domain, no endorsement implied); 224 accidents, 237 dead, on 51 pages, 144 before 2017. Nothing to
     run after deploying: apply db/046 (`npm run db:migrate`), and each mapped company's next ingest
     reads MSHA's two files once for all of them. Arcosa's two accidents wait for its Yahoo chart, which
     begins 2026-07-17.
  3. `P2` EPA cases under a fourth round of units (Ashland Chemical, Akzo Nobel Chemicals, Gerdau
     Ameristeel, Seaboard Farms…): 153 cases on 13 pages, 134 before 2017. **Built in batch 135:** 144
     court or penalty cases more on the 13 pages, 123 before 2017, each day read from a filing. Nothing to
     run after deploying: each page's next ingest reads the cases already kept.
  4. `P2` the regulator's own account on rows already held: (a) the CPSC's injury statement, (b) the
     railroad's narrative and the dead by kind. Each part approvable alone. **Built in batch 136,
     both parts:** after deploying, apply db/047 (`npm run db:migrate`); the next run reads the CPSC's
     service again for the statements, and each railroad page's next ingest rewrites its rows.

- ~~**The 2026-11-09 proposals** (batch 125, `docs/proposals/2026-11-09-proposals.md`): mark each
  `APPROVED`, `REJECTED` or `DEFERRED`, with a reason for a rejection.~~ **Decided 2026-11-09: all
  four**, with the rail floor as drafted ("Draft cut-off (Recommended)") and the Microsoft notices
  grouped a row a month ("Group a row a month (Recommended)"). #1 is built in batch 126; #2, #3 and #4
  follow in batches 127, 128 and 129.
  Nothing to run after deploying batch 126: each company's next ingest reads its new units' recalls
  from the CPSC recalls already kept. Four more wait for a filing's text, which www.sec.gov serves only
  with `NEWS_CHARTS_CONTACT` set (§2): Fisher-Price on Mattel (49 recalls), Hasbro's Playskool, Milton
  Bradley, Kenner and Tonka (25), Carrier on RTX before 2020 (8) and Lawn-Boy on Toro (7), each bought
  before EDGAR. Once the contact is set, a session can read their days and map them, with batch 123's.
  #2 is built in batch 127, with the floor you chose, and its counts corrected in batch 130 to the
  accident's own; nothing to run for the correction, since each row updates in place at the next ingest. Nothing to run after deploying it: the next ingest
  registers the source (id 37) and asks the dataset once for each of the six railroad companies. Two
  railroads wait for a filing's text, as #1's brands do: Missouri Pacific on Union Pacific (merged
  1982, 8 accidents of 1983–1985) and the Delaware & Hudson on CPKC (bought 1991, 2 accidents).
  #3 is built in batch 128, with Microsoft's notices a row a month as you chose. Nothing to run after
  deploying it: the archive walk reads the 56 new months of 1996–2000 over the next three ingest runs
  (24 a run), and each company's next Justice Department run picks up its own, with the drug makers'
  units. Alcoa's five of 1997–2000 land on AA under your open call below, as its 2003 release does.
  #4 is built in batch 129. After deploying it, run `npm run db:migrate` (db/045): the next ingest reads
  EPA's file again whole, keeping each case's cost recovery and each settlement's. All four of the
  2026-11-09 proposals are now built.
  1. the CPSC's recalls under about 90 units listed companies own (494 recalls on 48 pages, 321 before
     2017; American Honda on Honda, Fisher-Price on Mattel, Kidde on RTX);
  2. railroad accidents from the Federal Railroad Administration, a new source (461 on 6 pages, 388
     before 2017), with two calls inside it: the source, and the floor of what counts;
  3. more of the Justice Department's releases: its archive's 1996–2000 and the drug makers' own
     companies (97 releases on 49 pages), with one call inside it: the 9 routine Microsoft notices;
  4. EPA's cost-recovery figure on 3,126 rows pages already hold (no new events).
- ~~**The 2026-11-08 proposals** (batch 119, `docs/proposals/2026-11-08-proposals.md`): mark each
  `APPROVED`, `REJECTED` or `DEFERRED`.~~ **Decided 2026-11-08: "All three"; on #1's two calls, "Yes,
  both as drafted"** (Pharmacia LLC on Pfizer's page from 2003; MidAmerican Energy Berkshire's from
  2006-02-09). #1's parts (a) and (b) are built in batch 120, its part (c) in batch 121, #2 in batch
  122 and #3 in batch 123.
  Nothing to run after deploying batch 120: each company's next ingest reads its new units' cases from
  the EPA cases already kept.
  After deploying batch 121, nothing to run either: each company's next Justice Department run asks
  the API by the filter it reads, `title`. Since the API stopped reading `parameters[title]`, no page
  found a release from 2009 on; the next runs fill them in.
  #2 is built in batch 122. After deploying it, run `npm run db:migrate` (db/044): the next ingest reads
  EPA's file again whole, keeping each court case's filing day and each settlement's own day. One
  threshold in it is the owner's to widen: a suit's row is kept only where the page's own are every
  defendant, or at least half of fewer than 10 (`MANY_PARTIES`); counting any of them among fewer than
  10 would give 380 cases on 144 pages instead of 254 on 106 (the committed slice, before first prices).
  #3 is built in batch 123 for 16 makers; nothing to run after deploying it. Six more wait for a
  filing's text, which www.sec.gov serves only with `NEWS_CHARTS_CONTACT` set (§2): Hino on Toyota,
  Kelly-Springfield on Goodyear, Buell on Harley-Davidson, Fisher-Price on Mattel, and Thor California
  and Thor America on Thor. Once the contact is set, a session can read their days and map them.
  The audit of batches 117–123 (batch 124) adds two more for the same text: whether Southern Natural
  Gas became a joint venture in 2016, which would end it on Kinder Morgan's page, and whose Babcock &
  Wilcox's 2015 Superfund row is.
  1. EPA's cases under 28 more companies' operating units (BNSF on Berkshire, Pratt & Whitney on RTX);
     three parts, each approvable alone, and two calls inside it: Pharmacia LLC on Pfizer, and the
     day MidAmerican Energy becomes Berkshire's;
  2. EPA's own days: the day a suit was filed, and each settlement of a case that is all the
     company's;
  3. NHTSA recalls under about 20 makers the map lacks (Graco on Newell, Hino on Toyota).
- ~~**The 2026-11-07 proposals** (batch 112, `docs/proposals/2026-11-07-proposals.md`): mark each
  `APPROVED`, `REJECTED` or `DEFERRED`.~~ **Decided 2026-11-07: all three approved, titles from the
  FDA's data.** #1 is built in batch 113, #3 in batch 114 and #2 in batch 115. After deploying
  batch 113, run `npm run db:migrate` (db/043): the next ingest reads EPA's file again whole. After
  deploying batch 115, run `npm run sync:fda-supplements` monthly, and after each yearly
  `npm run sync:fda-approvals`; it reads one file from openFDA, with no key.
  1. EPA's own penalty and work-ordered figures on the EPA rows pages already hold (1,079 rows gain
     the penalty EPA's settlement record gives, 755 before 2017; AEP's 2007 decree among them);
  2. new indications and other efficacy supplements from Drugs@FDA, only for drugs whose holder never
     changed (973 on 27 pages, 352 before 2017), with one call inside it: titles from the data, or
     each approval letter read once;
  3. EPA's cases against the utilities' operating companies (442 cases on 31 utilities; PSEG 0→44,
     Exelon 0→22), each ownership day to be read from filings at build time.

- **DuPont's past on DD's page** (the 2026-11-07 audit of batches 108–115, its open question). DD's
  EDGAR record is DowDuPont's of 2015, which took DuPont's name and ticker in 2017. E. I. du Pont's own
  record went with Corteva. Yahoo's DD prices start in 1972, so the chart before 2017 is old DuPont's,
  and 29 of DD's EPA rows before 2017-08-31 are old E. I. du Pont's ("DuPont Mt Clemens EPCRA 313",
  2012). Batch 105 already keeps DuPont's drug approvals of 1986–2001 off DD. This is a call like Merck's
  was:
  1. keep old DuPont's rows on DD, as its chart is DuPont's (as old Merck's history is MRK's);
  2. take them off before the merger, as with old Waste Management and AT&T Corp. (one entry in
     batch 117's table of taken names, `lib/takenNames.ts`, would do it for every source);
  3. keep them, labelled as E. I. du Pont's (as Schering-Plough's are on MRK).

  Nothing changes until you choose.

- **A death only a railroad's own report gives** (the 2026-11-09 audit of batches 125–129, batch 130).
  FRA's dataset gives two counts of the dead: each report's Form 54 count, and the accident's Form 55a
  count, which it calls the official one. Batch 130 shows the accident's count, or the report's where
  that is larger, so no death a railroad reported is dropped. On 6 of 2,957 records the two disagree:
  Form 54 gives a death and Form 55a none. Two are on pages: CSX at La Grange, Georgia (2016-09-06) and
  Illinois Central at Yazoo City, Mississippi (2022-08-25), each "1 killed" in a collision with an
  obstruction; the other four are crossing collisions, off the pages under your floor either way. Your
  choice:
  1. keep the larger count, as built (the two rows say "1 killed");
  2. use only FRA's official per-accident count (the two rows leave the pages: their damage is under
     $5,000,000 and no one was evacuated).

  Nothing changes until you choose.

- **Alcoa's past on AA's page** (noticed by the 2026-11-09 scout run, batch 125). AA's EDGAR record is
  Alcoa Corp.'s of 2016; old Alcoa Inc.'s record went with Howmet (as Arconic). AA's page takes old
  Alcoa Inc.'s Justice Department release of 2003 (a Clean Air Act settlement), and the 1997–2000
  archive months, read since batch 128, add five more (DuPont's toxic-cloud suit of 1997 is one more on
  DD under the call above). It is the same call as
  DuPont's above, with the same three choices. Nothing changes until you choose.

- **Drugs whose holder changed** (batch 115): 553 of the FDA's efficacy supplements (374 before
  2017) were filed by a company on its page that day, but the drug has since moved and Drugs@FDA
  does not say when. They stay off every page, as the proposal said. Two hand lists could bring
  some back; each is yours to approve or leave:
  1. **the moves inside one company**, no sale at all. These would be joined by hand:
     - Pfizer's drugs held by PF Prism and CPPI (54);
     - J&J's by Janssen (53);
     - Merck's by "MSD" (42);
     - old Merck's and Schering's under "MERCK SHARP DOHME" (16).
  2. **the sales**, dated by each sale's close in the seller's or buyer's filings, so that each
     supplement before the sale counts for the seller:
     - Abbott's drugs to AbbVie on 2013-01-01 (43);
     - Merck's to Organon in 2021 (48);
     - GSK's oncology drugs to Novartis in 2015 (40);
     - Pfizer's to Viatris in 2020 (26);
     - BMS's diabetes drugs to AstraZeneca in 2014 (15).

- ~~**Merck's history** (batch 108).~~ **Decided 2026-11-07: "Add Schering-Plough, labelled", built
  in batch 110.** MRK's SEC record was Schering-Plough's until the 2009 merger, when it took Merck's
  name and ticker. Merck's page carries old Merck's history to the merger, as batch 108 built, and
  Schering-Plough's past beside it, each of those rows labelled "Schering-Plough, before its 2009
  merger with Merck".

- ~~**The 2026-11-06 proposals** (batch 103, `docs/proposals/2026-11-06-proposals.md`): mark each
  `APPROVED`, `REJECTED` or `DEFERRED`.~~ **Decided 2026-11-06: all three approved, Shell from
  2005-07-20.** All three are built: #2 in batch 104, #1 in batch 105, #3 in batch 106. Once a year, in the spring
  when the FDA adds the year before, run `npm run sync:fda-approvals` and commit the file it
  writes.
  1. the FDA's new-drug approvals since 1985 on the company that applied (a new source: 461
     approvals on 82 companies, 279 before 2017);
  2. EPA's cases filed under the companies' own operating units (Chevron 20→258 rows, BP 4→238,
     Shell 15→208), with one call inside it: Shell's units from Shell's first price, or from
     2005-07-20;
  3. "Also on" links from a case's row to the other listed companies it names.
- ~~**The SEC News Digest, step 2** (batch 87).~~ **Decided 2026-11-06 ("Go ahead with the Digest
  step 2") and built in batch 102.** Three things on the host that runs ingest start the walk of
  ~9,500 issues (about a week of hourly runs): set `NEWS_CHARTS_CONTACT`, which www.sec.gov needs
  (it answers 403 without one); install poppler's `pdftotext` (`apt-get install poppler-utils`, or
  the poppler package for Windows, on the PATH); and run `npm run db:migrate` for db/040. Until
  then no page carries a Digest row. Two defaults kept, each yours to change: the first-price floor
  (it removes 147 of 1985's 509 rows), and names older than EDGAR's (Caterpillar Tractor) left
  out without a hand map.
- ~~**A unit's cases on its owner's page** (batch 100).~~ **Decided 2026-11-06 and done in batch
  101:** Sunoco, Inc.'s EPA cases are on Energy Transfer's page from 2012-10-05, and Graco Children's
  Products' recalls on Newell's from 1999-03-24, when Newell merged with Rubbermaid, Graco's owner
  (batch 100 said "1998" by mistake).

Raised by the October ledger batches, each recorded in the master checklist:

- **Soft 404s (NC-160).** Company and topic miss pages answer HTTP 200 because the loading
  screen starts the response first. The Next.js 16 upgrade (NC-166) did not change that, for
  browsers or for search-engine crawlers; sector misses now answer 404. A real 404 on company and
  topic pages means dropping their loading skeleton (a first search then waits up to ~8s on a
  blank screen).
- **Wikipedia attribution (NC-047).** Confirm the credit beside the topic summary meets CC BY-SA.
- **Visitor Federal Register terms (NC-162).** Kept and rate-limited; the alternative is
  server-chosen term lists only.
- **Companies without prices (NC-103).** They now show their timeline with a "no price data"
  note instead of "not on News Charts yet". Say if the old behaviour should come back.

## What I can keep building without you

On-chain `P2` work (Tally governance, DefiLlama TVL, paginated backfill), NYT keyword tags, and
AI summary nodes. **I'd hold off**: each is another adapter shipped against an unverified payload,
and six are already waiting on §1. Validating those beats adding to the pile.

One is genuinely blocked, not deferred: **confirming exploits on-chain** needs a transaction
reference DefiLlama may not carry. (The macro-event overlay, blocked here before for want of
verifiable FOMC/CPI dates, was built and verified against both live sites on 2026-10-20 — batch 21.)
