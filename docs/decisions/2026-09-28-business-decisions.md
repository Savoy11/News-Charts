# Business decisions bearing on News Charts (recorded 2026-10-17)

**What this is.** Decisions the owner made in Finance Now sessions between 18 August and
28 September 2026 that affect News Charts. Until now they existed only in Finance Now's
`docs/decisions` and the owner's project notes, so a session working in this repo could not see
them (NC-134).

**What this is not.** It is not the decision record. Each line below is the summary the NC
ledger carries (`docs/audits/nc-task-queue-2026-09-28.json`, NC-134 and NC-133). The full text,
the reasoning and any later amendment live in Finance Now's records. This repo does not read
another product's repository (the scope rule in `CLAUDE.md`), so nothing here was re-checked
against those records. Where the two disagree, the Finance Now record wins.

| Ref | Decision, as the ledger summarises it | What it means here |
| --- | --- | --- |
| **D3** | US-only. | Answers country access for now: no geo-gating work beyond US scope. |
| **D13** | Company formation is deferred, along with the rollout. | Nothing in this repo should assume an operating entity yet. |
| **D21** | Price the paid options now; buy nothing yet. No single provider may be the only source for a surface. | Licensing items stay priced rather than purchased. A page must never depend on one feed alone, which is the existing failure-isolation rule, now a business rule too. |
| **D22** | The first page load by anyone other than the owner is the trigger. Dated 23 September in the ledger. | **Applied here on 2026-10-19 by the owner (NC-133).** `COMMERCIAL_MODE`, the feed gate and the launch set now trip at the first outside page load, a private preview included, rather than "the day anything earns money". |
| Affiliate stance | Planned, built dark, no paid placement in anything ranked. | Matches the affiliate initiative in `docs/MASTER-CHECKLIST.md`: links may exist only where ranking cannot read them. |
| Pricing | Free / Core $9.99 / Pro $29 / Advisor $99, plus a $299 bring-your-own-key desktop edition. | **A working plan, to be reassessed — not a decision to build against.** Which product each tier belongs to is in the Finance Now record. |

When one of these changes, update this file, add a dated line saying what changed, and add the
same line to the NC ledger. A summary that has drifted from its record is worse than none,
because it will be trusted.
