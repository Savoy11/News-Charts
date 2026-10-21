import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * How many Federal Register documents name each company in their title?
 *
 *   npm run fr-company-report                 # every company the site holds
 *   npm run fr-company-report -- BA F AAPL    # these tickers (from the committed EDGAR index)
 *   npm run fr-company-report -- --since 2020-01-01
 *
 * The measurement the owner asked for before company pages carry Federal Register documents
 * (2026-10-17 proposal 4): per company, how many title-naming documents there are, from which
 * agencies, by year, and how many are airworthiness directives. Read-only — it writes nothing,
 * and it needs a host that reaches www.federalregister.gov.
 */
import { getPool, closePool, configProblem } from "../lib/db";
import { newsNamesFor, resolveTickerLocally, resolveCompany } from "../lib/sec";
import { fetchCompanyMentions, tallyCompanyMentions } from "../lib/frCompany";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function companies(): Promise<{ ticker: string; name: string; cik: string | null }[]> {
  const asked = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--since");
  if (asked.length) {
    const out: { ticker: string; name: string; cik: string | null }[] = [];
    for (const t of asked) {
      const c = resolveTickerLocally(t) ? await resolveCompany(t) : null;
      if (c) out.push({ ticker: c.ticker, name: c.name, cik: c.cik });
      else console.log(`  ${t}: not in the committed EDGAR index — skipped`);
    }
    return out;
  }
  const { rows } = await getPool().query<{ ticker: string; display_name: string; cik: string | null }>(
    "SELECT ticker, display_name, cik FROM subjects WHERE kind = 'company' AND ticker IS NOT NULL ORDER BY ticker"
  );
  return rows.map((r) => ({ ticker: r.ticker, name: r.display_name, cik: r.cik }));
}

async function main(): Promise<void> {
  const since = arg("since") ?? "2015-01-01";
  const list = await companies();
  console.log(`\nFederal Register documents naming each company in their title, since ${since}\n`);
  let totalNamed = 0;
  for (const c of list) {
    // the names the company feed searches under, so the count measures what a page would carry
    const alsoKnownAs = c.cik ? newsNamesFor(c.cik) : [];
    const r = await fetchCompanyMentions(c.name, since, alsoKnownAs);
    if ("error" in r) {
      console.log(`  ${c.ticker.padEnd(6)} could not ask: ${r.error}`);
      continue;
    }
    const t = tallyCompanyMentions(r.hits, c.name, alsoKnownAs);
    totalNamed += t.named;
    const capped = r.total > r.hits.length ? ` (first ${r.hits.length} of ${r.total} read)` : "";
    console.log(`  ${c.ticker.padEnd(6)} ${String(t.named).padStart(4)} name it in the title, of ${r.total} full-text hits${capped}`);
    if (t.airworthiness) console.log(`         ${t.airworthiness} of them airworthiness directives`);
    if (t.named) {
      console.log(`         agencies: ${t.byAgency.slice(0, 5).map(([a, n]) => `${a} ${n}`).join(" · ")}`);
      console.log(`         by year:  ${t.byYear.slice(0, 6).map(([y, n]) => `${y} ${n}`).join(" · ")}`);
      for (const e of t.examples) console.log(`           ${e}`);
    }
  }
  console.log(`\n  ${totalNamed} title-naming documents across ${list.length} companies\n`);
  await closePool();
}

main().catch(async (err) => {
  const known = configProblem(err);
  console.error(known ? `\nfr-company-report failed: ${known}` : err);
  await closePool().catch(() => {});
  process.exit(1);
});
