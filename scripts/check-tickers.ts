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
  const { resolveCompany, resolveTickerLocally, TICKER_INDEX_SYNCED_ON } = await import("../lib/sec");
  type TickerIndex = import("../lib/sec").TickerIndex;

  console.log("\nThe committed index");
  check("records when it was built", /^\d{4}-\d{2}-\d{2}$/.test(TICKER_INDEX_SYNCED_ON), TICKER_INDEX_SYNCED_ON);
  // Staleness is computed and said, not just recorded (NC-051): the date sat 66 days old with
  // nothing reading it but the format check above.
  const { tickerIndexAgeDays, TICKER_INDEX_MAX_AGE_DAYS } = await import("../lib/sec");
  check("its age is counted in whole days", tickerIndexAgeDays(new Date("2026-10-17T12:00:00Z"), "2026-08-12") === 66);
  check("…and a same-day sync is 0 days old", tickerIndexAgeDays(new Date("2026-08-12T23:59:00Z"), "2026-08-12") === 0);
  check("the age limit is about a month", TICKER_INDEX_MAX_AGE_DAYS >= 28 && TICKER_INDEX_MAX_AGE_DAYS <= 45, `${TICKER_INDEX_MAX_AGE_DAYS}`);
  const refreshSrc = (await import("node:fs")).readFileSync("scripts/refresh.ts", "utf8");
  check("the scheduled refresh warns when the index is past it",
    /tickerIndexAgeDays\(\)/.test(refreshSrc) && /indexAge > TICKER_INDEX_MAX_AGE_DAYS/.test(refreshSrc));
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

  /**
   * The prefix rung is gated on ambiguity, not on length.
   *
   * A three-character minimum was declining `"3M"` — which matches exactly one row in the whole
   * index — and telling a visitor that a Dow 30 component is not a listed security.
   */
  const mmm = await resolveCompany("3M").catch(() => null);
  check("a short but UNIQUE prefix resolves", mmm?.ticker === "MMM", mmm?.ticker ?? "null");
  check("  …to the company that bears the name", mmm?.name === "3M CO", mmm?.name ?? "null");
  // …and the ambiguous case still needs enough query to be meant, taking the SEC's own ordering.
  const apple = await resolveCompany("APPLE").catch(() => null);
  check("an ambiguous prefix still takes the largest", apple?.ticker === "AAPL", apple?.ticker ?? "null");
  check("nothing was fetched for either", asked.length === 0, asked.join(", "));

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

  console.log("\nA fund name that means several funds is not an answer");
  // NC-040: seven series start "S&P 500 …" and the rung took the first, QCEQRX "S&P 500 Index
  // Account"; 214 exact names are shared by several funds. The later rungs still run, so the
  // live files are stubbed empty here — what must not happen is the fund-name rung guessing.
  trapFetch((url) =>
    url.includes("company_tickers.json") ? {} : { fields: ["cik", "seriesId", "classId", "symbol"], data: [] }
  );
  const sp = await resolveCompany("S&P 500").catch(() => null);
  check("\"S&P 500\" no longer picks an arbitrary fund", sp === null, JSON.stringify(sp));
  const balanced = await resolveCompany("Balanced Fund").catch(() => null);
  check("an exact name shared by several funds picks none", balanced === null, JSON.stringify(balanced));
  const v500again = await resolveCompany("Vanguard 500").catch(() => null);
  check("two index rows for ONE fund still resolve", v500again?.ticker === "VOO", v500again?.ticker ?? "null");
  const fidelity = await resolveCompany("Fidelity 500").catch(() => null);
  check("a prefix only one fund has still resolves", fidelity?.ticker === "FUSVX", fidelity?.ticker ?? "null");

  console.log("\nA name on a read path resolves from the index alone");
  // NC-161: /company/Ford missed because the corpus is keyed by ticker. The page path now learns
  // Ford is F from the committed index — and must spend nothing to do it.
  trapFetch(); // any request now throws
  check("\"Ford\" is F", resolveTickerLocally("Ford") === "F", String(resolveTickerLocally("Ford")));
  check("a fund symbol is itself", resolveTickerLocally("VOO") === "VOO");
  check("a fund name is its ETF class", resolveTickerLocally("Vanguard 500") === "VOO", String(resolveTickerLocally("Vanguard 500")));
  check("junk is nothing", resolveTickerLocally("zzqqxxnotathing") === null);
  check("  …and none of it asked anybody", asked.length === 0, asked.join(", "));

  console.log("\n\"Did you mean\": near matches from the index, with no network");
  // 2026-10-17 proposal 3: the index matched exactly or by prefix, so a misspelling or "and" for
  // "&" ended at "didn't match" for every security not yet held.
  const { suggestSecurities, fundNameIsShared, SUGGEST_LIMIT } = await import("../lib/sec");
  const { trigrams, wordSimilarity } = await import("../lib/fuzzy");
  trapFetch(); // any request now throws
  const first = (q: string) => suggestSecurities(q)[0];
  check("\"Johnson and Johnson\" offers JNJ — \"&\" read as \"and\"",
    first("Johnson and Johnson")?.ticker === "JNJ" && first("Johnson and Johnson")?.via === "name",
    JSON.stringify(first("Johnson and Johnson")));
  check("\"Procter and Gamble\" offers PG", first("Procter and Gamble")?.ticker === "PG");
  check("a typo in a name not yet held is forgiven", first("berkshire hathway")?.ticker === "BRK-B" && first("nvidea")?.ticker === "NVDA");
  check("a fund misspelt is found by its series name", first("vanguard total stock markt")?.ticker === "VTI");
  check("an everyday name inside a longer query is found", first("tesla motors")?.ticker === "TSLA", JSON.stringify(first("tesla motors")));
  check("…but never ahead of a name holding every word typed",
    first("apple hospitalty")?.ticker === "APLE", JSON.stringify(first("apple hospitalty")));
  check("a name missing a word typed is not offered", suggestSecurities("electric cars").length === 0,
    suggestSecurities("electric cars").map((s) => s.name).join(" / "));
  check("junk is offered nothing", suggestSecurities("zzqqxxnotathing").length === 0);
  check("filler alone is offered nothing", suggestSecurities("holdings").length === 0 && suggestSecurities("co").length === 0);
  check(`never more than ${SUGGEST_LIMIT}`, suggestSecurities("bitcoin").length === SUGGEST_LIMIT);
  check("a name several funds share is recognised", fundNameIsShared("S&P 500") && fundNameIsShared("Balanced Fund"));
  check("  …but not one fund listed twice, or a company", !fundNameIsShared("Vanguard 500") && !fundNameIsShared("Ford"));
  check("\"S&P 500\" offers funds named for it, not S&P Global",
    suggestSecurities("S&P 500").every((s) => s.ticker !== "SPGI" && /^S&P 500/.test(s.name)),
    suggestSecurities("S&P 500").map((s) => s.ticker).join(" "));
  // Pinned against Postgres's own word_similarity, so the floor means the same on both paths.
  const pg: [string, string, number][] = [
    ["forde", "Ford Motor Company", 0.667],
    ["word", "two words", 0.8],
    ["alibba", "Alibaba Group Holding Ltd", 0.571],
    ["vanguard total stock markt", "Vanguard Institutional Total Stock Market Index Fund", 0.625],
    ["electric cars", "GENERAL ELECTRIC CO", 0.714],
  ];
  const off = pg.filter(([a, b, w]) => Math.abs(wordSimilarity(new Set(trigrams(a)), trigrams(b)) - w) > 0.001);
  check("the score is pg_trgm's word_similarity", off.length === 0, off.map(([a, b]) => `${a} / ${b}`).join("; "));
  check("  …and none of it asked anybody", asked.length === 0, asked.join(", "));

  console.log("\nTwo securities can share one registrant");
  // NC-138: subjects_cik_uq made the CIK an identity, so GOOG after GOOGL — or BRK-A after BRK-B,
  // or any second series of a fund trust — failed on insert and was never ingested. Read the
  // migrations in the order they apply and ask what the schema ends up enforcing.
  const { readdirSync, readFileSync } = await import("node:fs");
  let cikUnique = false;
  for (const file of readdirSync("db").filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(`db/${file}`, "utf8").replace(/--.*$/gm, "");
    if (/CREATE UNIQUE INDEX[^;]*ON subjects \(cik\)/i.test(sql)) cikUnique = true;
    if (/DROP INDEX[^;]*subjects_cik_uq/i.test(sql)) cikUnique = false;
  }
  check("no migration leaves the CIK unique", !cikUnique);
  const shared = Object.entries(
    Object.entries(index.funds).reduce<Record<number, number>>((acc, [, cik]) => ((acc[cik] = (acc[cik] ?? 0) + 1), acc), {})
  ).filter(([, n]) => n > 1).length;
  check("…which the index needs: fund CIKs carry several symbols", shared > 100, `${shared} shared fund CIKs`);

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
