/**
 * Words a headline uses for the same concern a visitor typed (NC-008 follow-up).
 *
 * "How did covid affect Best Buy" matched only the events whose words include "covid", while the
 * coverage of that concern also says "pandemic", "lockdown" and "coronavirus". Each group below
 * is one concern; a focus that names any member also finds the others, graded below a direct hit
 * so the visitor's own word still ranks first (lib/focus.ts).
 *
 * **The rules this list keeps**, because a wrong synonym quietly fills a narrowed page with
 * unrelated events — the failure the focus bar exists to prevent:
 *  - Only words a headline would use for the *same* concern. "vaccine" is about covid but is not
 *    another word for it, so it is not here.
 *  - No names of companies, people or places: those are subjects, and the corpus already has
 *    aliases for them.
 *  - No word in two groups, and no word that commonly means something else in market news
 *    ("deal", "duty", "settlement", "rule" are left out). `check:focus` enforces the first.
 *  - Words as a headline prints them, capitals included — they are what the focus bar shows;
 *    matching lowercases, normalises and stems both sides.
 *
 * A short member ("AI", "EV") is kept as a focus word even though focus words are normally three
 * letters or more — "how did AI affect Nvidia" otherwise narrowed on nothing.
 */
export const CONCEPTS: readonly (readonly string[])[] = [
  ["covid", "coronavirus", "pandemic", "lockdown", "lockdowns", "quarantine"],
  ["tariff", "tariffs", "trade war", "levy", "levies", "import duty", "import duties"],
  ["recession", "downturn", "economic slowdown", "economic contraction"],
  ["inflation", "CPI", "consumer price index", "consumer prices"],
  ["interest rate", "interest rates", "rate hike", "rate hikes", "rate cut", "rate cuts", "federal reserve", "FOMC", "Fed"],
  ["layoff", "layoffs", "job cuts", "laid off", "lay off", "workforce reduction", "downsizing"],
  ["strike", "strikes", "walkout", "work stoppage", "picket"],
  ["supply chain", "shortage", "shortages"],
  ["lawsuit", "lawsuits", "litigation", "sued", "class action"],
  ["merger", "acquisition", "acquire", "acquires", "acquired", "buyout", "takeover"],
  ["recall", "recalls", "recalled"],
  ["bankruptcy", "bankrupt", "Chapter 11", "insolvency"],
  ["AI", "artificial intelligence", "machine learning", "ChatGPT"],
  ["EV", "EVs", "electric vehicle", "electric vehicles", "electric car", "electric cars"],
  ["election", "elections", "midterms", "presidential race"],
];
