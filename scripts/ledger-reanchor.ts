/**
 * Puts each open ledger item's cited lines back where its quote is (batch 187).
 *
 *   npm run ledger:reanchor            # writes docs/audits/nc-task-queue-2026-09-28.json
 *   npm run ledger:reanchor -- --dry   # reports only
 *
 * Run it after a batch edits a document the ledger cites, before the commit; check:ledger fails otherwise.
 * A reference whose lines still hold its quote is left alone, so a deliberate range (a whole section) stays a
 * range. One whose quote has moved is given the quote's own lines, the place nearest where it was. One whose
 * quote is nowhere in the file is reported and left as it was: its text was rewritten, and the sentence that
 * took its place is a person's call (set `quote` to it, keep the old one in `quote_was`, date `requoted_on`).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lineRange, linesHold, locateQuote } from "./ledger-quotes";

const ROOT = join(__dirname, "..");
const LEDGER = join(ROOT, "docs/audits/nc-task-queue-2026-09-28.json");
const dry = process.argv.includes("--dry");

const ledger = JSON.parse(readFileSync(LEDGER, "utf8")) as { outstanding: { id: string; status: string; sources?: { file: string; lines?: string | number; quote?: string }[] }[] };
const files = new Map<string, string[] | null>();
const linesOf = (f: string) => {
  if (!files.has(f)) files.set(f, existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), "utf8").split("\n") : null);
  return files.get(f)!;
};

let held = 0;
const moved: string[] = [];
const gone: string[] = [];
for (const it of ledger.outstanding) {
  if (it.status === "closed") continue;
  for (const s of it.sources ?? []) {
    const range = lineRange(s.lines);
    if (!range || !s.quote) continue;
    const lines = linesOf(s.file);
    if (!lines) {
      gone.push(`${it.id} ${s.file}: no such file`);
      continue;
    }
    if (linesHold(lines, s.lines, s.quote)) {
      held++;
      continue;
    }
    const at = locateQuote(lines, s.quote, range[0]);
    if (!at) {
      gone.push(`${it.id} ${s.file}:${s.lines} "${s.quote.slice(0, 70)}"`);
      continue;
    }
    moved.push(`${it.id} ${s.file}: ${s.lines} → ${at.lines}${at.places > 1 ? ` (nearest of ${at.places})` : ""}`);
    s.lines = at.lines;
  }
}
for (const m of moved) console.log(`  moved  ${m}`);
for (const g of gone) console.log(`  GONE   ${g}`);
console.log(`${held} references held their quote, ${moved.length} moved, ${gone.length} not found${dry ? " (dry run: nothing written)" : ""}`);
// the ledger's own formatting: one space of indent, non-ASCII kept
if (!dry && moved.length) writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
if (gone.length) process.exit(1);
