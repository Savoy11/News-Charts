import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * The house form for source labels.
 *
 *   npm run check:source-labels
 *
 * The bug these exist for was not cosmetic. When an aggregator handed over an article without
 * naming the outlet, the label fell back to the aggregator — so a page said GNews published a
 * story GNews had only found. Every other inconsistency here is a style question; that one was
 * a false statement about a publisher, printed next to their link.
 */
import { UNATTRIBUTED, cleanDomain, requiresLicenceCredit, sourceLabel } from "../lib/sourceLabel";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

console.log("\nWho published it, and how we found it");
check("a direct source is named alone", sourceLabel("The New York Times") === "The New York Times");
check("an aggregated one names both", sourceLabel("Reuters", "gnews") === "Reuters · via GNews", sourceLabel("Reuters", "gnews"));

console.log("\nThe bug: an aggregator is not a publisher");
// This is what the old fallback produced, and it was untrue.
check("no outlet does not become the aggregator", sourceLabel(null, "gnews") !== "GNews", sourceLabel(null, "gnews"));
check("it says so instead", sourceLabel(null, "gnews") === `${UNATTRIBUTED} · via GNews`, sourceLabel(null, "gnews"));
check("an empty outlet is the same as none", sourceLabel("   ", "newsdata") === `${UNATTRIBUTED} · via Newsdata.io`);
// Some feeds report themselves as the outlet, which is the same false claim wearing a hat.
check("a feed naming itself is not credited as publisher", sourceLabel("GNews", "gnews") === `${UNATTRIBUTED} · via GNews`);
check("case does not smuggle it through", sourceLabel("gnews", "gnews") === `${UNATTRIBUTED} · via GNews`);
// Saying "The New York Times · via NYT" says nothing twice.
check("a publisher's own feed is not restated as a via", sourceLabel("The New York Times", "nyt") === "The New York Times");
check("nothing at all is still honest", sourceLabel(null) === UNATTRIBUTED);

console.log("\nDomains are tidied, never embellished");
check("www and scheme are noise", cleanDomain("https://www.reuters.com/") === "reuters.com", String(cleanDomain("https://www.reuters.com/")));
check("a path is dropped", cleanDomain("chinatechnews.com/article/1") === "chinatechnews.com");
check("case is normalised", cleanDomain("Reuters.COM") === "reuters.com");
// Inferring "The New York Times" from a domain would be a guess dressed as a fact; "Nytimes" is
// worse than the domain it replaced. The domain is a real, checkable identity as it stands.
check("the masthead is not invented", cleanDomain("nytimes.com") === "nytimes.com");
check("junk is refused rather than printed", cleanDomain("not a domain") === null);
check("an empty domain is refused", cleanDomain(undefined) === null);
check("a refused domain still labels honestly", sourceLabel(cleanDomain("garbage"), "gdelt") === `${UNATTRIBUTED} · via GDELT`);

console.log("\nLicence credit, as opposed to courtesy credit");
// CC BY-SA obliges naming contributors and the licence wherever the text is reused.
check("Wikipedia requires it", requiresLicenceCredit("wikipedia"));
// Public domain and open data are courtesy: accurate to credit, not a condition of use.
check("SEC EDGAR does not", !requiresLicenceCredit("sec_edgar"));
check("the Library of Congress does not", !requiresLicenceCredit("loc_chronam"));
check("an unknown source does not", !requiresLicenceCredit(undefined));

console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) process.exit(1);
