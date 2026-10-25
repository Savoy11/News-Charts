/**
 * The bounds on first-visit ingest — that the render path stays a bounded, keyless,
 * database-gated fetch and can never regress into per-view fetching.
 *
 *   npm run check:ondemand
 *
 * Commit 813d505 removed live fetching from the render path; lib/ingest/firstPass.ts returns
 * a deliberately bounded slice of it. Nothing else in the check chain asserts those bounds, so
 * nothing else would catch the quiet regression — a keyed source slipping into the first pass,
 * or a fetch happening when the database (whose ledger is the permission slip) is down.
 *
 * Offline by construction: fetch is replaced, DATABASE_URL points at a closed port, and the
 * rest is import graphs and pure functions. What this deliberately CANNOT prove is that the
 * Postgres advisory lock excludes two OS processes — that is a live, two-terminal
 * verification, recorded as such in docs/MASTER-CHECKLIST.md rather than implied here.
 */

import { readFileSync } from "node:fs";
import * as path from "node:path";
import { QUOTAS } from "../lib/ingest/quota";
import type { SourceKey } from "../lib/types";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

async function main(): Promise<void> {
  console.log("\nThe first pass reaches only unmetered sources");
  // Imported AFTER env mangling below would be too late for pool config, but constants are safe.
  const { FIRST_PASS_SOURCES, FIRST_PASS_BUDGET_MS, ATTEMPT_COOLDOWN_MINUTES } = await import(
    "../lib/ingest/firstPass"
  );
  for (const key of FIRST_PASS_SOURCES) {
    const quota = QUOTAS[key as SourceKey];
    check(
      `${key} carries no daily cap a traffic spike could drain`,
      quota !== undefined && quota.perDay === null,
      `perDay=${quota?.perDay}`
    );
  }

  console.log("\n...and its import graph cannot reach a keyed or slow source");
  // The keyed aggregators live in newsExtra; the slow sources (GDELT sleeps 5.5s twice when
  // throttled, Chronicling America 4s, Internet Archive) have no place on a visitor's clock.
  const src = readFileSync(path.join(__dirname, "../lib/ingest/firstPass.ts"), "utf8");
  for (const banned of ["newsExtra", "../news", "./news\"", "../loc", "../archive", "federalregister", "onchain"]) {
    check(`firstPass never imports ${banned.replace(/["\\]/g, "")}`, !src.includes(`from "${banned}`));
  }
  check("firstPass imports the wiki, sec and prices tiers only", ["../wiki", "../sec", "../prices"].every((m) => src.includes(`from "${m}"`)));

  console.log("\nA database outage means zero fetches — permission to fetch is a database write");
  process.env.DATABASE_URL = "postgresql://nobody:nothing@127.0.0.1:59999/absent";
  const attempted: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => {
    attempted.push(String(input));
    return { ok: true, status: 200, json: async () => ({}), text: async () => "" } as unknown as Response;
  }) as typeof fetch;
  try {
    const { firstPassTopic, firstPassCompany } = await import("../lib/ingest/firstPass");
    const t = await firstPassTopic("bicycle");
    check("topic pass reports unavailable", t === "unavailable", t);
    const c = await firstPassCompany("AAPL");
    check("company pass reports unavailable", c === "unavailable", c);
    check("no fetch was attempted by either", attempted.length === 0, attempted[0]?.slice(0, 80) ?? "");
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log("\nThe numbers are the ones we chose");
  check("the visitor's wait is bounded", FIRST_PASS_BUDGET_MS <= 10_000, `${FIRST_PASS_BUDGET_MS}ms`);
  check(
    "an unresolvable slug retries at most 4×/day",
    ATTEMPT_COOLDOWN_MINUTES >= 360,
    `${ATTEMPT_COOLDOWN_MINUTES}min cooldown`
  );
  // The dedicated pool must shed, not queue: pg-pool's default is NO connect timeout.
  check("the ingest pool sheds load instead of queueing", /connectionTimeoutMillis:\s*\d+/.test(src));
  check("  ...and is capped at two concurrent gathers", /max:\s*2/.test(src));

  /**
   * Wikipedia always answers, so "found an article" is not "found the right article".
   *
   * Search stopped minting topics in the 2026-08-08 scope refocus, but a slug typed straight into
   * the URL bar still reaches the first pass. Measured live 2026-08-12, asking Wikipedia for
   * `best buy earnings q3` returns **TaxAct** with 21 events — a complete, confident timeline for
   * a company the visitor never asked about, which is worse than the honest notice a miss gets.
   */
  console.log("\nThe article has to be about what was asked for");
  const { articleAnswersSlug } = await import("../lib/wiki");
  check("the live failure is rejected", !articleAnswersSlug("best buy earnings q3", "TaxAct"));
  check("  …and so is its shorter form", !articleAnswersSlug("best buy", "TaxAct"));
  check("an unrelated article is rejected", !articleAnswersSlug("penicillin", "TaxAct"));

  /**
   * The corpus already depends on stem tolerance, so these are regression cases, not niceties:
   * exact word-boundary matching — which `mentions()` does, correctly, for headlines — would
   * reject both and silently delete two subjects the site holds today.
   */
  check("telegraph still reaches Telegraphy", articleAnswersSlug("telegraph", "Telegraphy"));
  check("electric cars still reaches Electric car", articleAnswersSlug("electric cars", "Electric car"));
  check("a company slug still reaches its article", articleAnswersSlug("ford", "Ford Motor Company"));
  check("a qualified query still reaches its subject", articleAnswersSlug("nvidia earnings", "Nvidia"));
  check("covid reaches the pandemic article", articleAnswersSlug("covid", "COVID-19 pandemic"));
  // The parser artifact that gave this initiative its name still names a real subject.
  check(
    "a prompt-shaped slug still matches its subject",
    articleAnswersSlug("how-donald-trumps-presidency-affected", "Second presidency of Donald Trump")
  );

  // Conservative where it cannot judge: a slug of nothing but filler has no grounds to refuse on,
  // and being wrong that way costs a thin page rather than deleting a real subject.
  check("a slug with no distinctive token is not refused", articleAnswersSlug("q3 earnings", "TaxAct"));
  check("an empty slug is not refused", articleAnswersSlug("", "Anything"));

  /**
   * Depth belongs to the scheduler; the first pass stays bounded.
   *
   * EDGAR splits a filer's history at ~1,000 filings — `filings.recent` plus separate shard
   * files. Reading only `recent` left Ford's timeline starting in 2019 and Apple's in 2015, when
   * both go back to 1994 (209 → 937 and 161 → 393 filings respectively). The scheduler now takes
   * the shards; the first pass must NOT, because it runs with a visitor waiting on an 8s budget
   * and its job is to flip the render gate, not to be complete.
   */
  console.log("\nFiling depth is the scheduler's job, not the first pass's");
  const fs = await import("node:fs");
  const firstPassSrc = fs.readFileSync("lib/ingest/firstPass.ts", "utf8");
  const ingestSrc = fs.readFileSync("scripts/ingest.ts", "utf8");
  check("the first pass takes the recent block only", /\bgetFilings\(/.test(firstPassSrc) && !/getFilingsDeep/.test(firstPassSrc));
  check("the scheduler takes the older shards", /getFilingsDeep\([^,)]+,\s*true\b/.test(ingestSrc));

  const { getFilings, getFilingsDeep } = await import("../lib/sec");
  let asked: string[] = [];
  (globalThis as { fetch: unknown }).fetch = async (input: RequestInfo | URL) => {
    asked.push(String(input));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        filings: {
          recent: { form: ["10-K"], filingDate: ["2020-01-01"], accessionNumber: ["0000000000-20-000001"], primaryDocument: ["a.htm"] },
          files: [{ name: "CIK0000000001-submissions-001.json" }],
        },
      }),
    } as unknown as Response;
  };
  const co = { ticker: "T", cik: "0000000001", name: "Test Co" };
  asked = [];
  await getFilings(co);
  check("shallow asks for the submissions record and nothing else", asked.length === 1, `${asked.length} requests`);
  asked = [];
  await getFilingsDeep(co, true);
  check("deep asks for the shard too", asked.some((u) => u.includes("submissions-001.json")), asked.join(" "));

  console.log("\nA Wikipedia that cannot answer is not a Wikipedia with no article");
  // NC-146: any non-OK status read as "no article", so a throttled Wikipedia pushed real topics
  // toward the first pass's week-long block and gave the scheduler nothing to ingest.
  const { getTopicTimeline, WikipediaUnavailable, wikiOutcome } = await import("../lib/wiki");
  const { withTimeout, timedOut } = await import("../lib/timeout");
  const wikiServes = (status: number, body: unknown = {}) => {
    (globalThis as { fetch: unknown }).fetch = async () =>
      ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
  };
  const outcomeOf = async (): Promise<string> => {
    try {
      return (await getTopicTimeline("penicillin")) === null ? "no article" : "article";
    } catch (err) {
      return err instanceof WikipediaUnavailable ? `unavailable:${wikiOutcome(err)}` : `threw:${(err as Error).message}`;
    }
  };
  wikiServes(200, { query: { pages: { "-1": { title: "Penicillin", missing: "" } }, search: [] } });
  check("a missing page is still no article", (await outcomeOf()) === "no article", await outcomeOf());
  wikiServes(429);
  check("a 429 is unavailable, and backs off as throttled", (await outcomeOf()) === "unavailable:throttled", await outcomeOf());
  wikiServes(503);
  check("a 503 is unavailable, and backs off as throttled", (await outcomeOf()) === "unavailable:throttled", await outcomeOf());
  wikiServes(500);
  check("a 500 is unavailable, logged as an error", (await outcomeOf()) === "unavailable:error", await outcomeOf());
  (globalThis as { fetch: unknown }).fetch = async () => {
    throw new TypeError("fetch failed");
  };
  check("a refused connection is unavailable too", (await outcomeOf()) === "unavailable:error", await outcomeOf());
  wikiServes(429);
  const raced = await withTimeout(getTopicTimeline("penicillin"), 1_000);
  check("the first pass sees it as a timeout, never a miss", timedOut(raced));
  check(
    "  …and records a failure only on a real miss",
    /if \(!timedOut\(wiki\)\) await recordFailure\(/.test(firstPassSrc)
  );
  // The main article answered; a companion that cannot be fetched this moment is left out.
  (globalThis as { fetch: unknown }).fetch = async (input: RequestInfo | URL) => {
    const url = decodeURIComponent(String(input));
    const ok = !url.includes("Timeline of");
    return {
      ok,
      status: ok ? 200 : 429,
      json: async () =>
        url.includes("action=parse")
          ? { parse: { wikitext: { "*": "" } } }
          : url.includes("History of")
            ? { query: { pages: { "-1": { missing: "" } } } }
            : { query: { pages: { "1": { title: "Penicillin", extract: "Penicillin was discovered in 1928 by Alexander Fleming." } } } },
    } as unknown as Response;
  };
  const withCompanionDown = await getTopicTimeline("penicillin").catch(() => null);
  check("a companion article Wikipedia cannot serve is only left out", withCompanionDown?.title === "Penicillin", String(withCompanionDown?.title));

  /**
   * The first visit stores the SEC industry (batch 50). Only the scheduler linked it, so a fund
   * first visited before then — GLD, a commodity trust told from a company by its SIC 6221 —
   * was called a corporation, and every first page went without its sector. Driven end to end
   * through a stand-in database client and EDGAR record; it stays an enrichment throughout.
   */
  console.log("\nA first visit stores the SEC industry, and never waits or fails on it");
  const { firstPassCompany, INDUSTRY_GRACE_MS } = await import("../lib/ingest/firstPass");
  const pg = await import("pg");
  const GLD_RECORD = {
    sic: "6221",
    sicDescription: "Commodity Contracts Brokers & Dealers",
    filings: {
      recent: { form: ["10-K"], filingDate: ["2025-11-20"], accessionNumber: ["0001222333-25-000009"], primaryDocument: ["gld-10k.htm"] },
    },
  };
  /** One first pass for GLD; returns the outcome and the statements it sent, in order. */
  const firstVisit = async (opts: {
    record?: object;
    industryHangs?: boolean;
    refuse?: RegExp;
  }): Promise<{ outcome: string; sent: { sql: string; params: unknown[] }[]; ms: number }> => {
    const sent: { sql: string; params: unknown[] }[] = [];
    const fake = {
      query: async (sql: string, params: unknown[] = []) => {
        sent.push({ sql, params });
        if (opts.refuse?.test(sql)) throw new Error("refused by the check");
        if (/sec_headlines/.test(sql)) return { rows: [], rowCount: 0 };
        return { rows: [{ id: 7, ok: true, inserted: true }], rowCount: 1 };
      },
      release: () => {},
    };
    (pg.Pool.prototype as unknown as { connect: unknown }).connect = async () => fake;
    (globalThis as { fetch: unknown }).fetch = (input: RequestInfo | URL) => {
      if (!String(input).includes("data.sec.gov/submissions/")) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as unknown as Response);
      }
      if (opts.industryHangs && /getIndustry/.test(new Error().stack ?? "")) return new Promise<Response>(() => {});
      return Promise.resolve({ ok: true, status: 200, json: async () => opts.record ?? GLD_RECORD } as unknown as Response);
    };
    const started = Date.now();
    const outcome = await firstPassCompany(`GLD`);
    return { outcome, sent, ms: Date.now() - started };
  };
  const linked = (sent: { sql: string; params: unknown[] }[]) =>
    sent.some((q) => /INSERT INTO subject_members/.test(q.sql) && /'sic'/.test(q.sql));
  const at = (sent: { sql: string }[], re: RegExp) => sent.findIndex((q) => re.test(q.sql));

  const gld = await firstVisit({});
  check("GLD's first visit is ingested", gld.outcome === "ingested", gld.outcome);
  check(
    "  …and links it to its SEC industry, sic-6221",
    linked(gld.sent) && gld.sent.some((q) => q.params.includes("sic-6221")),
    gld.sent.filter((q) => /subject_members|sic-/.test(q.sql + q.params.join(" "))).length + " link statements"
  );
  check(
    "  …before its events, so no reader sees the page without it",
    at(gld.sent, /INSERT INTO subject_members/) >= 0 && at(gld.sent, /INSERT INTO subject_members/) < at(gld.sent, /^BEGIN$/),
    `link at ${at(gld.sent, /INSERT INTO subject_members/)}, BEGIN at ${at(gld.sent, /^BEGIN$/)}`
  );
  const { isFund } = await import("../lib/sec");
  check(
    "  …which is what makes it a fund: GLD is a Trust under SIC 6221",
    isFund({ ticker: "GLD", name: "SPDR GOLD TRUST", sic: "6221" }) && !isFund({ ticker: "GLD", name: "SPDR GOLD TRUST", sic: null })
  );

  const unclassified = await firstVisit({ record: { filings: GLD_RECORD.filings } });
  check("a record with no industry still renders, with no link", unclassified.outcome === "ingested" && !linked(unclassified.sent), unclassified.outcome);

  const refused = await firstVisit({ refuse: /INSERT INTO subject_members/ });
  check(
    "a link the database refuses costs only the link: the page's rows are still written",
    refused.outcome === "ingested" && at(refused.sent, /^COMMIT$/) > 0 && at(refused.sent, /^ROLLBACK$/) < 0,
    refused.outcome
  );

  const slow = await firstVisit({ industryHangs: true });
  check(
    `an industry that never answers holds the page ${INDUSTRY_GRACE_MS} ms at most, then renders without it`,
    slow.outcome === "ingested" && !linked(slow.sent) && slow.ms < INDUSTRY_GRACE_MS + 1_500,
    `${slow.outcome} in ${slow.ms} ms`
  );

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
