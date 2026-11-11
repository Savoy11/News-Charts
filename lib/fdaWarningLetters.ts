import type { TimelineEvent } from "./types";
import { UA } from "./contact";
import { approvalIsCompany } from "./fdaApprovals";

/**
 * The FDA's warning letters, 2021 on (batch 140, the 2026-11-11 proposal 2, approved by the owner on
 * 2026-11-11): the agency's own letter to a company setting out what it found, published on a page of
 * its own, often after an inspection.
 *
 * Public domain. The FDA's website policies (www.fda.gov/about-fda/about-website/website-policies,
 * read 2026-11-11): "Unless otherwise noted, the contents of the FDA website (www.fda.gov) — both text
 * and graphics — are not copyrighted. They are in the public domain and may be republished, reprinted
 * and otherwise used freely by anyone without the need to obtain permission from FDA. Credit to the
 * U.S. Food and Drug Administration as the source is appreciated but not required." No key.
 *
 * Read from the warning-letter list (`LETTERS_PAGE`) through the data its own table loads, 1,000 letters
 * a request ordered by the letter's issue day, once a week for every company
 * (`lib/ingest/fdaWarningWalk.ts`). Its "Data export" spreadsheet gives no link to a letter, so it is
 * not read; a request for 5,000 was refused (503, measured 2026-11-11). The list is read
 * twice, oldest first and newest first: letters of one day have no order of their own, so a day that
 * straddles a page's edge is cut differently by two requests, and one direction alone lost 12 of the
 * letters of 2025-09-09, Royal Philips's among them, giving 12 others twice (measured 2026-11-11). The
 * two directions' edges fall on different days, and together they gave all 3,807. The list begins in
 * 2021: older letters sit behind the FDA Data Dashboard's API, whose credentials need a registration,
 * and are not read. A read is kept only when every page of both directions answered, each direction's
 * rows add up to the list's own total, and the two together hold every letter it counts.
 *
 * A letter is the company's when its addressee is, on the letter's issue day, by the rule the FDA's
 * approvals use (`approvalIsCompany`: the caption rule under the year's names, the recall map's firms,
 * the applicant names, the table of taken names), or by `LETTER_NAMES`, the addressees that rule cannot
 * read, each read by hand; from the company's first price. A company's letters of one day are one row,
 * on that day, linked to the first letter's page, and say who issued each, when the FDA posted it and
 * when it sent a close-out letter. The letter is the agency's account, not a court's finding.
 */

export const LETTERS_PAGE = "https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/compliance-actions-and-activities/warning-letters";
export const PAGE_SIZE = 1000;
/** At most this many pages a direction: the list held 3,807 letters on 2026-11-11, four pages. */
export const MAX_PAGES = 12;
/** The pause between two requests. */
export const GAP_MS = 1_000;
const TIMEOUT_MS = 60_000;

export type Direction = "asc" | "desc";

/** One page of the list as its table asks for it, by issue day, oldest or newest first. */
export const lettersUrl = (start: number, direction: Direction = "asc") =>
  `https://www.fda.gov/datatables/views/ajax?view_name=warning_letter_solr_index&view_display_id=warning_letter_solr_block&draw=1&start=${start}&length=${PAGE_SIZE}` +
  `&search%5Bvalue%5D=&order%5B0%5D%5Bcolumn%5D=1&order%5B0%5D%5Bdir%5D=${direction}`;

export interface WarningLetter {
  /** The letter's page on www.fda.gov, from the list's own link: "/inspections-…/warning-letters/eli-lilly-and-company-716485-09092025". */
  path: string;
  /** The addressee as the FDA writes it. */
  company: string;
  /** The day the letter was issued, and the day the FDA posted it (YYYY-MM-DD). */
  issued: string;
  posted: string;
  office: string;
  subject: string;
  /**
   * The days of the company's response and of the FDA's close-out letter, where the list gives them, each
   * read from its own page's name; null where the list gives none, or a page name with no day.
   */
  response: string | null;
  closeout: string | null;
}

/** A letter's page path must be one of www.fda.gov's warning-letter pages: nothing else is linked. */
const LETTER_PATH = /^\/inspections-compliance-enforcement-and-criminal-investigations\/warning-letters\/[a-z0-9-]+$/;

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m);
/** A cell's text: its markup off, its entities read, its spacing tidied. */
const textOf = (html: string) => decode(html.replace(/<[^>]*>/g, " ")).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
/** A cell's day, as its visible "MM/DD/YYYY" gives it; "" for none. */
const dayOf = (html: string) => {
  const m = /\b(\d{2})\/(\d{2})\/(\d{4})\b/.exec(textOf(html));
  return m ? `${m[3]}-${m[1]}-${m[2]}` : "";
};
const hrefOf = (html: string) => /href="([^"]+)"/.exec(html)?.[1] ?? "";
/**
 * A follow-up letter's own day, from the end of its page's name ("…-720527-06162026"), as every letter's
 * page name ends with its issue day; "" for none. The cell's visible day is the day the FDA posted it,
 * 1 to 1,407 days later (batch 142, the 2026-11-11 audit's finding 2).
 */
const letterDayOf = (html: string) => {
  const m = /-(\d{2})(\d{2})(\d{4})(?:-\d+)?$/.exec(hrefOf(html));
  if (!m) return "";
  const iso = `${m[3]}-${m[1]}-${m[2]}`;
  const t = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso ? "" : iso;
};

/** One answer of the list: its total, its rows and its letters, the rows it cannot read left out. */
export function parseLetters(json: unknown): { total: number; rows: number; letters: WarningLetter[] } {
  const j = json as { recordsTotal?: unknown; data?: unknown };
  if (!j || typeof j.recordsTotal !== "number" || !Array.isArray(j.data)) throw new Error("not the FDA's warning-letter list");
  const letters: WarningLetter[] = [];
  for (const row of j.data as unknown[]) {
    if (!Array.isArray(row) || row.length < 7) throw new Error("a row of the list without its seven columns");
    const [posted, issued, company, office, subject, response, closeout] = row.map((c) => String(c ?? ""));
    const letter: WarningLetter = {
      path: hrefOf(company),
      company: textOf(company),
      issued: dayOf(issued),
      posted: dayOf(posted),
      office: textOf(office),
      subject: textOf(subject),
      response: letterDayOf(response) || null,
      closeout: letterDayOf(closeout) || null,
    };
    if (LETTER_PATH.test(letter.path) && letter.company && letter.issued) letters.push(letter);
  }
  return { total: j.recordsTotal, rows: j.data.length, letters };
}

export interface LettersAnswer {
  letters: WarningLetter[];
  /** The list's own count, and the pages asked in both directions. */
  total: number;
  pages: number;
  outcome: "ok" | "throttled" | "error";
  httpStatus?: number;
  detail?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The whole list, read oldest first and then newest first, and the two put together by letter; refused
 * whole unless every page answers, each direction's rows come to the list's total, and the two hold
 * every letter it counts but the rows no reader could read.
 */
export async function fetchLetters({ gapMs = GAP_MS }: { gapMs?: number } = {}): Promise<LettersAnswer> {
  let total = -1;
  let pages = 0;
  const refused = (outcome: "throttled" | "error", detail: string, httpStatus?: number): LettersAnswer => ({ letters: [], total, pages, outcome, httpStatus, detail });
  const read = async (direction: Direction): Promise<{ letters: WarningLetter[]; skipped: number } | LettersAnswer> => {
    const letters: WarningLetter[] = [];
    let rows = 0;
    let skipped = 0;
    for (let start = 0, asked = 0; total < 0 || start < total; start += PAGE_SIZE) {
      if (++asked > MAX_PAGES) return refused("error", `the list holds more than ${MAX_PAGES} pages`);
      if (gapMs && pages) await sleep(gapMs);
      pages++;
      const res = await fetch(lettersUrl(start, direction), { headers: { ...UA, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) return refused(res.status === 429 || res.status === 503 ? "throttled" : "error", `the ${direction === "asc" ? "oldest-first" : "newest-first"} page from ${start}`, res.status);
      const got = parseLetters(await res.json());
      if (total >= 0 && got.total !== total) return refused("error", `the list's total moved from ${total} to ${got.total} during the read`, res.status);
      total = got.total;
      rows += got.rows;
      skipped += got.rows - got.letters.length;
      letters.push(...got.letters);
      if (got.rows === 0) break;
    }
    if (rows !== total) return refused("error", `${rows} rows read ${direction === "asc" ? "oldest first" : "newest first"} of the ${total} the list gives`, 200);
    return { letters, skipped };
  };
  try {
    const older = await read("asc");
    if ("outcome" in older) return older;
    const newer = await read("desc");
    if ("outcome" in newer) return newer;
    const letters = new Map<string, WarningLetter>();
    for (const l of [...older.letters, ...newer.letters]) letters.set(l.path, l);
    if (!letters.size) return refused("error", "the list held no letter", 200);
    // a day's letters cut differently at a page's edge in both directions would leave some unread
    if (letters.size + Math.max(older.skipped, newer.skipped) < total) {
      return refused("error", `${letters.size} letters read in both directions of the ${total} the list gives`, 200);
    }
    return { letters: [...letters.values()].sort((a, b) => a.issued.localeCompare(b.issued) || a.path.localeCompare(b.path)), total, pages, outcome: "ok", httpStatus: 200 };
  } catch (err) {
    return refused("error", String(err).slice(0, 200));
  }
}

/**
 * The addressees the approvals' rule cannot read, by CIK, each read by hand on the list of 2026-11-11:
 * the company under a spelling that rule refuses, or a unit named after it, or one it bought, from the
 * day the filings give.
 */
export const LETTER_NAMES: Readonly<Record<number, { ticker: string; names: readonly { addressee: RegExp; from?: string; to?: string; why: string }[] }>> = {
  1018724: { ticker: "AMZN", names: [{ addressee: /^Amazon\.com,? Inc\.?$/i, why: "the company itself: its legal name holds \".com\", which the caption rule reads as no legal word" }] },
  1773751: { ticker: "HIMS", names: [{ addressee: /^Hims & Hers Health, Inc\.?\s+(?:dba|d\/b\/a)\s/i, why: "the company itself, doing business as Hims or Hers: a trade name after its legal one" }] },
  80424: { ticker: "PG", names: [{ addressee: /^Procter & Gamble Manufactura\b/i, why: "P&G's Mexican manufacturing company, named after it" }] },
  21665: { ticker: "CL", names: [{ addressee: /^Colgate-Palmolive\s*\//i, why: "Colgate-Palmolive with Tom's of Maine, its company since 2006, as one addressee" }] },
  920148: { ticker: "LH", names: [{ addressee: /\bLabcorp Bedford\b/i, why: "Labcorp's Bedford laboratory, named after it (the former Toxikon)" }] },
  866374: { ticker: "FLEX", names: [{ addressee: /^Flextronics America\b/i, why: "Flex's American company, named after the record's own former name, Flextronics International" }] },
  1739104: { ticker: "ELAN", names: [{ addressee: /^Elanco Animal Health USA\b/i, why: "Elanco's American company, named after it" }] },
  849869: { ticker: "SLGN", names: [{ addressee: /^Silgan Dispensing Systems\b/i, why: "Silgan's dispensing business, named after it" }] },
  1816708: { ticker: "OWLT", names: [{ addressee: /^Owlet Baby Care\b/i, why: "Owlet's operating company, named after it" }] },
  // batch 142, the 2026-11-11 audit's finding 3: four more, each read on the list and the filings
  1420798: { ticker: "RBGLY", names: [{ addressee: /^Reckitt\s*\/\s*Mead Johnson\b/i, why: "Reckitt itself with Mead Johnson Nutrition, its infant-formula company, as one addressee" }] },
  7084: { ticker: "ADM", names: [{ addressee: /^ADM Animal Nutrition\b/i, why: "ADM's animal-feed business, named after it" }] },
  884624: {
    ticker: "OFIX",
    names: [
      {
        addressee: /^IsoTis OrthoBiologics\b/i,
        from: "2023-01-05",
        why: "SeaSpine's orthobiologics company, Orthofix's from their merger: Orthofix's 8-K 0001193125-23-001900 of 2023-01-05, and its subsidiaries in every 10-K since",
      },
    ],
  },
  353278: {
    ticker: "NVO",
    names: [
      {
        addressee: /^Catalent Indiana\b/i,
        from: "2024-12-18",
        why: "the Bloomington plant Novo Nordisk bought with two other Catalent sites: its 6-K 0001171843-24-006991 of 2024-12-18, the day the deal closed, and its 20-F for 2024, whose list of companies holds Catalent Indiana",
      },
    ],
  },
  823277: { ticker: "CHSCP", names: [{ addressee: /^CHS Inc\.?\s*\//i, why: "CHS itself with one of its plants as one addressee (CHS River Plains)" }] },
  51253: {
    ticker: "IFF",
    names: [
      {
        addressee: /^DuPont Nutrition\b/i,
        from: "2021-02-01",
        why: "DuPont's Nutrition & Biosciences, IFF's from their merger: IFF's 8-K 0001193125-21-027533 (items 1.01 and 2.01, report date 2021-02-01); DuPont's own past is not IFF's",
      },
    ],
  },
};

/** Whether a letter is the company's on its issue day: by the approvals' rule, or by `LETTER_NAMES`. */
export function letterIsCompany(l: Pick<WarningLetter, "company" | "issued">, cik: number | string, namesIn: (year: number) => string[]): boolean {
  if (approvalIsCompany({ applicant: l.company, day: l.issued }, Number(cik), namesIn)) return true;
  return (LETTER_NAMES[Number(cik)]?.names ?? []).some((n) => n.addressee.test(l.company) && (!n.from || l.issued >= n.from) && (!n.to || l.issued <= n.to));
}

const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDay = (day: string) => `${MONTH[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}, ${day.slice(0, 4)}`;
/** A text cut to `room` characters at a word and marked "…", or whole when it fits. */
const cutAt = (text: string, room: number) => (text.length > room ? `${text.slice(0, room - 1).replace(/\s+\S*$/, "").replace(/[\s;,·]+$/, "")}…` : text);
const LIMIT = 600;

/**
 * The company's letters as timeline events, newest first, from `from`, its first price: one row a day,
 * "FDA warning letter: CGMP/QSR/Medical Devices/Adulterated", linked to the day's first letter.
 */
export function warningLetterEvents(letters: readonly WarningLetter[], namesIn: (year: number) => string[], { cik, from = "" }: { cik: number | string; from?: string }): TimelineEvent[] {
  const tag = Number(cik);
  const byDay = new Map<string, WarningLetter[]>();
  for (const l of letters) {
    if (l.issued < from || !letterIsCompany(l, tag, namesIn)) continue;
    byDay.set(l.issued, [...(byDay.get(l.issued) ?? []), l]);
  }
  const events: TimelineEvent[] = [];
  for (const [day, all] of byDay) {
    const day_ = [...all].sort((a, b) => a.path.localeCompare(b.path));
    const subjects = [...new Set(day_.map((l) => l.subject).filter(Boolean))];
    const title = day_.length === 1 ? `FDA warning letter: ${subjects[0] ?? "a letter"}` : `${day_.length} FDA warning letters: ${subjects.join("; ")}`;
    const each = day_.map(
      (l) =>
        `To ${l.company}${l.office ? `, from ${l.office}` : ""}${l.posted && l.posted !== l.issued ? `; posted ${longDay(l.posted)}` : ""}${l.closeout ? `; close-out letter ${longDay(l.closeout)}` : ""}`,
    );
    const head = `The FDA's warning letter${day_.length > 1 ? "s" : ""} of ${longDay(day)}: `;
    const tail = " The letter is the FDA's own account of what it found; the company's answer and any close-out follow on its page.";
    events.push({
      id: `fda-wl-${tag}-${day}`,
      date: day,
      type: "regulation",
      title: cutAt(title, 200),
      description: `${head}${cutAt(`${each.join(" · ")}.`, LIMIT - head.length - tail.length)}${tail}`,
      source: "FDA",
      url: `https://www.fda.gov${day_[0].path}`,
      sourceKey: "fda_warning_letters",
      externalId: day_.map((l) => l.path.slice(l.path.lastIndexOf("/") + 1)).join(","),
      dedupBasis: `fdawl:${tag}@${day}`,
    });
  }
  return events.sort((a, b) => b.date.localeCompare(a.date));
}
