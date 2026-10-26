# Code audit — 2026-10-26 (changes since `7ba8cb6`: batches 53–57)

Run by the `code-auditor` agent (read-only). It covers only the code changed in
`git diff 7ba8cb6..HEAD` (38 files).

**Commit:** `1ac7cdd` (branch `claude/lucid-goodall-6km6ea` = `origin/main`).

**Where it ran:** the cloud build container (`/home/user/News-Charts`, Node 22.22.0), going out
through the session proxy with `NODE_USE_ENV_PROXY=1`.
- **Answered:** EDGAR (`data.sec.gov`, the `www.sec.gov` archives and EDGAR full-text search),
  justice.gov, and GDELT once.
- **Did not answer:** GDELT refused 3 of the 4 requests sent (429). That is the shared egress
  address, not a feed defect. The 4 requests were spaced at least 7.5 s apart.
- **Database:** Postgres 16 was **not** running when the audit started (stale pid file). The
  auditor started the cluster (`pg_ctlcluster 16 main start`) and then only read from it.
  `chronolens` does not have migration 030 applied; `chronolens_b57` does.

**Checks run:**
- `npm run check`: tsc plus 48 suites, 49 in all, all pass, 1 m 04 s.
- `npm run lint`: clean. `npx tsc --noEmit`: clean.
- Probes, kept outside the repository:
  - **GDELT:** one backfill month asked exactly as `backfillNews` asks it (TGT, September 2026,
    answered). A second (GEG, August 2020) was refused three times.
  - **justice.gov:** `fetchJusticeReleases` called as ingest calls it, for EIG, SWRD, ANDE, ROG, PSN,
    WAT and NWSA; EIG and ROG also on `7ba8cb6`'s code.
  - **EDGAR:** `getFilingsDeep(…, true)` live for TIMB, PRG, GEG, CEF, PW and CIB. Also GEG's
    predecessor record, two of its 8-Ks, and full-text search.
  - **Offline:** `mentions` against contractions across all 10,443 index titles; the alias index
    diffed against `7ba8cb6` (1,555 → 1,586 keys: 33 added, 2 removed); `resolveSearch` with the
    database down, on both commits; `namesCompany` over the 3,225 stored GDELT titles in
    `chronolens_b42`.

**Checks skipped:**
- `check:ui` and `next build`: by instruction.
- `check:live` and `check:feeds`: each sends GDELT several requests, with 5.5 s retries. That goes
  past the GDELT budget and spacing this environment allows. Their EDGAR, DOJ and GDELT paths were
  probed directly instead (above).
- Anything that writes to a database.

## Summary

The mechanics of batches 53–57 are sound:
- every check is green;
- the predecessor reader drops nothing after a handover and shows no filing twice (six tickers,
  live);
- the DOJ possessive change added no wrong release in a seven-company live sample.

The defect that matters is batch 57's backfill. Its only filter is "the headline names the
company", and that cannot tell a company called Target, Southern, Progressive or Crown from the
word. Measured on one live month, 10 of the 33 stories it would store on Target's page are about
inflation targets, price targets and a fighter jet, each scored 0.9 as "headline names the
subject". Fix this before the backfill runs on a production refresh.

## Findings

### 1. The GDELT backfill stores a common word's stories as the company's: 10 of 33 kept for Target in one month · `P1`

**Evidence:** live, one request through `fetchNews(plan.query, aka, { byRelevance, window })`, as
`backfillNews` makes it. The answer was filtered with `namesCompany` and TGT's production aliases
(`["target","target corp","tgt"]`; query `"TARGET" sourcelang:english`).

```
TGT 2026-09-01..2026-09-30: outcome ok http 200; returned 93, backfill keeps 33
  KEPT 2026-09-28 Bihar urges Centre to raise paddy procurement target to 50 lakh MT
  KEPT 2026-09-30 Spanish fighter jets scrambled AGAIN as  moving target  spotted after Russian onslaught
  KEPT 2026-09-24 IMF urges retaining 5 % inflation target
  KEPT 2026-09-10 Winnipeg surpasses federal target for housing funding ahead of deadline
  KEPT 2026-09-29 Only 14 driving test centres hitting wait - time target
  KEPT 2026-09-24 NSE stock gets thumbs up from Street ; here highest share price target
  KEPT 2026-09-28 Top 5 Breakout stocks to buy : KPI Green , … | Target , stop - loss
  KEPT 2026-09-30 India fiscal deficit widens … hits 41 . 9 % of FY27 target by August
  KEPT 2026-10-01 45 % YTD rally ! Experts see up to 56 % upside in these 3 stocks … | Target , rationale
  KEPT 2026-09-30 Govt . to retain 5 % inflation target for next three years
  (+ 23 about Target, its stores or its stock)
```

- **The stored score.** `deterministicScore` gives "IMF urges retaining 5 % inflation target"
  `{"score":0.9,"reason":"headline names the subject"}` for Target. That is above the display
  threshold (`lib/store/read.ts:248`).
- **The same filter, offline, keeps:**
  - for Crown Holdings (query `"CROWN"`): "Crown Prince visits Washington" and "The Crown season 6
    review";
  - for Southern Co (`"SOUTHERN"`): "Southern California braces for record heat";
  - for Progressive (`"PROGRESSIVE"`): "Progressive Democrats push for new spending bill".
- **The code's own comments say otherwise.**
  - `lib/ingest/newsBackfill.ts:13-16` says the filter "leaves out … the other uses of a common
    word".
  - `lib/news.ts:178-179` limits asking by relevance to measured names, because "that test cannot
    tell a first name or a common word from it".
  - Yet the backfill asks every company by relevance (`lib/news.ts:295`), with that test as its only
    filter (`newsBackfill.ts:148`).
- **The checks could not catch it.**
  - `check:news-backfill`'s stand-in GDELT holds only a person-name collision ("Harrison Ford's new
    film", `scripts/check-news-backfill.ts:83,132`).
  - `check:feeds`' new past-month line reports the count "before the headline filter"
    (`scripts/check-feeds.ts:169`), so it never shows what is kept.
- **The recorded description is wrong.** The open GDELT item (`docs/MASTER-CHECKLIST.md:3116`) says
  "Scoring keeps the unrelated pages off the page". For the hourly ask too, it does not.

**What is wrong:** for a company whose name is an everyday word, "the headline names it" is true
of the word, so the filter keeps the very stories it was written to drop. The backfill asks up to
117 months per company, against the hourly ask's few days. That turns a known, small leak into
roughly a thousand stories per affected company, if September is typical. Each is shown as
certain.

**Why it matters:** these stories are dated on the price chart and compete for the page's news
budget and the biggest-move captions. A reader looking for why Target moved gets IMF and Indian
budget headlines labelled as Target news.

**Suggested fix:** don't backfill a company whose GDELT query is a lone common word until a
stronger test exists. `data/english-short-words.json` shows the pattern for a word list. Another
option is to require the legal form or ticker in those headlines. Add a real common-word collision
to the check's fixture, and have `check:feeds` print what the filter keeps.

*Importance:* high: wrong stories, scored as certain, on large-cap pages · *Efficiency:* a guard
in one function · *Practicality:* easy to gate now, harder to make precise.

### 2. Great Elm Group's news is asked and scored under two brands it sold: "Openwave" (2012) and "Unwired Planet" (2016) · `P2`

**Evidence:**
- `lib/predecessors.ts:130` gives GEG `news: ["Openwave", "Unwired Planet"]`. A probe shows what
  that produces:
  - `newsNamesFor(GEG)` = `["Openwave","Unwired Planet"]`;
  - GDELT query `("Great Elm Group" OR "openwave" OR "unwired planet") sourcelang:english`, used by
    the hourly ask and by all 117 backfill months;
  - Federal Register term `"Great Elm Group" | "Openwave" | "Unwired Planet"`, and the same three
    names asked of the DOJ;
  - `namesCompany` and `mentions` give "named" to "Openwave Mobility named a leader in mobile
    video optimization" and to "UK Supreme Court rules in Unwired Planet v Huawei".
- **The 2012 sale.** The predecessor's 8-K `0001193125-12-212068` (EDGAR) says Unwired Planet
  "completed the sale of its Mediation and Messaging product businesses … to Openwave Mobility,
  Inc., a company controlled by entities affiliated with Marlin Equity Partners".
- **The 2016 sale.** The 8-K `0001193125-16-532468`, Item 1.01, says Optis acquires the holding
  companies that own "Unwired Planet, LLC" and "Unwired Planet International Limited", which
  "collectively own all of the Company's patent assets".
- GDELT starts in 2017, after both sales, so every GDELT story under either name is another
  company's. The live GDELT request for August 2020 was refused (429), so how many stories
  arrive was not measured.

**What is wrong:** the project already bars a former name whose brand left with a divested
business. `KNOWN_NOT_NEWS` (`lib/companyAliases.ts:132-135`) bars "Motorola" from Motorola
Solutions' news for exactly that reason, and batch 55 withheld "Aaron's" from PROG Holdings on the
same grounds. GEG's two names were added without that check.

Related drift: the reason recorded for withholding "Aaron's" is out of date.
- `docs/MASTER-CHECKLIST.md:1178` and `scripts/check-predecessors.ts:206` say "another listed
  company now" holds the name.
- No Aaron's company is in `data/edgar-tickers.json` (synced 2026-10-18).
- So the check asserts a hand-omitted value against a premise that no longer holds, and would not
  flag GEG.

**Why it matters:** Openwave Mobility's product news and the Optis–Huawei FRAND litigation would
appear on Great Elm's page as its own, each scored 0.9, across up to nine years of backfill.

**Suggested fix:** drop both names from GEG's `news`, and state the rule beside `news` in
`lib/predecessors.ts`: a former name whose brand left with a sold business does not carry. Rewrite
the check's reason as "the brand went elsewhere".

*Importance:* medium: a small company, but wrong attribution by construction · *Efficiency:* a
one-line data change · *Practicality:* trivial.

### 3. Batch 54's apostrophe retry reads "she'll" as Shell · `P3`

**Evidence:** `mentions` now retries a one-word name against the title with its apostrophes
removed (`lib/enrich/relevance.ts:111,122-125`). With SHEL's production aliases
(`["shell","shell plc","shel","RDS","royal dutch shell"]`):

```
now      named   Taylor Swift says she'll retire next year      (deterministicScore 0.9)
now      named   She'll be missed: tributes pour in
7ba8cb6  none    (both)
```

A scan of all 10,443 index titles for one-word aliases that a common contraction becomes without
its apostrophe found:
- `shell` (SHEL, RYDAF), from "she'll";
- `well` (WELL, AMWL), from "we'll". "well" already named any headline with the word on
  `7ba8cb6`, so that case predates the diff;
- `its` (SITS).

**What is wrong:** removing apostrophes to read "Kohl's" as "kohls" also turns contractions into
company names. Shell's GDELT query is the bare word "Shell". How often its feed carries a "she'll"
headline was not measured, because GDELT refused.

**Suggested fix:** retry without the apostrophe only before a final "s" ("Kohl's" → "kohls"),
never inside a word ("she'll", "we'll").

*Importance:* low to medium · *Efficiency:* one regex · *Practicality:* trivial.

### 4. "Form 4 Tesla", "Form 13F Berkshire" and "Form D" still open FormFactor · `P3`

**Evidence:** offline `resolveSearch` with the database down, run on both commits:

```
"Form 10-K"            1ac7cdd {"kind":"none"}                       7ba8cb6 FORM, focus "10-K"
"Form 4 Tesla"         1ac7cdd FORM, focus "4 Tesla"                  7ba8cb6 the same
"Form 13F Berkshire"   1ac7cdd FORM, focus "13F Berkshire"            7ba8cb6 the same
"Form D"               1ac7cdd FORM, focus "D"                        7ba8cb6 the same
```

`FORM_WORD` is recognised only before the form numbers in `FORM` (`lib/prompt.ts:154,160-163`).
Batch 56 records that '"Form" and "SEC Form" are read as part of the form's name'
(`docs/MASTER-CHECKLIST.md:1088`). That is true for those numbers only.

**What is wrong:** the fix is narrower than its record. A query naming Form 4, the most common
insider filing, still opens an unrelated company with a nonsense filter.

**Suggested fix:** treat a leading "Form"/"SEC Form" followed by any form-like token as the form's
name, and resolve the rest of the query. Or correct the checklist line.

*Importance:* low · *Efficiency:* small · *Practicality:* easy.

## Checks that could not be run

- `check:live`, `check:feeds`: not run, by choice. Both send GDELT several requests with 5.5 s
  retries, which this environment's GDELT budget and spacing rule out. Not a script defect.
- GDELT for GEG (August 2020): refused, 429 ×3.

## Set aside (5)

- **DOJ, predates the diff.** Employers Holdings (EIG) gets "…Agreements with Ten Employers…" and
  "…Against Two Employers…". Rogers Corp (ROG) gets "Rogers Group Sentenced To Over 34 Years… For
  Drug Trafficking". Results are identical on `7ba8cb6`.
- **Aliases that are common words, predates the diff.** The ticker alias "well" names any headline
  containing "well" (Welltower). "Bill O'Reilly sued" is named for O'Reilly Automotive. Both
  happen on `7ba8cb6` too.
- **Backfill window edges.** A September window returned 3 stories GDELT dated 2026-10-01. This is
  harmless: they dedupe by story key.
- **`dojPossessive`'s extra queries.** It builds 233 possessives with no Wikidata source, mostly
  nonsense ("NOVARTI'S", "NEW'S"). Each costs two DOJ queries per refresh, as its comment says.
  None of the seven sampled added a release.
- **A contrived query.** "How did covid affect Form 10-K" keeps "Form 10-K" as its subject.

## Examined and clean

- Offline suites, lint and tsc: green, 49 in all.
- **Predecessor reader, live.**
  - TIMB 1,644, PRG 634, GEG 684, CEF 289, PW 417, CIB 983 events.
  - 0 duplicates, and 0 predecessor filings on or after `until`.
  - Renames kept and dropped as documented.
  - Headlines are read under the filer's own CIK (`lib/ingest/headlines.ts`).
  - The map holds 70 successors and 74 records, matching its header.
- **Backfill mechanics.**
  - Month windows, the 2017 and first-price floors, the shared 40-month budget, the stop at the
    first refusal, rollback, and query-keyed re-asking.
  - Refused months are logged only as `throttled`/`error`, which `loadLastFetched` ignores, so they
    never make the hourly ask look fresh.
  - `chronolens_b57` holds 101 months under one query, as batch 57 records.
- **Headline filter on stored titles.** Over 3,225 real stored GDELT titles (IBM, GM, UPS, JPM, F,
  GSK), `namesCompany` kept no headline that fails to name the company.
- **Alias index.** The 31 net new keys are plausible (Citi, Chase, Pepsi, McDonald, CN Rail…); the 2
  removals are Kraft Foods, as recorded.
- **Search.** The form-only check matches no company, fund or series name in the index.
- **Saved year folds (`EventList`).** Saves and loads are keyed per view, and the focused view
  neither reads nor writes storage.
- **`BiggestMoves`.** It ranks with the chart's `isMinorRecall`.
- **Dead code.** Every new export has a production caller.

*For `opportunity-scout`:* `check:feeds` could print a sample of the headlines each filter keeps
and drops, which is what would have shown finding 1 at once.
