import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * The Internet Archive adapter, against canned responses.
 *
 *   npm run check:archive
 *
 * ⚠ Both payload shapes are taken from archive.org's published API documentation and have never
 * been exercised against the live service from here — egress is blocked by policy. So these
 * checks prove the *parsing*, not the endpoint. What they are really for is the archive's uneven
 * metadata: a bare year must stay a bare year, a container item must not become an event, and a
 * CDX header row must not become a snapshot. Each of those renders as plausible-looking data
 * when it goes wrong.
 */
import { fetchArchiveItems, fetchSiteSnapshots, parseArchiveDate } from "../lib/archive";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const realFetch = globalThis.fetch;
function serve(body: unknown, status = 200): void {
  globalThis.fetch = (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }) as unknown as Response) as typeof fetch;
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
}

async function snapshots(): Promise<void> {
  console.log("\nWayback captures");
  // CDX answers an array of arrays whose FIRST row is the column header.
  serve([
    ["timestamp", "original", "statuscode"],
    ["19961023234631", "http://www.ford.com:80/", "200"],
    ["19971210174900", "http://www.ford.com:80/", "200"],
    ["bogus", "http://www.ford.com/", "200"],
  ]);
  const r = await fetchSiteSnapshots("ford.com");
  const snaps = r.snapshots;
  check("captures parse", snaps.length === 2, `${snaps.length}`);
  check("and say so", r.outcome === "ok", r.outcome);
  // Treating the header as data produced a snapshot dated "timestamp" — an empty row on screen.
  check("the header row is not a capture", !snaps.some((s) => s.date.startsWith("time")));
  check("a malformed timestamp is skipped", !snaps.some((s) => s.url.includes("bogus")));
  check("the timestamp becomes a date", snaps[0]?.date === "1996-10-23", snaps[0]?.date);
  check("the link replays that capture", snaps[0]?.url.startsWith("https://web.archive.org/web/19961023234631/"), snaps[0]?.url);

  /**
   * The half an array could not express.
   *
   * Every case below used to be `[]`, so "this domain was never archived" and "we could not ask"
   * were the same answer. Live proof, 2026-08-12: from a container where web.archive.org is
   * blocked, this function reported zero captures for ford.com.
   */
  serve([["timestamp", "original"]]);
  const headerOnly = await fetchSiteSnapshots("ford.com");
  check("a header with no captures is genuinely empty", headerOnly.snapshots.length === 0 && headerOnly.outcome === "empty", headerOnly.outcome);

  // A response that is not the documented shape must yield nothing rather than junk rows —
  // and must not claim the archive holds nothing, because we did not understand the answer.
  serve({ error: "nope" });
  const junk = await fetchSiteSnapshots("ford.com");
  check("an unexpected shape yields nothing", junk.snapshots.length === 0);
  check("and is an error, not an empty archive", junk.outcome === "error", junk.outcome);

  serve([["urlkey", "original"]]);
  const wrongCols = await fetchSiteSnapshots("ford.com");
  check("unexpected columns are an error", wrongCols.outcome === "error", wrongCols.outcome);
  serve([], 404);
  const notFound = await fetchSiteSnapshots("ford.com");
  check("a 404 yields nothing", notFound.snapshots.length === 0);
  check("and reports the status it got", notFound.outcome === "error" && notFound.httpStatus === 404, `${notFound.outcome}/${notFound.httpStatus}`);

  serve([], 503);
  const busy = await fetchSiteSnapshots("ford.com");
  check("a shedding Wayback is throttled, not empty", busy.outcome === "throttled", busy.outcome);

  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  const down = await fetchSiteSnapshots("ford.com");
  check("an unreachable Wayback never takes the page down", down.snapshots.length === 0);
  // The one this whole result type exists for: the live failure that reported "0 for ford.com".
  check("and is never reported as an archive with nothing in it", down.outcome === "error", down.outcome);

  const nothingAsked = await fetchSiteSnapshots("  ");
  check("an empty domain is not asked about", nothingAsked.snapshots.length === 0 && nothingAsked.outcome === "empty", nothingAsked.outcome);
}

async function main(): Promise<void> {
  try {
    await dates();
    await items();
    await snapshots();
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
