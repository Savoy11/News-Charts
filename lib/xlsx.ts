import { readZip } from "./zip";

/**
 * The first sheet of an Excel workbook as rows of text keyed by the header row (batch 105): the
 * FDA's compilation of new-drug approvals comes as one .xlsx. A workbook is a zip of XML parts
 * (`lib/zip.ts`); a cell's text is in the shared-string table (`t="s"`), inline (`t="inlineStr"`) or
 * the cell's own value — a number, which for a date column is Excel's day serial (`excelDay`). No
 * dependency. A workbook without the parts a sheet needs is refused, never half-read.
 */
export function readSheet(workbook: Uint8Array, sheet = "xl/worksheets/sheet1.xml"): Record<string, string>[] {
  const parts = readZip(workbook, [sheet, "xl/sharedStrings.xml"]);
  const xml = parts.get(sheet)?.toString("utf8");
  if (!xml) throw new Error(`not a workbook with ${sheet}`);
  const strings = [...(parts.get("xl/sharedStrings.xml")?.toString("utf8") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const grid: string[][] = [];
  for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+)\d+"/.exec(c[1])?.[1];
      const type = /\bt="([^"]+)"/.exec(c[1])?.[1];
      const body = c[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      const value = type === "s" ? (strings[Number(v)] ?? "") : type === "inlineStr" ? textOf(body) : v !== undefined ? unescape(v) : "";
      cells[ref ? column(ref) : cells.length] = value;
    }
    grid.push(Array.from(cells, (x) => x ?? ""));
  }
  const [head, ...rows] = grid;
  if (!head?.length) throw new Error("a sheet with no header row");
  const names = head.map((h) => h.replace(/\s+/g, " ").trim());
  return rows.filter((r) => r.some((x) => x.trim())).map((r) => Object.fromEntries(names.map((n, i) => [n, (r[i] ?? "").trim()])));
}

/** "A" → 0, "AA" → 26. */
const column = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** A shared string's or inline string's text: every run's `<t>`, joined. */
const textOf = (xml: string) => [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1])).join("");

const unescape = (s: string) =>
  s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
    e === "lt" ? "<" : e === "gt" ? ">" : e === "quot" ? '"' : e === "apos" ? "'" : e === "amp" ? "&" : String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))),
  );

/**
 * A date cell as YYYY-MM-DD: Excel's day serial (1 is 1900-01-01, with its leap-day bug, so day
 * 60 is the 29 February 1900 that never was), or a date written as text, "10/24/2025" or
 * "2025-10-24". Null for anything else.
 */
export function excelDay(cell: string): string | null {
  const t = cell.trim();
  if (/^\d+(?:\.\d+)?$/.test(t)) {
    const serial = Math.floor(Number(t));
    if (serial < 61 || serial > 2958465) return null;
    return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10);
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (us) return valid(`${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`);
  const iso = /^(\d{4}-\d{2}-\d{2})(?:[ T]00:00(?::00)?)?$/.exec(t);
  return iso ? valid(iso[1]) : null;
}

const valid = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day ? day : null;
};
