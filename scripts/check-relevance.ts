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
import { getFilings } from "../lib/sec";
import { REGISTRANT_FORM } from "../lib/secForms";

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

console.log("\nAn Internet Archive hit is not a citation by the subject's own article");
{
  // NC-131: archive items are typed "citation" but come from a keyword search with a date floor,
  // and every one scored 0.9 "cited by the subject's own article" — junk included.
  const ia = (title: string, byline = "Internet Archive") =>
    deterministicScore({ eventId: 1, kind: "citation", title, sourceKey: "internet_archive", byline }, FORD, aliases, false);
  const keycap = ia("Russian Korean Japanese PBT Keycap OEM Profile Dye Sub Therm");
  check("a marketplace listing that never names the subject is hidden", (keycap?.score ?? 1) < RELEVANCE_THRESHOLD, `${keycap?.score} ${keycap?.reason}`);
  check("  …and is not described as cited by the subject's article", keycap?.reason !== "cited by the subject's own article");
  const report = ia("Ford Motor Company annual report 1955");
  check("an item titled with the subject still displays", (report?.score ?? 0) > RELEVANCE_THRESHOLD, `${report?.score}`);
  const byCreator = ia("Annual report 1955", "Internet Archive · Ford Motor Company");
  check("an item the subject created displays, though its title doesn't name it", (byCreator?.score ?? 0) > RELEVANCE_THRESHOLD, `${byCreator?.score}`);
  check("a Wikipedia citation keeps its provenance score", deterministicScore({ eventId: 1, kind: "citation", title: "x", sourceKey: "wikipedia" }, FORD, aliases, false)?.score === 0.9);
}

console.log("\nNews, where the headline is the evidence");
check("a headline naming the subject scores high", (score("news", "Ford recalls SUVs")?.score ?? 0) >= 0.9);
check("the ticker counts as naming it", (score("news", "F beats estimates")?.score ?? 0) >= 0.9);
// An oblique headline is a real judgement call, which is what the paid tier is for.
check("an oblique headline is left for the model", score("news", "Detroit carmaker rebounds") === null);
check("unless strict mode demotes it", (score("news", "Detroit carmaker rebounds", true)?.score ?? 1) < RELEVANCE_THRESHOLD);

console.log("\nWeak tokens and name collisions — the false positives this scorer must not make");
// "Ford Motor Company" must not contribute "motor": weak tokens prove nothing alone.
check("a weak-token-only headline is left for the model", score("news", "Motor racing season opens") === null);
// The token matches but reads as a person's name — a judgement call, not a naming.
check("a person-name collision is left for the model", score("news", "Harrison Ford wins award") === null);
check(
  "  ...in strict mode too — a suspicion is not evidence of absence",
  score("news", "Harrison Ford wins award", true) === null
);

console.log("\nShort and non-ASCII names — the false negatives this scorer must not make");
const MMM: SubjectContext = { kind: "company", displayName: "3M Company", ticker: "MMM" };
const mmmScore = deterministicScore(row("news", "3M announces buyback"), MMM, aliasesFor(MMM));
check("a digit-bearing short name still names the subject", (mmmScore?.score ?? 0) >= 0.9, String(mmmScore?.score));
const NESTLE: SubjectContext = { kind: "company", displayName: "Nestlé S.A.", ticker: "NSRGY" };
const nestleScore = deterministicScore(row("news", "Nestlé announces buyback"), NESTLE, aliasesFor(NESTLE));
check("an accented name still names the subject", (nestleScore?.score ?? 0) >= 0.9, String(nestleScore?.score));
// Single-letter tickers: standalone uppercase is Ford; an initial is not.
check("a single-letter ticker as an initial does not name it", score("news", "John F. Kennedy Airport reopens") === null);

console.log("\nStored aliases join as whole phrases");
const GOOG: SubjectContext = { kind: "company", displayName: "Alphabet Inc.", ticker: "GOOGL" };
const googAliases = aliasesFor(GOOG, ["Google"]);
const googScore = deterministicScore(row("news", "Google unveils Gemini"), GOOG, googAliases);
check("an alias-named headline scores as naming the subject", (googScore?.score ?? 0) >= 0.9, String(googScore?.score));
const googWithout = deterministicScore(row("news", "Google unveils Gemini"), GOOG, aliasesFor(GOOG));
check("  ...and without the stored alias it stays a model call", googWithout === null);

console.log("\nOne threshold, one place");
// signals.ts once hardcoded its own copy of the display gate; a threshold change then
// desynced signal windows from what the timeline showed. Source-asserted, not hoped.
import { readFileSync } from "node:fs";
import * as path from "node:path";
const signalsSrc = readFileSync(path.join(__dirname, "../lib/signals.ts"), "utf8");
check("signals.ts imports the shared threshold", signalsSrc.includes("RELEVANCE_THRESHOLD"));
check(
  "signals.ts carries no hardcoded threshold literal",
  !/relevance\s*>=\s*0\.\d/.test(signalsSrc)
);

console.log("\nLeft for the model, deliberately");
/**
 * The case the others are measured against. A Federal Register rule reaches an industry through
 * a keyword query built from the industry's name, so whether it bears on that sector is exactly
 * the judgement provenance cannot make.
 */
check("a regulation is not scored from provenance", score("regulation") === null);
/**
 * The exception (proposal #4). On a company's page a Federal Register document arrives because its
 * TITLE names the company — fetchCompanyRegulations filters on exactly that — so the naming is the
 * evidence, and paying a model to re-read it would buy nothing.
 */
check("…but a document whose title names the company is scored without a model",
  score("regulation", "Ford Motor Company; Receipt of Petition for Decision of Inconsequential Noncompliance")?.score === 0.95);
check("  …and the short name is enough",
  score("regulation", "Ford Motor, Receipt of Petition")?.score === 0.95);
check("  …while a sector's keyword rule is still left for the model",
  deterministicScore(row("regulation", "Semiconductor Export Controls"), { kind: "topic", displayName: "Semiconductors" }, ["semiconductors"]) === null);

console.log("\nNothing falls through by accident");
/**
 * The regression this guards. `deterministicScore` used to end in a bare `return null`, so every
 * kind it had not been taught about went to the *paid* tier by default — silently, and forever.
 * Each kind below must be a deliberate decision, not an omission.
 */
const ALL: EventType[] = [
  "news", "filing", "earnings", "history", "press",
  "regulation", "citation", "corporate_action", "onchain", "annotation",
  "governance", "exploit", "macro",
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

/**
 * NC-139: a fund's CIK is its trust's, and the trust files for every series it sells. Titled with
 * the fund's name and scored 1.0 "filed under the subject's CIK", VOO's page presented every
 * sibling's prospectus updates and holdings reports as VOO's own.
 */
async function fundFilings(): Promise<void> {
  console.log("\nA fund's filings name who filed them");
  const realFetch = globalThis.fetch;
  const forms = ["497", "NPORT-P", "N-CSR", "N-CSRS", "N-30D", "N-CEN", "485APOS", "485BPOS", "497K", "N-1A", "8-K", "10-K"];
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      name: "VANGUARD INDEX FUNDS",
      filings: {
        recent: {
          form: forms,
          filingDate: forms.map(() => "2024-03-04"),
          accessionNumber: forms.map((_, i) => `0000000000-24-00000${i}`),
          primaryDocument: forms.map(() => "doc.htm"),
          items: forms.map((f) => (f === "8-K" ? "2.02" : "")),
        },
        files: [],
      },
    }),
  })) as unknown as typeof fetch;
  try {
    const events = await getFilings({ ticker: "VOO", cik: "0000036405", name: "Vanguard 500 Index Fund" });
    const fundRows = events.filter((e) => !/\((?:8-K|10-K)\)$/.test(e.title) && !/^Vanguard 500 Index Fund: (?:Annual report|Earnings announcement)/.test(e.title));
    const opRows = events.filter((e) => !fundRows.includes(e));
    check("every fund form is titled with the registrant, not the fund", fundRows.length === 10 && fundRows.every((e) => e.title.startsWith("VANGUARD INDEX FUNDS: ")), events.map((e) => e.title).join(" / "));
    check("  …and says it may concern a sibling fund", fundRows.every((e) => /may concern a sibling fund/.test(e.description ?? "")));
    check("  …and every one is recognised as a registrant form", fundRows.every((e) => REGISTRANT_FORM.test(e.title)));
    check("an operating company's forms keep the subject's name", opRows.length === 2 && opRows.every((e) => e.title.startsWith("Vanguard 500 Index Fund: ") && !REGISTRANT_FORM.test(e.title)), opRows.map((e) => e.title).join(" / "));
    const fund = deterministicScore({ eventId: 1, kind: "filing", title: fundRows[0].title }, FORD, aliases);
    const own = deterministicScore({ eventId: 1, kind: "earnings", title: "Ford Motor Company: Annual report (10-K)" }, FORD, aliases);
    check("a registrant's filing is likely, not certain", fund?.score === 0.7 && /registrant/.test(fund.reason), JSON.stringify(fund));
    check("  …and still clears the display floor", (fund?.score ?? 0) >= RELEVANCE_THRESHOLD);
    check("a company's own filing is still certain", own?.score === 1);
  } finally {
    globalThis.fetch = realFetch;
  }
}

fundFilings().then(() => {
  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
});
