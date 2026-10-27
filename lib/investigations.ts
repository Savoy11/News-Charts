import type { FetchResult, TimelineEvent } from "./types";
import { recallHeadline, recallMakersFor, type RecallMaker } from "./recalls";

/**
 * The defect investigations NHTSA opened into a listed carmaker, from 1975 (batch 66, the
 * 2026-10-26 proposal 4, a source the owner approved).
 *
 * A recall is on a carmaker's page; the investigation that came before it, often the event the
 * stock moved on, was not. NHTSA's Office of Defects Investigation opens a preliminary evaluation,
 * upgrades it to an engineering analysis, reviews a defect petition from the public, or queries a
 * recall's reach — Toyota's RQ10003, "Unintended and Uncontrolled Acceleration", opened 2010-02-16.
 *
 * Read from the Transportation Department's open-data copy, "Investigations Data": one row per
 * investigation, with its number, the maker as the recalls dataset writes it, a type, a subject
 * line, a component, its open and close dates and the recall NHTSA links to it. Public domain
 * ("Public Domain U.S. Government" in the dataset's own licence field, credited to NHTSA); no key.
 *
 * The owner's calls (2026-10-26): an investigation is shown with recalls, under the Recalls tag,
 * and as one row on the day it opened; its closing is said in that row, never a second one. A
 * maker reaches a page only through the hand-checked map recalls use (`RECALL_MAKERS`), on or after
 * the day the company owned it.
 */

const DATASET = "https://data.transportation.gov/resource/b3rp-be92.json";
// The same contact the other federal requests carry (lib/recalls.ts).
const UA = { "User-Agent": "News Charts Research marcusowens94@gmail.com" };
const TIMEOUT_MS = 20_000;
/** Far above any company's count (Ford: 684 on 2026-10-27); reaching it is reported. */
const ROW_LIMIT = 5000;

/** What NHTSA opened, as a title says it: "NHTSA opened an engineering analysis: …". */
export const INVESTIGATION_KIND: Record<string, string> = {
  "Preliminary Evaluation": "a preliminary evaluation",
  "Engineering Analysis": "an engineering analysis",
  "Defect Petition": "a review of a defect petition",
  "Recall Query": "a recall query",
  "Equipment Query": "an equipment query",
  "Audit Query": "an audit query",
};

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** One request for every investigation into the company's makers, newest first. */
export function investigationQuery(makers: readonly RecallMaker[]): string {
  const plain = makers.filter((m) => !m.from).map((m) => quote(m.name));
  const dated = makers
    .filter((m) => m.from)
    .map((m) => `(manufacturer = ${quote(m.name)} AND open_date >= ${quote(`${m.from}T00:00:00`)})`);
  const who = [...(plain.length ? [`manufacturer IN (${plain.join(", ")})`] : []), ...dated].join(" OR ");
  const params = new URLSearchParams({
    $select: "nhtsa_action_number, manufacturer, investigation_type, subject, component, recall, open_date, closed_date, status",
    $where: who,
    $order: "open_date DESC, nhtsa_action_number",
    $limit: String(ROW_LIMIT),
  });
  return `${DATASET}?${params}`;
}

export interface InvestigationRow {
  nhtsa_action_number?: string;
  manufacturer?: string;
  investigation_type?: string;
  subject?: string;
  component?: string;
  /** NHTSA's link to the latest recall it associates with the investigation */
  recall?: { url?: string; description?: string };
  open_date?: string;
  closed_date?: string;
  status?: string;
}

const day = (s?: string) => (s ?? "").slice(0, 10);
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Rows → timeline events. Every row is checked against the maker map again, whatever the query
 * asked for: an investigation reaches a company's page only under a mapped maker, opened on or
 * after its day. The title says what was opened, never a finding.
 */
export function investigationEvents(rows: readonly InvestigationRow[], makers: readonly RecallMaker[]): TimelineEvent[] {
  const byName = new Map(makers.map((m) => [m.name, m]));
  const out: TimelineEvent[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const id = r.nhtsa_action_number ?? "";
    const opened = day(r.open_date);
    const maker = byName.get(r.manufacturer ?? "");
    const kind = INVESTIGATION_KIND[r.investigation_type ?? ""];
    if (!/^[A-Z]{2}\d{5}$/.test(id) || seen.has(id) || !isDay(opened) || !kind) continue;
    if (!maker || (maker.from && opened < maker.from)) continue;
    seen.add(id);
    const closed = day(r.closed_date);
    const recall = /^\d{2}[A-Z]\d{3}$/.test(r.recall?.description ?? "") ? r.recall!.description : null;
    const ending = isDay(closed)
      ? `Closed ${closed}${recall ? `; NHTSA links it to recall ${recall}` : ""}.`
      : "Still open.";
    out.push({
      id: `nhtsa-inv-${id}`,
      date: opened,
      type: "recall",
      title: `NHTSA opened ${kind}: ${recallHeadline(r.subject, r.component)}`,
      // "into Tesla, Inc." ends its sentence on the name's own full stop
      description: `NHTSA investigation ${id} (${r.investigation_type}) into ${maker.name.replace(/\.$/, "")}. ${ending}`,
      source: "NHTSA",
      url: `https://www.nhtsa.gov/recalls?nhtsaId=${id}`,
      sourceKey: "nhtsa_investigations",
      externalId: id,
      // the action number is the investigation: one event however many runs carry it
      dedupBasis: `nhtsa-inv:${id}`,
    });
  }
  return out;
}

/** Whether an event is one of these: a recall-tag row that is an investigation, not a recall. */
export const isInvestigation = (ev: Pick<TimelineEvent, "type" | "title">): boolean =>
  ev.type === "recall" && /^NHTSA opened /.test(ev.title);

/** A company's NHTSA investigations, or why there are none. */
export async function fetchInvestigations(cik: number | string): Promise<FetchResult> {
  const makers = recallMakersFor(cik);
  if (!makers) return { events: [], outcome: "empty", detail: "no vehicle maker mapped to this company" };
  try {
    const res = await fetch(investigationQuery(makers), { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 429 || res.status === 503) return { events: [], outcome: "throttled", httpStatus: res.status };
    if (!res.ok) return { events: [], outcome: "error", httpStatus: res.status };
    const rows: unknown = await res.json();
    if (!Array.isArray(rows)) return { events: [], outcome: "error", httpStatus: res.status, detail: "the dataset did not answer with a list" };
    const events = investigationEvents(rows as InvestigationRow[], makers);
    return {
      events,
      outcome: events.length ? "ok" : "empty",
      httpStatus: res.status,
      ...(rows.length >= ROW_LIMIT ? { detail: `row limit ${ROW_LIMIT} reached; older investigations not read` } : {}),
    };
  } catch (err) {
    return { events: [], outcome: "error", detail: String(err).slice(0, 200) };
  }
}
