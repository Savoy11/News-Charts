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
];

// "the history of X", "a timeline of X", "origins of X" — the noun is the wrapper, X is the subject
const LEAD_IN =
  /^(?:the\s+|a\s+)?(?:history|story|timeline|evolution|origins?|background)\s+(?:of|behind|about)\s+(?:the\s+)?/i;

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

  subject = subject.trim();
  // over-stripped to nothing — fall back to the raw query rather than search for ""
  if (!subject) return { subject: raw.trim(), focus: null };
  return { subject, focus };
}
