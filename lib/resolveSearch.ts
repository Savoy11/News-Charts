import { resolveCompany } from "./sec";
import { findKnownCompany, loadSubject } from "./store/read";
import { headPrefixes } from "./prompt";
import { logResolution, targetHasEvents, type ResolutionRung } from "./searchLog";
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
 * **Prompt search is deliberately absent, not deleted.** `parseSearchPrompt` (lib/prompt.ts),
 * the focus grader (lib/focus.ts), FocusBar and BestMatches all remain — tested, dormant, and
 * still activated by `?focus=` links — because the planned v2 ("how did covid affect Best Buy's
 * stock price" → BBY narrowed to covid events) rebuilds on exactly that substrate. See the
 * checklist's "Prompt search v2" entry before touching any of it.
 */

export type ResolvedSearch =
  | { kind: "none" }
  | { kind: "company"; ticker: string }
  | {
      /** `slug` is raw — callers encode it for the medium they put it in (URL path, JSON). */
      kind: "topic";
      slug: string;
    };

export async function resolveSearch(q: string): Promise<ResolvedSearch> {
  const started = Date.now();
  const query = q.replace(/\s+/g, " ").trim();
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

  // Database first, the same discipline as every other loader — and the alias path
  // ("bitcoin" → btc) that the live rungs cannot see.
  const knownCompany = await findKnownCompany(query).catch(() => null);
  const known = knownCompany ? null : await loadSubject(query).catch(() => null);

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
   * Head-prefix salvage: "Best Buy earnings" fails every exact rung but "Best Buy" is BBY.
   * The tail is DROPPED for now rather than carried as focus — prompt search is shelved, and
   * routing to the right security beats a miss page. Logged distinctly so we can see how often
   * the tail was worth something; v2 gives it back as a focus.
   */
  let salvaged: { kind: "company" | "topic"; slug?: string } | null = null;
  let salvagedTopicSlug: string | null = null;
  if (!ticker && !known && !tickerIndexSlow) {
    for (const { prefix } of headPrefixes(query)) {
      const pCompany = await findKnownCompany(prefix).catch(() => null);
      if (pCompany) {
        ticker = pCompany.ticker;
        salvaged = { kind: "company" };
        break;
      }
      const pKnown = await loadSubject(prefix).catch(() => null);
      if (pKnown) {
        if (pKnown.kind === "company" && pKnown.ticker) {
          ticker = pKnown.ticker;
          salvaged = { kind: "company" };
        } else {
          salvaged = { kind: "topic", slug: pKnown.slug };
          salvagedTopicSlug = pKnown.slug;
        }
        break;
      }
      const pEdgar = await withTimeout(resolveCompany(prefix).catch(() => null), NETWORK_BUDGET_MS);
      if (!timedOut(pEdgar) && pEdgar) {
        ticker = pEdgar.ticker;
        salvaged = { kind: "company" };
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

  const kind = ticker ? "company" : knownTopicSlug ? "topic" : null;
  const target = ticker ?? knownTopicSlug;

  // Awaited rather than fired and forgotten: a background write is not guaranteed to survive
  // the response on a serverless host — and `unresolved` rows are the measure of whether this
  // scope decision starves real queries, so losing them would hide exactly what we must watch.
  await logResolution({
    query,
    subject: query,
    focus: null,
    influence: null,
    resolvedBy,
    kind,
    target,
    hasEvents: target ? await targetHasEvents(target) : null,
    durationMs: Date.now() - started,
  });

  if (ticker) return { kind: "company", ticker };
  if (knownTopicSlug) return { kind: "topic", slug: knownTopicSlug };
  return { kind: "none" };
}
