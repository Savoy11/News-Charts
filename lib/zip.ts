import { inflateRawSync } from "node:zlib";

/**
 * The files of a zip archive, by name, read from its central directory (batch 95): EPA's case file
 * comes as one 82 MB zip of CSV tables. Stored and deflated entries only, and no zip64 — an
 * archive this reader cannot read is refused, never half-read. No dependency: Node's own inflate.
 */
export function readZip(buf: Uint8Array, wanted: readonly string[]): Map<string, Buffer> {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  // the end-of-central-directory record: within the last 64 KB, after any comment
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("not a zip archive: no end of central directory");
  const entries = b.readUInt16LE(end + 10);
  const dirSize = b.readUInt32LE(end + 12);
  let at = b.readUInt32LE(end + 16);
  if (entries === 0xffff || dirSize === 0xffffffff || at === 0xffffffff) throw new Error("a zip64 archive, which this reader does not read");
  const want = new Set(wanted);
  const out = new Map<string, Buffer>();
  for (let n = 0; n < entries; n++) {
    if (b.readUInt32LE(at) !== 0x02014b50) throw new Error(`a broken central directory at entry ${n}`);
    const method = b.readUInt16LE(at + 10);
    const packed = b.readUInt32LE(at + 20);
    const size = b.readUInt32LE(at + 24);
    const nameLength = b.readUInt16LE(at + 28);
    const extraLength = b.readUInt16LE(at + 30);
    const commentLength = b.readUInt16LE(at + 32);
    const local = b.readUInt32LE(at + 42);
    const name = b.toString("utf8", at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    if (!want.has(name)) continue;
    if (b.readUInt32LE(local) !== 0x04034b50) throw new Error(`no local header for ${name}`);
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const data = b.subarray(start, start + packed);
    const file = method === 0 ? Buffer.from(data) : method === 8 ? inflateRawSync(data) : null;
    if (!file) throw new Error(`${name} is packed by method ${method}, which this reader does not read`);
    if (file.length !== size) throw new Error(`${name} unpacked to ${file.length} bytes, not the ${size} its directory gives`);
    out.set(name, file);
  }
  return out;
}

/** A file's text: UTF-8 when it is, else Windows-1252, as an older export writes it. */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * Each row of a CSV file, as the named columns only: `fn` gets one value a column, in the order
 * asked. Fields in double quotes may hold commas, line breaks and doubled quotes ("…""…"). Rows
 * are read one at a time and fields cut from the text, never built a character at a time: EPA's
 * case table is 95 MB. `separator` is the character between fields: a comma, or the "|" MSHA's
 * files use (batch 134).
 */
export function eachCsvRow(text: string, columns: readonly string[], fn: (values: string[]) => void, separator = ","): void {
  let i = 0;
  const n = text.length;
  const readRow = (): string[] | null => {
    if (i >= n) return null;
    const row: string[] = [];
    for (;;) {
      let value: string;
      if (text[i] === '"') {
        let j = i + 1;
        let parts = "";
        for (;;) {
          const q = text.indexOf('"', j);
          if (q < 0) {
            parts += text.slice(j);
            j = n;
            break;
          }
          parts += text.slice(j, q);
          if (text[q + 1] === '"') {
            parts += '"';
            j = q + 2;
          } else {
            j = q + 1;
            break;
          }
        }
        value = parts;
        i = j;
      } else {
        let j = i;
        while (j < n && text[j] !== separator && text[j] !== "\n" && text[j] !== "\r") j++;
        value = text.slice(i, j);
        i = j;
      }
      row.push(value);
      if (i >= n) return row;
      if (text[i] === separator) {
        i++;
        continue;
      }
      if (text[i] === "\r") i++;
      if (text[i] === "\n") i++;
      return row;
    }
  };
  const header = readRow();
  if (!header) return;
  const at = columns.map((c) => header.indexOf(c));
  const missing = columns.filter((_, k) => at[k] < 0);
  if (missing.length) throw new Error(`the table lacks ${missing.join(", ")}`);
  for (let row = readRow(); row; row = readRow()) {
    if (row.length === 1 && !row[0]) continue;
    fn(at.map((k) => row[k] ?? ""));
  }
}
