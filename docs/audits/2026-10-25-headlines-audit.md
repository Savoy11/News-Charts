# Code audit — 2026-10-25 (batches 42–46: SEC headlines, fund structured data)

**Commit:** 258d6dc (range `ff7a6de..258d6dc`, PRs #71–#75) · **Checks run:** `npm run check` (47 scripts, all pass; `check:sec-headlines` 177/177, `check:security-kind` 29/29, `tsc` clean), `npm run lint` (clean), plus live EDGAR reads through the production reader (`readFilingHeadline`): the 92 fixture filings, and about 430 recent 8-Ks/6-Ks from 37 companies · **Checks skipped:** `next build` (it writes `.next/`, and this pass changes nothing but this file), `check:ui` (needs a running server, a browser and the demo database), `check:feeds`/`check:live` (neither covers the headline reader: `grep -i headline scripts/check-feeds.ts scripts/check-live.ts` finds only GDELT/Yahoo news headlines).

**Where this ran:** the build container. EDGAR *was* reachable through the agent proxy. Node's `fetch` needs `NODE_USE_ENV_PROXY=1` to use it; without that every read failed with `TypeError: fetch failed`, which is the container, not EDGAR.

## Summary
The 8-K side is in good shape. The fixtures match the live server: 90 of 92 fixture filings read live give the fixture's headline, and the 2 that differ are filings where the fixture tests a second, non-release exhibit. US 8-Ks read well. The 6-K side gives confidently wrong titles for whole filers that the batch-43 sample never covered: Japanese banks' signature blocks, every GSK release, and a past release's title read out of a dated release's body. Each of these titles carries the description "The headline is the press release's". Fix the cover-page cut and the GSK date line first, because together they cover 21 of the 35 headlines read from those four filers.

## Findings

### 1. Japanese banks' 6-Ks are titled by their signature block · `P1`
**Evidence:** I read live the 25 newest 6-Ks each of MUFG, Mizuho and SMFG. Of MUFG's 13 headlines, 10 are signature text. For example, `MITSUBISHI UFJ FINANCIAL GROUP INC: By: /s/ Yoshitaka Sekine Name: Yoshitaka Sekine (6-K)` (000119312526283770, 000119312526225084, 000119312526225081, 000119312526092418, 000119312526032566), and `…: Managing Director, Head of Documentation & Corporate Secretary Department, Corporate Administration Division (6-K)` (000119312526350183 and four more). Mizuho has 3 of 4: `MIZUHO FINANCIAL GROUP INC: By: /s/ Makoto Samejima Name: Makoto Samejima (6-K)` (000119312526324804, …231899, …225227). SMFG has 1 of 11: `Executive Officer & General Manager, Financial Accounting Dept` (000119312526350182). In MUFG 000119312526350183 the real headline, "Risk-Adjusted Capital Ratio Based on the Basel 3 Standards for the First Quarter Ended June 30, 2026", sits two lines below the job title.
**What is wrong:** `afterCoverPage` (`lib/secHeadlines.ts:512-519`) stops at the first line of 200 characters or more (`:516`). These filers put the 428-character legend "THIS REPORT ON FORM 6-K SHALL BE DEEMED TO BE INCORPORATED BY REFERENCE…" (368 characters in Mizuho's version) above their `SIGNATURES` block. The cut therefore stops at line 21 of 169 (MUFG) or line 16 of 66 (Mizuho), and the `/s/` line at 27 or 22 is never reached. The signature then becomes the first headline candidate above the dateline or lead (`:608`).
**Why it matters:** A bank's capital-ratio or buyback announcement shows on the timeline as a person's name, and the description says it is the press release's headline. Before batch 43 it read "6-K filing", which was vague but true.
**Suggested fix:** Recognise the incorporation-by-reference legend as a cover-page phrase, and/or make `By:`/`/s/`/`Name:`/`Title:` lines boilerplate. Add one of these documents to the fixture.
*Importance:* high: wrong titles across whole filers · *Efficiency:* high: one rule · *Practicality:* high

### 2. Every GSK release is titled "Issued: <date>, London UK" · `P1`
**Evidence:** Live, GSK's 25 newest 6-Ks give 7 headlines, and all 7 are this line. For example, 000165495426009062 → `GSK plc: Issued: 20 October 2026, London UK (6-K)`. In that document, line 0 after the cover cut is `Issued: 20 October 2026, London UK`, and line 1 is the actual headline, `Hibsago (bepirovirsen) approved in the US for the treatment of chronic hepatitis B (CHB)`, an FDA approval. The lead is at line 5.
**What is wrong:** "Issued: <date>, <place>" matches neither `LETTERHEAD` nor `NOISE` (`lib/secHeadlines.ts:224-281`). The `NOISE` place-and-date rule (`:280`) needs the line to open on the place. With 4 or more lettered words and no closing period, the line passes `headlineLike`, and `pressReleaseHeadline` takes the first candidate after the letterhead (`:608`). That candidate sits above the real headline.
**Why it matters:** Price-moving releases (drug approvals) carry a date as their title and are labelled as the release's own headline. A focus search for "approval" cannot find them.
**Suggested fix:** Treat an "Issued:"/"Date:"-style date line as `NOISE`, and keep a GSK release as a fixture case.
*Importance:* high · *Efficiency:* high: one pattern · *Practicality:* high

### 3. The "listed release" rule reads any document's body, ahead of its dateline, and can throw · `P1`
**Evidence:**
- Live: SMFG 000119312526405895 (filed 2026-09-29) is titled `SMBC Group Announces Change of Subsidiary (Sub-Subsidiary) in connection with the Transition to an Intermediate Holding Company Structure in Japan and Progress on the Establishment of a Japanese Equities Joint Venture with Jefferies`. That is the title of SMFG's *2026-05-12* filing, word for word. The document's own headline is at lines 6–8, `SMBC Group Announces Decision to Execute a Share Exchange Agreement regarding Change of Subsidiary…`, and its dateline is at line 9. The dateline line itself goes on "…announced in its press release dated May 12, 2026, entitled “…”".
- Probe output (scratch script, synthetic inputs): `Press Release: October 24, 2026` above a real headline and dateline gives the headline `"October 24, 2026"`. `Contact for this press release: Jane Doe, Investor Relations` gives `"Jane Doe, Investor Relations"`. `Press release: ------------` throws `Cannot read properties of undefined (reading 'toUpperCase')`, because `tidy` strips the match to "" before `title[0]` (`:557`).
**What is wrong:** `listedRelease` (`lib/secHeadlines.ts:543-560`) runs on every document, 8-K exhibits included, and before `findDateline` (`:596-598`). Its patterns accept a quoted title anywhere in a sentence (`:550`) and any text after "press release:" (`:552`). README:351-352 describes the rule as being for a Japanese 6-K that *lists* what it carries. A throw is caught for each filing in `withSecHeadlines` (`lib/ingest/headlines.ts:120-124`). So that filing is never stored, is re-read (2–4 EDGAR requests) every run, and counts toward the 3-failures stop (`:133`). Three such filings in a row would stop every run for that company at the same place.
**Why it matters:** A filing gets another filing's headline, which is a plausible but wrong statement of what was announced and on which day.
**Suggested fix:** Limit the rule to the cover/list position it was built for, below any dateline already found. Never let a sentence that cites an earlier release supply the title. Return null rather than index an empty title.
*Importance:* medium-high: wrong but plausible, one live case · *Efficiency:* high · *Practicality:* high

### 4. `&euro;`, `&pound;`, `&yen;` and other common entities reach titles undecoded · `P2`
**Evidence:** Live, SAP 000110465925102307 → `SAP SE: Current cloud backlog of &euro;18.8 billion, up 23% and up 27% at constant currencies (6-K)`. Probe: `textLines("<p>&euro; &pound; &yen; &cent; &sect; &deg; &frac12; &ccedil; &eacute; &#8364;</p>")` gives `"&euro; &pound; &yen; &cent; &sect; &deg; &frac12; ç é €"`. `grep -c "&euro;\|&pound;" scripts/fixtures/sec-headlines.json` gives `0`.
**What is wrong:** `ENTITIES` (`lib/secHeadlines.ts:74-84`) covers punctuation and the Latin-1 letters from 0xC0 up, but not the symbols at 0xA0–0xBF or `&euro;`. `decode` (`:100`) leaves an unknown name as written, and React renders it literally.
**Why it matters:** A currency figure in a European or UK filer's title is shown garbled. The subheadline-as-title for SAP is already tracked; this entity bug is not.
**Suggested fix:** Decode the HTML named entities in full, or at least euro, pound, yen, cent, deg, sect and the fractions.
*Importance:* medium · *Efficiency:* high · *Practicality:* high

### 5. The reader's own documentation describes the batch-42 rule only · `P2`
**Evidence:** `lib/secHeadlines.ts:10-13` says "A document counts as a press release only when it has a dateline… without one it gives nothing". `pressReleaseHeadline` titles documents with no dateline by `listedRelease` (`:596`), `findLead` (`:599`) and `resultsHeadline` (`:600`). `db/029_sec_headlines.sql:1,4` says "headlines read from 8-K exhibits" and "two or three EDGAR requests". 6-Ks are read too, and `readFilingHeadline` makes up to four requests (`:715-718`). README:351-352 scopes the listed-title rule to Japanese 6-Ks; see finding 3.
**What is wrong:** The module header and the migration comment describe batch 42's reader, not the current one.
**Why it matters:** The next person to tune the reader starts from a rule it no longer follows, and that is how finding 3's ordering goes unnoticed.
**Suggested fix:** Update the header to list the four ways a document is marked as a release, in the order they are tried.
*Importance:* low · *Efficiency:* high · *Practicality:* high

Set aside (5): three headlines run on into a table header or label (WFC's last two results releases end "…Company-wide Financial Summary Quarter ended Sep 30, 2026 Sep 30"; a Toyota deck title; BP "…dated 02 September 2026 Exhibit 1.1"), which falls under the open "run into a subheadline" item; and two restatements of tracked items ("Jpmorganchase", SAP's subheadline).

## Checks that could not be run
- `next build`: not run, because it writes `.next/` and this pass was limited to one file.
- `check:ui`: needs `npm run dev`, Playwright and the seeded demo database. It was not set up in this pass.
- `check:feeds`/`check:live`: not run. Neither exercises the headline reader, so the live EDGAR reads above stand in for them.

## Examined and clean
- **Applying twice, wrong events, amendments:** `applyHeadlines` has two callers (`lib/ingest/firstPass.ts:280`, `lib/ingest/headlines.ts:137`). Both start from item titles freshly built by `getFilings`/`getFilingsDeep`, so a stored title is never retitled. A 6-K's retitled form, "(6-K)", no longer matches `RELEASE_TITLE` in any case. `mayCarryRelease` requires the `lib/sec.ts` title shape and an 18-digit accession, and only SEC filings are passed. 8-K/A titles keep their form. The event identity is `sec:${accession}` (`lib/sec.ts:964`), so a new title or link updates the row instead of duplicating it, and the attestation link is replaced (`lib/ingest/store.ts:903-904`).
- **Version re-read:** older-version rows are due again newest first, up to 150 a run, and are applied until re-read. A failure (`null` or a throw) is not stored. A 404 is stored as "none", as documented. The headline step runs before `BEGIN` in `runSource` (`scripts/ingest.ts:192-204`), so a SQL error there cannot abort the filings' transaction.
- **Odd input:** empty and whitespace documents, empty index pages and empty submissions return null or empty without throwing. The only throw found is finding 3. One catastrophic-backtracking pattern exists: `LETTERHEAD` `:236` (`director|manager … .* relations|…`) is O(matches × length) on a run of text with no block tags (0.5 MB → 4.3 s, 2 MB → 69 s, synthetic). No real document came near it: the largest live documents read (up to 1.35 MB) all have block tags, and the real "run together" releases in the fixture are 15–61 KB in full. Not a finding.
- **Fixtures vs live:** 90/92 fixture filings give the same headline live (see the Summary). The fixtures are real captures, not assumptions.
- **Checks:** nothing found that cannot fail. Every name and ticker `check-security-kind.ts` relies on is in the committed index (ANTA, NTRS, ARCC, SPY…, so `security()` never falls back to the bare ticker). `check-sec-headlines.ts`'s stand-in database implements both statements the code issues and throws on any other.
- **Batch 46:** `isFund`, `securityLd` and the page/metadata wiring match the checklist. `fund` is set in the one `CompanyPageData` constructor.

Opportunity (for the scout): the headline reader has no standing live check. A small sampled read like the one above would have caught findings 1–3.
