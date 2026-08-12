/**
 * The read path resolves a security without asking anyone.
 *
 *   npm run check:tickers
 *
 * Resolving a ticker was the last thing a *read* fetched. Bounding that fetch was the previous
 * fix (`NETWORK_BUDGET_MS`, the `network_timeout` rung); this is the removal. The check that
 * matters is not "the index parses" but "**no request was made**", so `fetch` is replaced with a
 * function that records the attempt and fails — a resolver that quietly reached the network
 * would then be visible rather than merely slow.
 *
 * The second half is the part a snapshot makes easy to get wrong: a company listed after the
 * last sync must still resolve. Local-first is not local-only.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const asked: string[] = [];
function trapFetch(handler?: (url: string) => unknown): void {
  asked.length = 0;
  (globalThis as { fetch: unknown }).fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    if (!handler) throw new Error(`unexpected network call: ${url}`);
    const body = handler(url);
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  };
}

async function main(): Promise<void> {
  const { resolveCompany, TICKER_INDEX_SYNCED_ON } = await import("../lib/sec");

  console.log("\nThe committed index");
  check("records when it was built", /^\d{4}-\d{2}-\d{2}$/.test(TICKER_INDEX_SYNCED_ON), TICKER_INDEX_SYNCED_ON);
  const index = (await import("../data/edgar-tickers.json")).default;
  check("holds the whole company file, not a sample", index.companies.length > 9000, `${index.companies.length}`);
  check("and the whole fund file", Object.keys(index.funds).length > 20000, `${Object.keys(index.funds).length}`);
  // The prefix rung takes the FIRST hit, so the SEC's size ordering has to survive the rebuild.
  // The comment in `resolveCompany` names this exact pair: "APPLE" must reach Apple Inc, not
  // Apple Hospitality REIT. Sorting the index alphabetically at any point would invert it.
  const names = (index.companies as [number, string, string][]).map((r) => r[2].toUpperCase());
  const appleInc = names.findIndex((n) => n.startsWith("APPLE INC"));
  const appleReit = names.findIndex((n) => n.startsWith("APPLE HOSPITALITY"));
  check(
    "keeps the SEC's own ordering, which the prefix rung depends on",
    appleInc >= 0 && appleReit > appleInc,
    `Apple Inc @${appleInc}, Apple Hospitality @${appleReit}`
  );

  console.log("\nA known security resolves with no network at all");
  trapFetch(); // any fetch now throws, and is recorded
  for (const [q, expected] of [
    ["F", "FORD MOTOR CO"],
    ["AAPL", "Apple Inc."],
    ["nvda", "NVIDIA CORP"],
    ["SPY", "SPDR S&P 500 ETF TRUST"],
  ] as const) {
    const hit = await resolveCompany(q).catch(() => null);
    check(`${q} resolves`, hit?.name === expected, hit?.name ?? "null");
  }
  check("and nothing was fetched", asked.length === 0, asked.join(", "));

  // The name-prefix rung, which is why the ordering above is asserted.
  const alibaba = await resolveCompany("ALIBABA").catch(() => null);
  check("a name prefix still finds the company", alibaba?.ticker === "BABA", alibaba?.ticker ?? "null");
  check("still with no request", asked.length === 0, asked.join(", "));

  console.log("\nA fund resolves from the index; only its NAME costs a request");
  trapFetch((url) => (url.includes("/submissions/") ? { name: "VANGUARD INDEX FUNDS" } : {}));
  const voo = await resolveCompany("VOO").catch(() => null);
  check("VOO resolves to a CIK", voo?.cik === "0000036405", voo?.cik ?? "null");
  check("its name comes from the registrant record", voo?.name === "VANGUARD INDEX FUNDS", voo?.name ?? "null");
  check("the ticker files were not fetched", !asked.some((u) => u.includes("company_tickers")), asked.join(", "));

  // An enrichment degrades; it never takes the resolution down with it.
  trapFetch(() => {
    throw new Error("submissions unreachable");
  });
  const vooOffline = await resolveCompany("VOO").catch(() => null);
  check("an unreachable registrant still resolves the fund", vooOffline?.cik === "0000036405", vooOffline?.cik ?? "null");
  check("and falls back to the symbol as its name", vooOffline?.name === "VOO", vooOffline?.name ?? "null");

  console.log("\nLocal-first is not local-only");
  // A company that listed after the last sync is not in the snapshot and must still resolve.
  trapFetch((url) =>
    url.includes("company_tickers.json")
      ? { "0": { cik_str: 9999999, ticker: "NEWCO", title: "NEWLY LISTED CO" } }
      : { fields: ["cik", "seriesId", "classId", "symbol"], data: [] }
  );
  const newco = await resolveCompany("NEWCO").catch(() => null);
  check("a listing newer than the index falls through to EDGAR", newco?.name === "NEWLY LISTED CO", newco?.name ?? "null");
  check("which is the only time the live file is asked for", asked.some((u) => u.includes("company_tickers.json")));

  console.log("\nA query that is nothing");
  trapFetch((url) =>
    url.includes("company_tickers.json") ? {} : { fields: ["cik", "seriesId", "classId", "symbol"], data: [] }
  );
  const junk = await resolveCompany("zzqqxxnotathing").catch(() => null);
  check("resolves to nothing rather than to something", junk === null, JSON.stringify(junk));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

main();
