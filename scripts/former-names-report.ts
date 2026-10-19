/**
 * What EDGAR's own record says about a company's former names — the raw `formerNames` field, and
 * what the site makes of it.
 *
 *   npm run former-names-report                 # META, AAPL and XYZ (Block, formerly Square)
 *   npm run former-names-report -- META GE      # these tickers (from the committed EDGAR index)
 *
 * 2026-10-17 proposal 9 reads `formerNames` from the submissions record, a field this repo had
 * never referenced, so its shape came from knowledge of the SEC API rather than a record anyone
 * here had seen. This prints the real field so it can be pinned as the check's fixture
 * (`scripts/fixtures/sec-former-names.json`) — a fixture written from an assumption can only
 * confirm that assumption. Read-only, and it needs a host that reaches data.sec.gov.
 */
import { formerNameAliases, renamesFrom, resolveCompany, resolveTickerLocally, type FormerName } from "../lib/sec";

const UA = { "User-Agent": "News Charts Research marcusowens94@gmail.com" };

async function main(): Promise<void> {
  const asked = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const tickers = asked.length ? asked : ["META", "AAPL", "XYZ"];
  const records: { ticker: string; cik: string; name: string; formerNames: FormerName[] }[] = [];
  for (const t of tickers) {
    const company = resolveTickerLocally(t) ? await resolveCompany(t) : null;
    if (!company) {
      console.log(`${t}: not in the committed EDGAR index — skipped`);
      continue;
    }
    const res = await fetch(`https://data.sec.gov/submissions/CIK${company.cik}.json`, { headers: UA });
    if (!res.ok) {
      console.log(`${t}: EDGAR answered ${res.status}`);
      continue;
    }
    const json = await res.json();
    const name = String(json?.name ?? company.name);
    const formerNames: FormerName[] = Array.isArray(json?.formerNames) ? json.formerNames : [];
    records.push({ ticker: company.ticker, cik: company.cik, name, formerNames });

    const renames = renamesFrom(name, formerNames);
    console.log(`\n${company.ticker} — ${name} (CIK ${company.cik})`);
    console.log(`  former names in the record: ${formerNames.length}`);
    for (const r of renames) console.log(`  ${r.on}  renamed from ${r.from} to ${r.to}`);
    if (!renames.length) console.log("  no rename the site would show");
    const aliases = formerNameAliases(renames, name);
    console.log(`  search aliases: ${aliases.length ? aliases.join(", ") : "none"}`);
  }
  // The block to paste back: the raw field, exactly as EDGAR sent it.
  console.log("\n--- copy from here ---");
  console.log(JSON.stringify(records, null, 1));
  console.log("--- to here ---");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
