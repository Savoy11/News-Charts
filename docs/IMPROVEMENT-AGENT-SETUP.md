# Improvement Agents — setup and operation

**Updated 28 July 2026.** Covers `opportunity-scout.md` and `code-auditor.md`.

---

## Two agents, one boundary

They are deliberately separate because the two jobs need opposite temperaments.

| | **opportunity-scout** | **code-auditor** |
|---|---|---|
| Looks for | Things worth building | Things that are broken |
| Output | Proposals → then checklist entries | A dated report |
| Writes to | Checklist, rejection log (after approval) | One report file only |
| Tools | Read, Grep, Glob, Bash, **Edit** | Read, Grep, Glob, Bash |
| Can be wrong | Yes — it explores | Should not be — it cites evidence |
| Cadence | Fortnightly, or after a competitive review | Fortnightly, before a release, after a large merge |

Each is told to stay out of the other's territory: if the scout spots a bug, it mentions it in
one closing line and moves on, and the auditor does the same with feature ideas. Merging them
produces a report where speculation and evidence sit side by side and the reader cannot tell
which is which.

---

## opportunity-scout — how the workflow runs

This is the one that ends in checklist entries, and it runs in **two passes with you in the
middle**.

**Pass 1 — PROPOSE.** It surveys, ranks, and writes a proposal file. It changes nothing else.

**You mark each item** `APPROVED`, `REJECTED` (with a reason) or `DEFERRED`.

**Pass 2 — FILE.** It inserts approved items into the checklist at the right priority, matching
the surrounding format exactly, tagged with what they were derived from and the date. Rejected
items go to `docs/audits/rejected-proposals.md` with your reason. Deferred items roll into the
next proposal file.

**Why the approval gate exists.** An agent that writes straight into your backlog turns a working
document into a landfill within a month, and you stop trusting the file. The rejection log
matters just as much — without it, the same idea returns every fortnight and you learn to skim.

**Why proposals must be anchored.** The scout may only propose things it can tie to one of five
concrete anchors: data already ingested but never shown; a capability present for one asset class
or subject type and missing for a comparable one; a dead-end user path; a documented competitor
capability from a written analysis in the repo; or an explicit gap named in a strategy document.
Anything it cannot anchor, it discards. Unanchored ideas are infinitely generatable and
unfalsifiable, which is precisely what makes this class of tool useless when it goes wrong.

---

## code-auditor — how it runs

One pass, one output: a dated report in `docs/audits/`. It does not fix anything and does not
open pull requests.

**The governing rule is that every finding cites evidence gathered in that run** — a command and
its output, or a file and line it can quote. No citation, no finding.

That is the same discipline the products apply to themselves: computed checks find the anomaly,
and the explanation may only reference what it can cite. It is also what keeps an audit from
becoming a list of confident, well-written guesses.

It is capped at ten findings, ranked by importance, with an honest note about what was set aside.

---

## Install

Both files go in each repository:

```
.claude/agents/opportunity-scout.md
.claude/agents/code-auditor.md
```

Project-level agents live in `.claude/agents/` and are shared with anyone working in the repo.
Use the project path rather than `~/.claude/agents/`, since both depend on these codebases'
conventions.

**Agents load at startup** — restart Claude Code after adding them or they will not appear.
Confirm with `/agents`, which also gives an interactive editor for tool permissions.

Create the output directory in each repo:

```
mkdir -p docs/audits
```

---

## Running them

**On demand:**

```
Run the opportunity-scout on this repo.
Run the code-auditor on this repo.
```

**Scheduled.** Since you already use GitHub Actions with an Anthropic API key, the code-auditor
suits unattended runs well — have it write the report and open a pull request containing only
`docs/audits/`, so findings arrive as a reviewable diff. The scout is a poorer fit for automation
because pass 2 needs your decisions; run its PROPOSE pass on a schedule if you like, but keep
FILE manual.

Check the current Claude Code GitHub Actions documentation for workflow syntax rather than
copying an example — the action's inputs change:
https://docs.claude.com/en/docs/claude-code/overview

**On cadence:** fortnightly is about right for both. Weekly on a repo that is not changing much
produces reports that mostly say "nothing new", which trains you to stop reading them — the
failure mode that kills this kind of tool.

---

## Tuning

Both definitions are prompts. Treat them as living documents.

- **Too much noise in a category?** Add it to the "what makes a bad report" section.
- **Missing something it should catch?** Add the specific pattern. The `overlay.ts` case is
  already named in the auditor because that class of defect — a stale comment causing a live
  feature to render as unavailable — is exactly what a generic audit misses.
- **New policy decided?** Add it to the policy list in both files the same day. An agent auditing
  against yesterday's rules is worse than none.
- **Recurring proposal you keep rejecting?** Confirm it reached the rejection log. If it did and
  still returns, the scout is not reading the log — say so explicitly in its Step 1.

---

## What neither agent can do

- **Neither can tell you whether your maths is right.** The auditor can report that
  `src/lib/utils/indicators.ts` has no test coverage and several consumers. It cannot tell you the
  RSI seeds its EMA incorrectly. Only tests against published reference values do that — task T2
  remains the more important work, and these agents do not substitute for it.
- **Neither sees production.** No traffic, no errors, no user behaviour. Static analysis only.
- **Neither decides the product.** The scout surfaces grounded options; what to build is a
  business decision informed by users.
- **Both will occasionally be wrong.** Treat findings as leads to verify. They cite evidence
  precisely so verification is quick.

---

## A third agent worth adding later

Once these are running, add a narrow **release-gate checker** that runs the V1 evidence process —
tests, coverage, the live-data audit, the data-sources verification, and the
no-affiliate/no-tracking search — and writes the dated evidence file.

Keep all three separate. The scout explores and may be wrong. The auditor investigates and cites.
The release checker verifies and must not be wrong at all.

