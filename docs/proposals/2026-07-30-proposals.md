# Opportunity proposals — 2026-07-30

**Commit:** 38fc07ceb63a84fbd1d9c626702b3aa456d6fd58 · **Reviewed:** `README.md`, `docs/MASTER-CHECKLIST.md`, `docs/COVERAGE-MAP.md`, `docs/EVENTS-SCHEMA.md` (headers), `db/001`–`014`, `app/` routes, `lib/ingest/queue.ts`, `lib/seo.ts`, `app/sitemap.ts`, `app/api/suggestions/route.ts` · **Proposals:** 2

> Smoke-test run — deliberately scoped to two proposals, not a full survey.
> `docs/audits/rejected-proposals.md` does not exist yet (only `docs/audits/.gitkeep`), so no
> prior rejections could be checked against. `docs/proposals/` did not exist and was created by
> this run. `docs/ROADMAP.md` does not exist in this repo — `docs/MASTER-CHECKLIST.md` is the
> governing document.

Mark each proposal below: `APPROVED`, `REJECTED`, or `DEFERRED`, and add a
reason for anything rejected. Then run the scout in FILE mode.

---

## 1. Report on the demand queue — make `subject_requests` readable · proposed `P1` · target section: Scheduled refresh (needs a scheduler on the host)

**Status:** PENDING

**What:** A `npm run demand` report over `subject_requests`: most-wanted unfulfilled subjects with
their request counts and first/last-asked dates, plus a second block of requests carrying a
`last_error`. Read-only, no new table, no new page.

**Grounded in:** `db/014_subject_requests.sql` stores `requests`, `first_asked`, `last_asked`,
`fulfilled_at` and `last_error`. `lib/ingest/queue.ts` writes all five and reads back exactly four
columns for the runner (`pendingRequests()`, which already selects `id, slug, kind, ticker,
requests`). Nothing in `app/` reads the table at all — grep for `subject_requests` returns
`lib/ingest/queue.ts` and one checklist line, nothing else. `last_error` is written by
`markFailed()` and read by nobody, so a subject failing every hourly run is invisible outside
psql. This is data already collected, already paid for, and never surfaced.

**Who benefits and how:** The owner, on two decisions that exist today and cannot currently be
made. (a) The open `P2` item in this same section — *"Decide how far the request queue is worked
per run… The right number depends on real demand, which does not exist yet"* — is blocked on
precisely this readout; once the hourly scheduler (the `P0` above it) runs, demand exists but is
unreadable. (b) A repeatedly failing request is a subject a real visitor asked for and will never
get; `last_error` already knows why, and today no one ever sees it. Secondary: request counts are
the honest input to whether a subject deserves curation in `lib/suggestions.ts`.

**Cost:** Small — one script in the existing `scripts/` suite alongside `cost-report` and
`check:feeds`, two SELECTs against a table and index that already exist. No key, no licence, no
recurring cost.

**Depends on:** Useful immediately, most useful after `P0` "Run `npm run refresh` on a schedule".
This does **not** replace that `P2` sizing item — it is the instrument that lets it be decided, so
file it above that item rather than in place of it.

*Note on scope:* deliberately a CLI report, not a public page. The app has no auth, and what
visitors search for is not something to publish — a `/demand` page would expose visitor queries
and invite gaming of the ingest queue. If a public "most requested" surface is ever wanted it is a
separate decision with its own privacy argument.

*Importance:* medium-high — unblocks a decision already on the checklist and makes a silent
failure mode visible · *Efficiency:* high — two queries over existing schema, helper already
written · *Practicality:* high — no dependencies, no network, no risk to any render path

---

## 2. Give industry pages their own OpenGraph card · proposed `P2` · target section: Initiative: Hardening & follow-ups from the feed/UX build-out (2026-07 session)

**Status:** PENDING

**What:** Add `app/industry/[slug]/opengraph-image.tsx`, mirroring the company and topic cards, so
a shared sector-timeline link renders "<Industry name> · sector timeline" instead of the generic
site card.

**Grounded in:** Capability asymmetry, verified by file listing. `app/company/[ticker]/` and
`app/topic/[slug]/` each have an `opengraph-image.tsx`; `app/industry/[slug]/` has `loading.tsx`
and `page.tsx` and no image, so it falls through to `app/opengraph-image.tsx`'s
`ogCard("Timelines for analysts", "Research any topic on a timeline")`. Industry pages are
publicly indexed, not an internal view: `lib/seo.ts`'s `subjectPath()` maps `kind === "industry"`
to `/industry/${slug}`, and `app/sitemap.ts` emits every indexed subject through that function.
The page's own `generateMetadata` already declares `twitter: { card: "summary_large_image" }` and a
full `openGraph` block — so the large-image promise is made and the generic image is what fills it.

**Who benefits and how:** Traffic, which `README.md` states as the project's purpose ("Built to
drive traffic and ad revenue"). The sector timeline is the most distinctive thing Chronolens
produces — the README's own example is `INTC lagged the sector by 172.3 points` — and it is the
one page type whose social preview says nothing about what is on it. Also the asymmetry a reader
notices: sharing a company page looks bespoke, sharing the sector page it links to looks like a
stray homepage link.

**Cost:** Small, with one honest wrinkle. The existing cards are deliberately fetch-free (the
company card renders the ticker from `params` alone), but an industry slug is `sic-3674`, and a
card reading "sic-3674" would be worse than the generic one. So this card needs the display name,
which means calling the same `loadIndustry(slug)` the page's `generateMetadata` already calls — a
DB read in an OG route, which the other two do not do. Node runtime, already the case; fall back
to the generic card when the lookup fails. No key, no licence, no recurring cost.

**Depends on:** nothing.

*Importance:* medium — real but modest; it serves the stated traffic objective on the product's
most differentiated page · *Efficiency:* high — one small file, `ogCard` and the loader both exist
· *Practicality:* high — additive, no existing behaviour changes; the only judgement call is the
DB read, and it degrades to today's behaviour

---

## Considered and cut

- **Backfilling the 1963–2017 coverage gap.** `docs/COVERAGE-MAP.md` calls it "the single biggest
  hole in the corpus", which makes it look like the top opportunity here — but it is already the
  subject of the open `P1` initiative *"Historical article resurfacing — expand beyond Wikipedia"*,
  which carries its own coverage-map section. Raising it again would be noise, and re-prioritising
  it is not something a smoke-test survey has the grounding to argue.
- **An OG card for `/group/[name]`.** Same asymmetry on its face, but custom groups are
  visitor-local by design — `app/sitemap.ts` says so explicitly ("deliberately absent — they're
  private to a visitor's browser"). A share card for a private, unindexed page is not an
  opportunity, and building one would push against a decided position.
- **Blending most-requested subjects into the homepage chips.** `app/api/suggestions/route.ts`
  already blends subjects with 10+ events, so demand-ranking is a natural extension — but a
  *requested* subject has no events yet, so it would chip through to an empty page. Revisit only
  once the queue is actually being worked; proposal 1 is the prerequisite for even knowing whether
  there is demand to blend.
- **Anything touching Crypto-Stuff / CAEP / Finance Now.** The checklist's Scope & independence
  section rules the projects separate with no shared code or runtime coupling; nothing here
  crosses that line.

*One closing note, not a proposal:* nothing in this pass looked for defects — that is the
`code-auditor`'s job — and nothing that looked like one turned up in the small area read.
