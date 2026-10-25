import { readFileSync } from "node:fs";
import { join } from "node:path";
import tickerIndex from "../data/edgar-tickers.json";
import { isFund } from "../lib/sec";
import { securityLd } from "../lib/seo";

/**
 * A fund described as a fund (batch 46).
 *
 *   npm run check:security-kind
 *
 * Every security page told search engines it was a schema.org Corporation — SPY, VOO and GLD
 * included — because, batch 10 found, "telling a fund from a company is not reliable from what is
 * stored". `isFund` tells them apart from three things that are, measured against the committed
 * index on 2026-10-25; the industry codes below are EDGAR's, as its submissions records gave them
 * that day. Offline: the committed index and plain values only.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const companies = (tickerIndex as unknown as { companies: [number, string, string][] }).companies;
/** a security as the page has it: its ticker, its name from the committed index, its industry code */
const security = (ticker: string, sic?: string) => {
  const row = companies.find(([, t]) => t === ticker);
  return { ticker, name: row ? row[2] : ticker, sic };
};

console.log("\nFunds");
for (const t of ["VOO", "QQQ", "IVV", "VFIAX", "ARKK", "IBIT"]) {
  check(`${t}: a registered fund, in the index's fund half`, isFund(security(t)));
}
for (const t of ["SPY", "DIA", "MDY"]) {
  const s = security(t);
  check(`${t}: a unit investment trust with no industry code, its name says ETF ("${s.name}")`, isFund(s), s.name);
}
for (const [t, why] of [["USO", "an oil fund"], ["UNG", "a natural gas fund"], ["GBTC", "a bitcoin trust turned ETF"]] as const) {
  const s = security(t, "6221");
  check(`${t}: ${why} ("${s.name}")`, isFund(s), s.name);
}
for (const t of ["GLD", "IAU", "SLV"]) {
  const s = security(t, "6221");
  check(`${t}: a commodity trust, industry 6221 and a name that says Trust ("${s.name}")`, isFund(s), s.name);
  check(`…but not on the name alone: ${t} with no industry code is not called a fund`, !isFund({ ...s, sic: undefined }));
}

console.log("\nCompanies");
check("Apple, Ford and Berkshire Hathaway are companies", ["AAPL", "F", "BRK-B"].every((t) => !isFund(security(t))));
check("a company EDGAR files under industry 6221 stays a company when its name says neither Trust, ETF nor Fund: Antalpha Platform Holding",
  !isFund({ ...security("ANTA"), sic: "6221" }));
check("a name that says Trust is a bank's as often: Northern Trust is a company", !isFund(security("NTRS")));
check("a business development company files as a company and stays one: Ares Capital", !isFund(security("ARCC")));
const largest = companies.slice(0, 300).filter(([, t, n]) => isFund({ ticker: t, name: n }));
check("none of the 300 largest companies in the index is called a fund", largest.length === 0, largest.map(([, t]) => t).join(", "));

console.log("\nWhat the page tells search engines");
const fund = securityLd({ name: "Vanguard S&P 500 ETF", ticker: "VOO", fund: true, description: "An index fund." });
check("a fund is an InvestmentFund, its ticker its identifier — schema.org gives InvestmentFund no tickerSymbol",
  fund["@type"] === "InvestmentFund" && (fund as { identifier?: string }).identifier === "VOO" && !("tickerSymbol" in fund), JSON.stringify(fund));
const company = securityLd({ name: "Ford Motor Co", ticker: "F", fund: false, siteDomain: "ford.com" });
check("a company stays a Corporation with its tickerSymbol and site",
  company["@type"] === "Corporation" && (company as { tickerSymbol?: string }).tickerSymbol === "F" && company.sameAs === "https://ford.com", JSON.stringify(company));
check("both name the page they describe", fund.url.endsWith("/company/VOO") && company.url.endsWith("/company/F"));

console.log("\nWired");
const page = read("app/company/[ticker]/page.tsx");
check("the company page builds its structured data from securityLd, told whether it is a fund",
  /securityLd\(\{[^}]*fund: data\.fund/.test(page) && !/"@type": "Corporation"/.test(page));
check("…and says a fund's chart is its share price, a company's its stock price", /data\.fund \? "its share price" : "the stock price"/.test(page));
check("the page data asks isFund with the stored industry code",
  /fund: isFund\(\{ ticker: subject\.ticker, name: subject\.displayName, sic: industry\?\.sic \}\)/.test(read("lib/page-data.ts")));

console.log(`\n${pass}/${pass + fail} checks passed\n`);
process.exit(fail ? 1 : 0);
