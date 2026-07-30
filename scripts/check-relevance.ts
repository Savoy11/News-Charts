import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * The deterministic relevance floor — what gets scored for free, and what is worth paying for.
 *
 *   npm run check:relevance
 *
 * Two failure modes, and the expensive one is silent. Score too little and every unhandled event
 * kind is sent to a paid model to have its aboutness assessed — which is how on-chain events,
 * whose whole value is that they are *certain*, ended up queued for a judgement call. Score too
 * much and we invent certainty we do not have, and a keyword match starts reading as a fact.
 */
import {
  RELEVANCE_THRESHOLD,
  aliasesFor,
  deterministicScore,
  type ScorableRow,
  type SubjectContext,
} from "../lib/enrich/relevance";
import type { EventType } from "../lib/types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const FORD: SubjectContext = { kind: "company", displayName: "Ford Motor Company", ticker: "F" };
const aliases = aliasesFor(FORD);
const row = (kind: EventType, title = "something happened"): ScorableRow => ({ eventId: 1, kind, title });
const score = (kind: EventType, title?: string, strict = false) =>
  deterministicScore(row(kind, title), FORD, aliases, strict);

console.log("\nSettled by provenance — never worth paying a model for");
for (const [kind, why] of [
  ["filing", "filed under the subject's CIK"],
  ["earnings", "filed under the subject's CIK"],
  ["history", "extracted from the subject's own article"],
  ["corporate_action", "a corporate action on the subject's own ticker"],
  ["onchain", "read from the subject's own contract or chain"],
  ["annotation", "the reader attached it to this subject"],
] as [EventType, string][]) {
  const v = score(kind);
  check(`${kind} scores 1`, v?.score === 1, String(v?.score));
  check(`  ...and says why: ${why}`, v?.reason === why, v?.reason);
}

console.log("\nStrong but not certain");
// The cited work can be broader than the subject — it supports a sentence about them.
check("a citation scores below a filing", (score("citation")?.score ?? 0) < 1);
check("but well above the display threshold", (score("citation")?.score ?? 0) > RELEVANCE_THRESHOLD, String(score("citation")?.score));
// OCR is noisy enough that a phrase match is not proof.
check("press scores below a citation", (score("press")?.score ?? 0) < (score("citation")?.score ?? 0));
check("press still displays", (score("press")?.score ?? 0) > RELEVANCE_THRESHOLD, String(score("press")?.score));

console.log("\nNews, where the headline is the evidence");
check("a headline naming the subject scores high", (score("news", "Ford recalls SUVs")?.score ?? 0) >= 0.9);
check("the ticker counts as naming it", (score("news", "F beats estimates")?.score ?? 0) >= 0.9);
// An oblique headline is a real judgement call, which is what the paid tier is for.
check("an oblique headline is left for the model", score("news", "Detroit carmaker rebounds") === null);
check("unless strict mode demotes it", (score("news", "Detroit carmaker rebounds", true)?.score ?? 1) < RELEVANCE_THRESHOLD);

console.log("\nLeft for the model, deliberately");
/**
 * The case the others are measured against. A Federal Register rule reaches an industry through
 * a keyword query built from the industry's name, so whether it bears on that sector is exactly
 * the judgement provenance cannot make.
 */
check("a regulation is not scored from provenance", score("regulation") === null);

console.log("\nNothing falls through by accident");
/**
 * The regression this guards. `deterministicScore` used to end in a bare `return null`, so every
 * kind it had not been taught about went to the *paid* tier by default — silently, and forever.
 * Each kind below must be a deliberate decision, not an omission.
 */
const ALL: EventType[] = [
  "news", "filing", "earnings", "history", "press",
  "regulation", "citation", "corporate_action", "onchain", "annotation",
];
const toModel = ALL.filter((k) => score(k) === null);
check(
  "only news and regulation ever reach the paid tier",
  toModel.length === 2 && toModel.includes("news") && toModel.includes("regulation"),
  toModel.join(", ")
);
check(
  "every kind that is scored is scored above the display threshold",
  ALL.every((k) => {
    const v = score(k);
    return v === null || v.score > RELEVANCE_THRESHOLD;
  })
);
check("every score carries a reason someone could check", ALL.every((k) => {
  const v = score(k);
  return v === null || v.reason.trim().length > 10;
}));

console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) process.exit(1);
