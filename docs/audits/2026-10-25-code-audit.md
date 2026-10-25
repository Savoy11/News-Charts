# Code audit — 2026-10-25 (changes since `d36636d`: batches 24–52)

Run by the `code-auditor` agent (read-only) at the start of batch 53; its findings are
re-verified and tracked in `docs/MASTER-CHECKLIST.md` (batch 53 onward).

**Commit:** `7ba8cb6` (branch `claude/lucid-goodall-6km6ea` = `origin/main`).

**Where it ran:** the cloud build container (`/home/user/News-Charts`, Node 22.22.0), going out
through the session proxy with `NODE_USE_ENV_PROXY=1`.
- **Answered:** EDGAR, Yahoo, the Federal Register, the Fed, BLS, Wikidata, NHTSA, openFDA,
  justice.gov, archive.org, LoC, Snapshot and DefiLlama.
- **Did not answer:** GDELT gave no answer at all, and Wikipedia returned 429. Both are this
  environment, not feed defects.
- **Database:** Postgres 16 was already online and was only read.

**Checks run:**
- `npm run check`: tsc plus 46 suites, 47 in all, all pass, 59 s.
- `npm run lint`: clean. `npx tsc --noEmit`: clean.
- `npm run check:live`: 20 pass, 0 fail, 6 unreachable (GDELT ×5, Wikipedia), 1 skipped
  (Etherscan), 3 m 07 s.
- `npm run check:feeds` (BABA).
- Throwaway probes outside the repository:
  - the headline reader fuzzed on 4,000 mutated fixture documents;
  - a live headline read of 104 recent 8-Ks/6-Ks from 26 filers outside `check:live`'s sample;
  - live DOJ and Federal Register probes;
  - offline `resolveSearch`;
  - one Playwright reproduction against `next start` of the existing `.next` build (local
    database).

**Checks skipped:** `check:ui` (by instruction), `next build` (it rewrites `.next/`), and anything
that writes to the database.

## Summary

Inside the diff the mechanics are sound: every check is green, the headline reader never threw on
4,000 mutated documents, and the recall, FDA and DOJ maps check out. Two real `P2` defects:
- the Justice Department feed loses every release about a company whose name has an apostrophe,
  including Moody's $864M settlement;
- one click on a long timeline makes later focused views of that page hide most of their matches.

The most important thing to fix is just outside the diff: XOM and BLK now resolve to new
holding-company CIKs, so their pages carry 8 and 46 filings instead of 581 and 416 (see "Outside
the requested scope").

## Findings

### 1. Justice Department releases about apostrophe-named companies are never found (Moody's $864M settlement, Kohl's, Macy's, Lowe's, McDonald's) · `P2`

**Evidence (live, justice.gov):**

| Company (SEC title) | What ingest asks the API | Hits | Hits with "’" | Release lost |
|---|---|---|---|---|
| MCO (`MOODYS CORP /DE/`) | `MOODYS` | 0 | `Moody’s` 2 | 2017-01-13 "…Nearly $864 Million Settlement With Moody’s Arising From Conduct in the Lead up to the Financial Crisis" (two copies) |
| KSS (`KOHLS Corp`) | `KOHLS` | 0 | `Kohl’s` 3 | 2022-05-05 "Kohl’s and Walmart Agree to Pay $5.5 Million in Combined Penalties…" |
| M (`Macy's, Inc.`) | `Macy's` | 0 | `Macy’s` 2 | 2016-06-22 "Justice Department Settles Immigration-Related Discrimination Claim Against Macy’s" |
| LOW (`LOWES COMPANIES INC`) | `LOWES COMPANIES` | 0 | `Lowe’s` 12 | 2024-12-03 "…Reaches Agreement with Lowe’s to Improve Customer Accessibility Nationwide" |
| MCD (`MCDONALDS CORP`) | `MCDONALDS` | 3 | `McDonald’s` 23 | 2015-11-19 "…Discrimination Claim Against McDonald’s" |

- **The production path finds none of them.** `fetchJusticeReleases(title, newsNamesFor(cik))`,
  called exactly as `scripts/ingest.ts:532-534` calls it, returned 0 events for MCD, MCO, KSS, M,
  WEN, DDS, CPB, DPZ, LOW, DKS, BJ and PZZA.
- **The party test fails on the same titles.** `releaseNamesParty` is false with the names ingest
  passes and true with the curly spelling.
- **Walmart gets the Kohl's release.** The same release returns true for Walmart's names, so it
  lands on Walmart's page and not on Kohl's.

**What is wrong:** two causes.
- **The query.** The API matches title substrings literally. SEC titles drop the apostrophe
  (KOHLS, MOODYS), and where they keep one it is a straight `'`, while justice.gov writes `’`.
- **The party rule.** `escapeName` (`lib/doj.ts:97-102`) folds neither kind of apostrophe. The
  Federal Register matcher's `words()` (`lib/frCompany.ts:24-25`) folds both.

Adding the possessive name would not help either: `companyNames` deduplicates by `words()`
(`lib/frCompany.ts:54`), so "McDonald’s" is discarded as identical to "MCDONALDS".

The same gap reaches headline scoring for Kohl's, which has no alias entry and no possessive name:
with ingest's aliases `["kohls","kohls corp","kss"]`, `mentions("Kohl's names new CEO")` gives
`none`. `check:doj`'s fixture holds no company whose own name carries an apostrophe.

**Why it matters:** a settlement in which the company pays is exactly the kind of event a reader
comes to explain a move with. Moody's largest DOJ settlement is absent from its page, and Kohl's
penalty shows on its competitor's page but not its own.

**Suggested fix:** fold `'`/`’` in the DOJ matcher the way `words()` does; query the API under the
spelling titles actually use, and stop `companyNames`' dedupe from swallowing that spelling. Add
Kohl's and Moody's cases to `check:doj`.

### 2. One click on a long timeline makes later focused views of that page hide most of their matches · `P2`

**Evidence:** Playwright against `next start`, using Ford's real local data (2,337 events):

```
A  fresh visitor, /company/F?focus=recall   rows 863, folded years 0
B1 same browser, /company/F                 rows 258, folded 99, note "Years before 2024 are folded…"
B2 click 1896                               localStorage news-charts:collapse:/company/F = {"years":["2023","2022",…],"chosen":true}; note gone
B3 then /company/F?focus=recall             rows 130, folded 58 (1966, 1967, …), no note;
                                            focus bar: "Showing the 863 of 2337 events that mention “recall”…"
```

- `components/EventList.tsx:588-590`: `folded = new Set(openAll ? [] : yearsToFold(...))`, then
  `collapsedYears = chosen?.years ?? folded`. So `openAll` only empties the default, never a saved
  choice.
- `toggleYear` seeds the saved choice with the whole set of opening folds.
- `persistKey` is `news-charts:collapse:${pathname}` (`CompanyExplorer.tsx:323`,
  `TopicExplorer.tsx:354`), which ignores `?focus`.
- The note is hidden whenever `chosen` is set (`:710`).
- The reverse case, read from the same lines but not run: a fold click while focused saves a
  one-year set, after which the unfocused page opens all of its rows.
- `check:event-folds` renders without storage and pins the source with regexes, so it could not
  fail on this.

**What is wrong:** batch 38's rule says "A list a focused search narrowed opens every year,
however long". That holds only until the reader has clicked any year on that page.

**Why it matters:** "How did covid affect Ford" opens with most of the matched years folded and no
explanation, while the bar claims all 863 are shown.

**Suggested fix:** let `openAll` override a saved choice, or keep focused views' folds apart from
it; save the reader's own changes rather than a seeded copy of the opening folds.

### 3. UnitedHealth's 2026 results releases are titled "Page 1 of N …" · `P3`

**Evidence:** live, UNH's last ten results 8-Ks through `readFilingHeadline`:
- `000073176626000025` (2026-01-27): "Page 1 of 21 UnitedHealth Group Reports 2025 Results and
  Issues 2026 Outlook"
- `…26000121` (04-21): "Page 1 of 16 …"; `…26000191` (07-16): "Page 1 of 17 …"
- The 2024–25 and 2026-10-13 releases read cleanly.

The document puts each page on one line, and line 0 begins "Page 1 of 17 UnitedHealth Group
Reports…". `NOISE` drops a page counter only when it stands alone on its line
(`lib/secHeadlines.ts:317`). `check:live`'s "page furniture" smell does not cover it, and UNH is
not in `HEADLINE_SAMPLE`.

**Suggested fix:** strip a leading "Page N of M" from a line that holds a whole page; add it as a
smell.

### 4. `check:feeds` asks GDELT a query production no longer sends, and never asks the new sources · `P3`

**Evidence:** `scripts/check-feeds.ts:132` calls `getNews(name)`, which is `fetchNews(name)` with
no other names and newest first:
- **V:** check:feeds sends `"VISA"`, a phrase batch 33 measured GDELT refusing as too short.
  Ingest sends `"VISA Inc"`.
- **MCD:** check:feeds sends `"MCDONALDS"` newest first. Ingest sends `"MCDONALD"` by relevance
  over 3 days.
- **UBER, IBM:** check:feeds drops the names ingest ORs in.
- It calls none of `fetchRecalls`, `fetchFdaRecalls`, `fetchJusticeReleases`,
  `fetchCompanyRegulations` or `readFilingHeadline`, though `docs/OWNER-ACTIONS.md:42` calls it
  "the per-subject report of what each feed returns".

**Suggested fix:** build its GDELT line from `gdeltNewsPlan` and `newsNamesFor`, and add lines for
NHTSA, FDA, DOJ and the company Federal Register feed.

## Outside the requested scope, reported for its size: XOM and BLK carry only their new holding company's filings · suggested `P1`

**Evidence:**
- `data/edgar-tickers.json` maps `[2115436, 'XOM', 'ExxonMobil Holdings Corp']` and
  `[2012383, 'BLK', 'BlackRock, Inc.']`, as it did already in the 2026-08-12 sync.
- CIK 2115436 holds 36 filings since 2026-07-01, no former names and no shards. The predecessor,
  CIK 34088 `EXXON MOBIL CORP` (now with no ticker), holds 1,001 recent filings plus 2 shards.
- `getFilingsDeep(…, true)`: XOM 8 events (2026-07-07 → 2026-10-16) on the current CIK against 581
  (1994-03-04 → 2026-09-25) on the predecessor; BLK 46 (2024-03-05 →) against 416 (2006-06-09 →
  2025-03-27).
- The alias file has 0 entries for either CIK of either company; `newsNamesFor(2115436)` is `[]`;
  with ingest's aliases, `mentions("Exxon Mobil beats profit estimates")` is `none`.

**What is wrong:** a holding-company reorganisation gives the ticker a new CIK. The app reads only
that CIK, so decades of 10-Ks, 10-Qs and results 8-Ks never reach the page, while the Yahoo chart
still runs from 1962. Batch 25's "predecessor whose ticker carried on" rule exists for exactly this
case (Google → Alphabet), but it applies only to names.

**Suggested fix:** follow a ticker's predecessor CIK for filings and aliases, through a checked map
like `RECALL_MAKERS`. FERG and SKYD look similar but were not checked.

## Set aside (6)

- "Form 10-K" resolves to FormFactor (`FORM`) with a 10-K focus, and "Lockheed F-4" narrows to F-4
  forms. No index name is cut by the form split (0 of 10,443 company titles and 19,540 series
  names).
- `BiggestMoves` gives every recall priority 4, FDA Class II included, which batch 40 demotes on
  the chart (`markerPriority`). Ford's 2020-03-24 +23.4% day is captioned with a 288,110-vehicle
  recall; the panel does say "proximity isn't proof".
- Fresh-filer headlines in tracked classes: STLA "Stellantis to Announce Third Quarter 2026" and
  TTE "…Divests its Minority Non-Operated" are cut short; Toyota is titled by its deck cover.
- MCO's scoring aliases include the token "/de/", taken from its display name (predates the diff).
- Search: "Chase" resolves to Chase Packaging and "Citi" to Citi Trends (predates the diff).
- FR search terms use the SEC spelling ("MCDONALDS" finds 1 document, "McDonald's" 29); none of
  those titles names the company, so no document was lost (live: 7 companies, 0 either way).

## Examined and clean

- Offline suites, lint, tsc: green, 47/47.
- Headline reader: 0 throws and none slower than 500 ms on 4,000 mutated real documents; 33
  headlines from 104 fresh filings, KO, PEP, CVX, MRK, AZN, SNY, DEO, ING, NVO and Barclays right.
- Maps: FDA 38 companies, NHTSA 20 makers, every ticker in the index; no post-2015 "McNeil
  Nutritionals" recall reaches J&J or Kenvue.
- Source registry: the three new sources' entries, refresh TTLs and deterministic scores in order.
- The 2026-10-21 audit's six findings, re-checked and still fixed.
- Pages and prices: the `boundPageNews` arithmetic; the in-progress session dropped in `prices.ts`.
- Form search: the split resolves AAPL, F, TSLA, TSM, MSFT and GOOGL correctly.
- Dead code: no new export lacks a production caller beyond test-exported internals.

*For `opportunity-scout`:* rotate `check:live`'s 16-filer headline sample, since every fresh
sample so far has found a new layout.
