import type { FetchResult, TimelineEvent } from "../types";

/**
 * Governance decisions from Snapshot, the off-chain voting hub most DeFi protocols use.
 *
 * Keyless and public, which is why it is here rather than Tally: a protocol changing its own
 * rules is among the highest-signal events on its timeline, and this is the source that costs
 * nothing to read.
 *
 * **These are not on-chain events**, and the distinction is load-bearing. A Snapshot vote is a
 * set of signed messages tallied by a hub — there is no transaction behind it, and often the
 * change it authorises is executed later, elsewhere, or not at all. They are filed under the
 * `governance` kind for that reason; calling them `onchain` would claim a proof they do not have.
 *
 * ✅ **Exercised live 2026-08-12**, and it found a defect the fixtures could not: the registered
 * Aave space id was not a Snapshot space at all. The payload shape below matches what
 * `hub.snapshot.org` actually returns; `npm run check:governance` pins the parsing offline, and
 * `assertSpacesResolve` (called by `npm run check:feeds`) is the live half, because whether an id
 * EXISTS is a question no fixture can answer.
 */

const SNAPSHOT_API = "https://hub.snapshot.org/graphql";

/** A protocol's governance space, and how we know it is theirs. */
export interface GovernanceSpace {
  /** subject slug this attaches to */
  slug: string;
  /** Snapshot space id, e.g. "uniswapgovernance.eth" */
  space: string;
  displayName: string;
  provenance: string;
}

/**
 * The spaces covered, each recorded the same way an address is: with why we believe it.
 *
 * A wrong space id returns an empty proposal list, which on a page is indistinguishable from
 * "this protocol has not voted lately" — the silent-empty failure. `npm run check:feeds` reports
 * each space's count so a zero is visible rather than assumed.
 *
 * ⚠ **That warning caught nothing for a fortnight, because a visible zero is not a read zero.**
 * `aave.eth` was registered here from 2026-07-28 and has never been a Snapshot space at all
 * (`{ space(id: "aave.eth") }` → `null`); Aave's DAO is `aavedao.eth`, with 970 proposals. So
 * `/topic/aave` shipped an empty governance timeline for two weeks while `check:feeds` dutifully
 * printed `⚠ 0 articles` beside it, annotated "(closed proposals only)" — a plausible-sounding
 * reason that made the zero easier to skip past than to investigate.
 *
 * Hence `assertSpacesResolve` below, and the change to how that zero is reported: an id that does
 * not resolve is now a *different line* from a space with nothing recent, because those are
 * different facts and only one of them is our bug. Verified live 2026-08-12.
 */
export const GOVERNANCE_SPACES: GovernanceSpace[] = [
  {
    slug: "uni",
    space: "uniswapgovernance.eth",
    displayName: "Uniswap",
    provenance: "The space linked from Uniswap's own governance documentation.",
  },
  {
    slug: "aave",
    space: "aavedao.eth",
    displayName: "Aave",
    provenance:
      "Snapshot's own space record — `{ space(id: \"aavedao.eth\") }` returns Aave DAO with 970 " +
      "proposals. Verified live 2026-08-12, after the previous id was found to be wrong.",
  },
];

interface SnapshotProposal {
  id?: string;
  title?: string;
  choices?: string[];
  scores?: number[];
  scores_total?: number;
  /** epoch seconds — when voting closed, which is when the decision was taken */
  end?: number;
  state?: string;
  space?: { id?: string };
}

/**
 * Affirmative and negative choice wordings, because Snapshot choices are free text.
 *
 * Spaces write them differently — "For"/"Against", "Yes"/"No", "Yae"/"Nay" — and they are *not*
 * consistently ordered, so reading `scores[0] > scores[1]` as "passed" is wrong the moment a
 * space lists Against first. The winning choice is decided by score, then classified by wording.
 */
const AFFIRMATIVE = /^\s*(for|yes|yae|yea|aye|approve|accept|in favou?r|support|pass)\b/i;
const NEGATIVE = /^\s*(against|no|nay|reject|decline|oppose|do not|don'?t)\b/i;

export type Outcome = "passed" | "rejected" | "decided";

export interface Tally {
  outcome: Outcome;
  winning: string;
}

/**
 * What a closed proposal actually decided.
 *
 * Returns `decided` — naming the winning option without calling it a pass or a fail — whenever
 * the wording is not plainly one or the other. A multi-option proposal ("Option A / Option B /
 * Abstain") has a winner but no pass/fail, and asserting one would be inventing a result. On a
 * governance timeline that is a serious thing to get wrong, so the shape of the answer changes
 * rather than a guess being made.
 */
export function tally(choices: string[] | undefined, scores: number[] | undefined): Tally | null {
  if (!Array.isArray(choices) || !Array.isArray(scores) || choices.length === 0) return null;
  if (scores.length !== choices.length) return null;
  const total = scores.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  if (total <= 0) return null; // nobody voted — there is no decision to report

  let best = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
  // A tie has no winner, and picking the earlier index would make one up.
  if (scores.filter((s) => s === scores[best]).length > 1) return null;

  const winning = choices[best];
  if (AFFIRMATIVE.test(winning)) return { outcome: "passed", winning };
  if (NEGATIVE.test(winning)) return { outcome: "rejected", winning };
  return { outcome: "decided", winning };
}

const dayFromEpoch = (seconds: number): string =>
  new Date(seconds * 1000).toISOString().slice(0, 10);

/** The GraphQL query. `state: "closed"` is the finality signal here — voting has ended. */
function query(space: string, first: number): string {
  return `{
    proposals(
      first: ${first}
      where: { space: ${JSON.stringify(space)}, state: "closed" }
      orderBy: "end"
      orderDirection: desc
    ) { id title choices scores scores_total end state space { id } }
  }`;
}

/** What Snapshot says about a configured space id, as distinct from what it holds. */
export interface SpaceCheck {
  space: string;
  /** true = Snapshot knows this id; false = it does not exist; null = we could not ask */
  resolves: boolean | null;
  name?: string;
  proposalsCount?: number;
  detail?: string;
}

/**
 * Does each configured id actually name a Snapshot space?
 *
 * A separate question from "does it have proposals", and the one that went unasked for a
 * fortnight. `fetchGovernance` cannot answer it: a non-existent space and a space with nothing
 * closed both come back as an empty `proposals` array, which is the whole failure. Snapshot's
 * `space` query answers it in one request — `null` means the id is wrong, full stop.
 *
 * Lives here rather than in a `check:*` script because it needs the network, and every script in
 * the `npm run check` chain is offline by construction. `npm run check:feeds` is the live report,
 * and this is for that.
 */
export async function assertSpacesResolve(
  spaces: GovernanceSpace[] = GOVERNANCE_SPACES
): Promise<SpaceCheck[]> {
  const out: SpaceCheck[] = [];
  for (const s of spaces) {
    try {
      const res = await fetch(SNAPSHOT_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: `{ space(id: "${s.space}") { id name proposalsCount } }`,
        }),
      });
      if (!res.ok) {
        out.push({ space: s.space, resolves: null, detail: `HTTP ${res.status}` });
        continue;
      }
      const json = await res.json();
      if (Array.isArray(json?.errors) && json.errors.length) {
        out.push({ space: s.space, resolves: null, detail: String(json.errors[0]?.message ?? "graphql error") });
        continue;
      }
      const space = json?.data?.space;
      out.push(
        space
          ? { space: s.space, resolves: true, name: space.name, proposalsCount: space.proposalsCount }
          : { space: s.space, resolves: false }
      );
    } catch (err) {
      // Could not ask is not "does not exist" — the distinction this whole function is about.
      out.push({ space: s.space, resolves: null, detail: (err as Error).message });
    }
  }
  return out;
}

export async function fetchGovernance(
  target: GovernanceSpace,
  first = 40
): Promise<FetchResult> {
  try {
    const res = await fetch(SNAPSHOT_API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: query(target.space, first) }),
      next: { revalidate: 21600 },
    });
    if (res.status === 429 || res.status === 503) {
      return { events: [], outcome: "throttled", httpStatus: res.status };
    }
    if (!res.ok) return { events: [], outcome: "error", httpStatus: res.status };

    const json = await res.json();
    // GraphQL reports errors with HTTP 200 and an `errors` array, so a bad query would otherwise
    // read as an empty result — the same trap Etherscan sets with status "0".
    if (Array.isArray(json?.errors) && json.errors.length) {
      return { events: [], outcome: "error", detail: String(json.errors[0]?.message ?? "graphql error") };
    }
    const proposals: SnapshotProposal[] = json?.data?.proposals ?? [];
    const events: TimelineEvent[] = [];

    for (const p of proposals) {
      if (!p.id || !p.title) continue;
      if (typeof p.end !== "number" || !Number.isFinite(p.end) || p.end <= 0) continue;
      // A proposal whose voting has not closed has not decided anything yet.
      if (p.state !== "closed") continue;
      const result = tally(p.choices, p.scores);
      if (!result) continue; // no quorum, a tie, or a malformed tally — nothing to assert

      const verb =
        result.outcome === "passed"
          ? "passed"
          : result.outcome === "rejected"
            ? "rejected"
            : `decided: ${result.winning}`;

      events.push({
        id: `snapshot-${p.id}`,
        date: dayFromEpoch(p.end),
        type: "governance",
        title: `${target.displayName} governance ${verb} — ${p.title.replace(/\s+/g, " ").trim()}`,
        description:
          `Voting closed with “${result.winning}” ahead. Snapshot votes are signed off-chain, ` +
          `so this records the decision, not its execution.`,
        source: `Snapshot · ${target.space}`,
        url: `https://snapshot.org/#/${target.space}/proposal/${p.id}`,
        sourceKey: "snapshot",
        externalId: p.id,
        // the proposal id is Snapshot's own primary key: stable across re-reads
        dedupBasis: `snapshot:${p.id}`,
      });
    }
    return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
  } catch (err) {
    return { events: [], outcome: "error", detail: (err as Error).message };
  }
}

export async function getGovernanceFor(slug: string): Promise<TimelineEvent[]> {
  const target = GOVERNANCE_SPACES.find((g) => g.slug === slug);
  if (!target) return [];
  return (await fetchGovernance(target)).events;
}
