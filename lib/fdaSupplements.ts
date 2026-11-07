import supplementsFile from "../data/fda-supplements.json";
import { APPROVALS, approvalIsCompany, drugsAtFdaUrl, type FdaApproval } from "./fdaApprovals";
import type { TimelineEvent } from "./types";

/**
 * The FDA's later approvals of the drugs batch 105 put on a page: each efficacy supplement it
 * approved, on the page of the company that held the drug that day (batch 115, the 2026-11-07
 * proposal 2, approved by the owner on 2026-11-07: "Approve all three, titles from the FDA's data").
 *
 * The source is Drugs@FDA as openFDA publishes it (`DRUGSFDA_FILE`): every application the FDA's
 * drug centre holds, with each submission's type, class, status, day, review and documents. Of it the
 * repository keeps, in `data/fda-supplements.json` (`npm run sync:fda-supplements`, monthly, or with
 * the compilation each spring), the approved efficacy supplements of the applications in batch 105's
 * compilation: class "EFFICACY", status "AP", on the day of that status.
 *
 * Licence: "unless otherwise noted, the content, data, documentation, code, and related materials on
 * openFDA is public domain and made available with a Creative Commons CC0 1.0 Universal dedication.
 * Under CC0, FDA has dedicated the work to the public domain by waiving all rights to the work
 * worldwide under copyright law, including all related and neighboring rights, to the extent allowed
 * by law. You can copy, modify, distribute and perform the work, even for commercial purposes, all
 * without asking permission." (open.fda.gov/license, "Data Licensing", last modified May 27, 2014,
 * read 2026-11-07.) The letters it links are FDA documents under the website policies batch 105
 * quoted; none is read or kept.
 *
 * Whose a supplement is. Drugs@FDA's sponsor is today's holder, and the day a drug changed hands is
 * in none of its fields. The compilation's applicant is the one the first approval letter named. A
 * supplement is a company's only where the holder never left it (`holderKept`), and then by batch
 * 105's rule unchanged, on the supplement's own day (`approvalIsCompany`), from the company's first
 * price:
 *  - today's sponsor is the applicant itself, by name (`sameName`): Keytruda's "Merck Sharp & Dohme"
 *    is "MERCK SHARP DOHME", Remicade's "Centocor" is "CENTOCOR";
 *  - or today's sponsor is a name of the company the supplement would go to, under its own names of
 *    any year or Drugs@FDA's short forms of them (`SPONSOR_SPELLINGS`): the applicant was the
 *    company's on the day, and the drug is the company's still. Celgene's Revlimid, "BRISTOL MYERS
 *    SQUIBB" today, is BMS's from Celgene's purchase on 2019-11-20; Celgene's own years are no
 *    page's.
 * A drug whose holder changed and whose day of change no field gives stays off every page: Humira
 * (Abbott's, AbbVie's since 2013), Lipitor (Parke-Davis's, Pfizer's), Merck's drugs now Organon's.
 * So do the moves inside one company that no name shows (Pfizer's held by PF Prism, Merck's by "MSD
 * SUB MERCK", J&J's by Janssen): the proposal left a hand list of those for later.
 *
 * What a supplement says. Drugs@FDA classes each one; "EFFICACY" is all it says of what it changed.
 * About 60% are new indications (12 letters read for the proposal), the rest new populations or
 * dosing and labelling. A row says "an efficacy supplement", the review and orphan mark the data
 * gives, and links the letter Drugs@FDA lists for it; it never says "new indication", which only the
 * letter can (the owner's call: titles from the data alone, no letter read).
 */
export const DRUGSFDA_FILE = "https://download.open.fda.gov/drug/drugsfda/drug-drugsfda-0001-of-0001.json.zip";
export const DRUGSFDA_ENTRY = "drug-drugsfda-0001-of-0001.json";
/** Where every letter lives; a letter is kept as its path below it and always asked at https. */
export const LETTERS = "https://www.accessdata.fda.gov/drugsatfda_docs/";

/** One approved efficacy supplement, as `data/fda-supplements.json` keeps it. */
export interface FdaSupplement {
  /** the supplement's number: "16" is S-016 */
  number: string;
  day: string;
  review: "priority" | "standard" | null;
  orphan: boolean;
  /** the letter's path below `LETTERS`, "appletter/2017/125514s016ltr.pdf", or null when none is listed */
  letter: string | null;
}

/** A compilation application's supplements and today's sponsor. */
export interface SupplementedApplication {
  /** "BLA125514", as the compilation writes its kind and number */
  application: string;
  /** Drugs@FDA's sponsor: today's holder */
  sponsor: string;
  supplements: FdaSupplement[];
}

// a letter is a PDF, or for some of the 1990s a page; its file name may hold spaces, commas and
// semicolons ("…s032; 210563Orig1s009ltr.pdf"), never a query, a fragment or a step up
const LETTER_PATH = /^https?:\/\/www\.accessdata\.fda\.gov\/drugsatfda_docs\/((?:[^?#\\/"<>\u0000-\u001f]+\/)*[^?#\\/"<>\u0000-\u001f]+\.(?:pdf|html?))$/i;
const ymd = (d: string) => (/^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null);

type RawDoc = { url?: string; date?: string; type?: string };
type RawSubmission = {
  submission_type?: string;
  submission_number?: string;
  submission_status?: string;
  submission_status_date?: string;
  review_priority?: string;
  submission_class_code?: string;
  submission_property_type?: { code?: string }[];
  application_docs?: RawDoc[];
};
type RawApplication = { application_number?: string; sponsor_name?: string; submissions?: RawSubmission[] };

/**
 * The letter Drugs@FDA lists for a supplement: the one whose file is the supplement's ("…s016ltr.pdf"),
 * else the first by day. Only a letter on the FDA's own document host is kept, as its path.
 */
function letterOf(docs: readonly RawDoc[], number: string): string | null {
  const letters = docs
    .filter((d) => d.type === "Letter")
    .map((d) => ({ path: LETTER_PATH.exec((d.url ?? "").trim())?.[1] ?? null, date: d.date ?? "" }))
    .map((d) => (d.path?.split("/").some((part) => part === ".." || part === ".") ? { ...d, path: null } : d))
    .filter((d): d is { path: string; date: string } => !!d.path)
    .sort((a, b) => a.date.localeCompare(b.date));
  const own = new RegExp(String.raw`s0*${Number(number)}(?!\d)`, "i");
  return (letters.find((d) => own.test(d.path.split("/").pop() ?? "")) ?? letters[0])?.path ?? null;
}

/**
 * Drugs@FDA's applications as the repository keeps them: the compilation's applications only, each
 * with its approved efficacy supplements, oldest first; an application with none is left out.
 */
export function readSupplements(results: readonly RawApplication[], approvals: readonly FdaApproval[] = APPROVALS): SupplementedApplication[] {
  const wanted = new Set(approvals.map((a) => `${a.kind}${a.application}`));
  const out: SupplementedApplication[] = [];
  for (const r of results) {
    const m = /^(NDA|BLA)0*(\d+)$/.exec(r.application_number ?? "");
    if (!m || !wanted.has(`${m[1]}${m[2]}`)) continue;
    const supplements: FdaSupplement[] = [];
    for (const s of r.submissions ?? []) {
      if (s.submission_type !== "SUPPL" || s.submission_class_code !== "EFFICACY" || s.submission_status !== "AP") continue;
      const day = ymd(s.submission_status_date ?? "");
      const number = /^\d+$/.test(s.submission_number ?? "") ? String(Number(s.submission_number)) : null;
      if (!day || !number) continue;
      const review = s.review_priority === "PRIORITY" ? "priority" : s.review_priority === "STANDARD" ? "standard" : null;
      supplements.push({ number, day, review, orphan: (s.submission_property_type ?? []).some((p) => p.code === "Orphan"), letter: letterOf(s.application_docs ?? [], number) });
    }
    if (!supplements.length) continue;
    supplements.sort((a, b) => a.day.localeCompare(b.day) || Number(a.number) - Number(b.number));
    out.push({ application: `${m[1]}${m[2]}`, sponsor: (r.sponsor_name ?? "").replace(/\s+/g, " ").trim(), supplements });
  }
  return out.sort((a, b) => a.application.localeCompare(b.application));
}

/** The supplements the repository keeps. */
export const SUPPLEMENTED: readonly SupplementedApplication[] = (supplementsFile as unknown as { applications: SupplementedApplication[] }).applications;

/** Legal forms, in any country's spelling. */
const LEGAL = new Set(
  "inc incorporated corp corporation co cos company companies llc lp llp ltd limited plc ag sa nv bv bvba gmbh kg kgaa kk spa srl sl sas sarl as asa ab oy oyj se dac pte pty cv the and of for a an".split(" "),
);
/**
 * Words that say what kind of company, or where, and Drugs@FDA's shortenings of them: "NOVARTIS
 * PHARMS CORP" is "Novartis Pharmaceuticals Corporation", "BAYER HLTHCARE" "Bayer HealthCare".
 */
const KIND = new Set(
  (
    "pharma pharmas pharms pharm pharmaceutical pharmaceuticals pharmaceutica pharmacueticals biopharma biopharm biopharms biopharmaceutical biopharmaceuticals " +
    "radiopharma radiopharms radiopharmaceutical radiopharmaceuticals labs lab laboratories laboratory laboratoire laboratoires healthcare hlthcare health hlth " +
    "products product prods therapeutics therapeutic theraps therap therapies biotech biotechnology biologics bio sciences science sci bioscience biosciences " +
    "medical medcl clinical clincl medicines research res development dev institute inst diagnostics diagnostic oncology oncol center division div " +
    "worldwide global international intl america americas usa us uk ireland europe canada japan north"
  ).split(" "),
);

/** A name's own words: legal forms, kinds and places, punctuation and accents left out. */
export function nameWords(name: string): Set<string> {
  const plain = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    // "U.S.A." is "usa", "A/S" "as", "Reddy's" "reddys"
    .replace(/[./'’]/g, "")
    .replace(/[^a-z0-9]+/g, " ");
  return new Set(plain.split(" ").filter((w) => w && !LEGAL.has(w) && !KIND.has(w)));
}

/** Whether two names are one, by their own words: "Novartis Pharmaceuticals Corporation" and "NOVARTIS". */
export function sameName(a: string, b: string): boolean {
  const x = nameWords(a);
  const y = nameWords(b);
  return x.size > 0 && x.size === y.size && [...x].every((w) => y.has(w));
}

/**
 * Drugs@FDA's own short forms of a company's name, which no rule of words can read, by CIK, read by
 * hand against every sponsor of a compilation application whose applicant is on a page (2026-11-07).
 */
export const SPONSOR_SPELLINGS: Readonly<Record<number, { ticker: string; sponsor: RegExp; why: string }[]>> = {
  59478: [{ ticker: "LLY", sponsor: /^LILLY$/, why: "Eli Lilly and Company: Drugs@FDA writes it \"LILLY\" on 116 applications, \"ELI LILLY AND CO\" on the rest" }],
  353278: [{ ticker: "NVO", sponsor: /^NOVO$/, why: "Novo Nordisk: Drugs@FDA writes it \"NOVO\" on 10 applications, Ozempic, Wegovy and Tresiba among them, \"NOVO NORDISK INC\" on 18" }],
  14272: [
    {
      ticker: "BMY",
      sponsor: /^BRISTOL(?:[- ]MYERS)?$/,
      why: "Bristol-Myers Squibb Company: Drugs@FDA writes it \"BRISTOL\" (36 applications), \"BRISTOL-MYERS\" (6) and \"BRISTOL MYERS\" (6) as well as in full",
    },
  ],
};

/**
 * Whether an application's holder never left the company: today's sponsor is the applicant by name,
 * or a name the company held in any year (`namesEver`), or Drugs@FDA's short form of one.
 */
export function holderKept(applicant: string, sponsor: string, cik: number, namesEver: readonly string[]): boolean {
  if (sameName(applicant, sponsor)) return true;
  if (SPONSOR_SPELLINGS[cik]?.some((s) => s.sponsor.test(sponsor))) return true;
  return namesEver.some((n) => sameName(n, sponsor));
}

/** The company's names in every year from 1985, the compilation's first, to now. */
export function namesEverOf(namesIn: (year: number) => string[], now = new Date().getUTCFullYear()): string[] {
  const all = new Set<string>();
  for (let y = 1985; y <= now; y++) for (const n of namesIn(y)) all.add(n);
  return [...all];
}

const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDay = (day: string) => `${MONTH[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}, ${day.slice(0, 4)}`;

/** "FDA approves an efficacy supplement to Keytruda (pembrolizumab)" */
export function supplementTitle(a: FdaApproval): string {
  return a.name ? `FDA approves an efficacy supplement to ${a.name} (${a.ingredient})` : `FDA approves an efficacy supplement to ${a.ingredient}`;
}

/** A path's part as written, its escapes read: Drugs@FDA writes some already encoded ("s015,%20s016"). */
function unescaped(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    // a "%" that begins no escape is a character of the name
    return part;
  }
}

/**
 * The letter's address, always at https: the file links about three in four at http://. Each part is
 * encoded once, from its plain form, as Drugs@FDA lists it (a comma or semicolon as it is, a space as
 * "%20"), so a path Drugs@FDA already encoded is not encoded twice
 * (batch 116, the audit's finding 4: Retevmo's letter of 2025 linked "%2520" and answered 404).
 */
export const letterUrl = (path: string) => `${LETTERS}${path.split("/").map((part) => encodePart(unescaped(part))).join("/")}`;

/** A path's part as an address writes it: what a path may hold as it is (RFC 3986's pchar), the rest escaped. */
const encodePart = (part: string) => encodeURIComponent(part).replace(/%(?:21|24|26|27|28|29|2A|2B|2C|3B|3D|3A|40)/g, (e) => decodeURIComponent(e));

const approvalOf = new Map(APPROVALS.map((a) => [`${a.kind}${a.application}`, a]));

/**
 * The company's supplements as timeline events, newest first, from `from`, its first price. One row a
 * supplement, on its approval day, linked to its letter, or to Drugs@FDA where none is listed.
 */
export function supplementEvents(
  applications: readonly SupplementedApplication[],
  namesIn: (year: number) => string[],
  { cik, from = "", approvals = approvalOf }: { cik: number | string; from?: string; approvals?: ReadonlyMap<string, FdaApproval> },
): TimelineEvent[] {
  const tag = Number(cik);
  const ever = namesEverOf(namesIn);
  const out: TimelineEvent[] = [];
  for (const app of applications) {
    const a = approvals.get(app.application);
    if (!a || !holderKept(a.applicant, app.sponsor, tag, ever)) continue;
    for (const s of app.supplements) {
      // batch 105's rule, on the supplement's day: the applicant was the company, its firm or its unit then
      if (s.day < from || !approvalIsCompany({ ...a, day: s.day }, tag, namesIn)) continue;
      const how = [s.review ? `${s.review} review` : null, s.orphan ? "an orphan drug" : null].filter(Boolean).join("; ");
      const ref = `${a.kind}${a.application}-S${s.number}`;
      out.push({
        id: `fda-supplement-${tag}-${ref}`,
        date: s.day,
        type: "regulation",
        title: supplementTitle(a),
        description:
          `Supplement ${s.number} to ${a.applicant}'s ${a.kind} ${a.application}, approved ${longDay(s.day)}${how ? ` (${how})` : ""}. ` +
          (s.letter ? "Drugs@FDA classes it as an efficacy supplement; the letter it lists, linked, says what it provides." : "Drugs@FDA classes it as an efficacy supplement and lists no letter for it."),
        source: "FDA",
        url: s.letter ? letterUrl(s.letter) : drugsAtFdaUrl(a.application),
        sourceKey: "fda_supplements",
        externalId: ref,
        dedupBasis: `fda-supplement:${tag}@${ref}`,
      });
    }
  }
  return out.sort((x, y) => y.date.localeCompare(x.date) || (x.externalId ?? "").localeCompare(y.externalId ?? ""));
}
