/**
 * Search-prompt parsing, against a corpus of the way people actually type.
 *
 *   npm run check:prompt
 *
 * Pure string work, so this is fast and offline. It exists because the failure mode is silent
 * and expensive: an unparsed prompt is handed to Wikipedia verbatim, fuzzy-matches something
 * unrelated, and the visitor gets a confidently wrong page rather than an error.
 *
 * `subject` is what we try to resolve; `focus` is the angle carried on the URL to seed the AI
 * panel. For a relational question ("X's effect on Y") the **subject is Y** — the thing whose
 * timeline and price series we can actually draw — and X becomes the focus.
 */
import { parseSearchPrompt } from "../lib/prompt";

interface Case {
  q: string;
  subject: string;
  focus?: string | null;
  note?: string;
}

const CASES: Case[] = [
  // ---- the shapes the parser was originally built for: must not regress
  { q: "Show me the history of Alibaba in the United States", subject: "Alibaba", focus: "in the United States" },
  { q: "please show me the timeline of the bicycle", subject: "bicycle" },
  { q: "what is Tesla", subject: "Tesla" },
  { q: "alibaba's history", subject: "alibaba" },
  { q: "electric cars", subject: "electric cars" },
  { q: "AAPL", subject: "AAPL" },

  // ---- "<thing> stock" — extremely common, and it used to break resolution outright:
  // "Ford" matches the EDGAR ticker index, "Ford stock" matches nothing.
  { q: "Ford stock", subject: "Ford" },
  { q: "AAPL stock price", subject: "AAPL" },
  { q: "Tesla shares", subject: "Tesla" },
  { q: "Nvidia share price", subject: "Nvidia" },

  // ---- relational questions: the subject is what's being affected
  { q: "Barak Obamas effect on Ford stock", subject: "Ford", focus: "Barak Obamas" },
  { q: "Barack Obama's effect on Ford stock", subject: "Ford", focus: "Barack Obama" },
  { q: "effect of Obama on Ford stock", subject: "Ford", focus: "Obama" },
  { q: "the impact of tariffs on Ford", subject: "Ford", focus: "tariffs" },
  { q: "how did the pandemic affect Boeing", subject: "Boeing", focus: "the pandemic" },
  { q: "how does inflation impact Walmart stock", subject: "Walmart", focus: "inflation" },
  { q: "did the merger affect Disney shares", subject: "Disney", focus: "the merger" },
  { q: "what was the effect of the strike on GM", subject: "GM", focus: "the strike" },
  { q: "tariffs influence on Ford stock price", subject: "Ford", focus: "tariffs" },

  // ---- relation plus a qualifier: both angles survive
  { q: "impact of tariffs on Ford in 2025", subject: "Ford", focus: "tariffs · in 2025" },

  // ---- NC-008: shapes search now carries in
  { q: "what happened to Nvidia after the export rules", subject: "Nvidia", focus: "after the export rules" },
  { q: "what happened with Boeing during the strike", subject: "Boeing", focus: "during the strike" },
  { q: "how did covid affect Best Buy's stock price", subject: "Best Buy's", focus: "covid",
    note: "the possessive is left for the resolver, which tries it as typed and then without — McDonald's is a name" },

  // ---- things that must NOT be mangled
  { q: "rolling stock", subject: "rolling stock", note: "a real topic that ends in 'stock'" },
  { q: "stock", subject: "stock", note: "stripping would leave nothing" },
  { q: "Woodstock", subject: "Woodstock" },
  { q: "effect", subject: "effect", note: "no relation without both sides" },

  // ---- an SEC form beside the security (batch 52): the form is what to narrow the page to
  { q: "Apple 10-K", subject: "Apple", focus: "10-K" },
  { q: "Arm F-1", subject: "Arm", focus: "F-1", note: "a foreign listing's form, kept since batch 65" },
  { q: "Ford's 8-K filings", subject: "Ford's", focus: "8-K", note: "the possessive is the resolver's, as above" },
  { q: "Tesla 10Q", subject: "Tesla", focus: "10Q", note: "written without its hyphen" },
  { q: "TSMC 20-F", subject: "TSMC", focus: "20-F" },
  { q: "Pfizer S-4", subject: "Pfizer", focus: "S-4" },
  { q: "10-Q for Tesla", subject: "Tesla", focus: "10-Q" },
  { q: "Apple 10-K filings in 2020", subject: "Apple", focus: "10-K · in 2020", note: "the form and the year both narrow" },
  { q: "Sony 4K", subject: "Sony 4K", note: "4K is no form" },
  { q: "10-K", subject: "10-K", note: "a form alone names no security" },
  // ---- the form by its full name (batch 56): "Form" is no security, though FormFactor's ticker is FORM
  { q: "Form 10-K", subject: "Form 10-K", note: "a form alone, by its full name, names no security either" },
  { q: "SEC Form 8-K filings", subject: "SEC Form 8-K filings", note: "nor with the SEC's name on it" },
  { q: "Form 10-K for Apple", subject: "Apple", focus: "10-K" },
  { q: "Apple Form 10-K", subject: "Apple", focus: "10-K" },
  { q: "Form 8-K Tesla", subject: "Tesla", focus: "8-K" },
  { q: "FormFactor 10-K", subject: "FormFactor", focus: "10-K", note: "a name that starts with \"Form\" keeps it" },
  // ---- any form called a form (batch 58): the page carries no insider or fund forms, so no focus
  { q: "Form 4 Tesla", subject: "Tesla", note: "an insider form names no focus, and no FormFactor" },
  { q: "Tesla Form 4", subject: "Tesla" },
  { q: "Berkshire Form 13F filings", subject: "Berkshire" },
  { q: "Form 144 for Apple", subject: "Apple" },
  { q: "Form D", subject: "Form D", note: "a form alone, whatever its number" },
  { q: "Form Energy", subject: "Form Energy", note: "a word after \"Form\" is no form" },
];

let pass = 0;
let fail = 0;

for (const c of CASES) {
  const got = parseSearchPrompt(c.q);
  const wantFocus = c.focus ?? null;
  const ok = got.subject === c.subject && got.focus === wantFocus;
  if (ok) pass++;
  else fail++;
  const label = `${JSON.stringify(c.q)}${c.note ? `  (${c.note})` : ""}`;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) {
    console.log(`        want subject=${JSON.stringify(c.subject)} focus=${JSON.stringify(wantFocus)}`);
    console.log(`        got  subject=${JSON.stringify(got.subject)} focus=${JSON.stringify(got.focus)}`);
  }
}

/**
 * The influence, kept as its own field so the resolve route can send a relational question to a
 * two-subject compose instead of to one subject with the other pre-filled in a text box.
 *
 * It is still folded into `focus` as well — the AI panel should see it wherever the visitor
 * lands, including when the compose is not available.
 */
console.log("\nThe influence, separated from the focus");
const inf = (q: string, want: string | null) => {
  const got = parseSearchPrompt(q).influence;
  const ok = got === want;
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${JSON.stringify(q.slice(0, 46))} → ${JSON.stringify(got)}`);
};
inf("Barak Obamas effect on Ford stock", "Barak Obamas");
inf("effect of Obama on Ford stock", "Obama");
inf("how did tariffs affect GM", "tariffs");
// The suffix is stripped on both sides — "Tesla stock's effect on Ford" names a company either way.
inf("Tesla stock's effect on Ford", "Tesla");
// No relation, no influence: a plain subject must never route to a compare with an empty half.
inf("Ford", null);
inf("the history of Alibaba in the United States", null);
inf("effect", null);
// A relation plus a qualifier keeps the two apart, and `focus` still carries both.
inf("impact of tariffs on Ford in 2025", "tariffs");
const both = parseSearchPrompt("impact of tariffs on Ford in 2025");
const also = (name: string, ok: boolean, detail: string) => {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
};
also("focus still carries the relation and the qualifier", both.focus === "tariffs \u00b7 in 2025", String(both.focus));
also("and the subject is still the thing affected", both.subject === "Ford", both.subject);

console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) process.exit(1);
