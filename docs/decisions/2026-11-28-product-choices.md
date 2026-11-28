# Product choices — the owner's calls of 2026-11-28

The task ledger (`docs/audits/nc-task-queue-2026-09-28.json`) held thirteen items that were product
directions rather than tasks. They came to eight decisions, asked in two dialogs on 2026-11-28 and
answered as quoted. Two more items fell away with an earlier call. This file is the record; the
ledger and `docs/MASTER-CHECKLIST.md` carry the result on each item.

## The eight calls

| # | Asked | The owner's answer | What it means | Ledger |
| --- | --- | --- | --- | --- |
| 1 | The site has no news archive for 1963–2017. Accept the government records as the coverage, price a licensed archive, or decide after launch? | "Price a news archive" | A session researches which archives license headline-and-link display for those years and what they cost, as was done for prices. Nothing is bought; the owner decides from the comparison. | NC-072 stays open for the comparison |
| 2 | No sign-in exists: follows and settings live in the visitor's browser and the site holds no personal data. Stay account-free, add Google sign-in, or decide after launch? | "No accounts (Recommended)" | The site stays account-free. Email alerts, which need an identity to send to, are parked until the owner reopens the question. | NC-089 closed; NC-081 parked |
| 3 | The business decision on record is US-only (D3). English with no blocking, US visitors only, or Spanish menus? | "English, no blocking (Recommended)" | The site is written for US readers in English. Visitors elsewhere are not blocked, so no geo-detection is built and no translation is made. Cookie consent for visitors from the EU or UK stays its own item for the lawyer (NC-125). | NC-091 and NC-092 closed |
| 4 | An old item asks for a web search engine as an extra way to find present-day articles. Park it, or write the comparison? | "Write the comparison" | A session compares the engines on reach, date filters, cost, and whether their terms allow storing results on a site with advertising. No spending; the owner picks after. | NC-070 stays open for the comparison; NC-071 waits on it |
| 5 | AI-written one-line summaries over clusters of near-identical headlines, paid for on the server. Hold off, or build with a spending cap? | "Hold off (Recommended)" | No server-side AI spending before launch. | NC-079 parked |
| 6 | The visitor's-own-key AI ranking panel is built and checked offline; only a quality test with a real key is left. Leave until beta, test it in a session, or the owner tests? | "Leave until beta (Recommended)" | Nothing is tuned until real use shows a problem. | NC-087 waits on the beta (NC-088) |
| 7 | Library of Congress newspapers show the best 25 matches. Keep that, or spread the selection across decades? | "Keep best 25 (Recommended)" | The decade walk is not built. Most of what it would add sits before any price chart begins, and it reaches the decades where scanning errors are worst. | NC-007 closed |
| 8 | Executed on-chain governance votes (Compound, Maker) on the crypto topic pages. Park it, or build it keyless? | "Park it (Recommended)" | Parked with the other crypto ideas: the build scope is listed securities. | NC-061 parked |

## Two items that fell away

Neither was asked. Both rest on DefiLlama, which the owner turned off on 2026-11-25
(`docs/decisions/2026-11-25-source-licences.md`: its terms are "personal, non-commercial").

- **DefiLlama protocol launches and TVL events (NC-062).** Not to be built: the source is off the
  ingest path.
- **Confirming exploits on-chain before ingest (NC-060).** Moot: the exploit rows were DefiLlama's
  incident list, which is no longer read, and a stored one is withheld on a public build.

## What follows

- Two comparisons for the owner to pick from, written in batch 192 as
  `docs/proposals/2026-11-28-news-archive-and-web-search.md`: the news archive for 1963–2017
  (call 1, its Part A) and the web search engine (call 4, its Part B).
- To reopen any of the parked or closed calls, say so: accounts (and with them email alerts),
  Spanish menus or country blocking, AI summaries, the newspapers' decade walk, on-chain governance.
