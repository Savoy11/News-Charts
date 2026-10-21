import { fundNameIsShared, namesSecurity, resolveCompany, suggestSecurities, type SecuritySuggestion } from "./sec";
import { findCandidates, findKnownCompany, loadSubject } from "./store/read";
import { closeCandidates, optionFor, optionForSuggestion, withFocus, type SearchOption } from "./searchChoice";

export type { SearchOption };
import { headPrefixes, parseSearchPrompt } from "./prompt";
import { MAX_QUERY, logResolution, targetHasEvents, type ResolutionRung } from "./searchLog";
import { NETWORK_BUDGET_MS, timedOut, withTimeout } from "./timeout";

/**
 * The resolution ladder behind the search box, shared by `/api/resolve` (JSON, for the hydrated
 * box) and `/search` (redirect, the no-JS floor) so both give one answer to one query.
 *
 * **Scope (2026-08-08): search resolves exchange-traded securities.** Companies, ETFs and
 * mutual funds resolve through the corpus and EDGAR's two ticker files; subjects already in the
 * corpus (of any kind) stay reachable, because a page we hold is a page worth finding. What a
 * query can no longer do is mint a NEW topic: the old `assumed_topic` fallthrough sent every
 * unmatched string to `/topic/<string>`, which the first-visit gather would then spend a real
 * Wikipedia pass on. Off-scope queries now resolve to `none` and the box says what the site is
 * for.
 *
 * **Prompt search (NC-008, v2).** A query that reads as a question — "how did covid affect Best
 * Buy's stock price" — is split by `parseSearchPrompt` (lib/prompt.ts) into the security it
 * names and the concern it asks about. The ladder below resolves the security; the concern rides
 * on the answer as `focus`, and the page it lands on narrows and ranks its own events by it
 * (lib/focus.ts, FocusBar). A query the parser leaves whole runs the ladder exactly as before.
 */

export type ResolvedSearch =
  | { kind: "none" }
  /**
   * `focus` is the concern the query asked about, when it asked about one — the caller puts it on
   * the page's URL as `?focus=`, raw here like `slug`. Absent for a plain name.
   */
  | { kind: "company"; ticker: string; focus?: string }
  | {
      /** `slug` is raw — callers encode it for the medium they put it in (URL path, JSON). */
      kind: "topic";
      slug: string;
      focus?: string;
    }
  /** Option hrefs already carry the focus, so whichever one is picked keeps the question. */
  | { kind: "choose"; options: SearchOption[] }
  /**
   * Nothing matched, but the committed index holds names close to what was typed. Offered, never
   * followed: unlike `choose`, whose options each matched, these only resemble the query, so a
   * caller that cannot ask the visitor (the no-script `/search`) must not pick one for them.
   */
  | { kind: "suggest"; options: SearchOption[] };

/** What the visitor typed, carried while the ladder works on the security parsed out of it. */
interface Carried {
  /** the query as typed (capped) — what the log records as `query` */
  raw: string;
  focus: string | null;
  influence: string | null;
}

/** How much of the ladder one attempt may use. */
interface Attempt {
  /** try shorter heads of the subject when the whole of it matches nothing */
  salvage: boolean;
  /**
   * The last attempt. A miss on it is offered near matches and logged; a miss on an earlier one
   * is returned unsettled, so the caller can try the next reading of the query.
   */
  final: boolean;
}

/** An attempt's answer, and whether it is the search's answer (logged) or a miss to try past. */
interface Outcome {
  result: ResolvedSearch;
  settled: boolean;
}

const POSSESSIVE = /['’]s$/i;
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9&]+/g, " ").trim();

export async function resolveSearch(q: string): Promise<ResolvedSearch> {
  const started = Date.now();
  // Capped before any database work, not only before logging: the fuzzy match runs trigram
  // similarity against every subject, and an unbounded query made that cost the caller's choice
  // (NC-090). No ticker, name or alias comes near the limit.
  const query = q.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
  if (!query) {
    await logResolution({
      query: "",
      subject: "",
      focus: null,
      influence: null,
      resolvedBy: "empty",
      kind: null,
      target: null,
      hasEvents: null,
      durationMs: Date.now() - started,
    });
    return { kind: "none" };
  }

  const whole = () => ladder(query, started, { raw: query, focus: null, influence: null }, { salvage: true, final: true });

  /**
   * Prompt search: the security the query names, with the concern it asked about carried along.
   *
   * The parse is only believed when it changed something and the whole query is not already a
   * name. "Jack in the Box" and "Transamerica Global Equity" are securities that the parser
   * would split ("Jack" + "in the Box"; a stock suffix stripped) — so a query the committed index
   * or the corpus answers exactly, as typed, is never read as a sentence.
   */
  const parsed = parseSearchPrompt(query);
  if (words(parsed.subject) === words(query) || namesSecurity(query) || (await namesHeldSubject(query))) {
    return (await whole()).result;
  }
  const carried: Carried = { raw: query, focus: parsed.focus, influence: parsed.influence };

  /**
   * "Best Buy's stock price" parses to "Best Buy's". The possessive is tried as typed first, then
   * with the apostrophe dropped — "McDonald's" is a name, which EDGAR spells "MCDONALDS CORP" —
   * and only then without it, which is "Best Buy".
   */
  const subjects = POSSESSIVE.test(parsed.subject)
    ? [parsed.subject, parsed.subject.replace(/['’]/g, ""), parsed.subject.replace(POSSESSIVE, "")]
    : [parsed.subject];
  for (const [i, subject] of subjects.entries()) {
    const last = i === subjects.length - 1;
    /**
     * A relational question ("X's effect on Y") has said what Y is, so a miss on Y is the answer
     * — near matches for Y, not for the whole sentence. A qualifier split ("Y in 2020") can be
     * wrong about where the name ends, so a miss on it falls back to the query as typed.
     */
    const outcome = await ladder(subject, started, carried, { salvage: last, final: last && carried.influence !== null });
    if (outcome.settled) return outcome.result;
  }
  return (await whole()).result;
}

/** The corpus holds a subject by exactly this name, ticker or alias — a query to take as typed. */
async function namesHeldSubject(query: string): Promise<boolean> {
  const candidates = await findCandidates(query).catch(() => []);
  return candidates.some((c) => c.via !== "fuzzy");
}

async function ladder(query: string, started: number, carried: Carried, attempt: Attempt): Promise<Outcome> {
  /** One row per search, whichever attempt answers it: what was typed, and what it was read as. */
  const log = (row: Pick<Parameters<typeof logResolution>[0], "resolvedBy" | "kind" | "target" | "hasEvents">, focus = carried.focus) =>
    logResolution({
      query: carried.raw,
      subject: query,
      focus,
      influence: carried.influence,
      ...row,
      durationMs: Date.now() - started,
    });

  /**
   * Database first, the same discipline as every other loader — and the alias path
   * ("bitcoin" → btc) that the live rungs cannot see.
   *
   * **Scored, not laddered.** `findCandidates` puts exact ticker, exact name, alias, prefix and
   * trigram resemblance on one 0–1 scale, which fixes two failures the old rungs could not tell
   * apart: a typo matched nothing and fell through to the live rungs (`forde`, `alibba` and
   * `electirc cars` now resolve — measured), and two plausible matches always went to whichever
   * rung came first, which is an ordering of our code rather than of the answers.
   *
   * The corpus is still consulted before EDGAR, so search keeps working when that file is
   * throttled. Exact identifiers still win outright; resemblance only decides among the rest.
   */
  const candidates = await findCandidates(query).catch(() => []);
  const tied = closeCandidates(candidates);
  if (tied.length >= 2) {
    const top = tied[0];
    await log({
      resolvedBy: "ambiguous",
      kind: top.kind === "company" ? "company" : "topic",
      target: top.ticker ?? top.slug,
      hasEvents: await targetHasEvents(top.ticker ?? top.slug),
    });
    return { result: { kind: "choose", options: tied.map((c) => withFocus(optionFor(c), carried.focus)) }, settled: true };
  }
  /** "Did you mean": near matches from the committed index, logged under their own rung. */
  const suggest = async (offered: SecuritySuggestion[]): Promise<Outcome> => {
    await log({
      resolvedBy: "suggested",
      kind: "company",
      target: offered[0].ticker,
      hasEvents: await targetHasEvents(offered[0].ticker),
    });
    return {
      result: { kind: "suggest", options: offered.map((s) => withFocus(optionForSuggestion(s), carried.focus)) },
      settled: true,
    };
  };

  const best = candidates[0] ?? null;
  const bestCompany = best?.kind === "company" && best.ticker ? best : null;

  const knownCompany = bestCompany
    ? { ticker: bestCompany.ticker as string, displayName: bestCompany.displayName }
    : await findKnownCompany(query).catch(() => null);
  const known = knownCompany
    ? null
    : best
      ? await loadSubject(best.slug).catch(() => null)
      : await loadSubject(query).catch(() => null);

  /**
   * The one rung that leaves the machine, on a budget. EDGAR rate-limits by User-Agent, and a
   * bounded miss is a result the page can act on; an unbounded await is a spinner. The
   * distinction between "EDGAR says no" and "EDGAR did not answer" is kept because only one of
   * them is a fact about the query. This rung now answers funds too: SPY, QQQ and VTSAX
   * resolve through EDGAR's fund ticker file exactly as companies do through the main one.
   */
  const probe =
    knownCompany || known
      ? null
      : await withTimeout(resolveCompany(query).catch(() => null), NETWORK_BUDGET_MS);
  const tickerIndexSlow = probe !== null && timedOut(probe);
  const company = knownCompany ?? (probe === null || timedOut(probe) ? null : probe);

  let ticker = knownCompany?.ticker ?? (known?.kind === "company" ? known.ticker : company?.ticker);

  /**
   * A name several funds share is a question, not a head to salvage: "S&P 500" starts seven
   * series' names, and salvage took "S&P" alone to S&P Global (NC-040's open case).
   */
  if (!ticker && !known && !tickerIndexSlow && fundNameIsShared(query)) {
    const offered = suggestSecurities(query);
    if (offered.length) return suggest(offered);
  }

  /**
   * Head-prefix salvage: "Best Buy earnings" fails every whole-query rung but "Best Buy" is BBY,
   * and the tail it leaves — "earnings" — is the concern, carried as the focus like any other
   * the parser finds. Logged distinctly, so the search report shows how often a query needed it.
   *
   * **This is the "generate candidate spans and test them against the corpus" design**, and each
   * span is tested with the same scored lookup the whole query gets — so a misspelt span
   * ("forde motor earnings") resolves where an exact-only test dropped it. The corpus decides
   * what is a subject name; no list of English patterns is consulted anywhere on this path.
   */
  let salvaged: { kind: "company" | "topic"; tail: string } | null = null;
  let salvagedTopicSlug: string | null = null;
  if (attempt.salvage && !ticker && !known && !tickerIndexSlow) {
    for (const { prefix, tail } of headPrefixes(query)) {
      const [pBest] = await findCandidates(prefix, 1).catch(() => []);
      if (pBest) {
        if (pBest.kind === "company" && pBest.ticker) {
          ticker = pBest.ticker;
          salvaged = { kind: "company", tail };
        } else {
          salvaged = { kind: "topic", tail };
          salvagedTopicSlug = pBest.slug;
        }
        break;
      }
      const pEdgar = await withTimeout(resolveCompany(prefix).catch(() => null), NETWORK_BUDGET_MS);
      if (!timedOut(pEdgar) && pEdgar) {
        ticker = pEdgar.ticker;
        salvaged = { kind: "company", tail };
        break;
      }
    }
  }

  const knownTopicSlug = known?.kind === "topic" ? known.slug : salvagedTopicSlug;

  const resolvedBy: ResolutionRung = knownCompany
    ? "known_company"
    : known
      ? "known_subject"
      : company
        ? "edgar"
        : salvaged
          ? "salvaged_prefix"
          : tickerIndexSlow
            ? "network_timeout"
            : "unresolved";

  /**
   * A miss on an attempt that is not the last is not the search's answer: the caller tries the
   * next reading of the query. A slow EDGAR is the exception — the next reading would wait on the
   * same file, so the timeout is answered here.
   */
  if (resolvedBy === "unresolved" && !attempt.final) return { result: { kind: "none" }, settled: false };

  /**
   * Before admitting a miss, the names it nearly matched. The corpus search forgives a typo only
   * for what the site holds; this is the same forgiveness for every security the index knows, in
   * process, so it answers with the database down too.
   */
  if (resolvedBy === "unresolved") {
    const offered = suggestSecurities(query);
    if (offered.length) return suggest(offered);
  }

  const kind = ticker ? "company" : knownTopicSlug ? "topic" : null;
  const target = ticker ?? knownTopicSlug;
  const focus = [salvaged?.tail, carried.focus].filter(Boolean).join(" · ") || null;

  // Awaited rather than fired and forgotten: a background write is not guaranteed to survive
  // the response on a serverless host — and `unresolved` rows are the measure of whether this
  // scope decision starves real queries, so losing them would hide exactly what we must watch.
  await log({ resolvedBy, kind, target, hasEvents: target ? await targetHasEvents(target) : null }, focus);

  const focused = focus ? { focus } : {};
  if (ticker) return { result: { kind: "company", ticker, ...focused }, settled: true };
  if (knownTopicSlug) return { result: { kind: "topic", slug: knownTopicSlug, ...focused }, settled: true };
  return { result: { kind: "none" }, settled: true };
}
