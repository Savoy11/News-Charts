# What needs you

**A view of `docs/MASTER-CHECKLIST.md`, not a second checklist.** Deliberately no checkboxes here
— items are ticked in the master checklist, and two lists that can disagree are worse than one
long one. This exists because that file is ~1,100 lines and mixes work that can be done in a
build container with work only you can do. This is the second kind, in the order I'd do it.

**Last updated:** 2026-08-12

---

## 1. Verify, before deciding anything (~30 min)

Nothing below this line can be judged until this is done. **No adapter in the last 23 commits has
ever made a live request** — egress is blocked from the build container by policy, so every
payload shape comes from published documentation and is pinned against canned responses. The
checks prove the parsing, not the endpoints.

```bash
npm run check:feeds            # defaults to BABA
npm run check:feeds NVDA       # a second company
npm run check:feeds bicycle    # a topic — different code path
npm run verify:addresses       # the on-chain address book, against the chain
```

Run from the **production host, not a laptop** — several sources behave differently from
datacenter IPs, and that is a checklist item in its own right.

Each feed reports one of three things, and the distinction is the point: `✓ N articles`,
`⚠ 0 articles` (reachable but empty — key or plan wrong), or `— no KEY set` (deliberately off).

**Three specific things to look at:**

| What | Why it matters |
| --- | --- |
| **Exploit amounts** | DefiLlama reports *millions* of USD. If that assumption is wrong every figure is off by 10⁶ — `$600` where `$600m` belongs. Glaring on screen, invisible offline. |
| **BYO feed keys** (NYT/Guardian) | Needs a browser, not `check:feeds`. Settings → News feed keys → paste a real key → load a company page. **A CORS rejection looks identical to a wrong key: no articles, no error.** |
| **Governance + USDT** | `check:feeds` reports per space and per token, so a zero is visible rather than assumed. A wrong Snapshot space id returns an empty list that reads as a quiet month. |

## 2. Turn on the scheduler (blocks everything)

`npm run refresh`, hourly. Cron, a GitHub Actions workflow, or the host's scheduler.

**Nothing runs this automatically yet.** Pages now read the database and never fetch, so this is
the only thing that refreshes a chart — and a scheduler that is not running looks exactly like a
quiet news week. Until it runs, the corpus only changes when you run it by hand.

```bash
npm run refresh -- --dry-run   # what it would touch, spending nothing
npm run refresh                # for real
npm run cost-report            # what it actually spent, against each free tier
```

## 3. The licensing decisions (the real blocker)

**Every free tier you are on is non-commercial.** Nine calls, each with three possible answers:
upgrade, drop the key at launch, or — for NYT and the Guardian only — ship BYO-key.

| Source | Options |
| --- | --- |
| Newsdata, GNews, Currents, Marketaux, EODHD, Finnhub | Upgrade to paid, or drop at launch |
| **Guardian** | Commercial key, drop, **or BYO-only** |
| **NYT** | No self-serve commercial tier — negotiate, drop, **or BYO-only** |
| **Yahoo Finance RSS** | Gray zone. Read the ToS and settle it — it is flagged `commercialOk: true` today, so it keeps fetching on the assumption you have decided |

Two things worth knowing before you spend:

- **`npm run cost-report` already found EODHD at 100% of its free tier at five subjects.** GNews
  covers ~25 subjects, Marketaux ~16. Subject capacity is the number that turns a quota into a
  decision.
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

---

## Decisions I can't make for you

Not blocking launch, but they shape what gets built next:

- **How far the request queue is worked per run** (`--requests`, default 10). Too low and demand
  backs up; too high and new subjects crowd out refreshing the ones already on the site. The
  right number depends on real demand, which does not exist yet.
- **Affiliate links** — whether at all, and if so the neutrality rule and per-link disclosure.
  Nothing is built; the checklist records the constraints.
- **Accounts, i18n, geo-access** — each is a product direction rather than a task.

## What I can keep building without you

On-chain `P2` work (Tally governance, DefiLlama TVL, paginated backfill), NYT keyword tags, and
AI summary nodes. **I'd hold off**: each is another adapter shipped against an unverified payload,
and six are already waiting on §1. Validating those beats adding to the pile.

Two are genuinely blocked, not deferred: the **macro-event overlay** needs FOMC/CPI dates I cannot
verify from here, and **confirming exploits on-chain** needs a transaction reference DefiLlama may
not carry.
