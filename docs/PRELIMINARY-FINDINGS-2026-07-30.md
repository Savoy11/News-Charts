# Preliminary findings — 2026-07-30

> **Provenance: this was NOT produced by `code-auditor` or `opportunity-scout`.**
> It came from two general-purpose agents run as stand-ins on 2026-07-30, before the real
> agent definitions were installed in this repo. It does not follow the auditor's evidence
> rule, it is not a dated audit report, and it does **not** live in `docs/audits/` — that
> directory is reserved for real `code-auditor` output so the two are never confused.
>
> Treat everything here as **leads to verify**, not as a baseline. The first real baseline
> is the `code-auditor` run described in `docs/IMPROVEMENT-AGENT-SETUP.md`.
>
> **Neither stand-in ran anything** — every item below was reached by reading code, with no
> `tsc`, lint or offline-suite results behind it.
>
> **Correction (same day):** the stand-ins reported this as impossible, and that was wrong.
> A later `code-auditor` run installed dependencies successfully via
> `npm install --ignore-scripts` through the agent proxy and executed `tsc --noEmit` (clean),
> `npm run lint` (2 `react-hooks/exhaustive-deps` warnings) and all 19 offline suites (pass).
> So the absence of results here is a limitation of that stand-in run, **not** of the
> environment. See `docs/audits/2026-07-30-audit.md`.
>
> What genuinely cannot run here is `npm run check:feeds` — egress to GDELT / Wikipedia /
> SEC / Yahoo is blocked from this container, so it would report a false negative rather
> than no result. No feed behaviour was observed.

---

## Independently verified

These were re-checked directly rather than taken on the agent's word.

### The scheduler cut-over orphaned ten adapters

Commit `813d505` ("Refresh on a schedule; pages read the database and nothing else") removed
live fetching from `lib/page-data.ts` on the stated basis that it "now lives only there" in
`scripts/ingest.ts`. The second half did not happen.

`getYahooFinanceNews`, `getNytNews`, `getGuardianNews`, `getNewsdataNews`, `getGnewsNews`,
`getCurrentsNews`, `getMarketauxNews`, `getEodhdNews`, `getFinnhubNews` (`lib/newsExtra.ts`)
and `getArchiveItems` (`lib/archive.ts`) are referenced by exactly two files —
`scripts/check-feeds.ts` and `scripts/check-commercial-mode.ts`, both diagnostics. Nothing in
the ingest path calls any of them.

**`npm run check:feeds` calls the adapters directly, so it reports these green while the
pipeline ingests nothing from them.** That is the "a 200 carrying fallback data" misdirection
class this project already knows about, and it means the ⛔ feed gate is currently pricing
licences for sources that feed nothing. Do not buy against `cost-report`'s numbers until the
wiring is confirmed.

### `npm run refresh` ignores the per-source windows

`scripts/refresh.ts:22` describes `selectStaleSources` in a comment. Its imports (lines 24-28)
never pull in `selectStaleSources` or `ttlFor`. The only real caller of either is
`scripts/check-refresh.ts` — the test. So the window logic is exercised solely by its own test,
and the reported consequence is an hourly run re-asking Wikipedia and Chronicling America far
inside their declared windows.

### On-chain subjects never refresh on schedule

`scripts/refresh.ts:25` imports `ingestCompany, ingestTopic` and no `ingestOnchain`. Crypto
assets are `kind='topic'` by design, so they go through the topic path.

The reported second-order effect — that `upsertSubject` would then let Wikipedia overwrite
`/topic/dai`'s display name and summary via a fuzzy match on the bare string "dai" — is
**not verified**. I did not read `upsertSubject`. Worth checking, because it is the
confidently-wrong-page failure mode the prompt-parsing work was written about.

### `governance` and `exploit` events are filtered out of every topic page

`components/TopicExplorer.tsx:25-33` lists exactly five filters:

```ts
const FILTERS: { key: EventType; label: string }[] = [
  { key: "history",  label: "History" },
  { key: "citation", label: "Cited articles" },
  { key: "press",    label: "Historical press" },
  { key: "news",     label: "Recent news" },
  { key: "onchain",  label: "On-chain" },
];
```

`db/011_governance_kind.sql` and `db/012_exploit_kind.sql` both exist. `ALL_TYPES` derives from
`FILTERS`, `active` is seeded from `ALL_TYPES`, and the render filters on `active` — so
governance and exploit rows are discarded, and because the chip row also derives from `FILTERS`
there is no control to turn them back on.

Deriving from `FILTERS` keeps the default set and the chip list in step, but does not make
`FILTERS` exhaustive over `EventType`, and a `Set<EventType>` cannot be exhaustiveness-checked,
so `tsc` is silent. The reported blast radius — `/topic/uni` and `/topic/aave` being
governance-only subjects that would render an empty timeline while the Sources panel reports
Snapshot contributing events — follows from the filter but was **not** observed in a browser.
The Phase 2 checklist block is marked `[x]`.

### `/api/group` emits a removed field

`app/api/group/route.ts:51` — `yearOnly: r.date_precision === "year"`. The type dropped
`yearOnly` in favour of `precision`. `tsc` cannot see it because the query is called without a
row generic, so `rows` is `any[]` and the assignment skips excess/missing property checking.

### Migration count

The repo has **14** migrations (`db/001`–`014`), not the 7 stated in `MASTER-CHECKLIST.md`
line 34.

---

## Reported, not verified

- **`/compare` discards a topic's price series.** `lib/compare.ts` reportedly hardcodes
  `prices: []` on the topic branch while `getTopicPageData` returns a real array. If so,
  `/compare?a=btc&b=eth` loses the growth-of-100 overlay — the same symptom as the bug the
  checklist records as fixed, through a different code path. Also reported: `resolveCompany`
  (EDGAR) still runs *before* the DB lookup in that function, the network-before-local shape
  this project has been bitten by before.
- **Deterministic relevance scores 0.9 on a single generic token.** `aliasesFor` reportedly
  keeps every word >2 chars against an 11-word stoplist and `mentions` returns true on *any*
  alias match, so "General strike halts European ports" scores 0.9 for "General Motors Company"
  and short-circuits the model tier. `lib/newsQuality.ts` reportedly solves the same problem
  correctly with a `WEAK` set — worth comparing the two directly.
- **`date` columns shift a day on non-UTC hosts.** `node-pg` parses PG `date` into a JS `Date`
  at local midnight and no custom type parser is registered, so `.toISOString().slice(0,10)`
  shifts back one day at positive UTC offsets. Reported as latent because Vercel defaults to
  `TZ=UTC`. Needs `TZ=Europe/Berlin` against a seeded DB to observe.
- **`ingestTopic` re-creates duplicate topic subjects** that `db/005` exists to clean up, by
  keying on the typed slug rather than the Wikipedia article. `upsertTopicSubject` reportedly
  does it correctly and is called only by the seed script.
- **`crossPeerWeeks` has no relevance filter** where the two sibling signal queries do, so a
  low-relevance event hidden from every page can still generate a signal that the paid explain
  pass narrates and pins.
- **`price_divergence` compares returns over different windows** — per-member first/last close
  with nothing enforcing a common start date.
- **A company with events but no price rows renders as "not indexed"**, and the price write sits
  outside `runSource` so the failure is never recorded in `source_fetches`.
- **`getFilings` reads only `filings.recent`**, silently truncating history for high-volume
  filers — the coverage-honesty hazard `docs/COVERAGE-MAP.md` names.
- **Doc drift:** `README.md` reportedly still describes `lib/page-data.ts` as a read-through
  cache with `stored`/`live` badges (deleted by `813d505`), still lists the Internet Archive as
  rejected while `lib/archive.ts` ships, and still says the confirmation-lag policy has to land
  when `lib/onchain/finality.ts` exists.

---

## The one proposal worth reading first

A **wiring/reachability check** (`scripts/check-wiring.ts`). Every verified finding above is one
shape: an exported adapter carrying a registered `SourceKey`, with a passing check, that no entry
point calls. Nineteen offline suites test behaviour; none tests reachability, and `tsc` cannot —
an unused export is legal. A check asserting that every `SOURCES` key has a call site in the
ingest path, that every `SOURCE_TTL_MINUTES` key is consulted by the thing that fetches, and that
`refresh.ts` covers every subject kind an ingester exists for, would have caught all of them on
the day they landed. It is the only item here that prevents the *next* one.

Also flagged: `applyRelevanceFloor`, `titleNamesSubject` and `LOOSE_SOURCES`
(`lib/newsQuality.ts`) reportedly have no callers outside their own check — the aggregator
relevance floor only ever ran on the deleted page path.
