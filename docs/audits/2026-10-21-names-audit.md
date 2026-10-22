# Names audit, batches 24–27 — 2026-10-21

The `code-auditor` agent wrote this report; it is saved as returned. The fixes are in batch 28 of
`docs/MASTER-CHECKLIST.md`.

**Commit:** `9eec1d7` (= main) · **Range:** `11edba2..9eec1d7` · **Where it ran:** the cloud build container. The Federal Register API answered through the proxy (about 30 live queries). GDELT answered 2 of about 14 requests; the rest got HTTP 429 "Please limit requests to one every 5 seconds". Wikidata was not called.
**Checks run:** `npm run check` before and after (36 suites plus `check:types`, all pass, exit 0). `npm run lint` is clean. Offline scratch scripts and the live queries above, all in the session scratchpad.
**Checks skipped:** `sync:aliases`, because it writes `data/company-aliases.json` and the Wikidata read it was rebuilt from is not in the repo. `check:live` and `check:feeds`, because GDELT throttled almost every request. `check:ui`, because no server was running. Nothing in the repo was modified (`git status` is clean).

## Summary
The alias file matches what the current code would produce on every invariant I could check, and the counts in the ledger reproduce. The defects are where the new names meet the Federal Register matcher and the headline scorer. Batch 26 stopped the matcher recognising a one-word company's own "S.A." / "N.V." legal name: Embraer's documents went from 22 to 2 on a live query. Other names are kept only in their punctuation-stripped key form, which neither the Federal Register search nor `mentions()` can match ("u s bancorp" returns 0 documents where "U.S. Bancorp" returns 108). Fix those two first.

## Findings

### 1. Batch 26 broke Federal Register matching for one-word names whose title carries a dotted or foreign legal form · `P1` (regression)
**Evidence:**
- `commonName` now strips "S.A.", "N.V.", "A/S", "ASA", "AB", "S.p.A.", "Oyj", "SAB de CV" (`lib/sec.ts:645-646`). That leaves names like "EMBRAER", "Ferrari" and "Vale" as one word.
- A one-word everyday name must have a word from `CORPORATE` within three words after it (`lib/frCompany.ts:27-30`, `:80-83`).
- `words()` splits "S.A." into "s a", "N.V." into "n v" and "A/S" into "a s". `CORPORATE` holds only "sa", "nv", "ag", "se", "lp" and has no "asa", "ab", "oyj", "spa", "tbk" or "sab".
- Before batch 26 the everyday name was "EMBRAER S.A", which matched as a two-word phrase.

Reproduction (offline):
```
npx tsx -e 'import { titleNamesCompany } from "./lib/frCompany"; …'
false "EMBRAER"   Embraer S.A.; Notice of Petition for Exemption
false "Ferrari"   Ferrari N.V.; Receipt of Petition for Decision of Inconsequential Noncompliance
false "Stellantis" / "EQUINOR" / "GENMAB" / "Vale" / "Criteo"   (same shape)
true  "MPLX"      MPLX LP; Order          ← "lp" is in CORPORATE
```
Whole-index sweep (`fr-self.ts`, `fr-gained.ts`): I built a title from each company's own legal name, with EDGAR's filing tags removed, followed by "; Order Granting Exemption". 66 companies were recognised before batch 26 and are not now (Embraer, Ferrari, Vale, Ambev, STMicroelectronics, Ecopetrol, Equinor, ENI, Genmab, Stellantis, Cemex, JBS, Gerdau, QIAGEN, Pandora, Adyen, Aena, Sampo, …). 11 were newly recognised (RUSH ENTERPRISES INC, AMARIN CORP PLC, Alight, Inc., …).

Live (`fr-embraer.ts`, `fr-66.ts`): the term ingest now sends, `"EMBRAER"`, returns 250 hits.
- Kept before batch 26: 22, all titled "Embraer S.A.", e.g. 2023-16443 "Petition for Exemption; Summary of Petition Received; Embraer S.A." and 2017-12281 "Special Conditions: Embraer S.A. Model ERJ 190-300 Airplane; …".
- Kept now: 2, both "Embraer Executive Aircraft, Inc.".
- Across 18 affected companies sampled live: 22 before, 7 now. Tenaris, Equinor, Ferrari and ENI each gained 1–2 subsidiary documents; the other companies sampled had none either way.

**What is wrong:** The cleanup made the everyday name shorter but did not teach the company-word test the legal forms it now strips. A title carrying the company's exact legal name is rejected.
**Why it matters:** ERJ's page loses its FAA special conditions and exemption petitions on the next ingest. The same thing happens to any of the 66 whose documents are titled with their legal form. `check:wiring` only added multi-word cases (Toyota Motor, Estée Lauder Companies), so nothing failed.
**Suggested fix:** For the everyday name, also accept the words form of the EDGAR title with its tags removed but its legal form kept ("embraer s a"). Or let the company-word test read the forms `LEGAL_SUFFIX` strips as they look after `words()` ("s a", "n v", "a s", "s p a", "asa", "ab", "oyj", "tbk", "sab"). Add "Special Conditions: Embraer S.A., Model ERJ 190-300…" and "Ferrari N.V.; …" to `check:wiring`.
*Importance:* high · *Efficiency:* high (small change) · *Practicality:* high

### 2. Other names exist only in key form ("j b hunt", "u s bancorp", "angies list"): Federal Register search finds nothing and headlines aren't recognised · `P1`
**Evidence:**
- An alias entry stores only its `nameKey` key (`lib/companyAliases.ts:30-31`, `:56`). `nameKey` deletes apostrophes and turns periods, hyphens and slashes into spaces.
- `newsNamesFor` returns those keys lowercased (`lib/sec.ts:282-289`), and they go unchanged to GDELT, to the Federal Register term (`frSearchTerm`, `lib/frCompany.ts:48`) and to `mentions()`.
- `mentions()` folds accents only (`lib/enrich/relevance.ts:89-100`).
- The Federal Register `words()` turns apostrophes into spaces where `nameKey` deletes them (`lib/frCompany.ts:23-24`).
- About 20 of the 174 companies that have news names are affected (D.R. Horton, J.B. Hunt, T. Rowe Price, W.R. Berkley, A.O. Smith, U.S. Bancorp, K. Hovnanian, Yandex N.V., M/A-COM, Take-Two, Mettler-Toledo, Cal-Maine, Owens-Illinois, Phillips-Van Heusen, O'Reilly, Angie's List, Dave & Buster's, Papa John's, BJ's, Pilgrim's).

Reproduction, headlines (`punct.ts`). In all 18 cases `mentions(headline, newsNamesFor(cik))` returns `none`. With ingest's full alias list:
```
DHI  "D.R. Horton beats estimates…"            oblique   JBHT "J.B. Hunt profit falls…"   oblique
WRB / AOS / USB / HOV                          oblique   OI "Owens-Illinois to close plant" none
ANGI "Angie's List rebrands"                   none      BJRI, PVH                         none
```
`oblique` goes to the paid model. `none` scores 0.2 under `npm run score -- --strict-headline`, which is below the 0.4 display floor.

Reproduction, Federal Register search, live (`fr-written.ts`):
```
"US BANCORP DE" | "u s bancorp"            -> 0 hits      "U.S. Bancorp" -> 108 hits, 2 the matcher would keep:
   2026-10015 U.S. Bancorp, et al.; Notice of Application and Temporary Order
   2022-03073 Public Meeting: Proposal by U.S. Bancorp To Acquire MUFG Union Bank, …
"HUNT J B TRANSPORT SERVICES" | "j b hunt" -> 6 hits, 0 kept   "J.B. Hunt" -> 13 hits, 2 kept:
   2017-03720 / 2017-01278 Controlled Substances and Alcohol Use and Testing: J.B. Hunt Transport, Inc., …
```
Reproduction, scoring of documents the matcher keeps: `titleNamesCompany` keeps "D.R. Horton, Inc.; …", "U.S. Bancorp; Order …", "W. R. Berkley Corporation; …", "K. Hovnanian Homes, Inc.; …", "Phillips-Van Heusen Corporation; …" and "Owens-Illinois, Inc.; …". For every one of them `deterministicScore(kind "regulation")` returns `null`, so it goes to the model. README.md:79 says "These are scored without the model: the title naming the company is the evidence."

One limit: GDELT rewrites headlines as "D . R . Horton". In the 36 live D.R. Horton results, both such headlines scored 0.9 through the token alias "horton", not through "d r horton". The scoring miss therefore lands on written headlines (Yahoo RSS) and on Federal Register titles.
**What is wrong:** The written form of each name is discarded when the file is built, and the three consumers normalise differently from `nameKey`.
**Why it matters:** For these companies, batch 27 adds no Federal Register documents, and batch 25's headline scoring adds nothing. The documents that do arrive cost model calls.
**Suggested fix:** Store the written form beside the key (for example the Wikidata label it came from) and send that to GDELT and the Federal Register. In `mentions()`, also test multi-word names against the padded `nameKey(title)`. In Federal Register `words()`, delete apostrophes as `nameKey` does. Add `check:aliases` cases for "D.R. Horton …", "U.S. Bancorp; Order" and "Angie's List …".
*Importance:* high · *Efficiency:* medium · *Practicality:* high

### 3. Multi-word other names skip the company-word test, so a leading "the" matches the article · `P1`
**Evidence:** `phraseNamesCompany` runs the company-word test only when the name has no space (`lib/frCompany.ts:79-84`). HIG's only other name is `"the hartford"`.

Live (`fr-generic.ts HIG`): 82 hits. 13 are kept, and 0 of them through the everyday name. Each scores 0.95 ("the document's title names the company"). 12 of the 13 match only on the article:
```
2017-23582 … To List and Trade Shares of the Hartford Schroders Tax-Aware Bond ETF Under NYSE Arca Rule 8.600-E
2020-02278 … To List and Trade Shares of the Hartford Core Bond ETF of the Hartford Funds Exchange-Traded Trust
2019-26406 … Proposed Rule Change To Allow the Hartford Short Duration ETF To Hold Certain Fixed Income Instruments
```
Offline, with the code as it stands, these invented titles are kept and scored 0.95:
```
true 0.95  Air Plan Approval; Connecticut; Reasonably Available Control Technology for the Hartford Area
true 0.95  Drawbridge Operation Regulation; Connecticut River, Between Old Saybrook and the Hartford Line
```
**What is wrong:** "the X" is treated as a distinctive two-word phrase. One of its two words is the grammatical article, so any "the Hartford <noun>" matches.
**Why it matters:** HIG's page gets a dozen exchange filings for listing ETF shares, shown as the insurer's own regulatory events at 0.95. Whether Hartford Funds' ETFs count as HIG's is debatable, but the match is accidental, and the same path would admit EPA or Coast Guard notices about the city. Batch 27's "every one read and the right company's" covered 15 companies, and HIG was not one of them.
**Suggested fix:** Drop a leading "the" before matching, so "the hartford" is handled as "hartford" with the one-word window of 1. Or apply the company-word test to any other name whose first word is in `GENERIC`.
*Importance:* medium-high · *Efficiency:* high · *Practicality:* high

### 4. Some everyday names still end in a legal form or tag, and `check:recall`'s sweep cannot see them · `P1`
**Evidence:** `LEGAL_SUFFIX` only matches adjacent letters (`s\.?a`, `n\.?v`, `l\.?p`), and nothing strips a parenthesised tag or a trailing "DE" that has no slash. Of all titles, 18 keep a legal form (`under.ts`), including:
```
USB  "US BANCORP DE"  →  "US BANCORP DE"        AYI  "ACUITY INC. (DE)"  →  "ACUITY INC. (DE)"
"TELEFONICA S A", "CREDIT AGRICOLE S A", "SOLVAY S A", "HEINEKEN HOLDING N V", "WOLTERS KLUWER N V",
"FERRELLGAS PARTNERS L P", "BROADWAY FINANCIAL CORP DE", "Vantage Corp (Singapore)", "111, Inc.", "1606 CORP."
```
- Live Federal Register: `"US BANCORP DE"` returns 0 hits and `"U.S. Bancorp"` returns 108. `"ACUITY INC. (DE)"` returns 0 and `"Acuity Brands"` returns 36. These strings are also what GDELT is asked for.
- `scripts/check-recall.ts:71-73` claims "no everyday name in the committed index keeps a mark or a legal form" and passes. Its `LEFT_OVER` pattern does not cover spaced forms, `INC.`/`CORP.` before a "(DE)"-style tag, or a trailing ` DE`.
- The digits guard rejects the whole cleanup step at once, so "111, Inc." keeps its comma and "Inc." where only the "Inc." needed to stay.

**What is wrong:** Batch 26's sweep missed the spaced and parenthesised variants, and the check meant to catch leftovers cannot see them. This is not a regression; the names were like this before.
**Why it matters:** The news and Federal Register searches for USB (a top-10 US bank) and AYI (an S&P 400 company) ask for strings that match nothing.
**Suggested fix:** Allow an optional space inside "S A", "N V" and "L P". Strip a final parenthesised state, country or "publ" tag and a trailing ` DE`. Widen `LEFT_OVER` to the same forms so the sweep can fail. Apply the digits guard to each replacement, not the whole step.
*Importance:* medium · *Efficiency:* high · *Practicality:* high

### 5. Accents are not folded in fund-name search or in suggestions, despite `lib/fold.ts:3` saying "Every comparison of names folds first" · `P2`
**Evidence:** `matchFundName` / `fundNameCandidates` compare plain uppercase (`lib/sec.ts:361-368`). `fuzzy.matchWords` splits words at an accented letter (`lib/fuzzy.ts:22-28`). The compact name form and `phrase()` don't fold either; their EDGAR side is all ASCII (0 of 10,443 titles), so only the query side is exposed. Full search with the database down (`search.ts`):
```
"Nestlé"  → suggest [NSRH, EGGQ "NestYield Visionary ETF", …]     "Nestle"  → company NSRH
"L'Oréal" → none                                                  "L'Oreal" → company LRLH
"Zürich"  → suggest [Rich Sparkle Holdings, RICHTECH ROBOTICS, RICHAR…]   "Zurich" → none
```
**What is wrong:** An accented query gets a different answer from the same query typed without the accent, and "Zürich" offers three unrelated companies.
**Why it matters:** These are the visible search answers for names people type with accents. The comment in `lib/fold.ts` tells the next developer the problem is already solved.
**Suggested fix:** Fold accents in `fundNameCandidates` (both sides) and in `matchWords`, or narrow the comment to the paths that actually fold.
*Importance:* low-medium · *Efficiency:* high · *Practicality:* high

### 6. The page-furniture filter runs after the names are trimmed, so the useful forms are already gone · `P2`
**Evidence:**
- The file holds `FACEBOOK INC` and `GOOGLE LLC` / `GOOGLE INC`, all with news = 1.
- `newsNamesFor` drops a name that contains a shorter kept one (`lib/sec.ts:288`). Then `gdeltNames` drops the short one as page furniture (`lib/news.ts:33-47`).
- `gdeltNames("Meta Platforms", newsNamesFor(1326801))` returns `["Meta Platforms","thefacebook"]`, a name last used in 2005. Alphabet's query carries no other name at all.
- `check:aliases` asserts this outcome as correct.

**Why it matters:** For the companies the batch was written for, the GDELT query widens with the least useful name. "Facebook Inc" (Meta's legal name 2004–2021) and "Google LLC" are not furniture.
**Suggested fix:** Apply `PAGE_FURNITURE` before the containment rule and the three-name cap when building the GDELT list, or let `gdeltNames` fall back to the longer names that were dropped when the short one is furniture.
*Importance:* low · *Efficiency:* medium · *Practicality:* high

### 7. README contradicts the code on what the other names do · `P2`
**Evidence:**
- README.md:526, the Wikidata row: "Other names for listed companies, for search only". The same README's GDELT and Federal Register rows, and `scripts/ingest.ts`, `scripts/score.ts` and `lib/frCompany.ts`, use them for news queries, headline scoring and the company Federal Register feed.
- README.md:79: "These are scored without the model". This is false for the documents in finding 2.

**Suggested fix:** Reword the Wikidata row. Qualify line 79, or make it true by fixing finding 2.
*Importance:* low · *Efficiency:* high · *Practicality:* high

## Checks that could not be run
- `npm run sync:aliases`: it writes `data/company-aliases.json` (out of bounds for this audit), and the saved Wikidata read is not in the repo. The file was checked against invariants instead (below).
- `check:live` / `check:feeds` / `check:ui`: not run. GDELT returned HTTP 429 to 12 of 14 probe requests, and there was no running server for `check:ui`.

## Checked and fine
- **Alias file against current code** (`inv.ts`):
  - Every key equals `nameKey(key)` and every CIK is listed.
  - No `KNOWN_WRONG` QID appears, and every Motorola (`KNOWN_NOT_NEWS`) entry has news = 0.
  - No key is another company's title or everyday name, and none is an exact title match.
  - Every key that finds its own company is news = 1 and doesn't contain the name already asked for.
  - No smaller company overrides a prefix hit, and no QID maps to two CIKs.
  - The 23 one-word news names are all well-known or coined.
  - Totals are 1,528 names and 546 for news, matching the ledger.
- **`commonName` over 8,028 titles:** 313 change, as documented. No new everyday-name collision between CIKs. The only tokens removed are legal forms or places (llc, tbk, asa, spa, sab, oyj, cayman, delaware, canada, marshall islands, new); no real word is cut. The suggest index's core words: 63 titles lost a legal-form word, none gained or emptied.
- **`listedNamesContaining` after batch 26:** 5 companies gained longer "owners" of their mentions, all genuinely different companies (Santander → its Brasil and Chile units, AllianceBernstein → 2 AB funds, Light → Light & Wonder and others, Orion → 6, SES → SES AI). None lost one. Other names are owned only by GS's BDC, ETF and trusts, by Toyota Tsusho, and by T. Rowe's crypto ETF; all correct.
- **Ledger numbers reproduce:** 315 GDELT queries changed by batch 26 (recomputed). 174 companies with news names and 172 wider queries, which is batch 25's 190/188 minus batch 26's 12 + 4. 36 suites; `check:wiring` 182, `check:aliases` 81, `check:recall` 34.
- **`mentions()` index math:** the title and its lowercase both come from the folded string, and after folding `toLowerCase` keeps the length ("İ" folds to "I" first). Folding produced no wrong `named` or `oblique`.
- **GDELT fallback:**
  - Bounded: the inner call has no other names, so it makes at most 2 requests with one 5.5 s sleep. A mocked total refusal returns `error` with "other names refused: …; non-JSON body". That wording blames the other names even when the everyday name was refused; cosmetic.
  - Dedup works: `gdeltNames` compares exact lowercase, but `newsNamesFor` already removed names equal to or containing the name asked for.
  - Live: `("HORTON D R" OR "d r horton")` returned 36 articles where `"HORTON D R"` alone returned `{}`. GDELT does accept one-letter words in a phrase, which answers batch 25's open note.
- **`frSearchTerm` quoting:** no EDGAR title contains `"` or `|`, and alias keys can't, so no broken term can be built today. `words()` dedup merges "J&J SNACK FOODS" with "j & j snack foods".
- **Live Federal Register spot checks (26 companies):** other names added correct documents for EPD, JCI ("Johnson Controls, Inc." waivers) and ALK ("Alaska Airlines"). "career education", "life time", "check point", "radio one", "new oriental", "alliance data" and "capital one" admitted nothing wrong.
- **Wiring:** `fr-company-report` passes the names consistently to both fetch and tally, and the CIK reaches `newsNamesFor` via `Number()` from both the database and `resolveCompany`. Ingest and re-scoring both read `newsNamesFor`.

Opportunity (one line, not a finding): store each alias's written label next to its key. That fixes finding 2 and gives `/company` pages a display name for "formerly known as".
