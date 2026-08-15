import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Bring-your-own-key feeds, against canned responses.
 *
 *   npm run check:feed-keys
 *
 * The licensing argument this feature rests on is: the visitor's key makes the visitor the
 * licensee. That only holds if the key goes straight to the publisher and nothing fetched with
 * it is ever stored by us. Two of those three are structural — there is no server route to hit
 * and no writer to call — so what is checkable here is that the request goes to the publisher's
 * own host, carries the visitor's key, and parses to exactly what the server adapters produce.
 *
 * ⚠ Unverified live twice over — and neither reason is egress, which has been open since
 * 2026-08-12. These endpoints need NYT and Guardian keys the build container does not hold, and
 * browser use additionally depends on each publisher's CORS headers, which nothing server-side
 * can test whatever the network allows. A CORS failure surfaces as "no extra articles", which is
 * also what a wrong key looks like.
 */
import { fetchGuardianInBrowser, fetchNytInBrowser, fetchVisitorFeeds } from "../lib/feeds/browser";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const realFetch = globalThis.fetch;
let asked: string[] = [];
function serve(route: (url: string) => unknown | undefined, status = 200): void {
  asked = [];
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    asked.push(url);
    const body = route(url);
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response;
  }) as typeof fetch;
}

const NYT_BODY = {
  response: {
    docs: [
      {
        headline: { main: "Ford to Pay Five Dollars a Day" },
        web_url: "https://www.nytimes.com/1914/01/06/ford.html",
        pub_date: "1914-01-06T00:00:00Z",
        abstract: "The company doubles pay.",
        byline: { original: "By A Reporter" },
      },
      // no url, so nothing to link to and nothing to show
      { headline: { main: "Untitled" }, pub_date: "1914-01-06T00:00:00Z" },
      // undated
      { headline: { main: "Undated" }, web_url: "https://www.nytimes.com/x" },
    ],
  },
};

const GUARDIAN_BODY = {
  response: {
    results: [
      {
        webTitle: "Ford unveils electric F-150",
        webUrl: "https://www.theguardian.com/business/2021/may/19/ford",
        webPublicationDate: "2021-05-19T18:00:00Z",
        fields: { byline: "A Correspondent", trailText: "<p>An <b>electric</b> pickup.</p>", thumbnail: "https://i.guim.co.uk/x.jpg" },
      },
      { webTitle: "No url", webPublicationDate: "2021-05-19T18:00:00Z" },
    ],
  },
};

async function nyt(): Promise<void> {
  console.log("\nThe New York Times, with the visitor's key");
  serve(() => NYT_BODY);
  const events = await fetchNytInBrowser("visitor-key-123", "Ford Motor Company");

  // The whole licensing argument depends on this request going to the publisher, not to us.
  check("the request goes straight to the publisher", asked[0]?.startsWith("https://api.nytimes.com/"), asked[0]?.slice(0, 48));
  check("it carries the visitor's key", asked[0]?.includes("api-key=visitor-key-123") === true);
  check("and never a News Charts origin", !asked.some((u) => /\/api\/|localhost|news-?charts/i.test(u)));

  check("articles parse", events.length === 1, `${events.length}`);
  check("dated to publication day", events[0]?.date === "1914-01-06", events[0]?.date);
  check("attributed to the publisher", events[0]?.source === "The New York Times");
  check("byline and abstract ride along", /A Reporter — The company doubles pay\./.test(events[0]?.description ?? ""), events[0]?.description);
  // Identity must match the server adapter's, or one article arrives twice on a merged timeline.
  check("identity is headline and day", events[0]?.dedupBasis === "ford to pay five dollars a day|1914-01-06", events[0]?.dedupBasis);
  check("filed under the same source key as the server adapter", events[0]?.sourceKey === "nyt");
  check("an article with no link is dropped", !events.some((e) => e.title === "Untitled"));
  check("an undated article is dropped", !events.some((e) => e.title === "Undated"));
}

async function guardian(): Promise<void> {
  console.log("\nThe Guardian, with the visitor's key");
  serve(() => GUARDIAN_BODY);
  const events = await fetchGuardianInBrowser("gdn-key-456", "Ford Motor Company");
  check("the request goes straight to the publisher", asked[0]?.startsWith("https://content.guardianapis.com/"), asked[0]?.slice(0, 48));
  check("it carries the visitor's key", asked[0]?.includes("api-key=gdn-key-456") === true);
  check("articles parse", events.length === 1, `${events.length}`);
  // trailText is HTML; rendering it raw would put markup on a card.
  check("markup is stripped from the trail text", events[0]?.description === "A Correspondent — An electric pickup.", events[0]?.description);
  check("the thumbnail rides along", events[0]?.imageUrl === "https://i.guim.co.uk/x.jpg");
  // "F-150" normalises to "f 150": storyKey strips punctuation so an outlet's hyphenation does
  // not split one story into two. Same rule server-side, which is the point of asserting it.
  check("identity is headline and day", events[0]?.dedupBasis === "ford unveils electric f 150|2021-05-19", events[0]?.dedupBasis);
  check("an article with no link is dropped", !events.some((e) => e.title === "No url"));
}

async function failure(): Promise<void> {
  console.log("\nWhen a key doesn't work");
  // Every one of these must cost the visitor nothing but the extra articles. The timeline they
  // already have is served by us and must never depend on their key.
  serve(() => undefined, 401);
  check("a rejected key yields nothing, not an error", (await fetchNytInBrowser("bad", "Ford")).length === 0);
  serve(() => ({ unexpected: true }));
  check("an unexpected shape yields nothing", (await fetchNytInBrowser("k", "Ford")).length === 0);
  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch"); // what a CORS rejection looks like in a browser
  }) as typeof fetch;
  check("a CORS rejection yields nothing", (await fetchNytInBrowser("k", "Ford")).length === 0);
  check("and does not throw at the caller", (await fetchGuardianInBrowser("k", "Ford")).length === 0);

  serve(() => NYT_BODY);
  check("no key means no request at all", (await fetchNytInBrowser("", "Ford")).length === 0 && asked.length === 0);
  check("no subject means no request at all", (await fetchNytInBrowser("k", "  ")).length === 0 && asked.length === 0);
}

async function combined(): Promise<void> {
  console.log("\nBoth together");
  serve((url) => (url.includes("nytimes") ? NYT_BODY : GUARDIAN_BODY));
  const both = await fetchVisitorFeeds({ nyt: "a", guardian: "b" }, "Ford");
  check("both feeds contribute", both.length === 2, `${both.length}`);
  check("only the feeds with a key are asked", asked.length === 2, `${asked.length} requests`);

  serve(() => GUARDIAN_BODY);
  const one = await fetchVisitorFeeds({ guardian: "b" }, "Ford");
  check("a feed without a key is not asked", asked.length === 1 && one.length === 1, `${asked.length} requests`);
  check("no keys means no requests", (await fetchVisitorFeeds({}, "Ford")).length === 0);

  // One publisher failing must not cost the other's articles.
  let n = 0;
  globalThis.fetch = (async (input: unknown) => {
    n++;
    if (String(input).includes("nytimes")) throw new Error("down");
    return { ok: true, status: 200, json: async () => GUARDIAN_BODY } as unknown as Response;
  }) as typeof fetch;
  const partial = await fetchVisitorFeeds({ nyt: "a", guardian: "b" }, "Ford");
  check("one feed failing does not cost the other", partial.length === 1, `${partial.length} of 2, ${n} attempted`);
}

async function main(): Promise<void> {
  try {
    await nyt();
    await guardian();
    await failure();
    await combined();
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
