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
  type TickerIndex = import("../lib/sec").TickerIndex;

  console.log("\nThe committed index");
  check("records when it was built", /^\d{4}-\d{2}-\d{2}$/.test(TICKER_INDEX_SYNCED_ON), TICKER_INDEX_SYNCED_ON);
  // Through the same declared contract the resolver uses, not the JSON's inferred literal type —
  // which is 49,000 key names wide and makes `index.funds[someString]` an implicit-any error.
  const index = (await import("../data/edgar-tickers.json")).default as unknown as TickerIndex;
  check("holds the whole company file, not a sample", index.companies.length > 9000, `${index.companies.length}`);
  check("and the whole fund file", Object.keys(index.funds).length > 20000, `${Object.keys(index.funds).length}`);
  // The prefix rung takes the FIRST hit, so the SEC's size ordering has to survive the rebuild.
  // The comment in `resolveCompany` names this exact pair: "APPLE" must reach Apple Inc, not
  // Apple Hospitality REIT. Sorting the index alphabetically at any point would invert it.
  const names = index.companies.map((r) => r[2].toUpperCase());
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

  console.log("\nA fund resolves from the index, name included");
  // This used to cost a request: the fund files carry no names, so a fund page fetched the
  // REGISTRANT record just to have something to call it — and got the trust ("VANGUARD INDEX
  // FUNDS") rather than the fund. The series pass put the real name in the index, so the
  // request is gone and the answer is better.
  trapFetch(); // any request now throws
  const voo = await resolveCompany("VOO").catch(() => null);
  check("VOO resolves to a CIK", voo?.cik === "0000036405", voo?.cik ?? "null");
  check("its name is the FUND, not the trust", voo?.name === "Vanguard 500 Index Fund", voo?.name ?? "null");
  check("and it cost no request at all", asked.length === 0, asked.join(", "));

  /**
   * The registrant fallback still exists, for the 27 fund symbols the series pass did not name.
   * An enrichment degrades; it never takes the resolution down with it.
   */
  const unnamed = Object.keys(index.funds).find((s) => index.symbolSeries?.[s] === undefined);
  check("some symbols still need the fallback", typeof unnamed === "string", unnamed ?? "none");
  if (unnamed) {
    trapFetch((url) => (url.includes("/submissions/") ? { name: "A REGISTRANT TRUST" } : {}));
    const viaRegistrant = await resolveCompany(unnamed).catch(() => null);
    check("an unnamed symbol falls back to the registrant", viaRegistrant?.name === "A REGISTRANT TRUST", viaRegistrant?.name ?? "null");
    check("  …and the ticker files were still not fetched", !asked.some((u) => u.includes("company_tickers")), asked.join(", "));

    trapFetch(() => {
      throw new Error("submissions unreachable");
    });
    const offline = await resolveCompany(unnamed).catch(() => null);
    check("an unreachable registrant still resolves the fund", offline?.ticker === unnamed, offline?.ticker ?? "null");
    check("  …falling back to the symbol as its name", offline?.name === unnamed, offline?.name ?? "null");
  }

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

  /**
   * Fund names — the rung funds could not have while the only fund source was a symbol list.
   *
   * The parser first, because a class belongs to the series ABOVE it: matching all series and
   * all classes with two independent sweeps would still "work" and would attach every symbol to
   * whichever fund happened to come first.
   */
  console.log("\nFund series parse");
  const { parseSeriesPage, preferredClass } = await import("../lib/edgarSeries");
  const fixture = `
    <tr><td><td colspan="2"><a href="/cgi-bin/browse-edgar?action=getcompany&amp;CIK=S000000001&amp;owner=include&amp;scd=filings&amp;count=40">S000000001</a></td>
    <td><a href="/cgi-bin/browse-edgar?action=getcompany&amp;CIK=S000000001&amp;scd=series&amp;view=mutual-fund">Acme 500 Index Fund</a></td></tr>
    <tr><td><td><td><a href="/cgi-bin/browse-edgar?action=getcompany&amp;CIK=C000000001&amp;owner=include&amp;scd=filings&amp;count=40">C000000001</a></td>
    <td class="text-sm">Investor Shares</td><td class="text-sm" valign="top" align="left">ACMEX</td></tr>
    <tr><td><td><td><a href="/cgi-bin/browse-edgar?action=getcompany&amp;CIK=C000000002&amp;owner=include&amp;scd=filings&amp;count=40">C000000002</a></td>
    <td class="text-sm">ETF Shares</td><td class="text-sm" valign="top" align="left">ACME</td></tr>
    <tr><td><td colspan="2"><a href="/cgi-bin/browse-edgar?action=getcompany&amp;CIK=S000000002&amp;owner=include&amp;scd=filings&amp;count=40">S000000002</a></td>
    <td><a href="/cgi-bin/browse-edgar?action=getcompany&amp;CIK=S000000002&amp;scd=series&amp;view=mutual-fund">Acme Bond &amp; Income Fund</a></td></tr>
    <tr><td><td><td><a href="/cgi-bin/browse-edgar?action=getcompany&amp;CIK=C000000003&amp;owner=include&amp;scd=filings&amp;count=40">C000000003</a></td>
    <td class="text-sm">Investor Shares</td><td class="text-sm" valign="top" align="left">ACBDX</td></tr>`;
  const parsed = parseSeriesPage(fixture);
  check("both series are found", parsed.length === 2, `${parsed.length}`);
  check("a class belongs to the series above it", parsed[0].classes.map((c) => c.symbol).join(",") === "ACMEX,ACME", parsed[0].classes.map((c) => c.symbol).join(","));
  check("and not to the wrong one", parsed[1].classes.map((c) => c.symbol).join(",") === "ACBDX", parsed[1].classes.map((c) => c.symbol).join(","));
  check("entities in a fund name are decoded", parsed[1].name === "Acme Bond & Income Fund", parsed[1].name);
  // The stated preference, not a silent pick between equals: the ETF class is the exchange-traded
  // one, which is what this product is about since the 2026-08-08 scope refocus.
  check("the ETF share class is preferred", preferredClass(parsed[0])?.symbol === "ACME", preferredClass(parsed[0])?.symbol);
  check("a fund with no ETF class still resolves", preferredClass(parsed[1])?.symbol === "ACBDX", preferredClass(parsed[1])?.symbol);

  console.log("\nA fund resolves by NAME, with no network");
  check("the index carries fund names", (index.seriesNames?.length ?? 0) > 5000, `${index.seriesNames?.length ?? 0}`);
  // Every series must carry its own CIK. Deriving it from `funds[symbol]` instead loses 36% of
  // them — found by measuring the built index rather than by reasoning about it.
  check(
    "every named series carries a CIK to answer with",
    index.seriesCiks?.length === index.seriesNames?.length && index.seriesSymbols?.length === index.seriesNames?.length,
    `${index.seriesNames?.length} names / ${index.seriesSymbols?.length} symbols / ${index.seriesCiks?.length} ciks`
  );
  const orphaned = (index.seriesSymbols ?? []).filter((s) => index.funds[s] === undefined).length;
  check(
    "…including the many the fund ticker file does not list",
    orphaned > 0 && (index.seriesCiks ?? []).every((c) => Number.isFinite(c) && c > 0),
    `${orphaned} series unresolvable via funds[symbol] alone`
  );
  trapFetch(); // any request now throws
  const v500 = await resolveCompany("Vanguard 500").catch(() => null);
  check("\"Vanguard 500\" resolves", v500 !== null, JSON.stringify(v500));
  check("  …to the ETF share class", v500?.ticker === "VOO", v500?.ticker ?? "null");
  check("  …named as the fund, not the trust", /Vanguard 500 Index Fund/i.test(v500?.name ?? ""), v500?.name ?? "null");
  check("  …and asked nobody", asked.length === 0, asked.join(", "));

  // A share class symbol keeps answering exactly, and now carries the fund's name for free —
  // this is the request that used to go to data.sec.gov for every single fund page.
  const vfiax = await resolveCompany("VFIAX").catch(() => null);
  check("a share-class symbol still resolves exactly", vfiax?.ticker === "VFIAX", vfiax?.ticker ?? "null");
  check("  …and names its fund without a request", /Vanguard 500 Index Fund/i.test(vfiax?.name ?? ""), vfiax?.name ?? "null");
  check("  …still with nothing fetched", asked.length === 0, asked.join(", "));

  // The guard the company prefix rung has, for the same reason: two characters of a fund name
  // match half the industry.
  // Worded to survive "VA" being a real symbol: what must not happen is a two-character
  // fragment matching a fund by NAME. Resolving as its own symbol is rung 2 doing its job.
  const shortQ = await resolveCompany("Va").catch(() => null);
  check("a two-character fragment is not treated as a fund name", shortQ === null || shortQ.ticker === "VA", JSON.stringify(shortQ));

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
