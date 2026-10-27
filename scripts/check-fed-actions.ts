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
 * banks, their predecessors and their namesakes finds.
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

  console.log("\nWhat each mapped bank carries (the Board's files of 2026-10-27)");
  const expected: Record<string, number> = {
    JPM: 10, C: 10, WFC: 7, GS: 7, BAC: 6, AXP: 5, USB: 4, PNC: 4, MS: 3, ALLY: 3, RF: 3, BNY: 3, MTB: 2, TFC: 1, COF: 1, STT: 1, FITB: 1, HBAN: 1,
    CFG: 0, KEY: 0, SCHW: 0, SYF: 0, NTRS: 0, ZION: 0, FHN: 0,
  };
  const counts = Object.fromEntries([...byTicker].map(([t, e]) => [t, e.length]));
  const off = Object.keys(expected).filter((t) => counts[t] !== expected[t]);
  check("72 events on 18 banks, each count as read", off.length === 0 && all.length === 72, off.map((t) => `${t} ${counts[t]}≠${expected[t]}`).join(", ") || `${all.length}`);
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
