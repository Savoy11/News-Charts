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
  freePass,
  shortName,
  type ScorableRow,
  type SubjectContext,
} from "../lib/enrich/relevance";
import { isOwnShortName, sharedBy, withCapital } from "../lib/wordNames";
import { companyScoringAliases } from "../lib/news";
import tickerIndex from "../data/edgar-tickers.json";
import sharedNames from "../data/shared-name-words.json";
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

console.log("\nApostrophes the SEC title dropped (batch 54, the 2026-10-25 audit's finding 1)");
const KSS: SubjectContext = { kind: "company", displayName: "KOHLS Corp", ticker: "KSS" };
const kssAliases = aliasesFor(KSS, ["KOHLS"]);
check("\"Kohl's\" and \"Kohl’s\" name KOHLS Corp, as ingest's aliases hold it",
  ["Kohl's names new CEO", "Kohl’s names new CEO"].every((t) => (deterministicScore(row("news", t), KSS, kssAliases)?.score ?? 0) >= 0.9),
  JSON.stringify(kssAliases));
const MCD: SubjectContext = { kind: "company", displayName: "MCDONALDS CORP", ticker: "MCD" };
check("  …and a curly \"McDonald’s\" names McDonald's, as the straight one did",
  (deterministicScore(row("news", "McDonald’s raises prices"), MCD, aliasesFor(MCD, ["McDonald's"]))?.score ?? 0) >= 0.9);
const FORD_CO: SubjectContext = { kind: "company", displayName: "FORD MOTOR CO", ticker: "F" };
check("  …while \"Ford's\" still names Ford, and \"Harrison Ford's\" is still left for the model",
  (deterministicScore(row("news", "Ford's profit falls"), FORD_CO, aliasesFor(FORD_CO))?.score ?? 0) >= 0.9 &&
    deterministicScore(row("news", "Harrison Ford's new film"), FORD_CO, aliasesFor(FORD_CO)) === null);

console.log("\nA title's registration tag and legal form name no company (batch 56, set aside by the 2026-10-25 audit)");
const namesOf = (displayName: string, kind: SubjectContext["kind"] = "company") => aliasesFor({ kind, displayName });
check("Moody's is named \"moodys\" and \"moodys corp\", never \"/de/\"",
  JSON.stringify(namesOf("MOODYS CORP /DE/")) === JSON.stringify(["moodys", "moodys corp"]), JSON.stringify(namesOf("MOODYS CORP /DE/")));
check("  …nor Pulte \"inc/mi/\", nor an ADR's company \"ab/adr\" or, the tag off, \"ab\"",
  !namesOf("PULTEGROUP INC/MI/").some((a) => a.includes("/")) &&
    JSON.stringify(namesOf("Embracer Group AB/ADR").map((a) => a.toLowerCase())) === JSON.stringify(["embracer", "embracer group ab", "embracer group"]),
  JSON.stringify(namesOf("Embracer Group AB/ADR")));
check("  …nor a partnership \"lp\"", !namesOf("Energy Transfer LP").includes("lp"), JSON.stringify(namesOf("Energy Transfer LP")));
check("  …while a slash inside a name stays, and a topic is named as it is written",
  namesOf("CULLEN/FROST BANKERS, INC.").includes("cullen/frost") && namesOf("AI/ML", "topic").includes("ai/ml"));

console.log("\nA contraction is no possessive (batch 58, the 2026-10-26 audit)");
const SHEL: SubjectContext = { kind: "company", displayName: "Shell plc", ticker: "SHEL" };
const shelAliases = aliasesFor(SHEL, ["Shell"]);
check("\"she'll\" with its apostrophe out is not Shell: \"Taylor Swift says she'll retire\" is left unscored",
  deterministicScore(row("news", "Taylor Swift says she'll retire next year"), SHEL, shelAliases) === null &&
    deterministicScore(row("news", "She’ll be missed: tributes pour in"), SHEL, shelAliases) === null);
check("  …while \"Shell\" itself still names it, and \"Kohl's\" still names KOHLS Corp",
  (deterministicScore(row("news", "Shell profit beats forecasts"), SHEL, shelAliases)?.score ?? 0) >= 0.9 &&
    (deterministicScore(row("news", "Kohl's names new CEO"), KSS, kssAliases)?.score ?? 0) >= 0.9);

console.log("\nAn everyday word names a company only with its capital (batch 59)");
const news = (subject: SubjectContext, title: string, extra: string[] = [], strict = false) =>
  deterministicScore(row("news", title), subject, aliasesFor(subject, extra), strict);
const ALL_CO: SubjectContext = { kind: "company", displayName: "ALLSTATE CORP", ticker: "ALL" };
const COST_CO: SubjectContext = { kind: "company", displayName: "COSTCO WHOLESALE CORP /NEW", ticker: "COST" };
const LOW_CO: SubjectContext = { kind: "company", displayName: "LOWES COMPANIES INC", ticker: "LOW" };
check("a ticker that is a word names a headline only in capitals: not Allstate's \"All eyes on the Fed\", Costco's \"Cost of living rises\" or Lowe's \"Stocks hit a new low\"",
  news(ALL_CO, "All eyes on the Fed as markets wait") === null && news(COST_CO, "Cost of living rises again") === null &&
    news(LOW_CO, "Stocks hit a new low on rate fears") === null,
  [news(ALL_CO, "All eyes on the Fed as markets wait"), news(COST_CO, "Cost of living rises again")].map((v) => v?.score ?? null).join(", "));
check("  …while \"Allstate (ALL) raises dividend\" and \"COST shares jump\" still name them",
  (news(ALL_CO, "Allstate (ALL) raises dividend")?.score ?? 0) >= 0.9 && (news(COST_CO, "COST shares jump after sales beat")?.score ?? 0) >= 0.9);
const VISA_CO: SubjectContext = { kind: "company", displayName: "VISA INC.", ticker: "V" };
const HD_CO: SubjectContext = { kind: "company", displayName: "HOME DEPOT, INC.", ticker: "HD" };
check("a name that is a word names a headline only with its capital: not \"New rules tighten student visa approvals\" for Visa, nor \"Fire closes bus depot downtown\" for Home Depot",
  news(VISA_CO, "New rules tighten student visa approvals") === null && news(HD_CO, "Fire closes bus depot downtown") === null,
  JSON.stringify(aliasesFor(VISA_CO)));
check("  …while \"Visa beats estimates\" still names Visa, and strict mode demotes the student visa",
  (news(VISA_CO, "Visa beats estimates")?.score ?? 0) >= 0.9 && (news(VISA_CO, "New rules tighten student visa approvals", [], true)?.score ?? 1) < RELEVANCE_THRESHOLD);
check("  …by the word list: \"visa\" → \"Visa\", \"lowe's\" → \"Lowe's\", while \"nvidia\" and \"motor racing\" stay as they are",
  withCapital("visa") === "Visa" && withCapital("lowe's") === "Lowe's" && withCapital("nvidia") === "nvidia" && withCapital("motor racing") === "motor racing");
// Real headlines GDELT gave for "TARGET" in September 2026 (the 2026-10-26 audit)
const TGT_CO: SubjectContext = { kind: "company", displayName: "TARGET CORP", ticker: "TGT" };
const wordOnly = ["IMF urges retaining 5 % inflation target", "Govt . to retain 5 % inflation target for next three years",
  "Bihar urges Centre to raise paddy procurement target to 50 lakh MT"];
check("a company whose own name is the word: a headline with it only in lowercase is hidden, in either mode — \"IMF urges retaining 5 % inflation target\"",
  wordOnly.every((t) => [false, true].every((strict) => {
    const v = news(TGT_CO, t, ["TARGET"], strict);
    return v?.score === 0.2 && v.reason === "headline uses the company's name only as an everyday word";
  })), wordOnly.map((t) => news(TGT_CO, t, ["TARGET"])?.score ?? null).join(", "));
check("  …while \"Target expands price cuts ahead of the holiday season\" still names it, and so does \"TGT shares jump\"",
  (news(TGT_CO, "Target expands price cuts ahead of the holiday season", ["TARGET"])?.score ?? 0) >= 0.9 &&
    (news(TGT_CO, "TGT shares jump", ["TARGET"])?.score ?? 0) >= 0.9);
check("  …and a headline in lowercase throughout says nothing by its case: \"target expands price cuts\" is read as before",
  (news(TGT_CO, "target expands price cuts", ["TARGET"])?.score ?? 0) >= 0.9);
check("  …Shell's \"Investors in shell shock as markets slide\" too, though \"Shell profit beats forecasts\" names it",
  news(SHEL, "Investors in shell shock as markets slide", ["Shell"])?.score === 0.2 && (news(SHEL, "Shell profit beats forecasts", ["Shell"])?.score ?? 0) >= 0.9);

console.log("\nA word many companies' names share names none of them alone (batch 60)");
// Real Yahoo Finance headlines, read 2026-10-26: each scored 0.9 for these companies on main
const co = (displayName: string, ticker: string): SubjectContext => ({ kind: "company", displayName, ticker });
const ADR = "European Equities Traded in the US as American Depositary Receipts Track Higher in Friday Trading";
const wronglyNamed: [SubjectContext, string][] = [
  [co("AMERICAN ELECTRIC POWER CO INC", "AEP"), ADR],
  [co("American Airlines Group Inc.", "AAL"), ADR],
  [co("AMERICAN TOWER CORP /MA/", "AMT"), ADR],
  [co("British American Tobacco p.l.c.", "BTI"), ADR],
  [co("Bank of New York Mellon Corp", "BNY"), "AI Chip Demand Gives Linde a New Growth Catalyst"],
  [co("Elevance Health, Inc.", "ELV"), "He Kept Driving for Uber and Paying for Health Insurance. Medicare Could Still Add a 10% Late-Enrollment Penalty"],
  [co("KINROSS GOLD CORP", "KGC"), "Newmont Sinks 4%4 Despite Record Third-Quarter Profit as Gold Slides Back Toward $4,000"],
  [co("SOUTHERN COPPER CORP/", "SCCO"), "Southern Company’s Dividend Looks Safe. Its Massive Spending Plan Is the Real Test"],
  [LOW_CO, "4 Companies Just Boosted Their Dividends. Not All the Raises Are Equally Safe"],
  [co("AMAZON COM INC", "AMZN"), "Investing.com’s stocks of the week"],
];
const stillNamed = wronglyNamed.filter(([subject, title]) => news(subject, title) !== null);
check("\"American Depositary Receipts\" names no American company, \"a New Growth Catalyst\" no Bank of New York Mellon, \"Gold Slides\" no Kinross Gold, \"Southern Company’s\" no Southern Copper, \"4 Companies\" no Lowe's, \"Investing.com’s\" no Amazon",
  stillNamed.length === 0, stillNamed.map(([subject]) => subject.ticker).join(", "));
const ownNews: [SubjectContext, string][] = [
  [co("American Water Works Company, Inc.", "AWK"), "American Water Announces Leadership Changes in Missouri and Illinois"],
  [co("FIRST CITIZENS BANCSHARES INC /DE/", "FCNCA"), "First Citizens Soars 8% on Q3 Earnings Beat and New $1.2 Billion Buyback"],
  [co("Interactive Brokers Group, Inc.", "IBKR"), "Interactive Brokers Introduces Autonomous Trading"],
  [co("British American Tobacco p.l.c.", "BTI"), "Is British American Tobacco (LSE:BATS) A Bargain After Horizon 2030?"],
  [co("SOUTHERN COPPER CORP/", "SCCO"), "Southern Copper Sinks 7%, Freeport Down 6% as Copper Slides Despite “Record Highs”"],
  [co("KINROSS GOLD CORP", "KGC"), "Kinross Gold (KGC) Earnings Expected to Grow: Should You Buy?"],
  [co("FRANCO NEVADA Corp", "FNV"), "Can Higher H2 Production Support Franco-Nevada's 2026 Guidance?"],
  [FORD_CO, "Ford Plans to Overtake Toyota in a Critical Business. Here's Why It Matters."],
];
const unnamed = ownNews.filter(([subject, title]) => (news(subject, title)?.score ?? 0) < 0.9);
check("  …while each company's own news is still named, by its whole name or its short one: \"American Water\", \"First Citizens\", \"Interactive Brokers\", \"Franco-Nevada's\"",
  unnamed.length === 0, unnamed.map(([subject]) => `${subject.ticker} ${JSON.stringify(aliasesFor(subject))}`).join("; "));
check("a name of two words names its possessive: \"Is Parker Hannifin’s Premium Valuation a Warning Sign\" is Parker-Hannifin's",
  (news(co("Parker-Hannifin Corp", "PH"), "Is Parker Hannifin’s Premium Valuation a Warning Sign for Dividend Investors?")?.score ?? 0) >= 0.9);
check("  …and a company whose whole name is a shared word keeps it: \"Target\" (five share it) still names Target",
  sharedBy("TARGET") >= 5 && (news(TGT_CO, "Target expands price cuts ahead of the holiday season", ["TARGET"])?.score ?? 0) >= 0.9);
check("a short name drops the trailing generic words, two words at least: \"American Water\", \"First Citizens\", \"Interactive Brokers\"; none for \"Bank of America\" or \"Johnson & Johnson\"",
  shortName("American Water Works") === "American Water" && shortName("FIRST CITIZENS BANCSHARES") === "FIRST CITIZENS" &&
    shortName("Interactive Brokers Group") === "Interactive Brokers" && shortName("Bank of America") === null && shortName("Johnson & Johnson") === null && shortName("Ford Motor") === null,
  JSON.stringify(["American Water Works", "Bank of America", "Johnson & Johnson"].map((n) => shortName(n))));
check(`the shared words were counted from the ticker index in use (${Object.keys(sharedNames.shared).length} shared by two or more; "GOLD" ${sharedBy("GOLD")}, "FORD" ${sharedBy("FORD")})`,
  sharedNames.index.endsWith((tickerIndex as unknown as { syncedOn: string }).syncedOn) && sharedBy("GOLD") >= 5 && sharedBy("FORD") === 1);

console.log("\nThe scoring audit's findings (batch 61, docs/audits/2026-10-26-scoring-audit.md)");
// each scored 0.9 for these companies on main
const shortWrong: [SubjectContext, string][] = [
  [co("U S GLOBAL INVESTORS INC", "GROW"), "U.S. stocks fall as Treasury yields climb"],
  [co("NEW YORK TIMES CO", "NYT"), "New York subway fares rise"],
  [co("United States Oil Fund, LP", "USO"), "United States and China agree trade truce"],
  [co("Morgan Stanley Direct Lending Fund", "MSDL"), "Morgan Stanley beats estimates on trading"],
  [co("Clean Energy Fuels Corp.", "CLNE"), "Truist names top clean energy stocks to watch ahead of Q3 earnings season"],
  [co("American Water Works Company, Inc.", "AWK"), "Olympic american water polo team wins gold"],
];
const shortStill = shortWrong.filter(([subject, title]) => news(subject, title) !== null);
check("finding 1: a short name names a company only when no other listed company's name holds it, with its capitals — not \"U.S. stocks fall\", \"New York subway fares\", \"Morgan Stanley beats\" or \"top clean energy stocks\"",
  shortStill.length === 0, shortStill.map(([subject]) => `${subject.ticker} ${JSON.stringify(aliasesFor(subject))}`).join("; "));
check("  …by the list the sync works out: \"American Water\" is American Water Works' alone, \"New York\" and \"Morgan Stanley\" are not, and initials make none (\"U S\")",
  isOwnShortName("AMERICAN WATER") && !isOwnShortName("NEW YORK") && !isOwnShortName("MORGAN STANLEY") && shortName("U S Global Investors") === null);
const tickerWords: [SubjectContext, string][] = [
  [co("GAP INC", "GAP"), "Gender pay gap widens for third straight year"],
  [co("BILL Holdings, Inc.", "BILL"), "Senate passes stopgap spending bill"],
  [co("Snap Inc", "SNAP"), "Japan's prime minister calls snap election"],
];
const tickerStill = tickerWords.filter(([subject, title]) => news(subject, title) !== null);
check("finding 2: a name word that is also the ticker keeps its capital: \"gender pay gap\" is not Gap's, \"stopgap spending bill\" not BILL's, \"snap election\" not Snap's",
  tickerStill.length === 0, tickerStill.map(([subject]) => `${subject.ticker} ${JSON.stringify(aliasesFor(subject))}`).join("; "));
check("  …while \"Gap raises full-year outlook\" still names Gap", (news(co("GAP INC", "GAP"), "Gap raises full-year outlook")?.score ?? 0) >= 0.9);
const geg = companyScoringAliases({ name: "Great Elm Group, Inc.", ticker: "GEG", cik: 1831096 });
check("finding 3: every path scores a company by the same names, never its stored search aliases: Great Elm has no \"Unwired Planet\" or \"Openwave\"",
  !geg.some((a) => /unwired|openwave/i.test(a)) &&
    deterministicScore(row("news", "UK Supreme Court rules in Unwired Planet v Huawei"), co("Great Elm Group, Inc.", "GEG"), geg) === null,
  JSON.stringify(geg));
const read = (file: string) => readFileSync(path.join(__dirname, "..", file), "utf8");
const scoreTs = read("scripts/score.ts");
check("  …in ingest, a first visit, npm run score and check:feeds alike",
  ["scripts/ingest.ts", "lib/ingest/firstPass.ts", "scripts/score.ts", "scripts/check-feeds.ts"].every((f) => /companyScoringAliases\(/.test(read(f))) &&
    /const \{ rows: aliasRows \} = cik \? \{ rows: \[\] as/.test(scoreTs));
check("finding 4: a --strict-headline score is kept apart, so a plain --rescore and ingest's re-score leave it alone",
  scoreTs.includes('const FREE_STRICT = "deterministic-strict"') && scoreTs.includes("strict ? FREE_STRICT : FREE") &&
    scoreTs.includes("es.scored_by = ANY($4::text[])") && scoreTs.includes("AND scored_by = ANY($3::text[])") &&
    /scored_by = 'deterministic'/.test(read("lib/ingest/store.ts")) && /startsWith\("deterministic"\)/.test(read("scripts/cost-report.ts")));
const SITS_CO = co("SOUTHERN ITS INTERNATIONAL, INC.", "SITS");
check("finding 5: \"It's\" is no possessive: \"The Real Energy Bottleneck Isn’t Crude—It’s Fuel, Says Kuwait CEO\" is not Southern ITS's",
  news(SITS_CO, "The Real Energy Bottleneck Isn’t Crude—It’s Fuel, Says Kuwait CEO") === null && (news(SITS_CO, "Southern ITS wins Texas contract")?.score ?? 0) >= 0.9);
check("a number is no name: \"Top 10 stocks to watch\" is not Bitwise 10 Crypto Index ETF's, \"Dow tops 40,000\" not WD-40's, while \"WD-40 raises dividend\" is",
  news(co("Bitwise 10 Crypto Index ETF", "BITW"), "Top 10 stocks to watch this week") === null &&
    news(co("WD 40 CO", "WDFC"), "Dow tops 40,000 for the first time") === null && (news(co("WD 40 CO", "WDFC"), "WD-40 raises dividend")?.score ?? 0) >= 0.9);

console.log("\nA corrected rule reaches the rows it scored before: npm run score -- --rescore (batch 59)");
const AS_STORED = 0.8999999761581421; // 0.9, as a real reads back
const tgtPass = freePass([
  { ...row("news", "IMF urges retaining 5 % inflation target"), eventId: 1, prior: AS_STORED },
  { ...row("news", "Target expands price cuts ahead of the holiday season"), eventId: 2, prior: AS_STORED },
  { ...row("news", "Target opening 8 new stores this fall across six states"), eventId: 3, prior: null },
  { ...row("filing", "TARGET CORP: Quarterly report (10-Q)"), eventId: 4, prior: 1 },
], TGT_CO, aliasesFor(TGT_CO, ["TARGET"]));
check("a free score the rules now change is written again, one they keep is left alone, and an unscored row is scored",
  JSON.stringify(tgtPass.scores) === JSON.stringify([{ eventId: 1, score: 0.2 }, { eventId: 3, score: 0.9 }]) && !tgtPass.cleared.length && !tgtPass.remaining.length,
  JSON.stringify(tgtPass));
const costPass = freePass([{ ...row("news", "Cost of living rises again"), eventId: 7, prior: AS_STORED }], COST_CO, aliasesFor(COST_CO));
check("  …and one the rules no longer settle is cleared, back to the model: Costco's \"Cost of living rises again\"",
  !costPass.scores.length && JSON.stringify(costPass.cleared) === "[7]" && costPass.remaining.length === 1, JSON.stringify(costPass));
const scoreSrc = readFileSync(path.join(__dirname, "score.ts"), "utf8");
check("  …in npm run score, which takes back only the free tier's own scores, never a model's",
  /const rescore = has\("rescore"\)/.test(scoreSrc) && scoreSrc.includes("es.relevance IS NULL OR ($3 AND es.scored_by = ANY($4::text[]))") &&
    scoreSrc.includes("AND scored_by = ANY($3::text[])") && scoreSrc.includes('const FREE = "deterministic"') &&
    /freePass\(pending, subject, aliases, strict\)/.test(scoreSrc));

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
  "governance", "exploit", "macro", "recall",
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
