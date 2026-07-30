import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Measures whether a big timeline actually janks, before anyone builds windowing for it.
 *
 *   npm run db:seed-demo -- --stress   # 600-event fixture
 *   npm run build && npx next start -p 3023
 *   npm run profile:list -- --base http://localhost:3023
 *
 * Run against a production build. A dev build re-renders through the React refresh runtime and
 * reports numbers several times worse than anything a reader would see, which would argue for
 * work nobody needs.
 *
 * The scroll frame deltas are the number the checklist asks about; the filter off/on pair is
 * the mount cost, which is the part windowing would actually change.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";

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
          /* next */
        }
      }
    }
    throw first;
  }
}

const BASE =
  process.argv[process.argv.indexOf("--base") + 1]?.startsWith("http")
    ? process.argv[process.argv.indexOf("--base") + 1]
    : "http://localhost:3000";

const PATHS = [
  ["stress (600 events)", "/topic/stress%20test"],
  ["electric cars (baseline)", "/topic/electric%20cars"],
];

(async () => {
  const browser = await launchChromium();
  for (const [label, path] of PATHS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const t0 = Date.now();
    await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 60_000 });
    const loaded = Date.now() - t0;

    // The default view is the horizontal timeline, which draws a windowed slice. The list is
    // the view under question, so switch to it and time that switch — mounting every row at
    // once is the single most expensive thing the page does.
    const t1 = Date.now();
    await page.getByRole("button", { name: /^list$/i }).click();
    await page.waitForTimeout(200);
    const switched = Date.now() - t1;

    const stats = await page.evaluate(() => ({
      nodes: document.getElementsByTagName("*").length,
      rows: document.querySelectorAll("[data-event-row]").length,
      height: document.body.scrollHeight,
      heap: (performance as any).memory?.usedJSHeapSize ?? null,
    }));

    // Scroll the window in steps, recording per-frame deltas via rAF.
    //
    // Passed as source text, not as a function: tsx compiles with esbuild's keepNames, which
    // wraps named inner functions in a `__name` helper that does not exist inside the page.
    const frames: number[] = await page.evaluate(`(async () => {
      const deltas = [];
      let last = performance.now();
      let running = true;
      function tick() {
        const now = performance.now();
        deltas.push(now - last);
        last = now;
        if (running) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
      const total = document.body.scrollHeight;
      for (let y = 0; y < total; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 32));
      }
      running = false;
      await new Promise((r) => setTimeout(r, 50));
      return deltas.slice(1);
    })()`);

    const sorted = [...frames].sort((a, b) => a - b);
    const p = (q: number) => sorted[Math.floor(sorted.length * q)] ?? 0;
    const long = frames.filter((f) => f > 50).length;

    // Turning a filter off and back on unmounts and remounts every row. It is the worst
    // interaction the list has, and the one a windowing change would actually speed up —
    // scrolling a long page is the browser's problem, remounting 600 components is ours.
    let offMs: number | null = null;
    let onMs: number | null = null;
    const chip = page.locator("button", { hasText: /^(Cited articles|News|History)\b/ }).first();
    if (await chip.count()) {
      const settle = () =>
        page.evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))");
      let t = Date.now();
      await chip.click();
      await settle();
      offMs = Date.now() - t;
      t = Date.now();
      await chip.click();
      await settle();
      onMs = Date.now() - t;
    }

    console.log(`\n${label}  ${path}`);
    console.log(`  load (networkidle)   ${loaded} ms`);
    console.log(`  switch to list       ${switched} ms`);
    console.log(`  DOM nodes            ${stats.nodes}`);
    console.log(`  event rows           ${stats.rows}`);
    console.log(`  page height          ${stats.height} px`);
    console.log(`  JS heap              ${stats.heap ? (stats.heap / 1e6).toFixed(1) + " MB" : "n/a"}`);
    console.log(`  frames sampled       ${frames.length}`);
    console.log(`  frame p50 / p95 / max  ${p(0.5).toFixed(1)} / ${p(0.95).toFixed(1)} / ${Math.max(...frames).toFixed(1)} ms`);
    console.log(`  frames > 50ms        ${long}`);
    console.log(`  filter off / on      ${offMs === null ? "n/a" : `${offMs} / ${onMs} ms`}`);
    await page.close();
  }
  await browser.close();
})();
