import { readFileSync } from "node:fs";
import { parseSeriesPage, preferredClass } from "./lib/edgarSeries";
const html = readFileSync("/tmp/s.html", "utf8");
const s = parseSeriesPage(html);
console.log("series parsed:", s.length, "| classes:", s.reduce((n, x) => n + x.classes.length, 0));
for (const x of s.slice(0, 3)) {
  console.log(`  ${x.seriesId} ${x.name}`);
  for (const c of x.classes) console.log(`      ${c.classId} ${c.className} -> ${c.symbol}`);
  console.log(`   preferred: ${preferredClass(x)?.symbol}`);
}
const v500 = s.find((x) => x.name.includes("500 Index"));
console.log("\nVanguard 500:", v500?.name, "-> preferred", preferredClass(v500!)?.symbol, "| all", v500?.classes.map(c=>c.symbol).join(","));
console.log("\npagination markers:", /Next\s*40|start=\d+/i.test(html) ? "present" : "none");
