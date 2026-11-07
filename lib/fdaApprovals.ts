import approvalsFile from "../data/fda-nme-approvals.json";
import { FDA_FIRMS, firmFor, type FdaFirm } from "./fdaRecalls";
import { captionParty } from "./secCases";
import type { TimelineEvent } from "./types";
import { excelDay, readSheet } from "./xlsx";

/**
 * The FDA's new-drug approvals since 1985, on the page of the company that applied (batch 105, the
 * 2026-11-06 proposal 1, approved by the owner on 2026-11-06).
 *
 * The source is CDER's *Compilation of New Molecular Entity (NME) Drug and New Biologic Approvals*
 * (`NME_PAGE`), one workbook of every new drug and new therapeutic biologic it approved from 1985,
 * kept in the repository as `data/fda-nme-approvals.json` (`npm run sync:fda-approvals`, once a
 * year: the FDA adds a year's approvals in the spring). Its applicant is the one the approval letter
 * names, as the file's data dictionary says, so Lipitor (1996) is Parke-Davis's and Humira (2002)
 * Abbott's, not today's holders'.
 *
 * Licence: "Unless otherwise noted, the contents of the FDA website (www.fda.gov) — both text and
 * graphics — are not copyrighted. They are in the public domain and may be republished, reprinted
 * and otherwise used freely by anyone without the need to obtain permission from FDA. Credit to the
 * U.S. Food and Drug Administration as the source is appreciated but not required."
 * (www.fda.gov/about-fda/about-website/website-policies, read 2026-11-06.)
 *
 * An approval is a company's when its applicant is, on the approval's day, under one of three rules,
 * and from the company's first price:
 *  - the caption rule (`captionParty`): the applicant is the company's name, or its legal name with
 *    legal words after it, under the names it had that year;
 *  - the FDA recall map's hand-checked firms, each on its days (`FDA_FIRMS` in lib/fdaRecalls.ts);
 *  - the names only approvals use (`APPLICANT_NAMES`): a company's own other names and the units it
 *    bought, each from the day it bought them, as the bought company's own filings give it.
 * An acquisition's past is never the buyer's: Parke-Davis's Lipitor of 1996 is no page's.
 */
export const NME_PAGE =
  "https://www.fda.gov/drugs/drug-approvals-and-databases/compilation-cder-new-molecular-entity-nme-drug-and-new-biologic-approvals";
export const NME_FILE = "https://www.fda.gov/media/177921/download?attachment";

/** One approval, as `data/fda-nme-approvals.json` keeps it. */
export interface FdaApproval {
  day: string;
  name: string;
  ingredient: string;
  applicant: string;
  kind: "NDA" | "BLA";
  application: string;
  indication: string;
  priority: boolean;
  orphan: boolean;
}

const NO_NAME = /^\[?drug marketed without a proprietary name\]?$/i;

/** The workbook's rows as approvals; a row without a readable approval day or application is refused. */
export function parseApprovals(rows: readonly Record<string, string>[]): FdaApproval[] {
  const out: FdaApproval[] = [];
  for (const r of rows) {
    const day = excelDay(r["FDA Approval Date"] ?? "");
    const application = (r["Application Number(1)"] ?? "").replace(/\D/g, "");
    const kind = (r["NDA/BLA"] ?? "").trim().toUpperCase();
    if (!day || !application || (kind !== "NDA" && kind !== "BLA")) continue;
    const name = (r["Proprietary Name"] ?? "").trim();
    out.push({
      day,
      name: NO_NAME.test(name) ? "" : name,
      ingredient: (r["Active Ingredient/Moiety"] ?? "").replace(/\s+/g, " ").trim(),
      applicant: (r["Applicant"] ?? "").replace(/\s+/g, " ").trim(),
      kind,
      application,
      indication: (r["Abbreviated Indication(s)"] || r["Approved Use(s)"] || "").replace(/\s+/g, " ").trim().slice(0, 400),
      priority: /^priority/i.test(r["Review Designation"] ?? ""),
      orphan: /^yes/i.test(r["Orphan Drug Designation"] ?? ""),
    });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.application.localeCompare(b.application));
}

/** The committed workbook's approvals. */
export const readApprovals = (workbook: Uint8Array) => parseApprovals(readSheet(workbook));

/** The approvals the repository keeps. */
export const APPROVALS: readonly FdaApproval[] = (approvalsFile as unknown as { approvals: FdaApproval[] }).approvals;

/**
 * The names only an approval uses, by CIK, read by hand against the compilation's 681 applicant
 * names (batch 105; Alexion, Anacor, Bioverativ, Ablynx and Jazz's Irish company, batch 107). Each
 * day is read from the bought company's EDGAR filing list (data.sec.gov, 2026-11-06 and 2026-11-07):
 * the day its deal closed, its listing ended or control passed.
 */
export const APPLICANT_NAMES: Readonly<Record<number, { ticker: string; names: readonly FdaFirm[] }>> = {
  901832: {
    ticker: "AZN",
    names: [
      { search: "AstraZeneca", match: /^AstraZeneca\b/i, why: "the company and its units (AstraZeneca Pharmaceuticals LP, AstraZeneca AB)" },
      { search: "Zeneca", match: /^Zeneca\b/i, why: "the company's record under its own earlier name, ZENECA GROUP PLC, before the 1999 merger with Astra" },
      {
        search: "Alexion Pharmaceuticals",
        from: "2021-07-21",
        why: "bought 2021-07-21 (Alexion's Form 25 of that day, and its 8-K of the merger, items 2.01 and 5.01, reporting it; batch 107)",
      },
    ],
  },
  59478: {
    ticker: "LLY",
    names: [
      { search: "Lilly", match: /^Lilly\b(?!\s+ICOS\b)/i, why: "the company, as the file writes it in 1995–1997; Lilly ICOS (Cialis, 2003) was a joint venture with ICOS, no owner's alone" },
      { search: "Loxo Oncology", from: "2019-02-15", why: "bought 2019-02-15 (Loxo's 8-K of that day, items 2.01 and 5.01)" },
    ],
  },
  14272: {
    ticker: "BMY",
    names: [
      { search: "Bristol-Myers", match: /^Bristol[- ]?Myers\b/i, why: "the company, under its name before the Squibb merger (Bristol-Myers Company) and after" },
      {
        search: "Squibb",
        match: /^(?:E\.?\s*R\.?\s+)?Squibb\b/i,
        from: "1990-01-01",
        why: "Squibb, the company's since the merger of October 1989, before EDGAR: from 1990, the first year surely after it; the file's Squibb rows since are of 1990 and 1992",
      },
      { search: "Celgene", from: "2019-11-20", why: "bought 2019-11-20 (Celgene's 8-K and Form 25 of that day)" },
    ],
  },
  200406: {
    ticker: "JNJ",
    names: [
      { search: "Ortho", match: /^Ortho\b(?!\s+Clinical)/i, why: "Ortho Pharmaceutical, the company's since 1931, and Ortho Biotech" },
      { search: "RW Johnson", match: /^R\.?\s?W\.?\s+Johnson\b/i, why: "the R.W. Johnson Pharmaceutical Research Institute, the company's" },
      { search: "McNeil", match: /^McNeil\b/i, why: "McNeil Laboratories and McNeil Pharmaceutical, the company's" },
      { search: "Centocor", from: "1999-10-13", why: "bought in October 1999: from Centocor's Form 15 of 1999-10-13, which ends its own record" },
      {
        search: "Tibotec",
        from: "2003-01-01",
        why: "bought in 2002, a private company with no EDGAR record: from 2003, the first year surely after; the file's Tibotec rows are of 2006–2011",
      },
    ],
  },
  1395064: {
    ticker: "TAK",
    names: [
      { search: "Takeda", match: /^Takeda\b/i, why: "the company and its US company" },
      { search: "Millennium Pharmaceuticals", from: "2008-05-14", why: "bought 2008-05-14 (Millennium's 8-K, Form 15 and Form 25 of that day)" },
      { search: "Ariad", from: "2017-02-16", why: "bought 2017-02-16 (Ariad's 8-K of that day, items 2.01 and 5.01)" },
    ],
  },
  78003: {
    ticker: "PFE",
    names: [
      { search: "Wyeth", from: "2009-10-15", why: "bought 2009-10-15 (Wyeth's 8-K of that day, item 5.01)" },
      {
        search: "Anacor",
        match: /^Anacor\b/i,
        from: "2016-06-24",
        why: "bought 2016-06-24 (Anacor's 8-K of that day, items 2.01 and 5.01); the file writes Eucrisa's applicant \"Anacor Pharmacueticals\" (batch 107)",
      },
    ],
  },
  1121404: {
    ticker: "SNY",
    names: [
      { search: "Bioverativ", from: "2018-03-08", why: "bought 2018-03-08 (Bioverativ's 8-K of that day, items 2.01 and 5.01; batch 107)" },
      {
        search: "Ablynx",
        from: "2018-06-12",
        why: "bought in 2018 by a tender offer: from Ablynx's Form 25 of 2018-06-12, which ends its listing, a day surely after control passed (Sanofi's 13D of 2018-05-25; batch 107)",
      },
    ],
  },
  1232524: {
    ticker: "JAZZ",
    names: [
      {
        search: "Jazz Pharmaceuticals Ireland",
        match: /^Jazz Pharmaceuticals Ireland\b/i,
        why: "the company's Irish company, the applicant of Rylaze (2021) and Ziihera (2024); \"Ireland Limited\" is not legal words alone, so the caption rule refuses it (batch 107)",
      },
    ],
  },
  1114448: {
    ticker: "NVS",
    names: [
      { search: "Ciba Vision", match: /^Ciba Vision\b/i, from: "1996-12-20", why: "Novartis's eye-care company from the merger that formed Novartis; Ciba-Geigy's past is not its" },
      {
        search: "Advanced Accelerator Applications",
        from: "2018-01-22",
        why: "bought 2018-01-22, when Novartis's tender offer closed (AAA's 6-K and the offer's amendment of that day)",
      },
    ],
  },
  1131399: {
    ticker: "GSK",
    names: [{ search: "Human Genome Sciences", from: "2012-08-02", why: "bought 2012-08-02 (HGS's 8-K of the merger, items 2.01 and 5.01)" }],
  },
  875045: {
    ticker: "BIIB",
    names: [{ search: "Biogen", match: /^Biogen\b/i, why: "the company, Biogen Idec from 2003 to 2015" }],
  },
};

/**
 * Applicants a rule would give a company that are not its, by CIK, read by hand: a name it shares or
 * a past no record of its holds.
 */
export const NOT_THE_APPLICANT: Readonly<Record<number, { ticker: string; applicant: RegExp; why: string }[]>> = {
  1666700: [
    {
      ticker: "DD",
      applicant: /^Du ?Pont\b/i,
      why: "E. I. du Pont de Nemours's pharmaceuticals of 1986–2001; its record went with Corteva, and DD's is DowDuPont's of 2015",
    },
  ],
  1512673: [{ ticker: "XYZ", applicant: /^Block\b/i, why: "Block Drug Company (Actinex, 1992), not Block, Inc." }],
  310158: [{ ticker: "MRK", applicant: /\b(?:Du ?Pont|Astra)\s+Merck\b/i, why: "DuPont Merck and Astra Merck, joint ventures, no owner's alone" }],
};

/** The firms and names that make an applicant the company's on a day, its own refused names aside. */
function whoseOn(cik: number): readonly FdaFirm[] {
  return [...(FDA_FIRMS[cik]?.firms ?? []), ...(APPLICANT_NAMES[cik]?.names ?? [])];
}

/** Whether an approval's applicant is the company on its day, by one of the three rules. */
export function approvalIsCompany(a: FdaApproval, cik: number, namesIn: (year: number) => string[]): boolean {
  if (NOT_THE_APPLICANT[cik]?.some((r) => r.applicant.test(a.applicant))) return false;
  if (firmFor(a.applicant, a.day, whoseOn(cik))) return true;
  return captionParty(a.applicant, namesIn(Number(a.day.slice(0, 4)))) !== null;
}

/** Drugs@FDA's page for an application. */
export const drugsAtFdaUrl = (application: string) =>
  `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${application.padStart(6, "0")}`;

const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDay = (day: string) => `${MONTH[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}, ${day.slice(0, 4)}`;

/** "FDA approves Prozac (fluoxetine hydrochloride), a new molecular entity" */
export function approvalTitle(a: FdaApproval): string {
  const what = a.kind === "BLA" ? "a new biologic" : "a new molecular entity";
  return a.name ? `FDA approves ${a.name} (${a.ingredient}), ${what}` : `FDA approves ${a.ingredient}, ${what}`;
}

/**
 * The company's approvals as timeline events, newest first, from `from`, its first price. One row an
 * application, on its approval day, linked to Drugs@FDA.
 */
export function approvalEvents(approvals: readonly FdaApproval[], namesIn: (year: number) => string[], { cik, from = "" }: { cik: number | string; from?: string }): TimelineEvent[] {
  const tag = Number(cik);
  return approvals
    .filter((a) => a.day >= from && approvalIsCompany(a, tag, namesIn))
    .map((a) => {
      const how = [a.priority ? "priority review" : "standard review", ...(a.orphan ? ["an orphan drug"] : [])].join("; ");
      return {
        id: `fda-approval-${tag}-${a.kind}${a.application}`,
        date: a.day,
        type: "regulation" as const,
        title: approvalTitle(a),
        description: `${a.indication ? `${a.indication.replace(/\.$/, "")}. ` : ""}Approved ${longDay(a.day)} on ${a.applicant}'s ${a.kind} ${a.application} (${how}).`.slice(0, 600),
        source: "FDA",
        url: drugsAtFdaUrl(a.application),
        sourceKey: "fda_approvals" as const,
        externalId: `${a.kind}${a.application}`,
        dedupBasis: `fda-approval:${tag}@${a.kind}${a.application}`,
      };
    })
    .sort((x, y) => y.date.localeCompare(x.date));
}
