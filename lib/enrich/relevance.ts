import { EventType, SourceKey } from "../types";
import { foldAccents } from "../fold";
import { nameKey } from "../companyAliases";
import { commonName, withoutTag } from "../edgarName";
import { WEAK_TOKENS } from "../newsQuality";
import { dataBlock, untrustedNotice } from "./untrusted";
import { REGISTRANT_FORM } from "../secForms";
import { parseScoreReply } from "../scoreReply";
import { isListedWord, isOwnShortName, oneWordName, sharedBy, withCapital } from "../wordNames";

export { parseScoreReply };

export const MODEL = "claude-haiku-4-5-20251001";

/** Below this, a scored event is hidden from the timeline. Unscored (NULL) always shows. */
export const RELEVANCE_THRESHOLD = 0.4;

export interface ScorableRow {
  eventId: number;
  kind: EventType;
  title: string;
  /** where the row came from — two sources can share a kind and not share its provenance */
  sourceKey?: SourceKey | null;
  /** the source's own label for the row ("Internet Archive · Ford Motor Company") */
  byline?: string | null;
}

export interface SubjectContext {
  kind: "topic" | "company";
  displayName: string;
  ticker?: string | null;
}

export interface Scored {
  score: number;
  reason: string;
}

/**
 * Distinctive lowercase tokens and phrases that identify the subject in a headline.
 *
 * Weakness is judged by the shared `WEAK_TOKENS` list from newsQuality — the private ten-word
 * stop list this replaces let "Ford Motor Company" contribute "motor" as a full-strength alias,
 * so "Motor racing season opens" displayed as strong Ford news at 0.9.
 *
 * Short tokens are inspected BEFORE lowercasing: "3M" and "GE" are the subject's actual name,
 * and the old `length > 2` filter silently dropped them — which sent every 3M headline to the
 * paid tier. A digit-bearing or all-caps short token survives; a lowercase short word does not.
 *
 * `extraAliases` carries stored `subject_aliases` rows ("Google" for Alphabet). They join as
 * whole phrases, never tokenized — an alias is a name someone recorded, not a bag of words.
 *
 * A company's everyday words keep their capitals, so they name only a headline that writes them
 * so (batch 59): its ticker ("COST" for Costco, never "Cost of living rises") and a one-word name
 * that is an English word (`withCapital`: "Visa beats estimates", never "Student visa rules
 * tightened").
 *
 * A word of a company's name that five or more listed companies' names share names none of them
 * alone, unless it is the whole name (batch 60): "…as Gold Slides Back Toward $4,000" is no Kinross
 * Gold news, nor "Companies cut hiring as rates bite" Lowe's, nor "American Depositary Receipts"
 * American Airlines'. The company is still named by its common name whole ("Southern Copper"), and
 * by that name without its trailing generic words (`shortName`: "American Water" for American Water
 * Works) when no other listed company's name holds it, with its capitals (batch 61): "New York" is
 * not the New York Times's, and "top clean energy stocks" not Clean Energy Fuels'.
 */
export function aliasesFor(subject: SubjectContext, extraAliases: string[] = []): string[] {
  const company = subject.kind === "company";
  const shown = company ? withoutTag(subject.displayName) : subject.displayName;
  const common = company ? commonName(shown) : shown;
  const aliases = new Set<string>();
  for (const word of nameWords(subject)) {
    if (company && nameKey(word) !== nameKey(common) && sharedBy(nameKey(word)) >= SHARED_ALONE) continue;
    aliases.add(word);
  }
  aliases.add(shown.toLowerCase());
  if (company && common.includes(" ")) aliases.add(common.toLowerCase());
  const short = company ? shortName(common) : null;
  if (short && isOwnShortName(nameKey(short))) aliases.add(short.toLowerCase().replace(/(?<![\p{L}\p{N}'])\p{L}/gu, (c) => c.toUpperCase()));
  if (subject.ticker) aliases.add(CAPITALS.test(subject.ticker) ? subject.ticker : subject.ticker.toLowerCase());
  for (const phrase of extraAliases) {
    // a company's initials keep their capitals, so they name a headline only written that way:
    // "PAN" is Palo Alto Networks, "pan-European" is not (batch 34)
    const p = INITIALISM.test(phrase.trim()) ? phrase.trim() : phrase.trim().toLowerCase();
    if (p.length >= 3) aliases.add(p);
  }
  return company ? [...new Set([...aliases].map(withCapital))] : [...aliases];
}

/**
 * The words of a subject's name it may be named by on their own, lowercased: "Ford Motor Company"
 * → "ford", "3M Company" → "3m". EDGAR's registration tag names no company, and its legal form no
 * more: "MOODYS CORP /DE/" gave Moody's the name "/de/", and the tag off, "Embracer Group AB/ADR"
 * would give Embracer "ab" (batch 56). Nor does a web address's ending: "AMAZON COM INC" made
 * "Investing.com's stocks of the week" Amazon news (batch 60). Search keeps "com" a word — "Cars.com"
 * is not offered for "electric cars" — so it is not one of `WEAK_TOKENS`. Nor does a number:
 * "Bitwise 10 Crypto Index ETF" named every "Top 10" headline, WD-40 every "Dow tops 40,000"
 * (batch 61).
 */
export function nameWords(subject: SubjectContext): string[] {
  const company = subject.kind === "company";
  const shown = company ? withoutTag(subject.displayName) : subject.displayName;
  const rawTokens = (company ? commonName(shown) : shown).replace(/[.,]/g, "").split(/\s+/).filter(Boolean);
  const words: string[] = [];
  for (const tok of rawTokens) {
    const keepShort = tok.length >= 2 && (/\d/.test(tok) || tok === tok.toUpperCase());
    const lower = tok.toLowerCase();
    if ((tok.length > 2 || keepShort) && /\p{L}/u.test(tok) && !WEAK_TOKENS.has(lower) && lower !== "com" && !words.includes(lower)) {
      words.push(lower);
    }
  }
  return words;
}

/**
 * How many listed companies' names may share a word before it names none of them alone. Measured
 * on 4,165 Yahoo Finance headlines from 235 companies' feeds (2026-10-26): at five, other feeds'
 * headlines naming a company fell from 3,098 to 1,236, every one of sixty removed at random wrong,
 * while companies' own feeds named the company 2,009 times against 2,029; of the 21 lost, 17 were
 * not about it ("3 Canadian Dividend Stocks" on CIBC's). At ten, 1,347 stayed; at three, own
 * namings fell to 1,992 (batch 60).
 */
export const SHARED_ALONE = 5;

/**
 * A company's common name without its trailing generic words, two words at least: "American Water
 * Works" → "American Water", "First Citizens BancShares" → "First Citizens", "Interactive Brokers
 * Group" → "Interactive Brokers". A word is generic when it is weak or two listed companies' names
 * share it; null when nothing goes, less than two words would be left ("Bank of America"), or a word
 * left is an initial: "U S" of U S Global Investors named every "U.S." headline (batch 61).
 * `aliasesFor` names a company by it only when no other listed company's name holds it
 * (`isOwnShortName`), which `npm run sync:word-names` works out with `shared` from its own counts.
 */
export function shortName(common: string, shared: (key: string) => number = sharedBy): string | null {
  const words = common.replace(/[.,]/g, "").split(/\s+/).filter(Boolean);
  const weak = (w: string) => WEAK_TOKENS.has(w.toLowerCase()) || !/\p{L}/u.test(w);
  let end = words.length;
  while (end > 2 && (weak(words[end - 1]) || shared(nameKey(words[end - 1])) >= 2)) end--;
  while (end > 0 && weak(words[end - 1])) end--;
  if (end < 2 || end === words.length) return null;
  const kept = words.slice(0, end);
  return kept.some((w) => (w.match(/\p{L}/gu) ?? []).length < 2) ? null : kept.join(" ");
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Three or four capitals: a company's initials, as `newsNamesFor` writes them ("IBM", "AIG"). */
export const INITIALISM = /^[A-Z]{3,4}$/;

/** A name kept in capitals, matched only in them: a company's initials, or its ticker ("COST"). */
const CAPITALS = /^[A-Z]{3,5}$/;

/** Words whose "'s" is "is" or "has", never a possessive: "It's", "That's", "Here's". */
const CONTRACTED: ReadonlySet<string> = new Set(["it", "that", "there", "here", "what", "who", "where", "when", "why", "how", "he", "she", "let"]);

/**
 * What a headline says about the subject: named outright, obliquely, or not at all — or only as
 * the everyday word one of its names also is, in lowercase ("inflation target").
 */
export type Mention = "named" | "oblique" | "word" | "none";

/**
 * Unicode-aware naming test over the ORIGINAL title, accents folded on both sides.
 *
 * `\b` without the `u` flag made accented aliases structurally unmatchable — "nestlé" ends in a
 * non-word character to ASCII `\b`, which then demands a word character right after it. The
 * lookarounds below define a boundary as "not a letter or digit" in any script. Folding lets a
 * stored name without its accent ("estee lauder", as the alias index keeps it) name a headline
 * that has one, and the other way round. A name of two words or more also matches with its
 * punctuation folded, as the alias index keys it: "D.R. Horton" names "D . R . Horton beats" (as
 * GDELT writes it) and "Angie's List" names "Angies List" (batch 28).
 *
 * Short aliases (single-letter tickers like F, or GM), a company's initials ("PAN", batch 34) and
 * a ticker kept in capitals ("COST", batch 59) match only as a standalone UPPERCASE token in the
 * original title, and never one followed by "." or "-" — "F beats estimates" names Ford; "John F.
 * Kennedy Airport reopens" does not.
 *
 * An alias kept with its capital ("Visa", `aliasesFor`) names only a headline that writes it with
 * the capital; one that has it only in lowercase is reported `word` (batch 59). A headline in
 * lowercase throughout says nothing by its case, and is read as before.
 *
 * A single-token alias immediately preceded by a different capitalized word reads as a person's
 * name — "Harrison Ford", "Gerald Ford" — which is a judgement call, not a naming, so it is
 * reported `oblique` and left for the model rather than scored as certain.
 */
export function mentions(original: string, names: string[]): Mention {
  // one apostrophe, so "Kohl’s" and "Kohl's" read alike; same length, so offsets hold
  const title = foldAccents(original).replace(/’/g, "'");
  const aliases = names.map((n) => foldAccents(n).replace(/’/g, "'"));
  const lowered = aliases.map((a) => a.toLowerCase());
  const cased = /\p{Lu}/u.test(title);
  // a name of two words or more names a possessive too: "Franco-Nevada's" is Franco Nevada's (batch 60)
  const keyOf = (t: string) => ` ${nameKey(t)} | ${nameKey(t.replace(/'s(?![\p{L}\p{N}])/gu, ""))} `;
  const keyed = keyOf(title);
  // …and a name kept with its capitals only in the title's capitalised words, each other word a
  // "&&" no name holds: "D.R. Horton" is "D. R. Horton", "olympic american water polo" no American Water (batch 61)
  const keyedCapitals = keyOf(title.replace(/(?<![\p{L}\p{N}'])\p{Ll}[\p{L}\p{N}'.-]*/gu, "&&"));
  // A one-word name kept without the apostrophe its SEC title dropped ("kohls") names "Kohl's
  // names new CEO" read with the apostrophes out (batch 54). Only as a second try: out, "Ford's"
  // would read "fords" and no longer name Ford. And only a possessive's: out of "she'll", it read
  // "shell" and named Shell (batch 58, the 2026-10-26 audit), and out of "It's", "Its", Southern ITS
  // (batch 61, the scoring audit).
  const bareTitle = title.replace(/(\p{L}+)'(?=s(?![\p{L}\p{N}]))/gu, (all, stem: string) => (CONTRACTED.has(stem.toLowerCase()) ? all : stem));
  let sawOblique = false;
  let sawWord = false;
  for (const a of aliases) {
    if (a.length < 3 || CAPITALS.test(a)) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(a.toUpperCase())}(?![\\p{L}\\p{N}.-])`, "u");
      if (re.test(title)) return "named";
      continue;
    }
    // the first place the title has the name — with its capitals, every word's, when the name keeps them
    const capital = cased && a[0] !== a[0].toLowerCase();
    const first = (re: RegExp, text: string): RegExpExecArray | null => {
      const low = text.toLowerCase();
      for (let m = re.exec(low); m; m = re.exec(low)) {
        if (!capital || [...m[0].matchAll(/(?<![\p{L}\p{N}'])\p{L}/gu)].every((w) => text[m.index + w.index] !== w[0])) return m;
        sawWord = true;
      }
      return null;
    };
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(a.toLowerCase())}(?![\\p{L}\\p{N}])`, "gu");
    let m = first(re, title);
    let read = title;
    if (!m && !a.includes(" ") && bareTitle !== title) {
      const bare = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(a.toLowerCase().replace(/'/g, ""))}(?![\\p{L}\\p{N}])`, "gu");
      m = first(bare, bareTitle);
      read = bareTitle;
    }
    if (!m) {
      const key = nameKey(a);
      if (key.includes(" ") && (capital ? keyedCapitals : keyed).includes(` ${key} `)) return "named";
      continue;
    }
    // Multi-word aliases ("ford motor company") can't be a surname; only single tokens can.
    if (!a.includes(" ")) {
      const before = read.slice(0, m.index);
      const preceding = /(\p{Lu}[\p{L}'’.-]*)\s+$/u.exec(before)?.[1]?.toLowerCase() ?? null;
      if (preceding && !lowered.includes(preceding) && !WEAK_TOKENS.has(preceding)) {
        sawOblique = true;
        continue;
      }
    }
    return "named";
  }
  return sawOblique ? "oblique" : sawWord ? "word" : "none";
}

/**
 * Free tier. Scores what provenance already settles, and returns null only where the answer
 * genuinely needs judgement — which is what the paid model tier is for.
 *
 * **Exhaustive over `EventType` on purpose.** This used to end in a bare `return null`, so a new
 * event kind fell through to the *paid* tier by default and nobody found out until a bill.
 * On-chain was exactly that case: a USDC mint read off the USDC contract is as certain as a
 * filing under a CIK, and it was being sent to a model to have its aboutness assessed. The
 * switch below has no default arm, so adding a kind stops compiling until someone decides which
 * side of the line it is on.
 *
 * `strictHeadline` is a product decision rather than a fact: it demotes company news whose
 * *headline* never names the subject. That removes market-roundup noise, at the cost of
 * demoting oblique headlines like "iPhone maker rebounds".
 */
/** The company's own name as a name key when it is one word the word list holds: "TARGET" for "Target Corp". */
function ownWordName(displayName: string): string | null {
  const key = oneWordName(commonName(withoutTag(displayName)));
  return key && isListedWord(key) ? key : null;
}

export function deterministicScore(
  row: ScorableRow,
  subject: SubjectContext,
  aliases: string[],
  strictHeadline = false
): Scored | null {
  switch (row.kind) {
    // Indexed under the company's own CIK — it cannot be about anyone else. A fund's CIK is its
    // trust's, though, and the trust files for every series it sells, so a registrant form is
    // likely but not certainly about this fund (NC-139): still shown, no longer certain.
    case "filing":
    case "earnings":
      if (REGISTRANT_FORM.test(row.title)) {
        return { score: 0.7, reason: "filed by the fund's registrant, which files for every series it sells" };
      }
      return { score: 1, reason: "filed under the subject's CIK" };

    // Extracted from the article the subject resolves to.
    case "history":
      return { score: 1, reason: "extracted from the subject's own article" };

    /**
     * A split or a dividend comes from the price adapter for this ticker. Same standing as a
     * filing: it is a corporate action *of* the subject, not a report about one.
     */
    case "corporate_action":
      return { score: 1, reason: "a corporate action on the subject's own ticker" };

    /**
     * Read from the subject's own contract or its own chain — a USDC mint is a transfer on the
     * USDC contract, a halving is a Bitcoin block. Certainty here is the point of on-chain data,
     * and paying a model to re-assess it would be paying to weaken it.
     *
     * Materiality is already settled upstream: a supply move below the token's bar is never
     * ingested, so every on-chain row that exists is one we judged worth showing.
     */
    case "onchain":
      return { score: 1, reason: "read from the subject's own contract or chain" };

    /**
     * The reader placed it on this subject themselves. Never persisted today — annotations live
     * in the browser — but scored explicitly so that if they ever are, nobody pays a model to
     * decide whether someone's own note is about the thing they attached it to.
     */
    case "annotation":
      return { score: 1, reason: "the reader attached it to this subject" };

    /**
     * Mined from the reference list of the subject's own article, so the link to the subject is
     * structural. Below a filing because the *cited work* can be broader than the subject — it
     * supports a sentence about them rather than being about them.
     */
    case "citation": {
      /**
       * Only a Wikipedia reference-list citation is "cited by the subject's own article". Internet
       * Archive items are typed citation too, but they come from a keyword search with nothing but
       * a date floor — "Russian Korean Japanese PBT Keycap…" reached Alibaba's page at 0.9 and
       * never met the model (NC-131). They are judged like a headline: on whether the title or
       * the archive's creator names the subject.
       */
      if (row.sourceKey === "internet_archive") {
        const creator = (row.byline ?? "").replace(/^Internet Archive(?:\s*·\s*)?/, "");
        const named = mentions(`${row.title} ${creator}`, aliases);
        if (named === "named") return { score: 0.7, reason: "archive item that names the subject" };
        if (named === "oblique") return null;
        return { score: 0.2, reason: "archive item that never names the subject" };
      }
      return { score: 0.9, reason: "cited by the subject's own article" };
    }

    // Phrase search over digitised pages, and OCR is noisy enough to keep this off 1.
    case "press":
      return { score: 0.7, reason: "phrase match in a digitised newspaper page" };

    case "news": {
      const named = mentions(row.title, aliases);
      // A company whose own name is one everyday word reaches GDELT by the word, so a headline with
      // it only in lowercase is the word's, not the company's: "IMF urges retaining 5 % inflation
      // target" is no Target news (batch 59). With its capital it still names the company, and
      // "Southern California wildfires spread" still reads as Southern Company's.
      if (named === "word" && subject.kind === "company" && ownWordName(subject.displayName)) {
        return { score: 0.2, reason: "headline uses the company's name only as an everyday word" };
      }
      if (named === "named") return { score: 0.9, reason: "headline names the subject" };
      // "Harrison Ford wins award" matches the token but reads as a person — a judgement
      // call in both modes, so it goes to the model rather than being scored or demoted.
      if (named === "oblique") return null;
      if (strictHeadline) return { score: 0.2, reason: "headline never names the subject" };
      // headline is oblique — a real judgement call, so it goes to the model
      return null;
    }

    /**
     * Left for the model deliberately, and this is the case the others are measured against.
     * A Federal Register rule reaches an industry through a *keyword query* built from the
     * industry's name, so whether it actually bears on that sector is exactly the judgement we
     * cannot make from provenance. Scoring it here would be inventing certainty.
     */
    case "regulation":
      // A Justice Department release reaches a company only when its title makes the company a
      // party — it pays, it is sued, its merger is blocked (lib/doj.ts, batch 32) — a stricter test
      // than naming it, and one "Justice Department Sues Monopolist Google" fails as a headline.
      if (subject.kind === "company" && row.sourceKey === "doj_press") {
        return { score: 0.95, reason: "a Justice Department release naming the company as a party" };
      }
      // …but a company's own document reaches it only when the title names it (lib/frCompany.ts),
      // so on a company subject that title is the evidence (2026-10-17 proposal 4).
      if (subject.kind === "company" && mentions(row.title, aliases) === "named") {
        return { score: 0.95, reason: "the document's title names the company" };
      }
      return null;

    /**
     * A proposal read from the protocol's own governance space is about that protocol by
     * construction, the same way a filing is about its filer. Scored here so a high-volume
     * governance feed never becomes a model bill.
     */
    case "governance":
      return { score: 1, reason: "a vote in the subject's own governance space" };

    /**
     * An incident is only attached to a subject it actually names, or to a chain it happened on
     * above a high bar — both decided at ingest, from structured fields rather than a headline.
     * There is nothing left for a model to judge.
     */
    case "exploit":
      return { score: 1, reason: "an incident recorded against the subject itself" };

    // Linked only to the curated economy subject that holds them (lib/macro.ts), which is what
    // they are about by construction; no company is ever their subject.
    case "macro":
      return { score: 1, reason: "a Fed decision or CPI release, held by the economy subject" };

    // Filed with NHTSA or the FDA by a maker or firm the company owned on that day, checked by
    // hand (lib/recalls.ts, lib/fdaRecalls.ts): about the company by construction, as a filing is.
    case "recall":
      return { score: 1, reason: "a recall filed by a maker or firm the company owned that day" };
  }
}

/**
 * The free tier over a subject's rows: the scores to write, the rows to clear, and the rows left
 * for the model. A row with a `prior` score is one this tier scored before (`npm run score --
 * --rescore`, batch 59): it is written again only when the rules now say otherwise, and cleared,
 * back to the model, when they no longer settle it — as ingest re-scores a row it fetches again.
 * A model's score is never passed in.
 */
export function freePass(
  rows: (ScorableRow & { prior?: number | null })[],
  subject: SubjectContext,
  aliases: string[],
  strictHeadline = false
): { scores: { eventId: number; score: number }[]; cleared: number[]; remaining: ScorableRow[] } {
  const scores: { eventId: number; score: number }[] = [];
  const cleared: number[] = [];
  const remaining: ScorableRow[] = [];
  for (const row of rows) {
    const verdict = deterministicScore(row, subject, aliases, strictHeadline);
    const prior = row.prior ?? null;
    if (verdict) {
      // a real holds 0.9 as 0.89999998, so a score is compared with room for that
      if (prior === null || Math.abs(prior - verdict.score) > 1e-6) scores.push({ eventId: row.eventId, score: verdict.score });
      continue;
    }
    if (prior !== null) cleared.push(row.eventId);
    remaining.push(row);
  }
  return { scores, cleared, remaining };
}

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens: number; output_tokens: number };
}

export interface ModelScoreResult {
  scores: Map<number, number>;
  inputTokens: number;
  outputTokens: number;
  /** items in the reply that failed validation and were dropped */
  rejected: number;
  /** set when the batch looks steered rather than judged — its scores must not be written */
  suspect: string | null;
}

/**
 * A batch this size or larger, scored 0 across the board, is held back instead of written.
 *
 * Only headlines the free tier could not settle reach the model, and a zero hides an event below
 * the relevance floor. One planted headline telling the model to zero its neighbours is the cheap
 * way to hide a batch, and its signature is exactly this. Leaving the rows unscored fails safe:
 * an unscored row still displays (NC-153).
 */
export const ALL_ZERO_MIN = 3;

/**
 * Paid tier, batched: one request scores many headlines, so cost scales with new
 * content rather than with rows or pageviews.
 */
export async function scoreBatchWithModel(
  rows: ScorableRow[],
  subject: SubjectContext,
  apiKey: string
): Promise<ModelScoreResult> {
  const subjectLine =
    subject.kind === "company"
      ? `${subject.displayName} (a publicly traded company, ticker ${subject.ticker ?? "?"})`
      : `${subject.displayName} (a general topic)`;

  // headlines are fetched text, so they go in as data the model is told not to obey (NC-153)
  const items = rows.map((r, i) => ({ i: i + 1, headline: r.title.replace(/\s+/g, " ").slice(0, 200) }));

  const prompt =
    `Subject: ${subjectLine}\n\n` +
    `Score how much each headline below is *about* that subject.\n` +
    `1.0 = primarily about the subject\n` +
    `0.6 = subject is a significant secondary subject\n` +
    `0.3 = passing mention only\n` +
    `0.0 = not about the subject (e.g. a general market roundup, or about a different company)\n\n` +
    `The headlines, one JSON object per line, numbered by "i":\n` +
    `${untrustedNotice("headlines")}\n\n` +
    `${dataBlock("headlines", items)}\n\n` +
    `Reply with ONLY a JSON array, one object per headline: [{"i":1,"s":0.9}, ...]`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const json = (await res.json()) as AnthropicResponse;
  const text = json.content?.find((c) => c.type === "text")?.text ?? "";
  const reply = parseScoreReply(text, rows.length);
  const scores = new Map<number, number>();
  for (const [i, s] of reply.scores) scores.set(rows[i - 1].eventId, s);

  const allZero = scores.size >= ALL_ZERO_MIN && [...scores.values()].every((s) => s === 0);
  return {
    scores,
    inputTokens: json.usage?.input_tokens ?? 0,
    outputTokens: json.usage?.output_tokens ?? 0,
    rejected: reply.rejected,
    suspect: allZero ? `all ${scores.size} headlines scored 0` : null,
  };
}
