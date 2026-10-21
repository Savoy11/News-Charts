import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * The Internet Archive adapter, against canned responses.
 *
 *   npm run check:archive
 *
 * These checks are offline, like every other suite in the chain, so what they prove is the
 * *parsing* — plus, since 2026-08-12, what the request asks for. The archive's metadata is uneven
 * by design: a bare year must stay a bare year, and a container item must not become an event.
 * Each renders as plausible-looking data when wrong.
 *
 * ⚠ **Payload shapes here are no longer taken from documentation alone.** They were, and it cost
 * two defects that every case in this file passed straight through: year-only items drawn on a
 * specific 1 January (the fixture used a field the live service does not send), and a `date asc`
 * sort that selected the archive's worst-catalogued rows (nothing here looked at the query at
 * all). Both fixtures now match responses captured from `advancedsearch.php` on 2026-08-12.
 * The Wayback CDX cases went with the reader they tested (NC-043, 2026-10-19).
 */
import { fetchArchiveItems, parseArchiveDate } from "../lib/archive";
import { fetchYahooFinanceNews } from "../lib/newsExtra";
import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const realFetch = globalThis.fetch;
/** The last URL the adapter asked for, so the QUERY can be asserted and not just the parsing. */
let lastUrl = "";
function serve(body: unknown, status = 200): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    lastUrl = String(input);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  }) as typeof fetch;
}

/**
 * What the adapter ASKS FOR, which is the half this suite could not see.
 *
 * Every case below this file tests how a payload is parsed. That is why a `sort[]=date asc`
 * parameter sat here for weeks: it produced perfectly parseable rows, and the defect was in the
 * selection, not the parsing. Measured live on 2026-08-12, that sort returned Ford items from
 * 1770 and capped NVIDIA's reach at 1999 for a company founded in 1993.
 */
async function query(): Promise<void> {
  console.log("\nWhat the request asks for");
  serve({ response: { numFound: 0, docs: [] } });
  await fetchArchiveItems("Ford Motor");
  check("the search term is quoted as a phrase", /q=%22Ford\+Motor%22|q=%22Ford%20Motor%22/.test(lastUrl), lastUrl.slice(0, 90));
  // The one that matters: archive.org's default is relevance, and its `date` field is not
  // curated well enough to sort on. Asking for the oldest rows asks for the worst-catalogued.
  check("no date sort is requested", !/sort/i.test(lastUrl), lastUrl.slice(0, 140));
  check("the fields the parser reads are requested", ["identifier", "title", "date", "year", "mediatype", "creator"].every((f) => lastUrl.includes(f)));
}

async function dates(): Promise<void> {
  console.log("\nDates, and how much of them the archive knew");
  // A full timestamp is what advancedsearch returns for well-catalogued items.
  check("a full timestamp is a day", parseArchiveDate("1922-03-04T00:00:00Z")?.precision === "day");
  check("and keeps its day", parseArchiveDate("1922-03-04T00:00:00Z")?.date === "1922-03-04");
  check("a bare date is a day", parseArchiveDate("1965-07-19")?.date === "1965-07-19");

  // The shape the LIVE service actually returns for a year-only item, confirmed 2026-08-12:
  // a midnight timestamp on 1 January. Read literally it is a specific day, which is how every
  // year-only archive item was being drawn on 1 January. The fixture below this used to be the
  // only year-only case and it carries a bare `year` — a shape archive.org does not send.
  const placeholder = parseArchiveDate("1936-01-01T00:00:00Z");
  check("the archive's Jan-1 midnight placeholder is a year", placeholder?.precision === "year", placeholder?.precision);
  check("and keeps the year it stood for", placeholder?.date === "1936-01-01", placeholder?.date);
  // The rule must not swallow real dates: only 1 January, only at midnight, only with a time.
  check("a real day at midnight stays a day", parseArchiveDate("1922-03-04T00:00:00Z")?.precision === "day");
  check("a real 1 January time stays a day", parseArchiveDate("1965-01-01T14:30:00Z")?.precision === "day");
  check("a bare 1 January stays a day", parseArchiveDate("1965-01-01")?.precision === "day");
  // The one that matters: normalising a bare year to Jan 1 and calling it a day would put a
  // March pamphlet in January and draw it as though the archive had said so.
  const y = parseArchiveDate("1922");
  check("a bare year stays a year", y?.precision === "year", y?.precision);
  check("and normalises to Jan 1 without claiming it", y?.date === "1922-01-01", y?.date);
  const m = parseArchiveDate("1922-03");
  check("a year-month stays a month", m?.precision === "month" && m.date === "1922-03-01", JSON.stringify(m));

  console.log("\nDates that must be refused rather than guessed at");
  check("a range is not its own prefix", parseArchiveDate("1922-03-04/1922-04-01") === null);
  check("an impossible month", parseArchiveDate("1922-13-04") === null);
  check("an impossible day", parseArchiveDate("1922-02-31") === null);
  check("a year before the archive's reach", parseArchiveDate("0001") === null);
  check("an identifier that looks numeric", parseArchiveDate("19220304123456") === null);
  check("nothing at all", parseArchiveDate(undefined) === null && parseArchiveDate("") === null);
}

async function items(): Promise<void> {
  console.log("\nItems");
  serve({
    response: {
      numFound: 4,
      docs: [
        { identifier: "fordmotor1922", title: "Ford Motor Company annual report", date: "1922-03-04T00:00:00Z", mediatype: "texts", creator: "Ford Motor Company" },
        // multi-valued title and creator: archive.org returns arrays when an item has several
        { identifier: "modelt", title: ["The Model T", "Model T Ford"], year: 1908, mediatype: "texts", creator: ["Ford", "Anon"] },
        // A year-only item AS THE LIVE SERVICE SENDS IT — Jan-1 midnight timestamp plus a `year`
        // field, not the bare `year` the docs show. Verified against archive.org on 2026-08-12.
        { identifier: "rockefeller1936", title: "Rockefeller Foundation Annual Report(s)", date: "1936-01-01T00:00:00Z", year: 1936, mediatype: "texts", creator: "Rockefeller Foundation" },
        // a container, not a happening — its date says when someone made a folder
        { identifier: "autos-collection", title: "Automobiles", date: "2011-05-02", mediatype: "collection" },
        // undated: there is nothing to place it against
        { identifier: "undated-thing", title: "A pamphlet", mediatype: "texts" },
      ],
    },
  });

  const r = await fetchArchiveItems("Ford Motor Company");
  check("dated items become events", r.events.length === 3, `${r.events.length}`);
  check("outcome is ok when something came back", r.outcome === "ok", r.outcome);
  check("a collection is not an event", !r.events.some((e) => e.id.includes("autos-collection")));
  check("an undated item is dropped", !r.events.some((e) => e.id.includes("undated-thing")));

  const report = r.events.find((e) => e.externalId === "fordmotor1922");
  check("title is cleaned, not raw", report?.title === "Ford Motor Company annual report", report?.title);
  check("the creator is the attribution", report?.source === "Internet Archive · Ford Motor Company", report?.source);
  check("links to the item, not the search", report?.url === "https://archive.org/details/fordmotor1922", report?.url);
  // The identifier is archive.org's own primary key, so two ingests of one item are one row.
  check("identity is the archive identifier", report?.dedupBasis === "ia:fordmotor1922", report?.dedupBasis);
  check("filed under the archive's source key", report?.sourceKey === "internet_archive");

  // A field returned as an array must not render as "a,b" or "[object Object]" on a card.
  const modelT = r.events.find((e) => e.externalId === "modelt");
  check("a multi-valued title takes one value", modelT?.title === "The Model T", modelT?.title);
  check("a multi-valued creator takes one value", modelT?.source === "Internet Archive · Ford", modelT?.source);
  check("a year-only item keeps year precision", modelT?.precision === "year", modelT?.precision);

  // The same assertion against the shape the service really sends. This is the one that was
  // missing: with only the fixture above, the parser could call every live year-only item a
  // specific 1 January and every check still passed.
  const rockefeller = r.events.find((e) => e.externalId === "rockefeller1936");
  check("a live-shaped year-only item is a year, not 1 January", rockefeller?.precision === "year", rockefeller?.precision);
  check("and still lands in its own year", rockefeller?.date === "1936-01-01", rockefeller?.date);

  console.log("\nWhen the archive can't answer");
  serve({ response: { numFound: 0, docs: [] } });
  const none = await fetchArchiveItems("zzqqxx");
  check("nothing found is empty, not an error", none.outcome === "empty" && none.events.length === 0, none.outcome);
  // "Come back later" is a different fact from "there is nothing", and ingest backs off on it.
  serve({}, 503);
  check("a 503 is throttled", (await fetchArchiveItems("x")).outcome === "throttled");
  serve({}, 429);
  check("a 429 is throttled", (await fetchArchiveItems("x")).outcome === "throttled");
  serve({}, 500);
  check("a 500 is an error", (await fetchArchiveItems("x")).outcome === "error");
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  const thrown = await fetchArchiveItems("x");
  check("a thrown request is an error, not a crash", thrown.outcome === "error" && thrown.events.length === 0);

  /**
   * NC-142: the outcomes above were computed and then thrown away. Ingest wrapped the adapter in
   * `asResult`, which re-derived ok/empty from the event count — so a throttled archive was logged
   * as a successful fetch of nothing, with no back-off and a healthy-looking status.
   */
  const ingestSrc = readFileSync("scripts/ingest.ts", "utf8");
  check("ingest hands runSource the archive's own outcome", /\(\) => fetchArchiveItems\(/.test(ingestSrc) && !/getArchiveItems/.test(ingestSrc));
  check("  …and nothing re-derives an outcome from an event count", !/asResult/.test(ingestSrc));

  console.log("\nYahoo Finance RSS keeps its outcome too");
  const rss = (status: number, xml = "") => {
    globalThis.fetch = (async () => ({ ok: status === 200, status, text: async () => xml })) as unknown as typeof fetch;
  };
  rss(200, "<rss><channel></channel></rss>");
  check("no headlines is empty", (await fetchYahooFinanceNews("F")).outcome === "empty");
  rss(200, `<rss><channel><item><title>Ford raises guidance</title><link>https://finance.yahoo.com/a</link><pubDate>Tue, 07 Jul 2026 12:00:00 GMT</pubDate></item></channel></rss>`);
  const one = await fetchYahooFinanceNews("F");
  check("a headline is ok", one.outcome === "ok" && one.events.length === 1, `${one.outcome} ${one.events.length}`);
  rss(429);
  check("a 429 is throttled", (await fetchYahooFinanceNews("F")).outcome === "throttled");
  rss(503);
  check("a 503 is throttled", (await fetchYahooFinanceNews("F")).outcome === "throttled");
  rss(404);
  check("any other status is an error", (await fetchYahooFinanceNews("F")).outcome === "error");
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  check("a thrown request is an error", (await fetchYahooFinanceNews("F")).outcome === "error");
  check("ingest uses the outcome-keeping adapter", /\(\) => fetchYahooFinanceNews\(/.test(ingestSrc) && !/getYahooFinanceNews/.test(ingestSrc));
}

async function main(): Promise<void> {
  try {
    await dates();
    await query();
    await items();
  } finally {
    globalThis.fetch = realFetch;
  }
  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
