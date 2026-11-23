/**
 * The European Commission's antitrust and cartel decisions, and its State aid notices and decisions naming the company as
 * the beneficiary (batch 177, the 2026-11-22c proposal 2, approved by the owner that day with call (a): State aid included
 * where the company is the beneficiary).
 *
 *   npm run check:eu-antitrust
 *
 * Offline: the committed file (`data/eu-antitrust.json.gz`, written by `npm run sync:eu-antitrust` from the lists the
 * Publications Office's SPARQL endpoint gave and the texts CELLAR served on 2026-11-22), a slice of those texts
 * (scripts/fixtures/eu-antitrust-texts.json.gz), and the first trading days the other checks' fixtures carry.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { ALSO_ON_SOURCES } from "../lib/alsoOn";
import { GROUPED_ROW_SOURCES } from "../lib/corroboration";
import { dojPossessive } from "../lib/doj";
import { andSpellings, withoutTag } from "../lib/edgarName";
import { deterministicScore } from "../lib/enrich/relevance";
import {
  EU_UNITS,
  NOT_THE_COMPANY,
  addresseeExcerpt,
  addresseeName,
  beneficiaryNames,
  beneficiaryOf,
  caseNumbers,
  caseTitle,
  competitionPartyIsCompany,
  decidedOn,
  decisionAddressees,
  decisionFines,
  euAntitrust,
  euAntitrustEvents,
  isDecisionTitle,
  isStateAidTitle,
} from "../lib/euAntitrust";
import { noticeText } from "../lib/euMergers";
import { companyNames } from "../lib/frCompany";
import { euAntitrustFor } from "../lib/ingest/euAntitrustFor";
import { namesForYear } from "../lib/ingest/frBackfill";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import { isNotesRecord, releaseNamesOn } from "../lib/releaseNames";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
import { COMPANY_SOURCES } from "./ingest";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail: unknown = ""): void {
  if (ok) pass++;
  else fail++;
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${d ? ` — ${d.slice(0, 300)}` : ""}`);
}
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The whole file as read on 2026-11-22, and every listed company in the index replayed against it. */
const EXPECTED = {
  listed: 859,
  stateAid: 1_909,
  texts: 723,
  // a decision printed whole and summarised, or held as the archive's copy and the Official Journal's, is one
  decisions: 680,
  withAddressees: 536,
  aidWithBeneficiary: 512,
  // every listed company in the index, under the rule, its names as the replay below builds them; the banks' notes records none
  total: 163,
  companies: 93,
  // from first prices, for the companies the fixtures read
  fromFirst: 83,
  fromFirstPages: 47,
  fromFirst2017: 50,
  top: "AKZOY 6, BP 6, F 4, AAPL 3, DB 3, MA 3, MSFT 3, UBS 3, ADM 2, BAC 2",
};

const companies = (tickerIndex as unknown as { companies: [number, string, string][] }).companies;
const titleOf = (cik: number) => companies.find((c) => c[0] === cik)![2];
/** A company's names of a year as ingest builds them, less the former names only the database holds. */
const namesOf = (cik: number) => (year: number) => {
  const title = titleOf(cik);
  const own = dojPossessive(title, possessiveNameFor(cik));
  return [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)];
};
const { decisions, aid } = euAntitrust();
const on = (cik: number, from = "") => euAntitrustEvents(decisions, aid, namesOf(cik), { cik, from, namesOn: (d) => releaseNamesOn(cik, d) });
const caseOn = (cik: number, c: string, day?: string) => on(cik).find((e) => e.externalId?.split(",").includes(c) && (!day || e.date === day));

async function main(): Promise<void> {
  const slice = JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", "eu-antitrust-texts.json.gz"))).toString()) as { texts: Record<string, { kind: "xhtml" | "text"; raw: string }> };
  const text = (w: string) => (slice.texts[w].kind === "text" ? noticeText(slice.texts[w].raw, "pdf") : noticeText(slice.texts[w].raw, "xhtml"));
  const W = {
    adsense: "e2d24607-1da6-11eb-b57e-01aa75ed71a1",
    android: "d5150312-11b8-11ea-8c1f-01aa75ed71a1",
    intel: "c7a4517a-39cf-4bfd-a3d3-8464d8ee37b7",
    microsoft: "0c739ea0-9598-48c2-91c5-9a5755867451",
    penguin: "74feee31-6c7e-11e3-9afb-01aa75ed71a1",
    post: "3bb52f40-0bd2-4285-8c11-87c7e149465a",
    autoliv: "75d4389a-8e79-11e9-9369-01aa75ed71a1",
    magna: "9f6ad387-678d-11eb-aeb5-01aa75ed71a1",
    rubber: "a4205238-d532-4ae1-ad36-6bb5e5bc6622",
    bitumen: "123db21c-1c51-459a-84c0-7bcceba242be",
    deere: "4fcbaeaf-2420-4b36-9904-35af9c608489",
    engines: "e24c5d59-314d-43fd-ab10-fcef39d8fda1",
    recycling: "55841383-465c-11f0-b9f2-01aa75ed71a1",
    canon: "3399ec62-4966-11ec-91ac-01aa75ed71a1",
  };

  console.log("The titles");
  check("a decision \"relating to a proceeding\" is listed; a draft, a meeting's agenda, a Euratom safeguards decision and a communication are not",
    isDecisionTitle("89/190/EEC: Commission Decision of 21 December 1988 relating to a proceeding pursuant to Article 85 of the EEC Treaty (IV/31.865, PVC)") &&
      !isDecisionTitle("AG 762 - 12.12.1984 Draft COMMISSION DECISION relating to a proceeding under Article 85") &&
      !isDecisionTitle("1) AG 824 - 23.4.86 2) Special Chefs de Cabinet meeting - 18.4.86 Draft Commission Decision relating to a proceeding") &&
      !isDecisionTitle("94/285/Euratom: Commission Decision of 21 February 1994 relating to a procedure in application of the second paragraph of Article 83 of the Euratom Treaty") &&
      !isDecisionTitle("Commission communication on the implementation of Decision 90/413/Euratom of 1 August 1990 relating to a procedure") &&
      isStateAidTitle("State aid — Ireland — State aid SA.38373 (2014/C) (ex 2014/NN) — Alleged aid to Apple — Invitation to submit comments pursuant to Article 108(2) TFEU"));
  check("its day in every form a title writes it: \"of 27 June 2017\", \"(EU) 2017/1283 of 30 August 2016\", and the archive's scans' \"2. VII. 1987\", \"09.11.1987\", \"20. Vll. 1988\", \"26. 7. 88\", \"30 ApriI 1984\"",
    decidedOn("Commission Decision (EU) 2017/1283 of 30 August 2016 on State aid SA.38373") === "2016-08-30" &&
      decidedOn("COMMISSION DECISION of 2. VII. 1987 relating to a proceeding") === "1987-07-02" &&
      decidedOn("COMMISSION DECISION of 09.11.1987 relating to proceeding") === "1987-11-09" &&
      decidedOn("COMMISSION DECISION of 20. Vll. 1988 relating to a proceeding") === "1988-07-20" &&
      decidedOn("COMMISSION DECISION of 26. 7. 88 relating to a proceeding") === "1988-07-26" &&
      decidedOn("COMMISSION DECISION of 30 ApriI 1984 relating to a proceeding") === "1984-04-30" &&
      decidedOn("Commission Decision of 31 February 2001 relating to a proceeding") === null);
  check("  …its case numbers in every register's form, a scan's stray space read, and the case's name after the dash, never the hyphen in \"C-3\"",
    same(caseNumbers("(Case AT.39740 — Google Search (Shopping))"), ["AT.39740"]) &&
      same(caseNumbers("(Case COMP/C-3/37.990 — Intel)"), ["COMP/C-3/37990"]) &&
      same(caseNumbers("(Case COMP/F/38.456 — Bitumen (NL))"), ["COMP/F/38456"]) &&
      same(caseNumbers("(IV/31 .902 — Konica)"), ["IV/31902"]) &&
      same(caseNumbers("(Cases IV/31.370 and 31.446 — UK Agricultural Tractor Registration Exchange)"), ["IV/31370", "IV/31446"]) &&
      caseTitle("(Case COMP/C-3/37.990 — Intel)") === "Intel" && caseTitle("(Case AT.39740 — Google Search (Shopping))") === "Google Search (Shopping)");
  check("a State aid title's beneficiary: \"Alleged aid to Apple\", \"implemented by Ireland to Apple\", \"granted to St. Jude Medical\", \"to Flughafen Lübeck GmbH and Ryanair\"",
    beneficiaryOf("State aid — Ireland — State aid SA.38373 (2014/C) (ex 2014/NN) — Alleged aid to Apple — Invitation to submit comments") === "Apple" &&
      beneficiaryOf("Commission Decision (EU) 2017/1283 of 30 August 2016 on State aid SA.38373 (2014/C) (ex 2014/NN) (ex 2014/CP) implemented by Ireland to Apple (notified under document C(2016) 5605)") === "Apple" &&
      beneficiaryOf("State aid — Belgium — State aid SA.53980 (2019/NN) — Excess profit exemption granted to St. Jude Medical — Invitation to submit comments") === "St. Jude Medical" &&
      same(beneficiaryNames(beneficiaryOf("State aid — Germany — State aid C 24/07 (ex NN 71/06) — State aid to Flughafen Lübeck GmbH and Ryanair — Invitation to submit comments") ?? ""), ["Flughafen Lübeck GmbH", "Ryanair"]));

  console.log("\nThe texts");
  check("Google's AdSense decision (2019): \"imposes a fine … upon Google Inc.\" and \"upon Alphabet Inc.\"; the fine of EUR 1,494,459,000 on both, Alphabet's share jointly",
    same(decisionAddressees(text(W.adsense)), ["Google Inc.", "Alphabet Inc."]) && decisionFines(text(W.adsense)).some((f) => f.amount === "1494459000" && f.names.includes("Google Inc.")),
    [decisionAddressees(text(W.adsense)), decisionFines(text(W.adsense))]);
  check("  …Android (2018): \"imposes a fine of EUR 4 342 865 000 on Google, of which EUR 1 921 666 000 jointly and severally with Alphabet\" is Google's fine, Alphabet liable for a part only",
    same(decisionAddressees(text(W.android)), ["Google", "Alphabet"]) && same(decisionFines(text(W.android)), [{ names: ["Google"], currency: "EUR", amount: "4342865000" }]),
    [decisionAddressees(text(W.android)), decisionFines(text(W.android))]);
  check("  …Intel (2009): \"The Decision establishes that Intel has infringed\", and \"A fine of EUR 1 060 000 000 has been imposed on Intel Corporation\"",
    decisionAddressees(text(W.intel)).includes("Intel") && decisionFines(text(W.intel)).some((f) => f.amount === "1060000000" && same(f.names, ["Intel Corporation"])),
    [decisionAddressees(text(W.intel)), decisionFines(text(W.intel))]);
  check("a commitments decision: Microsoft's of 2009, read from \"made these commitments binding upon Microsoft\" where nothing else names it; Penguin's of 2013, whose recall of the 2012 decision's parties (\"the four publishers and Apple\") names no addressee",
    same(decisionAddressees(text(W.microsoft)), ["Microsoft"]) && !decisionAddressees(text(W.penguin)).includes("Apple") && decisionAddressees(text(W.penguin)).includes("Penguin Random House Limited"),
    [decisionAddressees(text(W.microsoft)), decisionAddressees(text(W.penguin))]);
  check("an article that gives each addressee's address: Deutsche Post AG alone (2001), never \"Heinrich-von-Stephan-Strasse 1\"; the four of John Deere (1984), \"Deere and Company\" whole, no postcode",
    same(decisionAddressees(text(W.post)), ["Deutsche Post AG"]) && same(decisionAddressees(text(W.deere)), ["Deere and Company", "NV Louis Nagel and Co.", "Dansk Oversøisk Motor Industri A/S", "NV Cofabel"]),
    [decisionAddressees(text(W.post)), decisionAddressees(text(W.deere))]);
  check("  …GEAE/P&W (1999): General Electric Company and United Technologies Corporation, the address \"United Technologies Building\" off",
    same(decisionAddressees(text(W.engines)), ["General Electric Company", "United Technologies Corporation"]) && addresseeName("United Technologies Corporation United Technologies Building Hartford") === "United Technologies Corporation",
    decisionAddressees(text(W.engines)));
  const magna = decisionAddressees(text(W.magna));
  const rubber = decisionAddressees(text(W.rubber));
  check("the summaries' groups: \"— MAGNA: Magna International Inc., …\" (2020), \"(b) for Dow: The Dow Chemical Company from 1 July 1996 to …\" (2006), each entity named, its period of liability off",
    ["Magna International Inc.", "Magna Closures S.p.A.", "Kiekert AG", "Brose Verwaltung SE"].every((n) => magna.includes(n)) && !magna.some((n) => /Bamberg|Coburg/.test(n)) &&
      ["Dow Chemical Company", "Eni SpA", "Shell Petroleum N.V."].every((n) => rubber.includes(n)) && !rubber.some((n) => /\bfrom\b/.test(n)),
    { magna, rubber });
  const bitumen = decisionFines(text(W.bitumen));
  check("  …bitumen (NL, 2006): \"The Shell Transport and Trading Company Ltd\" one name, \"EUR 4,65 million\" EUR 4,650,000, one fine jointly owed one fine",
    bitumen.some((f) => f.amount === "108000000" && f.names.includes("Shell Transport and Trading Company Ltd")) && bitumen.some((f) => f.amount === "4650000" && same(f.names, ["Ballast Nedam NV", "Ballast Nedam Infra BV"])),
    bitumen.slice(0, 3));
  const autoliv = decisionFines(text(W.autoliv));
  check("  …occupant safety (2019): \"(b) on Autoliv, Inc. and Autoliv B.V. & Co KG., jointly and severally: EUR 121 211 000\"; an immunity's EUR 0 no fine",
    autoliv.some((f) => f.amount === "121211000" && same(f.names, ["Autoliv, Inc.", "Autoliv B.V. & Co KG"])) && !autoliv.some((f) => /^0+$/.test(f.amount)) && decisionAddressees(text(W.autoliv)).includes("TKJP Corporation"), autoliv);
  const recycling = decisionAddressees(text(W.recycling));
  check("the end-of-life vehicles cartel (2025): all 34 addressees, Ford-Werke GmbH to the carmakers' association",
    recycling.length === 34 && ["Ford-Werke GmbH", "Ford Motor Company", "General Motors Company", "Toyota Motor Corporation", "Stellantis N.V.", "Honda Motor Co."].every((n) => recycling.includes(n)), recycling.length);
  check("a scan read with pdftotext: Olivetti/Canon (1987), Canon Inc. among its addressees", decisionAddressees(text(W.canon)).includes("Canon Inc."), decisionAddressees(text(W.canon)));
  check("the file keeps of each text its passages alone, and reads the same addressees and fines from them as from the whole",
    Object.keys(slice.texts).every((w) => same(decisionAddressees(addresseeExcerpt(text(w))), decisionAddressees(text(w))) && same(decisionFines(addresseeExcerpt(text(w))), decisionFines(text(w)))),
    Object.keys(slice.texts).filter((w) => !same(decisionAddressees(addresseeExcerpt(text(w))), decisionAddressees(text(w))) || !same(decisionFines(addresseeExcerpt(text(w))), decisionFines(text(w)))));

  console.log("\nThe committed file");
  const file = JSON.parse(gunzipSync(readFileSync(join(__dirname, "..", "data", "eu-antitrust.json.gz"))).toString()) as { read: string; antitrust: unknown[][]; stateaid: unknown[][]; texts: unknown[][] };
  check(`the lists of 2026-11-22: ${EXPECTED.listed} decisions and ${EXPECTED.stateAid.toLocaleString("en-US")} State aid titles; ${EXPECTED.texts} texts read, ${EXPECTED.decisions} decisions once each, ${EXPECTED.withAddressees} naming their addressees; ${EXPECTED.aidWithBeneficiary} titles naming a beneficiary`,
    file.read === "2026-11-22" && file.antitrust.length === EXPECTED.listed && file.stateaid.length === EXPECTED.stateAid && file.texts.length === EXPECTED.texts &&
      decisions.length === EXPECTED.decisions && decisions.filter((d) => d.addressees.length).length === EXPECTED.withAddressees && aid.filter((a) => a.beneficiaries.length).length === EXPECTED.aidWithBeneficiary,
    { read: file.read, listed: file.antitrust.length, aid: file.stateaid.length, texts: file.texts.length, decisions: decisions.length, withAddressees: decisions.filter((d) => d.addressees.length).length, beneficiaries: aid.filter((a) => a.beneficiaries.length).length });
  check("  …every decision with its work, day and title, none twice; every day a calendar day",
    decisions.every((d) => /^[0-9a-f-]{36}$/.test(d.work) && /^\d{4}-\d{2}-\d{2}$/.test(d.day) && d.title) && new Set(decisions.map((d) => d.work)).size === decisions.length &&
      [...decisions, ...aid].every((d) => !Number.isNaN(Date.parse(d.day))));

  console.log("\nThe rule and the rows");
  const adsense = caseOn(1652044, "AT.40411");
  const android = caseOn(1652044, "AT.40099");
  check("Alphabet's page: AdSense (2019-03-20) addressed to Google Inc. and Alphabet Inc., its fine jointly; Android (2018-07-18) with Google's fine",
    adsense?.date === "2019-03-20" && /addressed to Google Inc\. and Alphabet Inc\.$/.test(adsense.title) && /Fines: EUR 1,494,459,000 on /.test(adsense.description ?? "") &&
      android?.date === "2018-07-18" && /Fines: EUR 4,342,865,000 on Google\./.test(android.description ?? "") && adsense.sourceKey === "eu_antitrust",
    [adsense?.title, android?.description?.slice(-120)]);
  const apple = on(320193);
  check("Apple's page: the e-books decision of 2012, the State aid opening of 2014-10-17 and decision of 2016-08-30 as its beneficiary, never Penguin's of 2013",
    !!apple.find((e) => e.date === "2012-12-12") && /invited comments on State aid SA\.38373/.test(apple.find((e) => e.date === "2014-10-17")?.title ?? "") &&
      /the company the aid's beneficiary \(Apple\), the member state the addressee/.test(apple.find((e) => e.date === "2016-08-30")?.description ?? "") && !apple.some((e) => e.date === "2013-07-25"),
    apple.map((e) => `${e.date} ${e.title.slice(0, 60)}`));
  check("Microsoft's 2004, 2009 and 2013 decisions; Intel's of 2009 and 2023; Ryanair's State aid on 14 days from 2007 (two decisions of 2014-07-23 one row)",
    ["2004-05-24", "2009-12-16", "2013-03-06"].every((d) => on(789019).some((e) => e.date === d)) && ["2009-05-13", "2023-09-22"].every((d) => on(50863).some((e) => e.date === d)) &&
      on(1038683).filter((e) => e.date >= "2007-01-01").length === 14 && /2 competition decisions/.test(on(1038683).find((e) => e.date === "2014-07-23")?.title ?? ""));
  check("the namesakes refused: \"Dow\" of 2007 off Dow Inc. before 2019-04-01, \"Post\" of the postal operators off Post Holdings; every one says why",
    !competitionPartyIsCompany("Dow", "2007-12-05", 1751788, () => ["Dow Inc", "Dow"]) && !competitionPartyIsCompany("Post", "1999-09-15", 1530950, () => ["Post Holdings", "Post"]) &&
      !on(1751788).some((e) => e.date < "2019-04-01") && !on(1530950).length && Object.values(NOT_THE_COMPANY).flat().every((n) => n.why.length > 30));
  check("the units: Ford-Werke on Ford's page in the vehicle recycling cartel (2025), BP Chemicals on BP's (1984, 1988); every unit says why",
    /Ford-Werke GmbH/.test(caseOn(37996, "AT.40669")?.title ?? "") && ["1984-07-19", "1988-05-05"].every((d) => on(313807).some((e) => e.date === d)) && Object.values(EU_UNITS).flat().every((u) => u.why.length > 30),
    caseOn(37996, "AT.40669")?.title);
  check("a row's id is the day's case numbers, compared as a set by \"Also on\"; its key the company and the day",
    adsense?.externalId === "AT.40411" && adsense.id === "eu-antitrust-1652044-2019-03-20" && adsense.dedupBasis === "eu-antitrust:1652044@2019-03-20");

  console.log("\nEvery listed company");
  const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const first: Record<string, string> = {};
  for (const [f, k] of [["digest-1985-entries.json.gz", "firstPrices"], ["eeoc-listing.json.gz", "first"], ["fda-device-recalls.json.gz", "first"], ["occ-actions.json.gz", "first"]] as const) {
    Object.assign(first, JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", f))).toString())[k]);
  }
  const dl = decisions.map((d) => alnum(d.addressees.join(" ")));
  const al = aid.map((a) => alnum(a.beneficiaries.join(" ")));
  const unitYears = Array.from({ length: 64 }, (_, k) => `${1963 + k}-07-01`);
  const rows: { ticker: string; date: string; first: string | null }[] = [];
  const seen = new Set<number>();
  for (const [cik, ticker] of companies) {
    if (seen.has(cik) || isNotesRecord(cik)) continue;
    seen.add(cik);
    const pre = [...new Set([...namesOf(cik)(2026), ...namesOf(cik)(2005), ...namesOf(cik)(1985), ...unitYears.flatMap((d) => releaseNamesOn(cik, d))].flatMap(andSpellings).map(alnum).filter((n) => n.length >= 3))];
    const units = !!EU_UNITS[cik];
    const md = decisions.filter((_, j) => units || pre.some((n) => dl[j].includes(n)));
    const ma = aid.filter((_, j) => pre.some((n) => al[j].includes(n)));
    if (!md.length && !ma.length) continue;
    for (const e of euAntitrustEvents(md, ma, namesOf(cik), { cik, namesOn: (d) => releaseNamesOn(cik, d) })) rows.push({ ticker, date: e.date, first: first[ticker] ?? null });
  }
  const after = rows.filter((r) => r.first && r.date >= r.first);
  const top = Object.entries(after.reduce<Record<string, number>>((m, r) => ((m[r.ticker] = (m[r.ticker] ?? 0) + 1), m), {}))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([t, n]) => `${t} ${n}`)
    .join(", ");
  check(`before any first price: ${EXPECTED.total} company days on ${EXPECTED.companies} companies`,
    rows.length === EXPECTED.total && new Set(rows.map((r) => r.ticker)).size === EXPECTED.companies, `${rows.length} on ${new Set(rows.map((r) => r.ticker)).size}`);
  check(`  …from first prices: ${EXPECTED.fromFirst} on ${EXPECTED.fromFirstPages} pages, ${EXPECTED.fromFirst2017} before 2017 (${EXPECTED.top})`,
    after.length === EXPECTED.fromFirst && new Set(after.map((r) => r.ticker)).size === EXPECTED.fromFirstPages && after.filter((r) => r.date < "2017-01-01").length === EXPECTED.fromFirst2017 && top === EXPECTED.top,
    `${after.length} on ${new Set(after.map((r) => r.ticker)).size}, ${after.filter((r) => r.date < "2017-01-01").length} before 2017; ${top}`);

  console.log("\nAt ingest");
  const step = await euAntitrustFor(fakeDb("1980-12-12"), 1, { edgarName: "Apple Inc.", alsoKnownAs: newsNamesFor(320193), cik: 320193 });
  check("the company's decisions from its first price, with no request, as a complete answer", step.outcome === "ok" && step.events.length === on(320193, "1980-12-12").length && !!step.complete,
    `${step.outcome} ${step.events.length}`);
  const none = await euAntitrustFor(fakeDb(null), 1, { edgarName: "Apple Inc.", alsoKnownAs: [], cik: 320193 });
  const fund = await euAntitrustFor(fakeDb("1980-12-12"), 1, { edgarName: "Apple Inc.", alsoKnownAs: [], cik: 320193, fundSeries: true });
  const notes = await euAntitrustFor(fakeDb("2000-05-16"), 1, { edgarName: "UBS AG", alsoKnownAs: [], cik: 1114446 });
  check("  …asked again while it has no prices, and none for a fund's series or a bank's notes record (UBS AG's, AMUB: UBS Group's page holds them)",
    none.outcome === "error" && /no prices/.test(none.detail ?? "") && fund.events.length === 0 && fund.outcome === "empty" && notes.events.length === 0 && notes.outcome === "empty");

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "eu_antitrust");
  check("the source is id 52, reusable commercially under Decision 2011/833/EU, reviewed 2026-11-22, credited \"© European Union, https://eur-lex.europa.eu\"",
    src?.id === 52 && /Decision 2011\/833\/EU/.test(src.license) && src.commercialOk && src.reviewedOn === "2026-11-22" && src.attribution === "© European Union, https://eur-lex.europa.eu", src);
  check("  …a company source, quota and refresh noted, scored without the model, a multi-party source whose rows join their case numbers",
    (COMPANY_SOURCES as readonly string[]).includes("eu_antitrust") && QUOTAS.eu_antitrust.perDay === null && SOURCE_TTL_MINUTES.eu_antitrust === 1440 &&
      deterministicScore({ eventId: 0, kind: "regulation", title: "The European Commission's decision in Case AT.40411", sourceKey: "eu_antitrust" }, { kind: "company", displayName: "Alphabet", ticker: "GOOGL" }, ["alphabet"])?.score === 0.95 &&
      ALSO_ON_SOURCES.includes("eu_antitrust") && GROUPED_ROW_SOURCES.includes("eu_antitrust") && /WHERE source_id IN \([^)]*\b52\)/.test(read("db/061_also_on_eu_antitrust.sql")));
  check("  …the ingest asks it for every company", /await run\("eu_antitrust", [^\n]+\n\s*euAntitrustFor\(client, subjectId, \{[^}]*cik: company\.cik, fundSeries \}\),/.test(read("scripts/ingest.ts")));
  check("  …synced monthly by `npm run sync:eu-antitrust`, and credited with the European Union's notice",
    /"sync:eu-antitrust": "tsx scripts\/sync-eu-antitrust\.ts"/.test(read("package.json")) &&
      /merger notifications and competition decisions from the European Commission&apos;s Official Journal \(© European Union, https:\/\/eur-lex\.europa\.eu\)/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /merger notifications and competition decisions from the European Commission&apos;s Official Journal \(© European Union, https:\/\/eur-lex\.europa\.eu\)/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

function fakeDb(listed: string | null): PoolClient {
  return {
    query: async (sql: string) => {
      if (/FROM prices/.test(sql)) return { rows: [{ listed }] };
      if (/sec:%:rename:%/.test(sql)) return { rows: [] };
      throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
    },
  } as unknown as PoolClient;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
