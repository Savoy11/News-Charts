# Code audit — 2026-10-26, headline scoring (changes since `1ac7cdd`: batches 58–60)

Run by the `code-auditor` agent (read-only). It covers `git diff 1ac7cdd..10f163a` (23 files): the
fixes for the previous audit (`2026-10-26-code-audit.md`), the capital rule (batch 59) and the
shared-word rule (batch 60).

**Commit:** `10f163a` (branch `claude/lucid-goodall-6km6ea`, equal to `origin/main`).

**Where it ran:** the cloud build container (`/home/user/News-Charts`, Node 22.22.0).
- **GDELT:** not asked. The caller reports that this container's requests are refused.
- **EDGAR:** two requests through the session proxy (`NODE_USE_ENV_PROXY=1`): Motorola Solutions'
  submissions record, and Great Elm Group's records through `getFilingsDeep`. Both carry the
  project's own User-Agent (`lib/sec.ts:13`).
- **Postgres 16:** running. Only read from: `chronolens`, `chronolens_b42`, `chronolens_b48`,
  `chronolens_b57`.

**Checks run:**
- `npm run check`: tsc plus 48 suites, 49 in all. All pass, in 1 m 08 s. The suite totals match the
  ledger (relevance 76, news-backfill 38, prompt 58, aliases 99, predecessors 28).
- `npm run lint`: clean.
- `sync-word-names` run in a scratch copy of the tree, so no repository file was written.
- Probes, all kept outside the repository (the scratchpad's `probes/` directory):
  - every one of the 10,443 index entries scored as `scripts/ingest.ts` scores them;
  - against the 4,165 saved Yahoo Finance items (3,351 distinct titles) from the caller's `b60/yf`,
    parsed as text;
  - on three trees: `1ac7cdd`, `4bec330` (batch 59) and `10f163a`.

**Checks skipped:**
- `check:feeds` and `check:live`: both need GDELT.
- `check:ui` and `next build`: no page or component changed.
- Anything that writes to a database.

## Summary

The mechanics are sound:
- the word files regenerate byte for byte from the committed index;
- the backfill, `check:feeds` and ingest build the same names;
- across every company in the index, other feeds' headlines scored 0.9 fall from 83,847 (batch 59)
  to 10,395.

The defects are at the edges of the two new rules:
- `shortName` adds phrases made only of generic words, and a phrase is never held to its capital. One
  such phrase, "u s", makes every "U.S." headline U.S. Global Investors' news.
- A one-line exclusion in the sync script exempts the 68 companies whose ticker is their name (Gap,
  Ball, Snap, Dell, Arm…) from the capital rule.
- `npm run score -- --rescore`, which the owner is told to run over everything, scores with a
  different set of names from ingest. That set brings back the Great Elm names batch 58 removed.

Fix finding 3 before the owner runs the re-score in `docs/OWNER-ACTIONS.md`.

## Findings (confirmed)

### 1. `shortName` puts back the generic names batch 60 removed: every "U.S." headline names U.S. Global Investors · `P2`

**Evidence:**
- **The code.** `lib/enrich/relevance.ts:74` adds `shortName(common)` as an alias whenever it has a
  space. `shortName` (`:122-129`) strips any trailing word that two names share, down to two words.
  It never asks whether the words left are distinctive.
- **Reproduction, U.S. Global Investors:**
  `npx tsx -e 'import {aliasesFor,deterministicScore} from "./lib/enrich/relevance"; const s={kind:"company" as const,displayName:"U S GLOBAL INVESTORS INC",ticker:"GROW"}; const a=aliasesFor(s,["U S Global Investors"]); console.log(JSON.stringify(a), JSON.stringify(deterministicScore({eventId:0,kind:"news",title:"U.S. stocks fall as Treasury yields climb"},s,a)))'`
  → `["u s global investors inc","u s global investors","u s","GROW"] {"score":0.9,"reason":"headline names the subject"}`.
  It was `null` on `4bec330`.
- **Reproduction, Clean Energy Fuels.** A short name is a phrase, and a phrase is matched in any
  case, so it undoes batch 59's capital rule. The real Yahoo headline "Truist names top clean
  energy stocks to watch ahead of Q3 earnings season" scores 0.9 for Clean Energy Fuels (alias
  `"clean energy"`). It scored `null` on `4bec330`. The same happens to Clean Energy Technologies,
  and to Natural Gas Services Group on "KMI Q3 deep dive: natural gas project surge…".
- **Measured, every index company against the saved headlines, `4bec330` → `10f163a`:**
  - 52 other-feed headlines newly score 0.9;
  - **47 of the 52 are U.S. Global Investors**, on headlines that only say "U.S.";
  - the rest are the "clean energy", "natural gas" and "Right On" phrases above, and one real
    C.H. Robinson headline.
- **Where the rule is not delivered.** 681 short names are made only of words shared by five or more
  names, the words `SHARED_ALONE` drops when they stand alone. For example:
  - "New York" for the New York Times Co;
  - "United States" for USO and USL (`"United States and China agree to tariff truce"` → 0.9);
  - "New Jersey" for NJR, and "Main Street" for MAIN.

  55 short names are another listed company's whole common name:
  - Morgan Stanley Direct Lending (MSDL) and five other Morgan Stanley funds or trusts (IIF, MSD, MSSE, MSBT, MSOL) take every
    "Morgan Stanley" headline, 19 of the 3,351 saved;
  - Goldman Sachs BDC and AAAU take every "Goldman Sachs" headline;
  - "Fidelity National" names both FIS and FNF.

  These were already over-named on `4bec330` (by the single words), so they are not regressions.
  But batch 60 records the shared-word rule as done (`docs/MASTER-CHECKLIST.md:1009-1011`), and
  for them it does not hold.

**What is wrong:** a short name can consist only of generic words or initials, or be another
company's name. It is also exempt from the capital rule.

**Why it matters:**
- A fund's or small company's page shows every "U.S.", "Morgan Stanley" or "clean energy" story that
  reaches it, scored as certain (0.9, above the 0.4 floor).
- Those stories crowd the page's news budget and its biggest-move captions.

**Suggested fix:**
- Drop a short name in any of these cases:
  - every word in it would be dropped alone (shared by five or more, or a single letter);
  - it equals another index company's common name;
  - two CIKs share it.
- Match a phrase made of English words only when each word is capitalised in a cased headline.
- Add GROW's "U.S." and CLNE's "clean energy" to `check:relevance`.

*Importance:* medium to high: wrong attribution, shown as certain · *Efficiency:* contained in
`shortName` and `aliasesFor` · *Practicality:* easy, and measurable with the same headline set.

### 2. The 68 companies whose ticker is their name escape the capital rule: "Gender pay gap widens" is Gap news · `P2`

**Evidence:**
- **The cause.** `scripts/sync-word-names.ts:64` skips any one-word scored name whose key equals the
  company's ticker (`key !== ticker`). That is meant to skip the ticker. It also skips the name
  word when the two are the same word. So "GAP", "BALL", "SNAP", "BILL" and "ROOT" never enter
  `pieces`, `withCapital` (`lib/wordNames.ts:67-70`) leaves them lowercase, and `mentions` matches
  them in any case.
- **Measured.** Every lowercase one-word English alias left in the whole index is of this kind: 68
  of 68 (ENABLE read 2026-10-26). Among them are DELL, ARM, VALE, AXON, BALL, JAZZ, ALLY, SNAP, GAP,
  WYNN, POOL, RIOT, BILL, YELP, HERE and ROOT.
- **Reproduction, Gap:**
  `npx tsx -e 'import {aliasesFor,deterministicScore} from "./lib/enrich/relevance"; const s={kind:"company" as const,displayName:"GAP INC",ticker:"GAP"}; const a=aliasesFor(s,["GAP"]); console.log(JSON.stringify(a), JSON.stringify(deterministicScore({eventId:0,kind:"news",title:"Gender pay gap widens for third straight year"},s,a)))'`
  → `["gap","gap inc","GAP"] {"score":0.9,…}`.
- **The same with ingest's full alias list:**
  - "Senate passes stopgap spending bill" → 0.9 for BILL Holdings;
  - "Fed drops the ball on inflation" → 0.9 for Ball;
  - "Japan's prime minister calls snap election" → 0.9 for Snap;
  - "Investigators find root cause of outage" → 0.9 for Root;
  - "Fed holds rates: here is what it means" → 0.9 for Here Group;
  - by contrast, Target's "inflation target" scores 0.2 and Visa's "student visa" `null`, as batch 59
    intends.
- **Measured incidence.** On the saved Yahoo headlines, which are mostly Title Case, 7 headlines are
  named only through such a lowercase word:
  - 5 for HERE, e.g. "American Express (AXP) stock trades down, here is why";
  - 2 for HOUR.

  GDELT's sentence-case headlines, where the Target case came from, were not measurable here.
- **Why the checks miss it.** `check:relevance` has no company whose ticker is its name word. Costco
  ("COST") is not one.

**What is wrong:** batch 59 records that "a name that is an English word names a headline only with
its capital" (`docs/MASTER-CHECKLIST.md:1068`). For these 68 companies it does not.

**Why it matters:**
- Several of these are large caps.
- Their GDELT queries carry a legal form ("GAP Inc", "BALL Corp", "Snap Inc"), so the backfill does
  not hold them back. Their feeds' lowercase uses of the word are stored at 0.9.

**Suggested fix:**
- Skip only the alias that is the ticker itself, not every alias with the same key.
- Rerun `sync:word-names`.
- Add Gap's "pay gap" to `check:relevance`.

*Importance:* medium · *Efficiency:* one condition · *Practicality:* trivial.

### 3. `npm run score` and `--rescore` score with every EDGAR former name, so batch 58's Great Elm fix holds only at ingest · `P2`

**Evidence:**
- **Ingest's names.** Ingest scores with
  `aliasesFor(ctx, [name, ...newsNamesFor(cik), ...gdeltHeadlineNames(...)])` (`scripts/ingest.ts:409-412`).
- **`score.ts`'s names.** `scripts/score.ts:81-89` adds every `subject_aliases` row. For a company
  those rows are `formerNameAliases`, stored on each run (`scripts/ingest.ts:487-491`), and they
  include the predecessor record's renames (`lib/sec.ts:1055`). None of them passes through the
  rules `newsNamesFor` applies.
- **Live, Great Elm Group through `getFilingsDeep`:**
  - renames: Unwired Planet → Phone.com (1999), → Openwave System(s) (2000), → Unwired Planet (2012),
    → Great Elm Capital Group (2016);
  - stored aliases: `["unwired planet","phone com","openwave system","openwave systems"]`;
  - "UK Supreme Court rules in Unwired Planet v Huawei": ingest **null**, `npm run score` **0.9**;
  - "Openwave Systems founder launches new startup": the same.
- **Why the check misses it.** `scripts/check-predecessors.ts:208-209` asserts the fix with ingest's
  alias list only, so it passes while the score path still names both brands.
- **Other stored names that only the score path uses** (`chronolens_b42`): JPM's
  `chemical banking | chase manhattan | j p morgan chase`, GSK's `glaxosmithkline`, MUFG's
  `mitsubishi tokyo financial group`.

**What is wrong:**
- Two code paths that write the same `event_subjects.relevance` disagree on a company's names.
- A `--rescore` writes 0.9 with `scored_by='deterministic'`. The story's next ingest computes `null`
  and clears it (`lib/ingest/store.ts:935-940`). The next `npm run score` writes 0.9 again.
- Rows already stored at 0.9 under these names are no longer asked for, since the GDELT query
  dropped them. `--rescore` is the only way to correct them, and it keeps them.

**Why it matters:**
- `docs/OWNER-ACTIONS.md:168` tells the owner to run `--rescore --limit 100000` over everything.
- On Great Elm's page, that keeps Optis–Huawei and Openwave Mobility stories scored as certain,
  the exact defect batch 58 recorded as fixed. Any company's sold-brand former name behaves the
  same way.

**Suggested fix:**
- Build the scoring aliases in one helper, called by ingest, `score.ts`, the backfill and
  `check:feeds`.
- If stored former names should score, filter them by the rules `newsNamesFor` applies.
- Make `check-predecessors` assert on the score path's names too.

*Importance:* medium · *Efficiency:* one shared function · *Practicality:* easy.

### 4. `--rescore` un-hides every `--strict-headline` demotion, and its README example reaches only the newest 500 rows · `P3`

**Evidence:**
- **Strict demotions are cleared.**
  - A strict-mode 0.2 is stored with the same `scored_by='deterministic'` as every other free score
    (`scripts/score.ts:47`).
  - `freePass` clears any prior free score that the current mode does not settle
    (`lib/enrich/relevance.ts:412`).
  - Reproduced: "Stocks rally as Fed signals pause" for AAPL scores
    `{"score":0.2,"reason":"headline never names the subject"}` under `--strict-headline`. A later
    `--rescore` without the flag returns `{"cleared":[9],…}`, so the row goes back to NULL and is
    shown again.
  - Ledger batch 59 offers `--strict-headline` as the way to hide what ingest leaves unscored
    (`docs/MASTER-CHECKLIST.md:1097-1099`). The owner's re-score command does not carry the flag.
- **The README example stops at the newest 500 rows.**
  - `README.md:493` documents `npm run score -- --rescore` with no `--limit`. The default is 500,
    newest first (`scripts/score.ts:99-101,193`), and with `--rescore` every filing counts against
    it.
  - Run against `chronolens_b42` (read-only, replicating that `WHERE`):
    - JPM: the 500 rows taken reach back only to 2026-04-10, of 11,694 rows;
    - Ford: back to 2021-01-11, of 2,349 rows.
  - The backfill stores news back to 2017.
  - `OWNER-ACTIONS.md` does pass `--limit 100000`. The README and the script's output do not say
    anything was cut.

**Suggested fix:** record the mode in `scored_by`, or keep strict rows out of a non-strict rescore.
Print when the limit cut the selection, and put the limit in the README example.

*Importance:* low to medium · *Efficiency:* small · *Practicality:* easy.

### 5. Batch 58's apostrophe fix still reads "It's" as Southern ITS's "Its" · `P3`

**Evidence:**
- **The rule.** The retry now drops an apostrophe only before a final "s"
  (`lib/enrich/relevance.ts:181`). "It's" is such a word.
- **The case was named.** The previous audit listed `its` (SITS) among finding 3's cases. Batch 58
  records finding 3 as fixed (`docs/MASTER-CHECKLIST.md:1173-1175`).
- **Reproduction:** `aliasesFor` gives SITS `["Its",…]`, and "The Real Energy Bottleneck Isn’t
  Crude—It’s Fuel, Says Kuwait CEO" → `{"score":0.9,"reason":"headline names the subject"}`.
- **Measured.** 5 of the 3,351 saved headlines are named for SITS only through "It's". Another 50
  are named through Title-Case "Its": that is the recorded capitalised-word item.

**Suggested fix:** keep the retry to names the possessive index marks (`possessiveNameFor`), or skip
the common `'s` contractions (it's, that's, here's, there's, let's, what's, he's, she's).

*Importance:* low: one OTC company · *Efficiency:* small · *Practicality:* easy.

## Suspected, not reproduced

- **Finding 2 through the backfill.** For Gap, Ball, Snap, Pool, Root and the rest, the backfill
  keeps a GDELT headline that uses the word in lowercase. Code path:
  - `everydayWordName("GAP Inc")` is `null`, so the company is asked (`lib/ingest/newsBackfill.ts:131`);
  - `namesCompany` passes the lowercase "gap".

  How often GDELT returns such a headline under the quoted `"GAP Inc"` query was not measured,
  because GDELT is refused here.
- **Finding 3 in production.** Whether production holds Great Elm rows scored 0.9 under "Unwired
  Planet" or "Openwave" depends on whether the batch 55–57 code ingested there. The production
  database was not visible.

## Known items: status

- **Words shared by fewer than five names still name alone** (recorded with "Canada" and "GE"). The
  record does not cover a sub-case that is worse: number tokens.
  - "10" names the Bitwise 10 Crypto Index ETF in 51 of the 3,351 saved headlines.
  - "Q2" names Q2 Holdings in 18 ("Apple Q2 earnings beat estimates" → 0.9).
  - "40" names WD-40 in 13 ("Dow tops 40,000" → 0.9).
  - The scores are the same on `1ac7cdd`. But batch 60 dropped "bitwise" (shared), which left "10"
    as BITW's only standalone name.
- The other recorded items were not re-examined.

## Set aside (4)

- **"Form 10 Q Apple"** now opens Qnity Electronics (ticker Q) with focus "Apple". On `1ac7cdd` it
  opened FormFactor with focus "10 Q Apple". The query was wrong before and is wrong differently
  now. A form typed with a space ("10 Q") is a rare way to write it, and "Apple 10 Q" resolves
  correctly.
- **`lib/enrich/relevance.ts:59`** still gives "Barrick Gold" as its example, a name batch 60
  corrected as made up (`docs/MASTER-CHECKLIST.md:1032-1034`).
- **The `freePass` comment** says "0.9 reads back as 0.8999999762". Postgres 16 returns `0.9` for a
  `real`. The 1e-6 tolerance is right either way.
- **The re-score check in `check:relevance`** matches `score.ts`'s source text, so it could not
  catch finding 4. That is by design.

## Examined and clean

- **`sync:word-names` reproduces both committed files exactly** from the committed index:
  - words 205, others 1,744, pieces 2,277;
  - shared 1,362 (406 shared by five or more).

  `pieces` does not depend on the old shared file: name words are added unfiltered
  (`scripts/sync-word-names.ts:61`), so no second run is needed. The date checks in
  `check:news-backfill` and `check:relevance` catch a stale file after a ticker sync, as
  `OWNER-ACTIONS.md` says.
- **Ledger and README numbers hold:**
  - 10,443 entries, 8,029 CIKs;
  - 589 tickers of three to five letters in ENABLE;
  - fund 305, gold 130, american 52, new 36, companies 24.

  The own-word 0.2 rule covers 208 CIKs (205 words); only Lowe's ("LOWE" for GDELT, "Lowes" as its
  common name) falls outside it.
- **The code paths agree on the backfill.** The backfill (`scripts/ingest.ts:553`, the hourly
  `scoring`) and `check:feeds` build ingest's aliases and the same capital test, and
  `everydayWordName` reads the GDELT query the sync wrote.
- **The re-score SQL.** `clearScores` touches only `scored_by='deterministic'`. `freePass` agrees
  with ingest's `ON CONFLICT` re-score on what to clear. The float comparison is sound.
- **Batch 58's fixes** (apart from finding 5):
  - "she'll" and "we'll" no longer name Shell or Welltower;
  - Great Elm's names are out of `newsNamesFor` and the GDELT query;
  - "Form 4 Tesla", "Form 13F Berkshire", "Form D", "Form S-1 Airbnb" and "Form 20-F Toyota" parse
    as recorded.
- **The possessive line** names "Parker Hannifin’s" and "Franco-Nevada's", with no false match found.
- **Net effect of batches 59 and 60.** Over the whole index, other feeds' headlines scored 0.9 fall
  from 83,847 to 10,395. The 52 gained are listed in finding 1.

*For `opportunity-scout`:* `check:relevance` could replay the saved headline set across the whole
index and fail on any new 0.9. That is how findings 1 and 2 were found.
