/**
 * Where a ledger item's quoted evidence is in a file (batch 187).
 *
 * The task ledger (`docs/audits/nc-task-queue-2026-09-28.json`) cites each item's evidence as a file, a line
 * range and a quote. Lines move every time a document grows above them, and by 2026-11-26 only 10 of the 129
 * references of the items still open held their quote: a per-batch remap had kept each reference's offset from
 * the batch before, and so never repaired one that was already wrong. `locateQuote` finds a quote by its words
 * instead, and `linesHold` is the test check:ledger makes of every reference.
 *
 * A quote is matched as written, or else less strictly: a quote in the ledger often drops a document's markdown
 * ("**Owner action, blocking launch:** review by" quoted as "Owner action, blocking launch: review by") or its
 * list number, and joins two passages with "...". Each passage on either side of an ellipsis must be found, in
 * order, within sixty lines.
 */

/** A passage with its whitespace collapsed; less strictly, with markdown marks, list markers and case removed. */
export function normQuote(s: string, relaxed: boolean): string {
  let t = s.replace(/\s+/g, " ").trim();
  if (relaxed) {
    t = t
      .replace(/[*`_~]/g, "")
      .replace(/^(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/, "")
      .replace(/’/g, "'")
      .replace(/[“”]/g, '"')
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }
  return t;
}

/** A quote's passages: its text split at each ellipsis, a passage of fewer than eight characters dropped. */
export function quoteFragments(quote: string, relaxed: boolean): string[] {
  return quote
    .split(/\s*(?:\.\.\.|…)\s*/)
    .map((p) => normQuote(p, relaxed))
    .filter((p) => p.length >= 8);
}

/** A file's lines as one normalised string, with the line number of each character. */
function indexed(lines: readonly string[], relaxed: boolean): { text: string; at: number[] } {
  let text = "";
  const at: number[] = [];
  lines.forEach((line, i) => {
    const s = normQuote(line, relaxed);
    if (!s) return;
    if (text) {
      text += " ";
      at.push(i + 1);
    }
    text += s;
    for (let k = 0; k < s.length; k++) at.push(i + 1);
  });
  return { text, at };
}

/** The first and last line of a reference such as "61" or "374-375"; null where it is neither. */
export function lineRange(lines: unknown): [number, number] | null {
  const m = /^(\d+)(?:-(\d+))?$/.exec(String(lines ?? ""));
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2] ?? m[1]);
  return a >= 1 && b >= a ? [a, b] : null;
}

/** Every place a quote's passages are found together, as [first line, last line], as written or less strictly. */
function places(lines: readonly string[], quote: string, relaxed: boolean): [number, number][] {
  const fr = quoteFragments(quote, relaxed);
  if (!fr.length) return [];
  const { text, at } = indexed(lines, relaxed);
  const out: [number, number][] = [];
  for (let st = text.indexOf(fr[0]); st >= 0; st = text.indexOf(fr[0], st + 1)) {
    let end = st + fr[0].length;
    let ok = true;
    for (const f of fr.slice(1)) {
      const k = text.indexOf(f, end);
      if (k < 0 || at[k] - at[st] > 60) {
        ok = false;
        break;
      }
      end = k + f.length;
    }
    if (ok) out.push([at[st], at[end - 1]]);
  }
  return out;
}

/** Whether the cited lines hold the quote: some place it is found lies within them. */
export function linesHold(fileLines: readonly string[], lines: unknown, quote: string): boolean {
  const range = lineRange(lines);
  if (!range || range[1] > fileLines.length) return false;
  const cited = fileLines.slice(range[0] - 1, range[1]);
  return places(cited, quote, false).length > 0 || places(cited, quote, true).length > 0;
}

/**
 * Where a quote is in a file: as written first, else less strictly; of several places the one nearest `near`
 * (the line it was last cited at). Null where its passages are not found together.
 */
export function locateQuote(fileLines: readonly string[], quote: string, near = 1): { lines: string; how: "literal" | "relaxed"; places: number } | null {
  for (const relaxed of [false, true]) {
    const found = places(fileLines, quote, relaxed);
    if (!found.length) continue;
    const best = found.reduce((a, b) => (Math.abs(b[0] - near) < Math.abs(a[0] - near) ? b : a));
    return { lines: best[0] === best[1] ? String(best[0]) : `${best[0]}-${best[1]}`, how: relaxed ? "relaxed" : "literal", places: found.length };
  }
  return null;
}
