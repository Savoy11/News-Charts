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
same names in one request and keeps a title only when it names one (`lib/frCompany.ts`). Every path
that scores a company's headlines — ingest, a first visit, `npm run score`, the backfill — takes its
names from one place, `companyScoringAliases` in `lib/scoringNames.ts`; build no second list.

A ticker whose company moved to a new SEC record — a holding-company reorganisation or redomicile
(XOM in 2026, Alphabet in 2015, Disney in 2019) — reads its earlier filings from the predecessor's
record up to the handover day, through the hand-checked map in `lib/predecessors.ts`; read its
header before adding an entry.

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
