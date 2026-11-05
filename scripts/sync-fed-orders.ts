import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { UA } from "../lib/contact";
import { orderSummary, parseYearPage, type ArchivedOrder } from "../lib/fedOrders";
import { decodeText } from "../lib/zip";

/**
 * Reads the Federal Reserve Board's orders of 1996–2005 into `data/fed-orders-1996-2005.json`
 * (batch 99): the ten yearly pages, then each order's own page for the sentence naming its parties,
 * a second apart. The archive is closed, so this is run once, or again only to re-check it.
 *
 *   npm run sync:fed-orders                 # asks www.federalreserve.gov, about 480 pages
 *   npm run sync:fed-orders -- --dir <path> # reads pages saved as <path>/YYYY.html and <path>/orders/<path with _>.html
 */
const BASE = "https://www.federalreserve.gov";
const OUT = join(__dirname, "..", "data", "fed-orders-1996-2005.json");
const dir = process.argv.includes("--dir") ? process.argv[process.argv.indexOf("--dir") + 1] : null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function page(path: string, saved: string): Promise<string> {
  // the older pages are Windows-1252, the newer UTF-8
  if (dir) return decodeText(readFileSync(join(dir, saved)));
  await sleep(1_000);
  const res = await fetch(`${BASE}${path}`, { headers: { ...UA, Accept: "text/html" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${path}: the Board answered ${res.status}`);
  return decodeText(new Uint8Array(await res.arrayBuffer()));
}

async function main(): Promise<void> {
  const orders: ArchivedOrder[] = [];
  for (let year = 1996; year <= 2005; year++) {
    const rows = parseYearPage(await page(`/newsevents/press/all/${year}all.htm`, `${year}.html`));
    if (!rows.length) throw new Error(`${year}: no order on the yearly page`);
    for (const r of rows) {
      const path = r.url.slice(BASE.length);
      let summary: string | null = null;
      try {
        summary = orderSummary(await page(path, join("orders", `${path.replaceAll("/", "_")}.html`)));
      } catch (err) {
        console.warn(`  ${path}: ${(err as Error).message}`);
      }
      orders.push({ ...r, summary });
    }
    console.log(`${year}: ${rows.length} orders`);
  }
  const unique = [...new Map(orders.map((o) => [o.url, o])).values()].sort((a, b) => a.day.localeCompare(b.day) || a.url.localeCompare(b.url));
  const about =
    "The Federal Reserve Board's orders on banks' applications of 1996–2005, from its yearly pages (www.federalreserve.gov/newsevents/press/all/YYYYall.htm), " +
    "each with its own page's sentence naming its parties, written by `npm run sync:fed-orders` (batch 99). Public domain (federalreserve.gov/disclaimer.htm).";
  writeFileSync(OUT, `${JSON.stringify({ about, read: new Date().toISOString().slice(0, 10), orders: unique }, null, 1)}\n`);
  console.log(`${unique.length} orders, ${unique.filter((o) => o.summary).length} with a summary → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
