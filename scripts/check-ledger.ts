/**
 * The task ledger's evidence is where it says it is (batch 187).
 *
 *   npm run check:ledger
 *
 * Every item of `docs/audits/nc-task-queue-2026-09-28.json` that is not closed cites its evidence as a file, a
 * line range and a quote. This holds each such reference to the file as it is now: the file exists, the lines
 * exist, and they hold the quote (`linesHold`, as written or with a document's markdown dropped). A document
 * that grows moves its lines, so a batch that edits one runs `npm run ledger:reanchor` before it commits.
 *
 * Offline: the ledger and the files it cites.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { lineRange, linesHold, locateQuote, normQuote, quoteFragments } from "./ledger-quotes";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail: unknown = ""): void {
  if (ok) pass++;
  else fail++;
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${d ? ` — ${d.slice(0, 400)}` : ""}`);
}

const ROOT = join(__dirname, "..");
export const LEDGER = "docs/audits/nc-task-queue-2026-09-28.json";

interface Source {
  file: string;
  lines?: string | number;
  quote?: string;
  quote_was?: string;
  requoted_on?: string;
}
interface Item {
  id: string;
  status: string;
  sources?: Source[];
}

function main(): void {
  console.log("How a quote is found");
  const doc = ["# Title", "", "- [ ] `P2` **DefiLlama** protocol launches / TVL inflection events.", "2. Deploy (Vercel free tier works", "   for MVP)", "A gray zone today.", "Review the terms", "at ship time."];
  check("as written, across a line break", linesHold(doc, "4-5", "Deploy (Vercel free tier works for MVP)") && locateQuote(doc, "Deploy (Vercel free tier works for MVP)")?.lines === "4-5");
  check("  …or with the document's markdown, list number and case dropped",
    linesHold(doc, "3", "DefiLlama protocol launches / TVL inflection events.") && linesHold(doc, "4-5", "1. Deploy (Vercel free tier works for MVP)") &&
      locateQuote(doc, "DefiLlama protocol launches / TVL inflection events.")?.how === "relaxed" && normQuote("- [x] **Bold** `code`", true) === "bold code");
  check("  …a quote joined by an ellipsis by each passage in order",
    linesHold(doc, "6-8", "gray zone ... Review the terms at ship time.") && !linesHold(doc, "6-8", "Review the terms ... gray zone today") &&
      quoteFragments("gray zone ... Review the terms", false).length === 2);
  check("  …not at lines that do not hold it, nor past the file's end, nor a quote that is nowhere",
    !linesHold(doc, "1-2", "Deploy (Vercel free tier works for MVP)") && !linesHold(doc, "7-40", "Review the terms") && locateQuote(doc, "no such sentence anywhere") === null &&
      lineRange("61")?.join() === "61,61" && lineRange("374-375")?.join() === "374,375" && lineRange("n/a") === null && lineRange("9-3") === null);
  const twice = ["commercialOk: true,", "x", "commercialOk: true,"];
  check("  …of several places, the one nearest where it was last cited", locateQuote(twice, "commercialOk: true,", 3)?.lines === "3" && locateQuote(twice, "commercialOk: true,", 1)?.places === 2);

  console.log("\nThe ledger");
  const ledger = JSON.parse(readFileSync(join(ROOT, LEDGER), "utf8")) as { outstanding: Item[]; counts: { by_status: Record<string, number> } };
  const byStatus: Record<string, number> = {};
  for (const it of ledger.outstanding) byStatus[it.status] = (byStatus[it.status] ?? 0) + 1;
  check("its counts by status are its items'", Object.keys(ledger.counts.by_status).every((k) => ledger.counts.by_status[k] === (byStatus[k] ?? 0)), byStatus);

  const files = new Map<string, string[] | null>();
  const linesOf = (f: string) => {
    if (!files.has(f)) files.set(f, existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), "utf8").split("\n") : null);
    return files.get(f)!;
  };
  let cited = 0;
  const missing: string[] = [];
  const moved: string[] = [];
  for (const it of ledger.outstanding) {
    if (it.status === "closed") continue;
    for (const s of it.sources ?? []) {
      if (!lineRange(s.lines) || !s.quote) continue;
      cited++;
      const lines = linesOf(s.file);
      if (!lines) missing.push(`${it.id} ${s.file}`);
      else if (!linesHold(lines, s.lines, s.quote)) moved.push(`${it.id} ${s.file}:${s.lines} "${s.quote.slice(0, 50)}"`);
    }
  }
  // some, not a set number: the count falls as items close (106 after batch 191's closures, from 123)
  check(`every file an open item cites exists (${cited} references with lines and a quote)`, cited > 0 && missing.length === 0, missing);
  check("  …and the lines each cites hold its quote: run `npm run ledger:reanchor` after a document moves", moved.length === 0, `${moved.length}: ${moved.slice(0, 6).join("; ")}`);
  const requoted = ledger.outstanding.flatMap((it) => (it.sources ?? []).filter((s) => s.quote_was));
  check("  …a quote whose text was rewritten keeps the old one beside it, dated", requoted.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.requoted_on ?? "") && s.quote_was !== s.quote), requoted.length);

  console.log("\nWired");
  const pkg = readFileSync(join(ROOT, "package.json"), "utf8");
  check("check:ledger is in the check chain, and `npm run ledger:reanchor` writes the lines",
    /"check:ledger": "tsx scripts\/check-ledger\.ts"/.test(pkg) && /"check": "[^"]*npm run check:ledger/.test(pkg) && /"ledger:reanchor": "tsx scripts\/ledger-reanchor\.ts"/.test(pkg));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

main();
