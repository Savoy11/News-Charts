import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * The model-spend estimate and its cap.
 *
 *   npm run check:cost
 *
 * The estimate exists to be *seen before* a pass runs, so the properties that matter are the
 * conservative ones: it must never undershoot the real bill, an unknown model must not be
 * guessed cheap, and sub-cent figures must not round to "$0.00" — which is how a number nobody
 * chose gets spent by a script nobody watched.
 */
import {
  DEFAULT_CAP_USD,
  PRICING,
  costUsd,
  estimateBatched,
  formatUsd,
  priceFor,
  withinCap,
} from "../lib/enrich/cost";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const HAIKU = "claude-haiku-4-5-20251001";

console.log("\nPricing");
check("a known model uses its own price", priceFor(HAIKU).inPerMTok === PRICING[HAIKU].inPerMTok);
// An unknown model is usually a newer one; guessing cheap under-reports a bill already paid.
const unknown = priceFor("some-future-model");
check("an unknown model is priced at the dearest known rate", unknown.inPerMTok === Math.max(...Object.values(PRICING).map((p) => p.inPerMTok)));
check("never at zero", unknown.inPerMTok > 0 && unknown.outPerMTok > 0);
check("a million in-tokens costs the list rate", costUsd(HAIKU, 1e6, 0) === PRICING[HAIKU].inPerMTok);
check("output is priced above input", costUsd(HAIKU, 0, 1e6) > costUsd(HAIKU, 1e6, 0));
check("nothing sent costs nothing", costUsd(HAIKU, 0, 0) === 0);

console.log("\nFormatting");
// Sub-cent is the normal case here, so rounding it away would hide every real figure.
check("a sub-cent figure keeps its digits", formatUsd(0.0031) === "$0.0031", formatUsd(0.0031));
check("and does not become $0.00", formatUsd(0.0031) !== "$0.00");
check("zero is plain", formatUsd(0) === "$0");
check("dollars round to cents", formatUsd(12.345) === "$12.35", formatUsd(12.345));

console.log("\nEstimating a batched pass");
const titles = Array.from({ length: 50 }, () => "A headline of roughly ordinary length here");
const est = estimateBatched(HAIKU, titles, 25);
check("every item is counted", est.items === 50);
check("batches are ceil, not floor", est.batches === 2, String(est.batches));
check("a partial batch still counts as one", estimateBatched(HAIKU, titles.slice(0, 26), 25).batches === 2);
check("nothing to send estimates nothing", estimateBatched(HAIKU, [], 25).usd === 0);
// Per-batch prompt scaffolding is small once and not small across two hundred batches.
const wide = estimateBatched(HAIKU, titles, 1);
check("per-batch overhead grows with batch count", wide.inputTokens > est.inputTokens, `${est.inputTokens} → ${wide.inputTokens}`);
check("more items cost more", estimateBatched(HAIKU, [...titles, ...titles], 25).usd > est.usd);
// The estimate is a tripwire, not an invoice: it must lean high.
check("token estimate is pessimistic, not generous", est.inputTokens > titles.join("").length / 4, `${est.inputTokens}`);

console.log("\nThe cap");
check("a small pass proceeds", withinCap(est, DEFAULT_CAP_USD).allowed);
check("an empty pass does not", !withinCap(estimateBatched(HAIKU, [], 25)).allowed);
check("and says why", withinCap(estimateBatched(HAIKU, [], 25)).reason === "nothing to send");
const huge = estimateBatched(HAIKU, Array.from({ length: 200_000 }, () => "x".repeat(200)), 25);
check("a large pass is stopped", !withinCap(huge, DEFAULT_CAP_USD).allowed, formatUsd(huge.usd));
check("and the reason names the override", /--max-usd/.test(withinCap(huge, DEFAULT_CAP_USD).reason));
check("raising the cap lets it through", withinCap(huge, huge.usd + 1).allowed);
// A tripwire only works if it is set below the point where a bill stops being noticeable.
check("the default cap is small on purpose", DEFAULT_CAP_USD <= 5, String(DEFAULT_CAP_USD));

console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) process.exit(1);
