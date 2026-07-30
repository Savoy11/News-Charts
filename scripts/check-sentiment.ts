import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Lexicon tone scoring.
 *
 *   npm run check:sentiment
 *
 * The cases that matter most here are the abstentions. A colour on a financial timeline reads as
 * a judgement we have made, so a confident wrong label is worse than no label — this is tested
 * for what it *refuses* to call at least as much as for what it calls.
 */
import { scoreTone, toneOf, tonedKinds } from "../lib/sentiment";
import type { TimelineEvent } from "../lib/types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const tone = (title: string, expected: string) =>
  check(`${JSON.stringify(title.slice(0, 58))} → ${expected}`, scoreTone(title) === expected, scoreTone(title));

console.log("\nClearly positive");
tone("Ford tops estimates as F-Series mix lifts margins", "positive");
tone("Nvidia shares surge to a record high", "positive");
tone("Regulator approves the merger", "positive");
tone("Company raises full-year guidance", "positive");

console.log("\nClearly negative");
tone("Ford recalls SUVs over software defect", "negative");
tone("Shares plunge after earnings miss", "negative");
tone("Regulator opens investigation into pricing", "negative");
tone("Automaker announces layoffs", "negative");

console.log("\nAbstains when the headline is genuinely mixed");
// One word each way is ambiguous. Calling it either way would invent a signal.
tone("Profit rises but deliveries miss expectations", "neutral");
tone("Record quarter overshadowed by recall", "neutral");

console.log("\nAbstains when there is nothing to go on");
tone("Ford holds annual shareholder meeting", "neutral");
tone("Company names new chief financial officer", "neutral");
tone("", "neutral");

console.log("\nNegation flips polarity");
// "not a miss" is not bad news, and a lexicon that ignores negation says it is.
tone("Quarterly results were not a miss", "positive");
tone("Company avoids a strike", "positive");
tone("Deal denies any breach of contract", "positive");

console.log("\nOnly reported coverage carries tone");
{
  const ev = (type: TimelineEvent["type"], title: string): TimelineEvent => ({
    id: title,
    date: "2026-01-01",
    type,
    title,
    source: "test",
  });
  // A filing is a fact, not good or bad news; colouring it would put a judgement on a document.
  check("a filing is never toned", toneOf(ev("filing", "8-K — Results of Operations")) === "neutral");
  check("an on-chain event is never toned", toneOf(ev("onchain", "Bitcoin halving — reward drops")) === "neutral");
  check("a reader's own note is never toned", toneOf(ev("annotation", "great entry point")) === "neutral");
  check("news is toned", toneOf(ev("news", "Shares plunge after earnings miss")) === "negative");
  check("a cited article is toned", toneOf(ev("citation", "Sales surge through the quarter")) === "positive");
  check(
    "tonedKinds agrees with toneOf",
    tonedKinds("news") && tonedKinds("press") && tonedKinds("citation") && !tonedKinds("earnings")
  );
}

console.log("\nCase and punctuation do not matter");
tone("SHARES PLUNGE AFTER MISS!", "negative");
tone("Ford's profit rises, again", "positive");

console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) process.exit(1);
