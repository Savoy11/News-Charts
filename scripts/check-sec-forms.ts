/**
 * What EDGAR says about a filing reaches its title (2026-10-17 proposal 1).
 *
 *   npm run check:sec-forms
 *
 * Every 8-K but a results one was titled "8-K filing", with its item codes printed underneath as
 * "Items: 5.02,9.01"; a foreign private issuer's annual report (20-F) could only ever be a filing,
 * and a Canadian one's (40-F) was dropped at the door. Offline by construction: fetch is replaced
 * with a submissions record built here.
 */

import { readFileSync } from "node:fs";
import { BUSY_PROSPECTUS_DAYS, describeItems, leadItem, pageFilings, reportsResults } from "../lib/secForms";
import type { TimelineEvent } from "../lib/types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

/** The SEC's Form 8-K item list as in force since August 2004. */
const CURRENT_ITEMS = [
  "1.01", "1.02", "1.03", "1.04", "1.05",
  "2.01", "2.02", "2.03", "2.04", "2.05", "2.06",
  "3.01", "3.02", "3.03",
  "4.01", "4.02",
  "5.01", "5.02", "5.03", "5.04", "5.05", "5.06", "5.07", "5.08",
  "6.01", "6.02", "6.03", "6.04", "6.05", "6.06",
  "7.01", "8.01", "9.01",
];

async function main(): Promise<void> {
  console.log("\nThe item list");
  const unnamed = CURRENT_ITEMS.filter((c) => describeItems(c) === `Item ${c}`);
  check("every current 8-K item has a plain name", unnamed.length === 0, unnamed.join(", "));
  check("an officer change leads over the exhibit index", leadItem("5.02,9.01")?.code === "5.02");
  check("the most material item leads, whatever order EDGAR lists them in",
    leadItem("8.01,1.03,9.01")?.code === "1.03" && leadItem("7.01,4.02")?.code === "4.02");
  check("an exhibit index alone names nothing", leadItem("9.01") === null);
  check("pre-2004 item numbers are not guessed at", leadItem("5,7") === null);
  check("results are item 2.02 exactly, not a substring of another code",
    reportsResults("2.02,9.01") && !reportsResults("12") && !reportsResults(""));
  check("the description keeps the codes and names them",
    describeItems("5.02,9.01") === "Items 5.02 Officer or director change · 9.01 Financial statements and exhibits",
    describeItems("5.02,9.01"));
  check("a code outside the list is shown bare", describeItems("5,7") === "Items 5 · 7");

  console.log("\nA submissions record, through the parser");
  const rows: [form: string, date: string, items: string][] = [
    ["8-K", "2026-09-02", "5.02,9.01"],
    ["8-K", "2026-08-01", "2.02,9.01"],
    ["8-K", "2026-07-15", "1.01,2.03,9.01"],
    ["8-K", "2026-06-10", "9.01"],
    ["8-K", "2001-03-05", "5,7"],
    ["20-F", "2026-04-28", ""],
    ["40-F", "2026-03-20", ""],
    ["6-K", "2026-05-14", ""],
    ["10-K", "2026-02-20", ""],
  ];
  const realFetch = globalThis.fetch;
  let events: TimelineEvent[] = [];
  try {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          name: "TEST CO",
          filings: {
            recent: {
              form: rows.map((r) => r[0]),
              filingDate: rows.map((r) => r[1]),
              accessionNumber: rows.map((_, i) => `0000000001-26-${String(i).padStart(6, "0")}`),
              primaryDocument: rows.map(() => "a.htm"),
              items: rows.map((r) => r[2]),
            },
          },
        }),
        { status: 200 }
      )) as typeof fetch;
    const { getFilings } = await import("../lib/sec");
    events = await getFilings({ ticker: "TST", cik: "0000000001", name: "Test Co" });
  } finally {
    globalThis.fetch = realFetch;
  }
  const on = (date: string) => events.find((e) => e.date === date);

  check("an 8-K is titled by its item",
    on("2026-09-02")?.title === "Test Co: Officer or director change (8-K 5.02)", on("2026-09-02")?.title);
  check("  …and stays a filing", on("2026-09-02")?.type === "filing");
  check("a results 8-K is still an earnings announcement",
    on("2026-08-01")?.title === "Test Co: Earnings announcement (8-K)" && on("2026-08-01")?.type === "earnings");
  check("a deal outranks the debt that funds it",
    on("2026-07-15")?.title === "Test Co: Material agreement (8-K 1.01)", on("2026-07-15")?.title);
  check("an exhibits-only 8-K keeps the plain title", on("2026-06-10")?.title === "Test Co: 8-K filing");
  check("a pre-2004 8-K keeps the plain title", on("2001-03-05")?.title === "Test Co: 8-K filing");
  check("a 20-F is an annual report, typed earnings",
    on("2026-04-28")?.title === "Test Co: Annual report (20-F)" && on("2026-04-28")?.type === "earnings",
    `${on("2026-04-28")?.title} / ${on("2026-04-28")?.type}`);
  check("a 40-F is admitted, as an annual report typed earnings",
    on("2026-03-20")?.title === "Test Co: Annual report (40-F)" && on("2026-03-20")?.type === "earnings",
    on("2026-03-20") ? `${on("2026-03-20")?.title} / ${on("2026-03-20")?.type}` : "dropped");
  check("a 6-K stays a filing — the list does not say whether it carries results",
    on("2026-05-14")?.type === "filing" && on("2026-05-14")?.title === "Test Co: 6-K filing");
  check("a 10-K is unchanged", on("2026-02-20")?.title === "Test Co: Annual report (10-K)");

  console.log("\nThe filing stack still reads the form out of the new titles");
  const src = readFileSync("components/EventList.tsx", "utf8");
  const reSrc = src.match(/const FORM_RE =\s*\/(.+)\/i;/)?.[1];
  check("EventList's form pattern is where this check expects it", Boolean(reSrc));
  if (reSrc) {
    const FORM_RE = new RegExp(reSrc, "i");
    const forms = events.map((e) => e.title.match(FORM_RE)?.[1].toUpperCase() ?? "?");
    check("every title yields its form", forms.every((f, i) => f === rows[i][0]), forms.join(" "));
  }

  // 2026-10-17 proposal 2: the material forms already in every record, as the owner chose them
  // on 2026-10-18 — corrections, mergers, large stakes, offerings and exits; no insider trades.
  console.log("\nThe material forms EDGAR already sends");
  const more: [form: string, date: string, items: string, fileNumber?: string][] = [
    ["10-K/A", "2026-03-02", ""],
    ["8-K/A", "2026-03-03", "5.02,9.01"],
    ["8-K/A", "2026-03-04", "2.02"],
    ["10-K405", "1999-03-30", ""],
    ["DEFM14A", "2026-03-05", ""],
    ["SC TO-T", "2026-03-06", ""],
    ["SCHEDULE 13D", "2026-03-09", ""],
    ["SC 13G/A", "2024-02-09", ""],
    ["S-3", "2026-03-10", ""],
    ["25-NSE", "2026-03-11", ""],
    ["15-12B", "2026-03-12", ""],
    ["25", "2026-03-13", ""],
    ["424B2", "2026-03-16", ""],
    ["424B2", "2026-03-16", ""],
    ["424B2", "2026-03-16", ""],
    ["424B5", "2026-03-16", ""],
    ["424B5", "2026-03-17", ""],
    ["4", "2026-03-18", ""],
    ["3", "2026-03-18", ""],
    ["5", "2026-03-18", ""],
    ["144", "2026-03-18", ""],
    // The company's own stake in another issuer: in its record such a filing has no file number
    // (a stake in the company carries the company's 005- number, as EDGAR's records do).
    ["SC 13G/A", "2025-02-10", "", ""],
  ];
  const record = (list: typeof more, offset: number) => ({
    form: list.map((r) => r[0]),
    filingDate: list.map((r) => r[1]),
    accessionNumber: list.map((_, i) => `0000000001-26-${String(offset + i).padStart(6, "0")}`),
    primaryDocument: list.map(() => "a.htm"),
    items: list.map((r) => r[2]),
    fileNumber: list.map((r) => r[3] ?? (/13[DG]/.test(r[0]) ? "005-00001" : "001-00001")),
  });
  // the third 424B2 of the day sits in an older shard: a day split across blocks is still one row
  const shard: typeof more = [["424B2", "2026-03-16", ""]];
  let wide: TimelineEvent[] = [];
  const othersStakes: string[] = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) =>
      new Response(
        JSON.stringify(
          String(input).includes("submissions-001")
            ? record(shard, 500)
            : { name: "TEST CO", filings: { recent: record(more.filter((_, i) => i !== 14), 100), files: [{ name: "CIK0000000001-submissions-001.json" }] } }
        ),
        { status: 200 }
      )) as typeof fetch;
    const { getFilingsDeep } = await import("../lib/sec");
    wide = await getFilingsDeep({ ticker: "TST", cik: "0000000001", name: "Test Co" }, true, [], othersStakes);
  } finally {
    globalThis.fetch = realFetch;
  }
  const titled = (t: string) => wide.find((e) => e.title === `Test Co: ${t}`);
  check("an amended annual report is kept, as a filing", titled("Amended annual report (10-K/A)")?.type === "filing");
  check("an amended 8-K is named by its item", Boolean(titled("Amended: Officer or director change (8-K/A 5.02)")));
  check("  …and an amended results release is not a second earnings event",
    titled("Amended earnings announcement (8-K/A)")?.type === "filing");
  check("the pre-2002 annual report is earnings, like a 10-K", titled("Annual report (10-K405)")?.type === "earnings");
  check("mergers, stakes, offerings and exits are kept",
    ["Merger vote proxy (DEFM14A)", "Tender offer by an outside bidder (SC TO-T)", "Investor stake over 5% (SCHEDULE 13D)",
      "Change to a passive 5%+ stake (SC 13G/A)", "Shelf registration for new securities (S-3)", "Removed from an exchange (25-NSE)",
      "Deregistration — stops SEC reporting (15-12B)", "Delisting notice (25)"].every((t) => titled(t)),
    wide.map((e) => e.title).join(" | "));
  const p2 = wide.filter((e) => /\(424B2\)$/.test(e.title));
  check("a day's prospectuses of one form are one row, counted across blocks",
    p2.length === 1 && p2[0].title === "Test Co: Prospectuses ×3 (424B2)", p2.map((e) => e.title).join(" | "));
  check("  …with a stable identity per form and day", p2[0]?.dedupBasis === "sec:1:424B2:2026-03-16");
  check("  …and a single one links its own document",
    wide.some((e) => e.title === "Test Co: Prospectus (424B5)" && e.date === "2026-03-17" && /\/Archives\/edgar\/data\/1\//.test(e.url ?? "")));
  check("insider-trade forms stay out", !wide.some((e) => /\((?:3|4|5|144)\)$/.test(e.title) || e.date === "2026-03-18"));
  // Found measuring audit 2026-10-21 #4: JPMorgan's page called 190 of its 192 recent 13Gs — its
  // own stakes in 3M, DigitalOcean and the rest — "Passive investor stake over 5%", as if in JPM.
  check("a company's own stake in another issuer is not shown as a stake in it",
    !wide.some((e) => e.date === "2025-02-10"), wide.filter((e) => e.date === "2025-02-10").map((e) => e.title).join(" | "));
  check("  …and is handed back, so ingest can unlink what an earlier run stored",
    othersStakes.length === 1 &&
      othersStakes[0] === `000000000126${String(100 + more.filter((_, i) => i !== 14).findIndex((r) => r[3] === "")).padStart(6, "0")}`,
    othersStakes.join(","));
  const ingestStakes = readFileSync("scripts/ingest.ts", "utf8");
  check("  …which it does, for this company only",
    /getFilingsDeep\(company, true, renames, othersStakes\)/.test(ingestStakes) &&
      /DELETE FROM event_subjects es[\s\S]{0,200}?es\.subject_id = \$1[\s\S]{0,200}?s\.key = 'sec_edgar' AND a\.external_id = ANY\(\$2::text\[\]\)/.test(ingestStakes));
  if (reSrc) {
    const FORM_RE = new RegExp(reSrc, "i");
    const unread = wide.filter((e) => !FORM_RE.test(e.title)).map((e) => e.title);
    check("the filing stack reads a form out of every new title", unread.length === 0, unread.join(" | "));
  }

  /**
   * The forms the 2026-10-18 list missed, picked by the owner on 2026-10-26 (batch 65). Each row's
   * form, date and accession are a real filing's, read from EDGAR on 2026-10-27; a deal form's file
   * number is as EDGAR lists it (Disney's own, 001-38842; none on Pfizer's, which it made about
   * other companies), and UBS's F-4's; the others are stand-ins, which no rule here reads.
   */
  console.log("\nThe forms the 2026-10-18 list missed (batch 65)");
  const missed: [form: string, date: string, accession: string, fileNumber: string, who: string][] = [
    ["F-1", "2023-08-21", "0001193125-23-216983", "333-00001", "Arm Holdings plc"],
    ["NT 10-Q", "2006-08-11", "0001104659-06-053743", "001-00001", "Apple Inc."],
    ["NT 10-K", "2006-12-15", "0001104659-06-081617", "001-00001", "Apple Inc."],
    ["S-3ASR", "2024-11-01", "0001140361-24-044880", "333-00001", "Apple Inc."],
    ["SC TO-I", "2007-03-16", "0001104659-07-019900", "005-00001", "Apple Inc."],
    ["NT 20-F", "2020-04-29", "0001104659-20-052701", "001-00001", "NIO Inc."],
    ["F-3ASR", "2024-05-21", "0001104659-24-063824", "333-00001", "NIO Inc."],
    ["F-4", "2023-04-26", "0001193125-23-118754", "333-271453", "UBS Group AG"],
    ["F-3", "2023-06-06", "0001104659-23-068524", "333-00001", "UBS Group AG"],
    ["PREC14A", "2024-01-16", "0001744489-24-000050", "001-38842", "Walt Disney Co"],
    ["DEFC14A", "2024-02-06", "0001213900-24-010239", "001-38842", "Walt Disney Co"],
    ["SC TO-T", "2019-06-28", "0001193125-19-185659", "", "Pfizer Inc."],
    ["PREC14A", "1999-12-16", "0000950123-99-010992", "", "Pfizer Inc."],
  ];
  const dfan = (JSON.parse(readFileSync("scripts/fixtures/sec-form-rows.json", "utf8")) as {
    rows: { form: string; date: string; accession: string; fileNumber: string; who: string }[];
  }).rows;
  const allMissed = [...missed.map(([form, date, accession, fileNumber, who]) => ({ form, date, accession, fileNumber, who })), ...dfan];
  const byWho = new Map<string, TimelineEvent[]>();
  try {
    for (const who of [...new Set(allMissed.map((r) => r.who))]) {
      const list = allMissed.filter((r) => r.who === who);
      globalThis.fetch = (async () => new Response(JSON.stringify({ name: who, filings: { recent: {
        form: list.map((r) => r.form), filingDate: list.map((r) => r.date), accessionNumber: list.map((r) => r.accession),
        primaryDocument: list.map(() => "a.htm"), items: list.map(() => ""), fileNumber: list.map((r) => r.fileNumber),
      } } }), { status: 200 })) as typeof fetch;
      const { getFilingsDeep } = await import("../lib/sec");
      byWho.set(who, await getFilingsDeep({ ticker: "X", cik: "0000000002", name: who }, true, [], []));
    }
  } finally {
    globalThis.fetch = realFetch;
  }
  const filed = (who: string, date: string, form: string) =>
    byWho.get(who)?.find((e) => e.date === date && e.title.endsWith(`(${form})`))?.title.replace(`${who}: `, "");
  check("ARM's F-1, its 2023 listing, is kept and named",
    filed("Arm Holdings plc", "2023-08-21", "F-1") === "Registration to sell shares (foreign company) (F-1)", filed("Arm Holdings plc", "2023-08-21", "F-1"));
  check("Apple's 2006 late-filing notices are kept, the 10-Q's and the 10-K's",
    filed("Apple Inc.", "2006-08-11", "NT 10-Q") === "Notice that the quarterly report will be late (NT 10-Q)" &&
      filed("Apple Inc.", "2006-12-15", "NT 10-K") === "Notice that the annual report will be late (NT 10-K)");
  check("  …as is NIO's NT 20-F of 2020", filed("NIO Inc.", "2020-04-29", "NT 20-F") === "Notice that the annual report will be late (NT 20-F)");
  check("an automatic shelf reads as a shelf: Apple's S-3ASR, NIO's F-3ASR, UBS's F-3",
    filed("Apple Inc.", "2024-11-01", "S-3ASR") === "Shelf registration for new securities (S-3ASR)" &&
      filed("NIO Inc.", "2024-05-21", "F-3ASR") === "Shelf registration for new securities (F-3ASR)" &&
      filed("UBS Group AG", "2023-06-06", "F-3") === "Shelf registration for new securities (F-3)");
  check("UBS's F-4 for Credit Suisse is a merger registration, and Apple's SC TO-I its own offer",
    filed("UBS Group AG", "2023-04-26", "F-4") === "Merger or exchange registration (F-4)" &&
      filed("Apple Inc.", "2007-03-16", "SC TO-I") === "The company's own tender or exchange offer (SC TO-I)");
  check("Disney's 2024 proxy fight is on its page, its own preliminary proxy and Blackwells' proxy statement",
    filed("Walt Disney Co", "2024-01-16", "PREC14A") === "Proxy fight: preliminary proxy statement (PREC14A)" &&
      filed("Walt Disney Co", "2024-02-06", "DEFC14A") === "Proxy fight: proxy statement (DEFC14A)");
  check("Pfizer's own bid for Array reads as its offer, not as a bidder's for Pfizer",
    filed("Pfizer Inc.", "2019-06-28", "SC TO-T") === "Its tender offer for another company's shares (SC TO-T)", filed("Pfizer Inc.", "2019-06-28", "SC TO-T"));
  check("  …and its 1999 fight for Warner-Lambert as its proxy fight at another company",
    filed("Pfizer Inc.", "1999-12-16", "PREC14A") === "Its proxy fight at another company: preliminary proxy statement (PREC14A)");
  const disneyPage = pageFilings(byWho.get("Walt Disney Co")!, "1744489");
  const march = disneyPage.filter((e) => e.date.startsWith("2024-03") && /DFAN14A/.test(e.title));
  check("Disney's March 2024 DFAN14As are one row for the month",
    march.length === 1 && march[0].precision === "month" && march[0].title === `Walt Disney Co: Proxy material from outside the company ×${dfan.filter((r) => r.who === "Walt Disney Co" && r.date.startsWith("2024-03")).length} (DFAN14A)`,
    march.map((e) => e.title).join(" | "));
  check("  …while a month with one keeps its dated row", disneyPage.some((e) => e.date === "2023-11-30" && /\(DFAN14A\)$/.test(e.title) && e.precision !== "month"),
    disneyPage.filter((e) => e.date.startsWith("2023-11")).map((e) => `${e.date} ${e.title}`).join(" | "));
  const pfizerPage = pageFilings(byWho.get("Pfizer Inc.")!, "78003");
  const july = pfizerPage.filter((e) => e.date.startsWith("2019-07"));
  check("Pfizer's July 2019 updates to its Array offer are one row",
    july.length === 1 && july[0].title === "Pfizer Inc.: Update to its tender offer for another company's shares ×8 (SC TO-T/A)", july.map((e) => e.title).join(" | "));
  if (reSrc) {
    const FORM_RE = new RegExp(reSrc, "i");
    const stackForm = (t: string) => (/\(([^()]*)\)$/.exec(t)?.[1].match(FORM_RE) ?? t.match(FORM_RE))?.[1].toUpperCase();
    check("the filing stack names each new form as it is, a late notice never as the report",
      stackForm("Apple Inc.: Notice that the annual report will be late (NT 10-K)") === "NT 10-K" &&
        stackForm("Pfizer Inc.: Update to its tender offer for another company's shares ×8 (SC TO-T/A)") === "SC TO-T/A" &&
        stackForm("Apple Inc.: The company's own tender or exchange offer (SC TO-I)") === "SC TO-I" &&
        stackForm("Walt Disney Co: Proxy material from outside the company ×58 (DFAN14A)") === "DFAN14A" &&
        stackForm("Apple Inc.: Shelf registration for new securities (S-3ASR)") === "S-3ASR");
  }

  /**
   * 2026-10-17 proposal 9. The fixture is the record's own `formerNames` field, pinned from
   * `npm run former-names-report`; while it is still the provisional one this says so, because a
   * fixture written from an assumption can only confirm that assumption.
   */
  console.log("\nFormer names — renames on the timeline, old names as search aliases");
  const { renamesFrom, renameEvents, formerNameAliases } = await import("../lib/sec");
  const fixture = JSON.parse(readFileSync("scripts/fixtures/sec-former-names.json", "utf8")) as {
    provisional?: boolean;
    records: { ticker: string; cik: string; name: string; formerNames: { name?: string; from?: string; to?: string }[] }[];
  };
  if (fixture.provisional) console.log("  (the fixture is still PROVISIONAL — not yet pinned from a real record)");
  const rec = (t: string) => fixture.records.find((r) => r.ticker === t)!;
  const meta = rec("META");
  const metaRenames = renamesFrom(meta.name, meta.formerNames);
  check("Meta's record holds one rename, from Facebook to its current name",
    metaRenames.length === 1 && /^FACEBOOK\b/i.test(metaRenames[0].from) && metaRenames[0].to === meta.name,
    JSON.stringify(metaRenames));
  check("  …and \"facebook\" becomes a search alias", formerNameAliases(metaRenames, meta.name).includes("facebook"),
    formerNameAliases(metaRenames, meta.name).join(", "));
  const apple = rec("AAPL");
  const appleRenames = renamesFrom(apple.name, apple.formerNames);
  check("Apple Computer → Apple is a rename", appleRenames.some((r) => /^APPLE COMPUTER\b/i.test(r.from)), JSON.stringify(appleRenames));
  check("  …but a change of case alone (APPLE INC → Apple Inc.) is not",
    !appleRenames.some((r) => r.from.toUpperCase() === "APPLE INC"), JSON.stringify(appleRenames));
  check("  …and the current name is never an alias of itself", !formerNameAliases(appleRenames, apple.name).includes("apple"));
  // Pinned from the real record (2026-10-20): Apple's lists "APPLE COMPUTER INC/ FA", in use for
  // no days at all — an EDGAR filer annotation, not a name. Read as one, it made a 1997 "rename"
  // to the same name and the search alias "apple computer inc/ fa".
  check("  …and an EDGAR annotation (\"APPLE COMPUTER INC/ FA\") is neither a rename nor an alias",
    !appleRenames.some((r) => /\/\s*FA/i.test(r.from)) && !formerNameAliases(appleRenames, apple.name).some((a) => a.includes("/")) &&
      appleRenames.length === 1 && appleRenames[0].on === "2007-01-04",
    JSON.stringify(appleRenames));
  check("a company that never changed its name has no renames (GE, Ford)",
    renamesFrom(rec("GE").name, rec("GE").formerNames).length === 0 && renamesFrom(rec("F").name, rec("F").formerNames).length === 0);

  const chain = renamesFrom("CHARLIE HOLDINGS INC", [
    { name: "BRAVO CORP /DE/", to: "2015-03-02T00:00:00.000Z" },
    { name: "ALPHA CORP", to: "2010-06-01T00:00:00.000Z" },
    { name: "BRAVO CORP", to: "2012-01-05T00:00:00.000Z" },
    { name: "DELTA INC", to: "2099-01-01T00:00:00.000Z" },
    { name: "ECHO INC" },
  ]);
  check("a chain pairs each old name with the one that replaced it, oldest first",
    chain.map((r) => `${r.on} ${r.from} > ${r.to}`).join(" | ") ===
      "2010-06-01 ALPHA CORP > BRAVO CORP | 2015-03-02 BRAVO CORP /DE/ > CHARLIE HOLDINGS INC",
    chain.map((r) => `${r.on} ${r.from} > ${r.to}`).join(" | "));
  check("  …dropping a state tag change, a future date and an undated entry", chain.length === 2);
  const [rename] = renameEvents(chain.slice(0, 1), { ticker: "TST", cik: "0000000001", name: "Test Co" });
  check("a rename is a dated corporate action with its own identity",
    rename?.type === "corporate_action" && rename.date === "2010-06-01" &&
      rename.title === "Renamed from ALPHA CORP to BRAVO CORP" && rename.dedupBasis === "sec:0000000001:rename:2010-06-01",
    JSON.stringify(rename));

  // The record is already in hand for the filings, so renames cost no request; a fund's record is
  // its trust's, whose old names are not the fund's.
  const served = (body: object) =>
    (globalThis.fetch = (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch);
  const metaRecord = { name: meta.name, formerNames: meta.formerNames, filings: { recent: record([["10-K", "2026-01-29", ""]], 900) } };
  let metaEvents: TimelineEvent[] = [];
  let fundEvents: TimelineEvent[] = [];
  const collected: { on: string; from: string; to: string }[] = [];
  try {
    const { getFilings, getFilingsDeep } = await import("../lib/sec");
    served(metaRecord);
    metaEvents = await getFilingsDeep({ ticker: "META", cik: meta.cik, name: meta.name }, false, collected);
    served({ ...metaRecord, name: "VANGUARD INDEX FUNDS", formerNames: [{ name: "VANGUARD INDEX TRUST", to: "1999-01-01T00:00:00.000Z" }] });
    fundEvents = await getFilings({ ticker: "VOO", cik: "0000036405", name: "Vanguard 500 Index Fund" });
  } finally {
    globalThis.fetch = realFetch;
  }
  check("a company's filings carry its rename", metaEvents.some((e) => e.type === "corporate_action" && /^Renamed from FACEBOOK/i.test(e.title)),
    metaEvents.map((e) => e.title).join(" | "));
  check("  …and hand the renames to a caller that stores aliases", collected.length === metaRenames.length && collected.length > 0);
  check("a fund's page does not inherit its trust's old names", !fundEvents.some((e) => e.type === "corporate_action"),
    fundEvents.map((e) => e.title).join(" | "));
  const ingestSrc = readFileSync("scripts/ingest.ts", "utf8");
  check("company ingest stores the old names as search aliases",
    /getFilingsDeep\(company, true, renames, othersStakes\)/.test(ingestSrc) && /formerNameAliases\(renames, company\.name\)/.test(ingestSrc));

  /**
   * Audit 2026-10-21 #4: a bank files structured-note prospectuses nearly every business day, so
   * JPMorgan's page carried 5,022 dated 424B2 rows and came to 5.4 MB — over the 2 MB Next caches,
   * so its page was rebuilt for every visitor. Rows shaped the way `loadEvents` returns them.
   */
  console.log("\nA note programme is one row a month; an offering keeps its day");
  const stored = (date: string, title: string, i: number): TimelineEvent => ({
    id: `db-${i}`, date, type: "filing", title, source: "SEC EDGAR", precision: "day", relevance: 0.9,
    url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000019617&type=424B2&dateb=${date.replace(/-/g, "")}&owner=include&count=40`,
    description: "148 offering documents for new securities filed this day under 424B2, grouped into one row.",
    externalId: `sec:19617:424B2:${date}`,
  });
  const october = ["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"];
  const bankRows: TimelineEvent[] = [
    ...october.map((d, i) => stored(d, `BIG BANK: Prospectuses ×${10 + i} (424B2)`, i)),
    stored("2026-09-15", "BIG BANK: Prospectus (424B5)", 50), // an offering priced on one day
    stored("2026-09-16", "BIG BANK: Prospectuses ×2 (424B5)", 51),
    { ...stored("2026-10-03", "BIG BANK: Quarterly report (10-Q)", 52), type: "earnings" },
    { ...stored("2026-10-04", "Fed policy statement (FOMC)", 53), type: "macro" },
  ];
  const paged = pageFilings(bankRows, "0000019617");
  const month = paged.filter((e) => /424B2/.test(e.title));
  check(`a form filed on ${BUSY_PROSPECTUS_DAYS}+ days of a month becomes one row for the month`,
    month.length === 1 && month[0].title === "BIG BANK: Prospectuses ×75 on 6 days (424B2)" && month[0].date === "2026-10-01" && month[0].precision === "month",
    month.map((e) => `${e.date} ${e.title}`).join(" | "));
  check("  …linking EDGAR's list of that form up to the month's last filing",
    /type=424B2&dateb=20261008/.test(month[0]?.url ?? ""), month[0]?.url);
  check("  …while an offering's dated rows are kept as they are",
    paged.filter((e) => /424B5/.test(e.title)).map((e) => e.date).join(",") === "2026-09-15,2026-09-16");
  check("  …and every other row passes through, in date order",
    paged.some((e) => /10-Q/.test(e.title)) && paged.some((e) => e.type === "macro") &&
      paged.every((e, i) => i === 0 || paged[i - 1].date <= e.date), paged.map((e) => e.date).join(","));
  {
    // Twenty years of a bank's daily note programme, its other filings, every close since 1972
    // and the economy rows, as a held page carries them.
    const filings: TimelineEvent[] = [];
    for (let y = 2006; y < 2026; y++)
      for (let m = 1; m <= 12; m++)
        for (let d = 1; d <= 21; d++) {
          const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          filings.push(stored(date, `JPMORGAN CHASE & CO: Prospectuses ×${d * 7} (424B2)`, filings.length));
        }
    // JPMorgan's measured shape once trimmed: 2,903 filing rows, 11,744 closes, 470 economy rows.
    for (let i = 0; i < 2700; i++) filings.push(stored(`2010-01-${String((i % 28) + 1).padStart(2, "0")}`, "JPMORGAN CHASE & CO: Other events (8-K 8.01)", 90_000 + i));
    const prices = Array.from({ length: 11_744 }, (_, i) => ({ time: "1980-03-17", value: 0.123456 + (i % 250), volume: 12_345_678 }));
    const macro = Array.from({ length: 470 }, (_, i) => stored("2000-01-01", `CPI report: consumer prices for month ${i}`, 80_000 + i));
    const mb = (n: number) => `${(n / 1e6).toFixed(2)} MB`;
    const whole = JSON.stringify({ events: filings, prices, macro }).length;
    const timeline = JSON.stringify({ events: pageFilings(filings, "0000019617"), prices: [], macro }).length;
    const closes = JSON.stringify(prices).length;
    check("a heavy filer's page fits the 2 MB Next will cache, as two entries",
      whole > 2_000_000 && timeline < 2_000_000 && closes < 1_000_000, `${mb(whole)} → timeline ${mb(timeline)} + prices ${mb(closes)}`);
  }
  const pageData = readFileSync("lib/page-data.ts", "utf8");
  check("  …the held company page is built through it",
    /pageFilings\(\[\.\.\.events, \.\.\.withoutSharedSectorRows\(events, sector\)\], subject\.cik\)/.test(pageData));
  check("  …and its prices are cached as an entry of their own",
    /return page && \{ \.\.\.page, prices: \[\] \};/.test(pageData) && /\["held-company-prices", "v1"\]/.test(pageData) &&
      /prices: await cachedHeldPrices\(k\)/.test(pageData));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

main();
