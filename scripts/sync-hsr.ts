import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { UA } from "../lib/contact";
import { DATA_COLUMNS, HSR_DATA, HSR_LIST, type HsrGrant, isGrantTitle, noticeLines, noticeText, numbersIn, readGrantNotice } from "../lib/hsrEarly";

/**
 * Writes `data/hsr-early-terminations.json.gz` (batch 166): every grant of early termination of the
 * Hart-Scott-Rodino waiting period the FTC's Federal Register notices list, 1994 on. One request for the
 * Federal Register API's list (`HSR_LIST`), then each grant notice the file does not hold yet from
 * govinfo (`noticeText`), one at a time, 1.5 s apart: about 440 notices the first time, about one a month
 * since, so it is run monthly. A notice whose text holds no transaction (four of 2005 are printed as
 * images) is kept as read, with none.
 *
 *   npm run sync:hsr                               # asks the API, then govinfo for new notices
 *   npm run sync:hsr -- --list <file> --dir <dir> --read <day>
 *                                                  # reads a saved list and saved copies, <doc>.htm each
 */
const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const listFile = arg("--list");
const dir = arg("--dir");
const readOn = arg("--read") ?? new Date().toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface NoticeRead {
  doc: string;
  published: string;
  transactions: number;
  /** transaction numbers the text holds that no table row gives (a notice of 2002 prints them with no parties) */
  unread: number;
}

async function text(doc: string, published: string): Promise<string | null> {
  if (dir) {
    const f = join(dir, `${doc}.htm`);
    return existsSync(f) ? readFileSync(f, "utf8") : null;
  }
  const res = await fetch(noticeText(published, doc), { headers: { ...UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`govinfo answered ${res.status} for ${doc}`);
  return res.text();
}

async function main(): Promise<void> {
  const list = listFile
    ? JSON.parse(readFileSync(listFile, "utf8"))
    : await (async () => {
        const res = await fetch(HSR_LIST, { headers: { ...UA, Accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
        if (!res.ok) throw new Error(`the Federal Register API answered ${res.status}`);
        return res.json();
      })();
  const notices = (list.results as { title: string; publication_date: string; document_number: string }[]).filter((r) => isGrantTitle(r.title));
  // the list of 2026-11-22 holds 441 grant notices; one that holds far fewer is broken
  if (notices.length < 430) throw new Error(`only ${notices.length} grant notices listed`);

  // what the committed file holds already is kept, and only a notice it does not hold is read
  const kept: { notices: NoticeRead[]; grants: HsrGrant[] } = { notices: [], grants: [] };
  if (!dir && existsSync(HSR_DATA)) {
    const body = JSON.parse(gunzipSync(readFileSync(HSR_DATA)).toString("utf8"));
    kept.notices = body.notices;
    const at = (k: string) => body.columns.indexOf(k);
    kept.grants = body.rows.map((r: unknown[]) => Object.fromEntries(DATA_COLUMNS.map((k) => [k, r[at(k)]])) as unknown as HsrGrant);
  }
  const have = new Set(kept.notices.map((n) => n.doc));
  const read: NoticeRead[] = [...kept.notices];
  const grants: HsrGrant[] = [...kept.grants];
  let asked = 0;
  for (const n of notices) {
    if (have.has(n.document_number)) continue;
    if (!dir && asked++) await sleep(1_500);
    const page = await text(n.document_number, n.publication_date);
    if (page === null) throw new Error(`no copy of ${n.document_number}`);
    const found = readGrantNotice(page, { doc: n.document_number, published: n.publication_date });
    const numbers = new Set(found.map((g) => g.number));
    read.push({ doc: n.document_number, published: n.publication_date, transactions: found.length, unread: numbersIn(noticeLines(page)).filter((x) => !numbers.has(x)).length });
    grants.push(...found);
  }
  read.sort((a, b) => a.published.localeCompare(b.published) || a.doc.localeCompare(b.doc));
  // a transaction two notices both print is one grant, the first notice's
  const seen = new Set<string>();
  const rows = grants
    .sort((a, b) => a.published.localeCompare(b.published) || a.notice.localeCompare(b.notice))
    .filter((g) => !seen.has(`${g.number}@${g.day}`) && !!seen.add(`${g.number}@${g.day}`));
  const about =
    "The FTC's and the Justice Department's grants of early termination of the Hart-Scott-Rodino waiting period, as the Federal Register's notices list them " +
    `(${HSR_LIST.split("?")[0]}, the grant notices; each notice's text from govinfo.gov): each transaction's number, the day the waiting period was ended, ` +
    "the acquiring person, the acquired person and the acquired entities as the notice writes them, and the notice's document number and publication day. " +
    "A grant whose notice prints no day for its group has none. The notices are the agencies' own work in the Federal Register, public domain; " +
    "credit the Federal Trade Commission. Written by `npm run sync:hsr` (batch 166) for lib/hsrEarly.ts.";
  const body = { about, read: readOn, notices: read, columns: DATA_COLUMNS, rows: rows.map((g) => DATA_COLUMNS.map((k) => g[k])) };
  writeFileSync(HSR_DATA, gzipSync(Buffer.from(`${JSON.stringify(body)}\n`), { level: 9 }));
  console.log(`${rows.length} grants from ${read.length} notices (${asked} read from govinfo now) → ${HSR_DATA}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
