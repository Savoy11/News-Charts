/**
 * The Federal Reserve Board's enforcement actions on bank pages (batch 69, the 2026-10-26
 * proposal 7, a source the owner approved).
 *
 *   npm run check:fed-actions
 *
 * Banks had none of their regulator's actions on their pages: not Wells Fargo's order of
 * 2018-02-02 that capped its assets, nor JPMorgan's $200 million penalty of 2013-09-18. Offline by
 * construction: the Board's two files are served from real rows pinned on 2026-10-27
 * (`scripts/fixtures/fed-actions.json`), every one any map pattern or a broad search for the mapped
 * banks, their predecessors and their namesakes finds. Batch 74 (the 2026-10-28 proposal 2) added
 * the foreign banks with a page here, from the same files read 2026-10-30.
 */

import { readFileSync } from "node:fs";
import type { TimelineEvent } from "../lib/types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const read = (p: string) => readFileSync(p, "utf8");

async function main(): Promise<void> {
  const fed = await import("../lib/fedActions");
  const pinned = JSON.parse(read("scripts/fixtures/fed-actions.json")) as { old: unknown[]; recent: unknown[] };

  // The Board's files as it serves them: a byte-order mark, then the list.
  const asked: string[] = [];
  let failNext = false;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string) => {
    const url = String(input);
    asked.push(url);
    if (failNext) {
      failNext = false;
      return new Response("", { status: 503 });
    }
    const body = url === fed.FED_FILES[0] ? pinned.old : url === fed.FED_FILES[1] ? pinned.recent : null;
    if (!body) throw new Error(`unexpected request: ${url}`);
    return new Response(`﻿${JSON.stringify({ eaitems: body })}`, { status: 200 });
  }) as unknown as typeof fetch;

  const byTicker = new Map<string, TimelineEvent[]>();
  try {
    console.log("\nReading the Board's files");
    failNext = true;
    const refused = await fed.fetchFedActions(72971);
    check("a file that will not load is an error, with nothing stored from the other", refused.outcome === "error" && refused.events.length === 0, refused.detail);
    asked.length = 0;
    for (const [cik, bank] of Object.entries(fed.FED_BANKS)) {
      const got = await fed.fetchFedActions(cik);
      if (got.outcome === "error") check(`${bank.ticker} read`, false, got.detail);
      byTicker.set(bank.ticker, got.events);
    }
    check("…the failure was not kept: the next bank's ingest asked for that file again", asked.length === 1 && asked[0] === fed.FED_FILES[0], asked.join(", "));
    check("  …and every bank after it read both from the first answers, a process reading each once", asked.length === 1);
    const none = await fed.fetchFedActions(320193);
    check("a company that is not a mapped bank is not asked", none.outcome === "empty" && asked.length === 1 && fed.fedBanksFor(320193) === null);
  } finally {
    globalThis.fetch = realFetch;
  }

  const of = (ticker: string) => byTicker.get(ticker) ?? [];
  const on = (ticker: string, day: string) => of(ticker).find((e) => e.date === day);

  console.log("\nThe actions, on the right bank");
  const asset = on("WFC", "2018-02-02");
  check("Wells Fargo's order of 2018-02-02, the asset cap, lands on WFC",
    asset?.title === "Federal Reserve: Cease-and-desist order" && asset.url === "https://www.federalreserve.gov/newsevents/pressreleases/enforcement20180202a.htm" &&
      asset.type === "regulation" && asset.sourceKey === "fed_enforcement",
    asset?.title);
  const fine = on("JPM", "2013-09-18");
  check("JPMorgan's $200 million penalty of 2013-09-18 lands on JPM", fine?.title === "Federal Reserve: $200 million civil money penalty", fine?.title);
  const may = on("JPM", "2015-05-20");
  check("an order and a penalty of one day are one event, each said",
    of("JPM").filter((e) => e.date === "2015-05-20").length === 1 && may?.title === "Federal Reserve: Cease-and-desist order and $342 million civil money penalty",
    may?.title);
  check("  …with the day the order ended", may?.description === "Against JPMORGAN CHASE & CO.New York, New York, as the Board names it. The cease-and-desist order ended 2021-08-03.", may?.description);
  const two = on("JPM", "2013-01-14");
  check("two orders of one day are two orders, each with its end",
    two?.title === "Federal Reserve: Two cease-and-desist orders" && /The cease-and-desist orders ended 2019-06-06 and 2019-12-05\.$/.test(two.description ?? ""), two?.description);
  const amended = on("WFC", "2020-04-08");
  check("an amendment names the order it amends, by its day", amended?.title === "Federal Reserve: Amendment to the cease-and-desist order of 2018-02-02", amended?.title);
  const gs = on("GS", "2018-01-12");
  check("a day's actions against the company and its bank name both",
    gs?.title === "Federal Reserve: $14 million civil money penalty and $90,000 civil money penalty" && /Goldman Sachs Group, Inc\., New York, New York; Goldman Sachs Bank USA/.test(gs.description ?? ""),
    gs?.title);

  console.log("\nNever a namesake's, a person's, or an acquisition's past");
  const all = [...byTicker.values()].flat();
  for (const [where, who] of [
    ["Chillicothe", "Citizens Bancshares Co., Chillicothe, Missouri is not Citizens Financial"],
    ["Huntington, Texas", "Huntington Bancshares, Inc., Huntington, Texas is not Huntington of Columbus"],
    ["Edina", "Commerce Bancshares, Inc., Edina, Minnesota is not Commerce of Kansas City"],
  ]) {
    check(`${who}`, !all.some((e) => (e.description ?? "").includes(where)));
  }
  check("  …and Huntington's own written agreement of 2005, of Columbus, is Huntington's", on("HBAN", "2005-02-28")?.title === "Federal Reserve: Written agreement");
  check("an action against a person who worked at JPMorgan is not the bank's: Matthew T. Stromgren's of 2005-06-28",
    !on("JPM", "2005-06-28") && !all.some((e) => /Stromgren/.test(e.description ?? "")));
  check("SunTrust's orders before it merged into BB&T are not Truist's; BB&T's own of 2017 is",
    of("TFC").length === 1 && of("TFC")[0].date === "2017-01-25" && !all.some((e) => /SunTrust/i.test(e.description ?? "")));
  check("AmSouth's of 2004 are not Regions'; Regions Bank's are", !of("RF").some((e) => e.date < "2006-01-01") && of("RF").length === 3);
  check("The Bank of New York's before the 2007 merger are not BNY's", of("BNY").length === 3 && of("BNY").every((e) => e.date >= "2007-07-01"));
  const amex = fed.FED_BANKS[4962].orgs.find((o) => o.match.test("American Express Bank International"));
  check("American Express's international bank is its own until it was sold on 2008-02-29",
    amex?.to === "2008-02-28" && on("AXP", "2007-08-03")?.title === "Federal Reserve: $20 million civil money penalty and cease-and-desist order");

  console.log("\nThe foreign banks with a page here (batch 74)");
  const hsbc = on("HSBC", "2012-12-11");
  check("HSBC's order and $165 million penalty of 2012-12-11 are one event on HSBC",
    of("HSBC").filter((e) => e.date === "2012-12-11").length === 1 && hsbc?.title === "Federal Reserve: $165 million civil money penalty and cease-and-desist order", hsbc?.title);
  check("  …and HSBC Finance's order of 2011, Household International before 2004, is HSBC's: it bought Household on 2003-03-28",
    /HSBC Finance Corporation/.test(on("HSBC", "2011-04-13")?.description ?? "") && fed.FED_BANKS[1089113].orgs[1].from === "2003-03-28");
  check("Barclays' order and $342 million penalty of 2015-05-20 land on BCS, and not on the others fined that day",
    on("BCS", "2015-05-20")?.title === "Federal Reserve: Cease-and-desist order and $342 million civil money penalty" &&
      !/Barclays/i.test(on("UBS", "2015-05-20")?.description ?? "") && !/Barclays/i.test(on("NWG", "2015-05-20")?.description ?? ""));
  check("Bankers Trust's agreement of 1994 is not Deutsche Bank's, which bought it on 1999-06-04; its trust company's of 2005, under Deutsche Bank's name, is",
    !on("DB", "1994-12-04") && on("DB", "2005-10-12")?.title === "Federal Reserve: Written agreement" && fed.FED_BANKS[1159508].orgs[1].from === "1999-06-04");
  check("  …nor the Des Moines Bankers Trust's of 1991, nor Community Bankers Trust's of Glen Allen", !on("DB", "1991-04-08") && !of("DB").some((e) => /Des Moines|Glen Allen/.test(e.description ?? "")));
  check("Newark's City National Bancshares is not RBC's City National, nor are the Capital and Tennessee Commerce Bancorps TD's",
    !all.some((e) => /Newark|Capital Commerce|Tennessee Commerce/.test(e.description ?? "")) && of("RY").length === 1 && of("TD").length === 1);
  check("RBC Centura's penalty of 2007 is RBC's, between its purchase on 2001-06-05 and its sale on 2012-03-02",
    on("RY", "2007-06-13")?.title === "Federal Reserve: $106,930 civil money penalty" && fed.FED_BANKS[1000275].orgs[1].to === "2012-03-01");
  check("UBS's action of 2023 is UBS's; Credit Suisse's from before UBS bought it on 2023-06-12 are not",
    !!on("UBS", "2023-07-21") && !on("UBS", "2009-12-16") && !on("UBS", "2014-05-19") && !on("UBS", "2020-12-22"));
  check("Santander's written agreements are Santander Holdings USA's, wholly its own from 2009-01-30",
    on("SAN", "2014-09-14")?.title === "Federal Reserve: Written agreement" && fed.FED_BANKS[891478].orgs[1].from === "2009-01-30");
  check("Union Bank of California's agreement of 2004, 62.1% the company's that year, is MUFG's; the Irwin, Highlands and Bowling Green Union Banks are no one's here",
    !!on("MUFG", "2004-10-18") && !all.some((e) => /Irwin|Highlands|Bowling Green/.test(e.description ?? "")));
  check("The Royal Bank of Scotland's are NatWest's, the same company renamed", of("NWG").map((e) => e.date).sort().join(",") === "2011-07-26,2013-12-11,2015-05-20");
  check("Banks with no page here stay out: Asahi, Banco Popular", !all.some((e) => /Asahi|Popular/.test(e.description ?? "")));

  console.log("\nWhat each mapped bank carries (the Board's files of 2026-10-27 and 2026-10-30)");
  const expected: Record<string, number> = {
    JPM: 10, C: 10, WFC: 7, GS: 7, BAC: 6, AXP: 5, USB: 4, PNC: 4, MS: 3, ALLY: 3, RF: 3, BNY: 3, MTB: 2, TFC: 1, COF: 1, STT: 1, FITB: 1, HBAN: 1,
    CFG: 0, KEY: 0, SCHW: 0, SYF: 0, NTRS: 0, ZION: 0, FHN: 0,
    HSBC: 7, DB: 7, SAN: 4, UBS: 3, NWG: 3, BCS: 2, SMFG: 2, MUFG: 2, BBVA: 2, RY: 1, TD: 1, BMO: 1, BNS: 1, CM: 1,
  };
  const counts = Object.fromEntries([...byTicker].map(([t, e]) => [t, e.length]));
  const off = Object.keys(expected).filter((t) => counts[t] !== expected[t]);
  const foreign = ["HSBC", "DB", "SAN", "UBS", "NWG", "BCS", "SMFG", "MUFG", "BBVA", "RY", "TD", "BMO", "BNS", "CM"].flatMap(of);
  check("109 events on 32 of the 39 banks, each count as read: the 14 foreign banks add 37, 27 of them before 2017",
    off.length === 0 && all.length === 109 && Object.keys(expected).length === 39 && Object.keys(fed.FED_BANKS).length === 39 &&
      foreign.length === 37 && foreign.filter((e) => e.date < "2017-01-01").length === 27,
    off.map((t) => `${t} ${counts[t]}≠${expected[t]}`).join(", ") || `${all.length}, ${foreign.length} foreign`);
  check("every mapped bank says why each name is its own", Object.values(fed.FED_BANKS).every((b) => b.orgs.every((o) => o.why.length > 10)));

  console.log("\nThe Board's words, read");
  check("penalties read as amounts", fed.money("Civil Money Penalty, $61,932,500") === "$61.93 million" && fed.money("Civil Money Penalty, $54.75 million") === "$54.75 million" &&
    fed.money("Civil Money Penalty, $90,000") === "$90,000" && fed.money("Civil Money Penalty, $20,264.27") === "$20,264.27" && fed.money("Civil Money Penalty") === null);
  check("a combined row is both its actions", JSON.stringify(fed.actionPhrases("Civil Money Penalty, $100,000,000, and Cease and Desist Order")) === JSON.stringify(["$100 million civil money penalty", "cease-and-desist order"]));
  check("a link the Board left as \"DNE\" is no link", on("AXP", "1993-09-29") !== undefined && on("AXP", "1993-09-29")!.url === undefined);

  console.log("\nRegistered, scored and credited");
  const { SOURCES } = await import("../lib/ingest/store");
  const src = SOURCES.find((s) => s.key === "fed_enforcement");
  check("the source is registered as public domain, credited to the Board", src?.license === "public domain" && src.commercialOk === true && /Board of Governors of the Federal Reserve System/.test(src.attribution));
  const { SOURCE_TTL_MINUTES } = await import("../lib/ingest/refresh");
  check("  …asked once a day", SOURCE_TTL_MINUTES.fed_enforcement === 1440);
  const { COMPANY_SOURCES } = await import("./ingest");
  const ingest = read("scripts/ingest.ts");
  check("  …for a mapped bank only", (COMPANY_SOURCES as readonly string[]).includes("fed_enforcement") &&
    /if \(fedBanksFor\(company\.cik\)\) \{\s+await run\("fed_enforcement"/.test(ingest));
  const { deterministicScore } = await import("../lib/enrich/relevance");
  const scored = deterministicScore({ eventId: 1, kind: "regulation", title: asset!.title, sourceKey: "fed_enforcement" }, { kind: "company", displayName: "Wells Fargo & Company", ticker: "WFC" }, ["wells fargo"]);
  check("  …scored as the company's own, without the model", scored?.score === 1, JSON.stringify(scored));
  check("  …and credited in the footer and the Terms page",
    /enforcement actions from the\s+Federal Reserve Board/.test(read("app/layout.tsx")) && /enforcement actions from the Federal Reserve Board/.test(read("app/legal/terms/page.tsx")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

main();
