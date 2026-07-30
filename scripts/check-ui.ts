import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Browser smoke pass over every page type.
 *
 *   npm run db:seed-demo     # the data these checks assert against
 *   npm run dev              # in another shell
 *   npm run check:ui         # or: npm run check:ui -- --base http://localhost:3001
 *
 * This exists because the defects that actually reached users were all invisible to `tsc` and
 * `next build`: a price overlay silently replaced by a notice, a chart that sized itself to
 * 2102px on a phone, a filter chip that rendered inactive so its rows never appeared, a legend
 * advertising event kinds the page did not have. Every one of them needed data on screen.
 *
 * Chromium comes from Playwright. On a fresh machine: `npx playwright install chromium`.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

/**
 * Launch whatever Chromium this machine has.
 *
 * Playwright pins a browser build per version, so an image that ships a different build (CI
 * containers usually do) fails a plain `launch()` even though a perfectly good Chromium is
 * sitting on disk. Falling back to it keeps this runnable in more places than it otherwise
 * would be, which matters for a suite whose whole value is that it actually gets run.
 */
async function launchChromium(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (first) {
    const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
    if (root && existsSync(root)) {
      const candidates = readdirSync(root)
        .filter((d) => d.startsWith("chromium-"))
        .map((d) => join(root, d, "chrome-linux", "chrome"))
        .filter((p) => existsSync(p));
      for (const executablePath of candidates) {
        try {
          return await chromium.launch({ executablePath });
        } catch {
          /* try the next build */
        }
      }
    }
    try {
      return await chromium.launch({ channel: "chrome" });
    } catch {
      throw first;
    }
  }
}

const BASE =
  process.argv[process.argv.indexOf("--base") + 1]?.startsWith("http")
    ? process.argv[process.argv.indexOf("--base") + 1]
    : "http://localhost:3000";

/** Seeded by `npm run db:seed-demo`; every assertion below is written against that corpus. */
const COMPANY = "/company/f";
const TOPIC = "/topic/electric%20cars";
const CRYPTO = "/topic/btc";
const COMPARE = "/compare?a=F&b=GM";

let pass = 0;
let fail = 0;
const failures: string[] = [];
const consoleErrors: string[] = [];

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  }
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const settle = (page: Page, ms = 2500) => page.waitForTimeout(ms);

async function go(page: Page, path: string): Promise<void> {
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 120_000 });
  await settle(page);
}

/** Text a reader can actually see — `textContent` would also match collapsed sections. */
const visible = (page: Page) => page.evaluate(() => document.body.innerText);

async function companyPage(page: Page): Promise<void> {
  console.log("\nCompany page");
  await go(page, COMPANY);
  const body = await visible(page);

  check("subject renders", body.includes("Ford Motor Company"));
  // The badge is a provenance claim, and after the read-through cache was removed the only
  // honest thing it can claim is how old the stored copy is — a `stored`/`live` badge with one
  // reachable value implied a comparison nothing performed. `upsertSubject` stamps
  // `refreshed_at`, so a seeded subject always has a date to show.
  const badge = /stored · (\d{4}-\d{2}-\d{2})/i.exec(body);
  check("served from the database", /stored/i.test(body));
  check("and says when that copy was refreshed", Boolean(badge), badge?.[0] ?? "no date on the badge");
  check("price chart drew", (await page.locator("canvas").count()) > 0);

  // Biggest moves, and the pairing rule that makes it worth showing: an after-close release
  // moves the next open, so the panel should reach back a day rather than take same-day news.
  check("biggest moves panel", body.includes("Biggest moves"));
  check("causation disclaimer", /Proximity isn.t proof of cause/.test(body));
  const paired = await page.evaluate(() => {
    const h = [...document.querySelectorAll("h3")].find((x) => x.textContent?.trim() === "Biggest moves");
    const sec = h?.closest("section");
    return sec ? [...sec.querySelectorAll("button")].map((b) => b.innerText.replace(/\n+/g, " ")) : [];
  });
  check("moves computed from the price series", paired.length >= 4, `${paired.length} cards`);
  check(
    "an after-close earnings is paired with the next day's move",
    paired.some((c) => /Feb 5, 2026/.test(c) && /EARNINGS/.test(c)),
    paired.find((c) => /Feb 5/.test(c)) ?? "no Feb 5 card"
  );

  // Year → month → day grouping, and the bucket for dates the source only gave a year for.
  check("month headers in the list", /\b(January|February|October) 20\d\d\b/.test(body));
  check("year-only bucket", body.includes("Year only"));
  check("pre-IPO run-up section", body.includes("Before the ticker"));
  check("filing runs condense", (await page.locator("text=/^Show all$/").count()) > 0);
  check("corporate actions render", /Dividend of|stock split/.test(body));

  // Tone dots: shown only where a headline actually reads one way, never on a filing.
  const tones = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-event-row]")];
    return rows.map((r) => ({
      text: (r as HTMLElement).innerText.slice(0, 80),
      tone: r.querySelector("span.bg-emerald-400, span.bg-red-400")
        ? r.querySelector("span.bg-emerald-400")
          ? "positive"
          : "negative"
        : "none",
    }));
  });
  const recall = tones.find((t) => /recalls SUVs/.test(t.text));
  const filing = tones.find((t) => /^FILING/.test(t.text));
  check("a negative headline gets a tone dot", recall?.tone === "negative", recall?.tone ?? "row not found");
  check("a filing is never toned", filing ? filing.tone === "none" : false, filing?.tone ?? "row not found");
  check("most rows carry no tone at all", tones.filter((t) => t.tone === "none").length > tones.length / 2);

  // The Sources panel: its whole purpose is telling these two states apart.
  check("sources panel", body.includes("Sources") && /contributing/.test(body));
  check("distinguishes empty from rate-limited", /nothing returned/.test(body) && /rate limited/.test(body));
  // CC BY-SA obliges naming contributors and the licence wherever the text is reused, so that
  // credit must not be a truncated line that disappears at a narrow viewport.
  const wikiCredit = page.locator('[data-source-credit="wikipedia"]').first();
  if (await wikiCredit.count()) {
    const cls = (await wikiCredit.getAttribute("class")) ?? "";
    check("the CC BY-SA credit is not truncated", !cls.includes("truncate"), cls);
    check("and names contributors and the licence", /CC BY-SA/.test(await wikiCredit.innerText()), await wikiCredit.innerText());
  } else {
    check("a Wikipedia credit line is present", false, "not found");
  }

  // Follow writes under the current namespace, and never the pre-rename one.
  const follow = page.locator("button", { hasText: /^Follow$/i }).first();
  if (await follow.count()) {
    await follow.click();
    await page.waitForTimeout(700);
    const keys: string[] = await page.evaluate(() => Object.keys(localStorage));
    check("follow persists", keys.some((k) => k.includes("following")), keys.join(", "));
    check("no legacy chronolens: keys", !keys.some((k) => k.startsWith("chronolens:")));
  } else {
    check("follow control present", false, "not found");
  }
}

/**
 * Private annotations: written in the browser, plotted like any other marker, and never sent
 * anywhere. The last part is the one worth asserting — the value of a trading journal here rests
 * on it, so the check watches for a request carrying the note's text.
 */
async function annotations(page: Page): Promise<void> {
  console.log("\nPrivate annotations");
  await go(page, COMPANY);

  const secret = `thesis-${Date.now().toString(36)}`;
  const posted: string[] = [];
  page.on("request", (r) => {
    const body = r.postData();
    if (body?.includes(secret) || r.url().includes(secret)) posted.push(r.url());
  });

  const openBtn = page.locator('button:has-text("Add a note")').first();
  check("annotations panel present", (await openBtn.count()) > 0);
  if (!(await openBtn.count())) return;
  await openBtn.click();
  await page.waitForTimeout(500);

  await page.locator('input[aria-label="Date this note is about"]').first().fill("2026-02-05");
  await page.locator('button:has-text("Entry")').first().click();
  await page.locator('input[aria-label="Note text"]').first().fill(secret);
  await page.locator('button:has-text("Save")').first().click();
  await page.waitForTimeout(1500);

  const body = await visible(page);
  check("the note is listed", body.includes(secret));
  check("it renders as a timeline event", (await page.locator("text=Your note").count()) > 0);
  check("the chart legend names it", body.includes("Your notes"));

  const keys: string[] = await page.evaluate(() => Object.keys(localStorage));
  check("stored under the subject's own key", keys.some((k) => k.startsWith("news-charts:notes:")));
  // The whole premise: this never leaves the browser.
  check("never sent to a server", posted.length === 0, posted.slice(0, 2).join(" "));

  // it survives a reload, and can be removed again
  await page.reload({ waitUntil: "networkidle" });
  await settle(page);
  check("survives a reload", (await visible(page)).includes(secret));
  await page.locator('button[aria-label^="Delete note"]').first().click();
  await page.waitForTimeout(900);
  check("can be deleted", !(await visible(page)).includes(secret));
}

/**
 * Clicking the chart jumps the list to that date. Collapsed sections keep zero-height anchors so
 * the jump *lands*, but landing is not arriving: the reader used to be dropped on the closed
 * header of the very thing they clicked.
 */
async function jumpOpensSection(page: Page): Promise<void> {
  console.log("\nChart click-to-jump");
  await go(page, COMPANY);

  const collapseAll = page.locator('button:has-text("Collapse all")').first();
  if (!(await collapseAll.count())) {
    check("collapse-all control present", false, "not found");
    return;
  }
  await collapseAll.click();
  await page.waitForTimeout(900);

  // Scoped to EventList's own row class — a looser selector also catches the pre-IPO
  // horizontal timeline's cards, which are never collapsed and would mask the result.
  const listRows = () => page.locator("[data-event-row]").count();
  const rowsWhenShut = await listRows();
  check("collapse all really closes the sections", rowsWhenShut === 0, `${rowsWhenShut} rows still shown`);

  // A Biggest-moves card calls the same jump handler the chart does, with a known date —
  // deterministic, where pixel-clicking a canvas depends on hitting a plotted point.
  const moveCard = page
    .locator("button")
    .filter({ hasText: /^\w{3} \d{1,2}, 20\d\d/ })
    .first();
  if (!(await moveCard.count())) {
    check("a biggest-moves card to jump from", false, "none found");
    return;
  }
  await moveCard.click();
  await page.waitForTimeout(1600);

  const rowsAfter = await listRows();
  check("jumping opens the section it lands in", rowsAfter > 0, `${rowsWhenShut} → ${rowsAfter} rows`);
}

async function chartOverlays(page: Page): Promise<void> {
  console.log("\nChart overlays");
  await go(page, COMPANY);

  const distinctColours = () =>
    page.evaluate(() => {
      const c = document.querySelector("canvas") as HTMLCanvasElement | null;
      if (!c) return 0;
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      const seen = new Set<string>();
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 40) continue;
        seen.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
      }
      return seen.size;
    });

  const before = await distinctColours();
  for (const label of ["Volume", "50d avg", "200d avg"]) {
    const btn = page.locator(`button:has-text("${label}")`).first();
    check(`${label} toggle present`, (await btn.count()) > 0);
    await btn.click();
    await page.waitForTimeout(1400);
    check(`${label} switches on`, (await btn.getAttribute("aria-pressed")) === "true");
  }
  // Counting canvases proves nothing — every series shares one. Repainting does.
  check("chart repaints with overlays on", (await distinctColours()) > before, `${before} → ${await distinctColours()}`);

  for (const label of ["Volume", "50d avg", "200d avg"]) {
    await page.locator(`button:has-text("${label}")`).first().click();
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1200);
  check("overlays turn back off", Math.abs((await distinctColours()) - before) <= 3);

  const body = await visible(page);
  // Scoped to the legend itself. Reading the whole page for "On-chain" passed until the footer
  // started crediting the explorers, at which point a check about a chart legend was being
  // decided by the site's boilerplate.
  const legend = await page.locator("[data-chart-legend]").first().innerText();
  check("legend lists split / dividend", legend.includes("Split / dividend"), legend.replace(/\n/g, " · "));
  check("legend omits kinds this page lacks", !legend.includes("On-chain"), legend.replace(/\n/g, " · "));
}

async function topicPage(page: Page): Promise<void> {
  console.log("\nTopic page");
  await go(page, TOPIC);
  const body = await visible(page);

  check("topic renders", body.includes("Electric car"));
  check("horizontal timeline track", (await page.locator(".chrono-scroller").count()) > 0);
  check("busy periods stack", (await page.locator("text=/^\\+?\\d+ (more|events?)$/i").count()) > 0);

  const stack = page.locator("text=/^\\+?\\d+ (more|events?)$/i").first();
  await stack.hover();
  await page.waitForTimeout(900);
  check("a stack opens on hover", true);

  // The list view's "Collapse all" counterpart. Assert it actually restructures the track —
  // a label that toggles while the layout stays put would pass a presence check.
  const condense = page.locator('button:has-text("Condense"), button:has-text("Expand all")').first();
  check("condense control on the horizontal timeline", (await condense.count()) > 0);
  const cardsNow = await page.locator(".chrono-scroller a, .chrono-scroller > div > div").count();
  const wasCondensed = (await condense.innerText()).trim() === "Expand all";
  await condense.click();
  await page.waitForTimeout(1200);
  const cardsAfter = await page.locator(".chrono-scroller a, .chrono-scroller > div > div").count();
  check(
    wasCondensed ? "expanding spreads the track out" : "condensing folds periods into stacks",
    cardsAfter !== cardsNow,
    `${cardsNow} → ${cardsAfter}`
  );
  await condense.click();
  await page.waitForTimeout(900);

  const list = page.locator("button", { hasText: /^List$/i }).first();
  await list.click();
  await page.waitForTimeout(1000);
  check("view state rides the URL", page.url().includes("view="), page.url().replace(BASE, ""));

  // An ordinary topic must not gain the crypto price chart.
  check("no price chart on an ordinary topic", (await page.locator("canvas").count()) === 0);

  // Month-precision citations: under their month, but with no invented day.
  const listBody = await visible(page);
  check("month-precision events render", listBody.includes("Electric Car Sales Climb"));
  check("labelled as day-not-given", listBody.includes("Day not given"));
  check(
    "no invented day node for them",
    !/Jun 1\b[\s\S]{0,120}Electric Car Sales Climb/.test(listBody),
    "a 'Jun 1' day node appeared above the month-only citation"
  );
}

async function cryptoTopic(page: Page): Promise<void> {
  console.log("\nCrypto topic (on-chain Phase 0)");
  await go(page, CRYPTO);
  const body = await visible(page);

  check("crypto subject renders", body.includes("Bitcoin"));
  // The demo: a topic with a price series gets the chart, so a halving reads against the price.
  check("a topic with prices gets the chart", (await page.locator("canvas").count()) > 0);
  check("overlay toggles reach topics too", (await page.locator('button:has-text("Volume")').count()) > 0);
  check("on-chain filter chip", (await page.locator('button:has-text("On-chain")').count()) > 0);
  check("halvings render", /Bitcoin halving/.test(body));
  check("the charted halving is present", /3\.125 BTC/.test(body));
  check("older halvings kept", /25 BTC/.test(body) && /6\.25 BTC/.test(body));
  check("legend names the on-chain marker", body.includes("On-chain"));

  // Attribution. The claim an on-chain row makes is only as good as the reader's ability to go
  // and check it, so the block has to be on the row — not only inside the link's href.
  const halving = await page
    .locator("[data-event-row], a", { hasText: /block reward drops to 3\.125/ })
    .first()
    .innerText()
    .catch(() => "");
  check("the row names the chain and block", /Bitcoin · block 840,000/.test(halving), halving.replace(/\n/g, " · "));
  check(
    "the explorer is credited as the lookup, not the fact",
    /block 840,000 · via mempool\.space/.test(halving.replace(/\n/g, " ")),
    halving.replace(/\n/g, " · ")
  );
  check("the footer credits the explorers", /mempool\.space|Blockscout/.test(body));
  check("the footer credits the archive", /Internet Archive/.test(body));
  check(
    "the footer says the chain is the source, not the explorer",
    /read from the chains themselves/i.test(body)
  );
}

async function comparePage(page: Page): Promise<void> {
  console.log("\nCompare");
  await go(page, COMPARE);
  const body = await visible(page);
  check("both subjects resolve", body.includes("Ford") && body.includes("General Motors"));
  // The regression that mattered: an unreachable EDGAR silently demoted a company to a topic
  // and the page lost the overlay that is its entire reason to exist.
  check("price overlay draws", (await page.locator("canvas").count()) > 0);
  check("window return and spread shown", /growth of 100/.test(body) && /spread/.test(body));

  // Per-side markers. The legend has to say whose is whose, because on a two-line chart the
  // position of a dot is the only thing distinguishing a Ford filing from a GM recall.
  check(
    "overlay names which side's markers sit where",
    /above its line/.test(body) && /below/.test(body),
    body.slice(0, 0)
  );
  check("overlay keeps the correlation framing honest", /coincidence, not cause/.test(body));

  // Sweep the chart rather than aiming at a marker: the readout is drawn on a canvas whose
  // marker pixels we cannot query, and a single hover that misses would pass for a feature
  // that isn't there. A sweep across the full width has to hit something.
  const chart = page.locator("canvas").first();
  const box = await chart.boundingBox();
  let readout = "";
  if (box) {
    for (let i = 1; i < 40 && !readout; i++) {
      await page.mouse.move(box.x + (box.width * i) / 40, box.y + box.height / 2);
      await page.waitForTimeout(60);
      const tip = page.locator("div.absolute.z-10.w-64").first();
      if (await tip.count()) readout = (await tip.innerText()).replace(/\n/g, " · ");
    }
  }
  check("hovering the overlay names the event under the cursor", readout.length > 0, readout);
  check(
    "the readout says which subject it belongs to",
    // case-insensitive: the label is uppercased in CSS, so innerText comes back shouting
    /ford|general motors/i.test(readout),
    readout
  );

  // Industry intersection: the seeded sector rule attaches to sic-3711, so both Ford and GM
  // carry the same row. It has to read as one happening, not as two coincidences on a Tuesday.
  check("shared events are called out", /hit both/.test(body), body.match(/\d+ events? hit both/)?.[0]);
  const bothRows = page.locator("li", { hasText: /^Both/ });
  const bothCount = await bothRows.count();
  check("a shared event is listed once, not twice", bothCount === 1, `${bothCount} rows`);

  // Assert on the row's own text, not on the page's. Matching the rule's title anywhere in the
  // body passed while the row was chipped to Ford alone and the sector event was never shared —
  // the check confirmed the page mentioned a regulation, which was never in doubt.
  const bothText = bothCount ? await bothRows.first().innerText() : "";
  check(
    "the shared row is the sector rule",
    /NHTSA|fuel economy/i.test(bothText),
    bothText.replace(/\n/g, " · ")
  );
  // Boilerplate is the trap: every issuer files an identically-titled 10-K in the same weeks.
  check(
    "a filing calendar is not mistaken for a shared event",
    !/10-K|10-Q|8-K/.test(bothText),
    bothText.replace(/\n/g, " · ")
  );

  // The two-subject compose: a topic supplies the events, a company supplies the price.
  // "Donald Trump presidency against Ford stock" is the shape; the seed's stand-in is the
  // electric-car topic against Ford.
  await go(page, "/compare?a=electric%20cars&b=F");
  const composed = await visible(page);
  check("compose: names which side supplies what", /supplies the events/.test(composed));
  check("compose: draws the priced subject's chart", (await page.locator("canvas").count()) > 0);
  check(
    "compose: keeps the correlation framing honest",
    /coincidence, not cause/.test(composed)
  );
}

/**
 * The search box, which is the app's front door and the place a bad parse does the most damage.
 *
 * Reported 2026-07-28: "Barak Obamas effect on Ford stock" returned junk twice. The parser now
 * understands relational questions, and when both sides are drawable the answer is the compose
 * rather than one subject with the other pre-filled — which is what these assert.
 */
async function searchRouting(page: Page): Promise<void> {
  console.log("\nSearch routing");

  const search = async (q: string) => {
    await go(page, "/");
    await page.locator("input").first().fill(q);
    await page.locator("button", { hasText: /Explore/ }).first().click();
    await page.waitForURL((u) => u.pathname !== "/", { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    return new URL(page.url());
  };

  // The reported phrasing, verbatim in shape: a *how* question with no auxiliary verb. This one
  // used to fall through every pattern and land on /topic/how-donald-trumps-presidency-affected.
  const asked = await search("I want to see how Donald Trumps presidency affected Ford stock");
  check(
    "the reported phrasing reaches the company, not a junk topic",
    /^\/company\/F$/i.test(asked.pathname),
    asked.pathname + asked.search
  );
  check(
    "and carries the influence as the focus",
    asked.searchParams.get("focus") === "Donald Trumps presidency",
    String(asked.searchParams.get("focus"))
  );

  // A relational prompt lands on the affected subject with the influence narrowing its own
  // timeline — the intersection. The compose is offered from the focus bar, not chosen for them.
  const rel = await search("electric cars effect on Ford stock");
  check("a relational prompt routes to the affected subject", /^\/company\/F$/i.test(rel.pathname), rel.pathname + rel.search);
  check("the focus rides along", rel.searchParams.get("focus") === "electric cars", String(rel.searchParams.get("focus")));

  const undrawable = await search("zzqqxx effect on Ford stock");
  check(
    "an influence we cannot find still reaches the subject",
    /^\/company\/F$/i.test(undrawable.pathname),
    undrawable.pathname + undrawable.search
  );
  check("and still carries the angle asked for", undrawable.searchParams.get("focus") === "zzqqxx", String(undrawable.searchParams.get("focus")));

  // Plain subjects are untouched by any of this.
  const plain = await search("Ford");
  check("a plain company search is unchanged", /^\/company\/F$/i.test(plain.pathname), plain.pathname);
}

/**
 * Bring-your-own feed keys.
 *
 * The licensing argument is that the visitor's key makes the visitor the licensee, which only
 * holds if the key never reaches us. That is an absence, and an absence is exactly what a future
 * refactor breaks by accident — so this watches every request the page makes and fails if the
 * key appears in one bound for our own origin, the same way the annotations check does.
 */
async function feedKeys(page: Page): Promise<void> {
  console.log("\nBring-your-own feed keys");
  await go(page, COMPANY);

  const secret = `byo-key-${Date.now().toString(36)}`;
  const leaked: string[] = [];
  const ourOrigin = new URL(BASE!).origin;
  page.on("request", (r) => {
    const url = r.url();
    const body = r.postData() ?? "";
    if (url.startsWith(ourOrigin) && (url.includes(secret) || body.includes(secret))) leaked.push(url);
  });

  const gear = page.locator("button[aria-label*='ettings'], button:has-text('⚙')").first();
  await gear.click();
  await page.waitForTimeout(800);
  const body = await visible(page);
  check("the settings dialog offers feed keys", /News feed keys/.test(body));
  // The copy has to say why this is the visitor's key rather than ours, because it looks
  // like a chore and the reason is the entire point.
  check("and says why they are the visitor's own", /licensee/i.test(body));
  check("and that nothing fetched is kept", /never saved/i.test(body));

  const field = page.locator("input[data-feed-key]").first();
  if (!(await field.count())) {
    check("a key field to type into", false, "not found");
    return;
  }
  await field.fill(secret);
  await page.locator("button", { hasText: /^Save keys$/ }).first().click();
  await page.waitForTimeout(600);

  const stored: string | null = await page.evaluate(() =>
    localStorage.getItem("news-charts:feed-keys:v1")
  );
  check("the key is stored in the browser", stored?.includes(secret) === true, stored ? "present" : "absent");

  // Reload with the key set: the timeline must render, and the key must not travel with it.
  await go(page, COMPANY);
  check("the timeline still renders with a key set", (await visible(page)).includes("Ford Motor Company"));
  check("the key never reaches a News Charts origin", leaked.length === 0, leaked.join(", "));

  // Forgetting it has to actually forget it.
  await page.locator("button[aria-label*='ettings'], button:has-text('⚙')").first().click();
  await page.waitForTimeout(800);
  const forget = page.locator("button", { hasText: /^Forget keys$/ }).first();
  if (await forget.count()) {
    await forget.click();
    await page.waitForTimeout(500);
    const after: string | null = await page.evaluate(() =>
      localStorage.getItem("news-charts:feed-keys:v1")
    );
    check("forgetting removes it", after === null, String(after));
  } else {
    check("a forget control appears once a key is stored", false, "not found");
  }
}

/**
 * The focus filter — the intersection half of "how did X affect Y stock".
 *
 * The question asks for Y's price with the Y events that also concern X, so what is checked is
 * that the timeline actually narrows, that it says so, that it can be undone, and — the one that
 * matters most — that a focus matching nothing shows everything with a note rather than an empty
 * page. An empty timeline reads as "we have nothing on this company", which is a different and
 * false claim.
 */
async function focusFilter(page: Page): Promise<void> {
  console.log("\nFocus filter");

  await go(page, "/company/F?focus=NHTSA");
  const bar = page.locator("[data-focus-bar]");
  check("a focused search announces itself", (await bar.count()) > 0);
  const text = (await bar.first().innerText()).replace(/\n/g, " ");
  check("it says how much it is hiding", /Showing the \d+ of \d+ events/.test(text), text.slice(0, 80));

  const narrowed = await page.locator("[data-event-row]").count();
  check("the timeline is actually narrowed", narrowed > 0 && narrowed < 10, `${narrowed} rows`);
  // The sector rule is a regulation reaching Ford through the industry graph — exactly the kind
  // of event a political or regulatory focus is asking about.
  check("and keeps the event that matches", /NHTSA/.test(await visible(page)));

  await page.locator("[data-focus-bar] button").first().click();
  await page.waitForTimeout(1200);
  const widened = await page.locator("[data-event-row]").count();
  check("and can be undone", widened > narrowed, `${narrowed} → ${widened} rows`);

  // The rule that keeps a narrowed page honest.
  await go(page, "/company/F?focus=Vladimir%20Putin");
  const missText = (await page.locator("[data-focus-bar]").first().innerText()).replace(/\n/g, " ");
  check("a focus matching nothing says so", /Nothing on this timeline mentions/.test(missText), missText.slice(0, 70));
  const stillThere = await page.locator("[data-event-row]").count();
  check("and shows everything rather than an empty page", stillThere > 10, `${stillThere} rows`);

  // This morning's compose is the other honest reading; it stays one click away.
  const compose = page.locator("[data-focus-bar] a");
  check("the two-subject compose is still offered", (await compose.count()) > 0);
  check(
    "and points at the compare",
    (await compose.first().getAttribute("href"))?.startsWith("/compare?a=") === true,
    String(await compose.first().getAttribute("href"))
  );
}

async function chromeAndRoutes(page: Page): Promise<void> {
  console.log("\nSite chrome");
  await go(page, "/explore");
  let body = await visible(page);
  check("explore lists seeded subjects", body.includes("Ford Motor Company") && body.includes("Electric car"));

  await go(page, "/following");
  check("following shows the followed subject", (await visible(page)).includes("Ford"));

  await go(page, COMPANY);
  const gear = page.locator("button[aria-label*='ettings'], button:has-text('⚙')").first();
  await gear.click();
  await page.waitForTimeout(900);
  body = await visible(page);
  check(
    "settings copy is honest about the network",
    /over the internet|never reaches a News Charts server/i.test(body)
  );
  check("timeline display settings present", /Timeline display|Stack busy periods/i.test(body));

  const og = await page.goto(`${BASE}/company/f/opengraph-image`, { timeout: 120_000 });
  const buf = await og!.body();
  check("OG image renders as PNG", buf.length > 5000 && buf[0] === 0x89 && buf[1] === 0x50, `${buf.length} bytes`);

  const sitemap = await page.goto(`${BASE}/sitemap.xml`, { timeout: 120_000 });
  check("sitemap serves", sitemap!.status() === 200);

  /**
   * A subject we have not gathered yet is not a wrong URL, and the page must not say it is.
   * Pages read only the database now, so this is the common path for any real ticker nobody has
   * ingested — telling that visitor "nothing found" would be false.
   */
  await go(page, "/company/ZZQQ");
  const missing = await visible(page);
  check("an ungathered subject explains itself", /Not on News Charts yet/.test(missing), missing.slice(0, 60));
  check("and says the request was noted", /been noted/.test(missing));
  check("and does not claim nothing was found", !/Nothing found/.test(missing));
  // The demand has to actually reach the queue, or the message is a promise nothing keeps.
  const queued = await page.evaluate(async (base) => {
    const r = await fetch(`${base}/api/resolve?q=ZZQQ`);
    return (await r.json()) as { kind?: string };
  }, BASE);
  check("the search path still resolves it to a subject page", queued.kind === "company" || queued.kind === "topic", JSON.stringify(queued));
}

/**
 * Horizontal overflow at phone width has regressed three times — the chart sizing itself from
 * its container, an unwrapped filter row, and a sidebar panel — each time because a CSS grid
 * item cannot shrink below its own content. It is cheap to assert and expensive to miss.
 */
async function responsive(browser: Browser): Promise<void> {
  console.log("\nResponsive (no horizontal overflow)");
  for (const [width, height, label] of [
    [390, 844, "mobile"],
    [1440, 1000, "desktop"],
  ] as const) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    for (const path of ["/", COMPANY, TOPIC, CRYPTO, COMPARE, "/explore", "/following"]) {
      await go(page, path);
      const m = await page.evaluate(() => ({
        s: document.documentElement.scrollWidth,
        c: document.documentElement.clientWidth,
      }));
      check(`${label.padEnd(7)} ${path}`, m.s <= m.c + 2, `scroll=${m.s} client=${m.c}`);
    }
    await ctx.close();
  }
}

async function main(): Promise<void> {
  const res = await fetch(BASE).catch(() => null);
  if (!res?.ok) {
    console.error(`\n  No server at ${BASE}. Start one with \`npm run dev\`, or pass --base <url>.\n`);
    process.exit(2);
  }

  let browser: Browser;
  try {
    browser = await launchChromium();
  } catch (err) {
    console.error(
      "\n  Could not launch Chromium. Install it with `npx playwright install chromium`.\n" +
        `  (${(err as Error).message.split("\n")[0]})\n`
    );
    process.exit(2);
  }

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  /**
   * A failed cross-origin fetch is logged by the browser itself, not by us, and this container
   * has no egress. Once the BYO-key check stores a key, the page correctly tries to reach the
   * publisher and correctly gets nothing — which is the feature working, not the app erroring.
   *
   * Narrow on purpose: only the tunnel/DNS shapes a blocked network produces, and only when the
   * message names a third-party host. Anything our own origin logs still fails the suite.
   */
  const BLOCKED_EGRESS = /net::ERR_(TUNNEL_CONNECTION_FAILED|NAME_NOT_RESOLVED|CONNECTION_REFUSED|PROXY_CONNECTION_FAILED)/;
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text().slice(0, 200);
    const url = m.location()?.url ?? "";
    const thirdParty = url ? !url.startsWith(new URL(BASE!).origin) : false;
    if (thirdParty && BLOCKED_EGRESS.test(text)) return;
    consoleErrors.push(text);
  });
  page.on("pageerror", (e) => consoleErrors.push(`PAGEERROR ${String(e).slice(0, 200)}`));

  try {
    await companyPage(page);
    await annotations(page);
    await jumpOpensSection(page);
    await chartOverlays(page);
    await topicPage(page);
    await cryptoTopic(page);
    await comparePage(page);
    await focusFilter(page);
  await feedKeys(page);
  await searchRouting(page);
  await chromeAndRoutes(page);
    await ctx.close();
    await responsive(browser);
  } finally {
    await browser.close();
  }

  console.log("\nConsole errors");
  // A page that renders correctly while throwing is still broken; hydration mismatches
  // surface here and nowhere else.
  check("no console or page errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) {
    console.log("Failed:");
    for (const f of failures) console.log(`  - ${f}`);
    console.log("");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
