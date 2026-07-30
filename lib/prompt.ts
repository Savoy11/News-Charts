/**
 * Turn a natural-language search prompt into a subject to resolve and a focus to
 * carry along. "Show me the history of Alibaba in the United States" is not a
 * Wikipedia title — searched verbatim it fuzzy-matches junk ("Media conglomerate").
 * The subject is what we look up; the focus rides on the URL and seeds the AI
 * panel so the angle the visitor asked for isn't silently dropped.
 *
 * Pure string work, no network — safe for both the resolve route and tests.
 */

export interface ParsedPrompt {
  subject: string;
  /** qualifier the visitor attached, e.g. "in the united states" — null when none */
  focus: string | null;
}

// conversational scaffolding that precedes the actual request
const FILLERS = [
  /^please\s+/i,
  /^(?:can|could|would)\s+you\s+/i,
  /^i(?:'d|’d| would)?\s*(?:like|want|need)\s+(?:to\s+(?:see|know\s+about|explore|read\s+about)\s+)?/i,
  /^show\s+me\s+/i,
  /^tell\s+me\s+about\s+/i,
  /^give\s+me\s+/i,
  /^find\s+(?:me\s+)?/i,
  /^search\s+(?:for\s+)?/i,
  /^look\s+up\s+/i,
  /^pull\s+up\s+/i,
  /^bring\s+up\s+/i,
  /^what(?:'s|’s|\s+is)\s+/i,
  /^what\s+(?:was|were|are)\s+/i,
];

// "the history of X", "a timeline of X", "origins of X" — the noun is the wrapper, X is the subject
const LEAD_IN =
  /^(?:the\s+|a\s+)?(?:history|story|timeline|evolution|origins?|background)\s+(?:of|behind|about)\s+(?:the\s+)?/i;

/**
 * Relational questions — "Barack Obama's effect on Ford stock", "how did tariffs affect GM".
 *
 * These are the product's own use case phrased as a question, and they used to fall through
 * entirely: the whole sentence went to `resolveCompany`, missed, and was handed to Wikipedia,
 * which fuzzy-matched something unrelated. The visitor got a confidently wrong page.
 *
 * **The subject is the thing being affected**, because that is the side we can actually draw —
 * it has the timeline and, for a company, the price series. The influence becomes the focus,
 * which seeds the AI panel so the angle isn't dropped. (A true two-subject overlay — a topic's
 * events against a company's price — is the separate `P1` item in the owner backlog.)
 *
 * Ordered: "effect of X on Y" must be tried before "X effect on Y", or the former's "the
 * effect of X" would be read as the influencer.
 */
const RELATIONS = [
  /^(?:the\s+)?(?:effects?|impacts?|influence|role)\s+of\s+(.+?)\s+on\s+(.+)$/i,
  /^how\s+(?:did|does|do|has|have|had)\s+(.+?)\s+(?:affects?|affected|impacts?|impacted|influenced?|changed?|moved?|hurt|helped?)\s+(.+)$/i,
  /^(?:did|does|do|has|have|had)\s+(.+?)\s+(?:affects?|impacts?|influence|move|hurt|help)\s+(.+)$/i,
  /^(.+?)(?:['’]s)?\s+(?:effects?|impacts?|influence)\s+on\s+(.+)$/i,
];

/**
 * "Ford stock" is how people refer to a company; the EDGAR ticker index knows "Ford". Leaving
 * the suffix on turned a resolvable company into a Wikipedia guess — plain "Ford" resolves,
 * "Ford stock" did not.
 */
const STOCK_SUFFIX = /\s+(?:stock\s+price|share\s+price|stock|shares|share|ticker|equity)$/i;

/**
 * Compounds where the trailing word is part of the name, not a way of saying "the company".
 * The trade is deliberate: mis-stripping sends a rare topic to a near-miss page, while not
 * stripping sends every "<company> stock" query to a junk match.
 */
const STOCK_COMPOUNDS = /^(?:rolling|livestock|laughing)\s+stock$/i;

function stripStockSuffix(subject: string): string {
  if (STOCK_COMPOUNDS.test(subject)) return subject;
  const next = subject.replace(STOCK_SUFFIX, "").trim();
  // never strip away the entire query ("stock", "shares")
  return next ? next : subject;
}

// where the subject ends and the qualifier begins; earliest match wins
const QUALIFIERS = [
  /\s+as\s+an?\s+/i,
  /\s+operating\s+in\s+/i,
  /\s+doing\s+business\s+in\s+/i,
  /\s+in\s+the\s+/i,
  /\s+in\s+/i,
  /\s+during\s+/i,
  /\s+since\s+/i,
  /\s+before\s+/i,
  /\s+after\s+/i,
  /\s+between\s+/i,
  /\s+throughout\s+/i,
  /\s+across\s+/i,
];

export function parseSearchPrompt(raw: string): ParsedPrompt {
  let s = raw.replace(/\s+/g, " ").trim().replace(/[?!.]+$/, "");

  // strip scaffolding until nothing matches — prompts stack it ("please show me…")
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of FILLERS) {
      const next = s.replace(f, "");
      if (next !== s) {
        s = next;
        changed = true;
      }
    }
  }
  s = s.replace(LEAD_IN, "");

  // "alibaba's history" / "alibaba history" — wrapper trailing instead of leading
  s = s.replace(/['’]s\s+(?:history|story|timeline)$/i, "").replace(/\s+(?:history|timeline)$/i, "");

  // A relational question names two things; the affected one is the subject we can draw.
  let relationFocus: string | null = null;
  for (const r of RELATIONS) {
    const m = s.match(r);
    if (m && m[1]?.trim() && m[2]?.trim()) {
      relationFocus = m[1].trim();
      s = m[2].trim();
      break;
    }
  }

  // split subject from qualifier at the earliest marker (subject must keep ≥ 1 word)
  let subject = s;
  let focus: string | null = null;
  let at = -1;
  for (const q of QUALIFIERS) {
    const m = s.match(q);
    if (m && m.index !== undefined && m.index > 0 && (at === -1 || m.index < at)) {
      at = m.index;
    }
  }
  if (at > 0) {
    subject = s.slice(0, at).trim();
    focus = s.slice(at).trim() || null;
  }

  subject = stripStockSuffix(subject.trim());
  // over-stripped to nothing — fall back to the raw query rather than search for ""
  if (!subject) return { subject: raw.trim(), focus: null };

  // both angles survive when a prompt carries a relation and a qualifier
  // ("impact of tariffs on Ford in 2025")
  const parts = [relationFocus, focus].filter(Boolean) as string[];
  return { subject, focus: parts.length ? parts.join(" · ") : null };
}
