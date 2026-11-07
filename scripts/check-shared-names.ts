import tickerIndex from "../data/edgar-tickers.json";
import { nameKey } from "../lib/companyAliases";
import { releaseNamesParty, fetchJusticeReleases } from "../lib/doj";
import { commonName, withoutTag } from "../lib/edgarName";
import { aliasesFor, mentions } from "../lib/enrich/relevance";
import { companyNames, fetchCompanyRegulations, frSearchTerm, titleNamesCompany } from "../lib/frCompany";
import { listedCompaniesNamed } from "../lib/sec";
import { captionParty } from "../lib/secCases";
import { ONE_GROUP } from "../lib/sharedNames";

/**
 * A name two listed companies hold names neither (batch 109, the 2026-11-07 audit's question 2).
 *
 *   npm run check:shared-names
 *
 * "INDEPENDENT BANK CORP" is the Massachusetts bank's record (INDB) and, its tag "/MI/" off, the
 * Michigan bank's (IBCP); "FIRST BANCORP" Puerto Rico's (FBP) and North Carolina's (FBNC). Before,
 * every case, release, notice or headline naming either name landed on both pages, and both asked
 * the news the same query. The SEC's and the Board's caption rules already refused an everyday name
 * two companies hold (batch 73); a legal name was never counted, and the Justice Department's rule,
 * the names lists and headline scoring counted neither. Offline: the committed index, stand-in fetches.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)}`}`);
}

async function main(): Promise<void> {
  console.log("\nThe shared names, from the committed index");
  const by = new Map<string, Set<number>>();
  for (const [cik, , title] of (tickerIndex as unknown as { companies: [number, string, string][] }).companies) {
    const k = nameKey(commonName(withoutTag(title)));
    (by.get(k) ?? by.set(k, new Set()).get(k)!).add(cik);
  }
  const shared = [...by].filter(([, c]) => c.size > 1).map(([k]) => k).sort();
  // read by hand, 2026-11-07: three are one company's two records, nine are different companies'
  const DIFFERENT = ["BLUE OWL CAPITAL", "CITIZENS", "FARMERS & MERCHANTS BANCORP", "FIRST BANCORP", "FLUENT", "GRAHAM", "INDEPENDENT BANK", "MERIDIAN", "TORO"];
  check("twelve everyday names two or more listed records hold: the three of one group, the nine of different companies, each read by hand",
    JSON.stringify(shared) === JSON.stringify([...DIFFERENT, ...Object.keys(ONE_GROUP)].sort()), shared);
  check("  …and the count says so for each, and for none of the rest", shared.every((k) => listedCompaniesNamed(k) > 1) && listedCompaniesNamed("Ford Motor") === 1 && listedCompaniesNamed("Apple") === 1);
  check("a legal name two records hold counts as shared, a legal name one holds as its own (\"First Bancorp\" is also Maine's everyday name: three)",
    listedCompaniesNamed("INDEPENDENT BANK CORP") === 2 && listedCompaniesNamed("Independent Bank Corp.") === 2 && listedCompaniesNamed("FIRST BANCORP") === 3 &&
      listedCompaniesNamed("Rio Tinto plc") === 1 && listedCompaniesNamed("TORO CO") === 1,
    ["INDEPENDENT BANK CORP", "FIRST BANCORP", "Rio Tinto plc", "TORO CO"].map((n) => `${n} ${listedCompaniesNamed(n)}`));

  console.log("\nThe names a company is asked and read by");
  const names = (title: string) => companyNames(title);
  check("the two Independent Bank banks and the two First Bancorps have no name of their own: their legal names are each other's",
    [names("INDEPENDENT BANK CORP"), names("INDEPENDENT BANK CORP /MI/"), names("FIRST BANCORP /PR/"), names("FIRST BANCORP /NC/")].every((n) => n.length === 0));
  check("  …a company whose everyday name is shared and whose legal name is its own goes by that: Maine's First Bancorp, Toro, Graham",
    JSON.stringify(names("First Bancorp, Inc /ME/")) === JSON.stringify(["First Bancorp, Inc"]) && JSON.stringify(names("TORO CO")) === JSON.stringify(["TORO CO"]) &&
      JSON.stringify(names("TORO CORP.")) === JSON.stringify(["TORO CORP."]) && JSON.stringify(names("GRAHAM CORP")) === JSON.stringify(["GRAHAM CORP"]));
  check("  …one group's two records keep the group's name, and every other company its everyday name, as before",
    JSON.stringify(names("RIO TINTO PLC")) === JSON.stringify(["RIO TINTO"]) && JSON.stringify(names("RIO TINTO LTD")) === JSON.stringify(["RIO TINTO"]) &&
      JSON.stringify(names("FORD MOTOR CO")) === JSON.stringify(["FORD MOTOR"]) && JSON.stringify(companyNames("Alphabet Inc.", ["Google"])) === JSON.stringify(["Alphabet", "Google"]),
    [names("RIO TINTO PLC"), names("FORD MOTOR CO")]);

  console.log("\nThe rules");
  const partyNames = (title: string) => [...companyNames(title), withoutTag(title)];
  check("an SEC caption naming \"Independent Bank Corp.\" is neither bank's",
    captionParty("Independent Bank Corp.", partyNames("INDEPENDENT BANK CORP")) === null && captionParty("Independent Bank Corp.", partyNames("INDEPENDENT BANK CORP /MI/")) === null);
  check("  …nor \"First BanCorp\" Puerto Rico's or North Carolina's; \"Rio Tinto plc\" is still Rio Tinto plc's",
    captionParty("First BanCorp", partyNames("FIRST BANCORP /PR/")) === null && captionParty("First Bancorp", partyNames("FIRST BANCORP /NC/")) === null &&
      captionParty("Rio Tinto plc", partyNames("RIO TINTO PLC")) === "Rio Tinto plc");
  check("a Justice Department title naming \"Independent Bank\" is neither's, and Rio Tinto's two records keep theirs",
    !releaseNamesParty("Independent Bank Agrees to Pay $1 Million", ["Independent Bank", "Independent Bank Corp"]) &&
      !releaseNamesParty("Independent Bank Group Agrees to Pay Penalty", partyNames("INDEPENDENT BANK CORP /MI/")) &&
      releaseNamesParty("Rio Tinto Agrees to Pay $15 Million", companyNames("RIO TINTO PLC")) && releaseNamesParty("Ford Motor Company Agrees to Pay $165 Million", companyNames("FORD MOTOR CO")));
  check("a Federal Register title naming \"Independent Bank Corporation\" is neither's",
    !titleNamesCompany("Independent Bank Corporation; Formation of, Acquisition by, or Merger of Bank Holding Companies", "INDEPENDENT BANK CORP") &&
      !titleNamesCompany("Independent Bank Corporation; Formation of, Acquisition by, or Merger of Bank Holding Companies", "INDEPENDENT BANK CORP /MI/"));

  console.log("\nHeadlines");
  const indb = aliasesFor({ kind: "company", displayName: "INDEPENDENT BANK CORP", ticker: "INDB" });
  const ibcp = aliasesFor({ kind: "company", displayName: "INDEPENDENT BANK CORP /MI/", ticker: "IBCP" });
  check("a headline naming Independent Bank, or Texas's Independent Bank Group, is neither bank's news",
    ["Independent Bank Corp. reports third-quarter results", "Independent Bank Group to pay penalty", "Independent directors sue"].every((h) => mentions(h, indb) === "none" && mentions(h, ibcp) === "none"),
    { indb, ibcp });
  check("  …one naming its ticker is its own", mentions("Independent Bank Corp. (NASDAQ: INDB) reports third-quarter results", indb) !== "none" &&
    mentions("Independent Bank Corp. (NASDAQ: INDB) reports third-quarter results", ibcp) === "none");
  check("  …and one group's records and every other company keep their names: Rio Tinto, Ford",
    mentions("Rio Tinto profit falls", aliasesFor({ kind: "company", displayName: "RIO TINTO PLC", ticker: "RIO" })) !== "none" &&
      mentions("Ford recalls trucks", aliasesFor({ kind: "company", displayName: "FORD MOTOR CO", ticker: "F" })) !== "none");

  console.log("\nWhat a company with no name of its own asks");
  const realFetch = globalThis.fetch;
  const asked: string[] = [];
  (globalThis as { fetch: unknown }).fetch = async (input: RequestInfo | URL) => {
    asked.push(String(input));
    return { ok: true, status: 200, json: async () => ({ results: [], count: 0 }) } as unknown as Response;
  };
  let fr: Awaited<ReturnType<typeof fetchCompanyRegulations>>;
  let doj: Awaited<ReturnType<typeof fetchJusticeReleases>>;
  try {
    fr = await fetchCompanyRegulations("INDEPENDENT BANK CORP");
    doj = await fetchJusticeReleases("INDEPENDENT BANK CORP", [], "", 776901);
  } finally {
    globalThis.fetch = realFetch;
  }
  check("the Federal Register and the Justice Department are asked nothing: there is no name to ask by",
    frSearchTerm("INDEPENDENT BANK CORP") === "" && asked.length === 0 && fr.outcome === "empty" && fr.events.length === 0 && doj.events.length === 0, { asked, fr, doj });

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
