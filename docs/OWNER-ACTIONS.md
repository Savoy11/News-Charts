# What needs you

**A view of `docs/MASTER-CHECKLIST.md`, not a second checklist.** Deliberately no checkboxes here
— items are ticked in the master checklist, and two lists that can disagree are worse than one
long one. This exists because that file is ~1,100 lines and mixes work that can be done in a
build container with work only you can do. This is the second kind, in the order I'd do it.

**Last updated:** 2026-10-17

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

`npm run refresh`, hourly. Cron, a GitHub Actions workflow, or the host's scheduler.

**Nothing runs this automatically yet.** Pages read the database — the only fetch on the page path
is one bounded gather the first time a subject is visited — so this is the only thing that
refreshes a chart — and a scheduler that is not running looks exactly like a
quiet news week. Until it runs, the corpus only changes when you run it by hand.

Before the first run on a new deploy, apply the schema: `npm run db:migrate` (db/021–025 came
with the October ledger batches).

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
- **Set `COMMERCIAL_MODE=true` in production the same day anything earns money.** Built and
  tested, off by default — right for development, wrong the moment an ad renders. **Affiliate
  links trigger this too, not just ads.**
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
  days old (NC-051). It is 66 days old today.
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

Raised by the October ledger batches, each recorded in the master checklist:

- **Soft 404s (NC-160).** Company and topic miss pages answer HTTP 200 because the loading
  screen starts the response first. The Next.js 16 upgrade (NC-166) did not change that, for
  browsers or for search-engine crawlers; sector misses now answer 404. A real 404 on company and
  topic pages means dropping their loading skeleton (a first search then waits up to ~8s on a
  blank screen).
- **Seven stale browser checks.** The prompt-search tests in `check:ui` expect behaviour switched
  off on 2026-08-08: rewrite them to today's behaviour, or keep them as the Prompt search v2 spec.
- **Wikipedia attribution (NC-047).** Confirm the credit beside the topic summary meets CC BY-SA.
- **Visitor Federal Register terms (NC-162).** Kept and rate-limited; the alternative is
  server-chosen term lists only.
- **Companies without prices (NC-103).** They now show their timeline with a "no price data"
  note instead of "not on News Charts yet". Say if the old behaviour should come back.

## What I can keep building without you

On-chain `P2` work (Tally governance, DefiLlama TVL, paginated backfill), NYT keyword tags, and
AI summary nodes. **I'd hold off**: each is another adapter shipped against an unverified payload,
and six are already waiting on §1. Validating those beats adding to the pile.

Two are genuinely blocked, not deferred: the **macro-event overlay** needs FOMC/CPI dates I cannot
verify from here, and **confirming exploits on-chain** needs a transaction reference DefiLlama may
not carry.
