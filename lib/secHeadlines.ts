/**
 * The press release inside an 8-K, read for its headline (batch 42).
 *
 * An 8-K is titled by its item ("Other events (8-K 8.01)"), which says what kind of thing was
 * reported and nothing about what it was. Many carry the company's press release as an exhibit
 * (EX-99, or EX-20 before 2004), and its headline is the one line a reader wants: "Boeing Sets 787
 * First Delivery Date for Mid-First Quarter 2011". This reads that line. Of 638 8-Ks sampled from
 * 57 companies (2026-10-24), 378 carried such an exhibit and 247 gave a headline.
 *
 * **Only a press release gives a headline.** An EX-99 is just as often a contract, a slide deck,
 * a certification or a list of terms, and their first lines are no headline at all. A document
 * counts as a press release only when it has a dateline — "DEARBORN, Mich., Sept. 1, 2004 –" —
 * near the top; without one it gives nothing, and the filing keeps its item title.
 */

/**
 * Bumped when the reading changes, so headlines read by an older version are read again. 2 (batch
 * 43): an announcement with no dateline is read by its lead paragraph, and a 6-K's own document
 * past its cover page. 3 (batch 44): a results release with neither, by its headline.
 */
export const HEADLINE_VERSION = 3;

/** The exhibit types a press release is filed under: EX-99.x, and EX-20 before the 2004 rules. */
const RELEASE_EXHIBIT = /^EX-(?:99|20)\b/i;

/**
 * The documents of a filing that can hold its press release, from the filing's index page
 * (`…/{accession}-index.htm`), in the order filed. A filing from before about 2001 has no
 * per-document index, only its full submission text; `submission` names that file instead.
 */
export function releaseExhibits(indexHtml: string): {
  exhibits: string[];
  submission: string | null;
  /** how many documents the index lists one by one: none for a filing from before about 2001 */
  documents: number;
  /** a 6-K's own document, which often carries the announcement itself */
  primary: string | null;
} {
  const exhibits: string[] = [];
  let submission: string | null = null;
  let primary: string | null = null;
  let documents = 0;
  for (const row of indexHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? [];
    const href = row.match(/href="([^"]+)"/i)?.[1];
    if (!href) continue;
    const text = cells.map((c) => c.replace(/<[^>]+>/g, "").trim());
    if (/^Complete submission text file/i.test(text[1] ?? "")) {
      submission = href;
      continue;
    }
    if (cells.length >= 4 && text[3] && !href.endsWith("/")) documents++;
    if (cells.length >= 4 && /^6-K(?:\/A)?$/i.test(text[3]) && /\.(?:htm|html|txt)$/i.test(href)) {
      primary ??= href.replace(/^\/ix\?doc=/, "");
    }
    if (cells.length >= 4 && RELEASE_EXHIBIT.test(text[3]) && /\.(?:htm|html|txt)$/i.test(href)) {
      // inline-XBRL viewer links ("/ix?doc=/Archives/…") point at the same file
      exhibits.push(href.replace(/^\/ix\?doc=/, ""));
    }
  }
  return { exhibits, submission, documents, primary };
}

/** The press-release exhibits inside a full submission text (`<DOCUMENT>…<TYPE>EX-99…`). */
export function exhibitsInSubmission(text: string): string[] {
  const out: string[] = [];
  for (const doc of text.match(/<DOCUMENT>[\s\S]*?<\/DOCUMENT>/gi) ?? []) {
    const type = doc.match(/<TYPE>([^\n<]+)/i)?.[1].trim() ?? "";
    if (RELEASE_EXHIBIT.test(type)) out.push(doc);
  }
  return out;
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”",
  ldquo: "“", mdash: "—", ndash: "–", bull: "•", middot: "·", reg: "®", trade: "™", copy: "©", hellip: "…",
};
/** The Latin-1 letters by entity name ("eacute" → é), as `&Nestl&eacute;` writes them. */
const LATIN1 =
  "Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde " +
  "Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde " +
  "auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml " +
  "divide oslash ugrave uacute ucirc uuml yacute thorn yuml";
LATIN1.split(" ").forEach((name, i) => (ENTITIES[name] = String.fromCharCode(0xc0 + i)));
/**
 * Windows-1252's characters at 0x80–0x9F, where Unicode has control codes. An older filing writes
 * its dashes and quotes there — as raw bytes, or as `&#151;` and `&#146;` — and means these by them.
 * (Node's own windows-1252 decoder hands back the control codes, so the table is spelled out.)
 */
const CP1252_HIGH = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ";
function fromWindows1252(s: string): string {
  return s.replace(/[\u0080-\u009f]/g, (c) => CP1252_HIGH[c.charCodeAt(0) - 0x80]);
}
function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
    }
    return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m;
  });
}

/**
 * A document's bytes as text. EDGAR serves documents without a character set, and older ones are
 * Windows-1252: read as UTF-8, their dashes and curly quotes come out as replacement marks, and a
 * dateline's dash is the very character the reading depends on.
 */
export function decodeDocument(bytes: ArrayBuffer | Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return utf8.includes("\uFFFD") ? fromWindows1252(new TextDecoder("latin1").decode(bytes)) : utf8;
}

/**
 * A document's visible text, one line per paragraph or table row. HTML is split at its block
 * tags and nowhere else — the line breaks inside a paragraph are only the filer's word wrap — and
 * plain text keeps its own lines. The SGML wrapper EDGAR puts round every document is dropped,
 * and so are the `<PAGE>`, `<TABLE>` and `<S>` marks inside an old plain-text filing.
 */
export function textLines(doc: string): string[] {
  let t = doc.replace(/^[\s\S]*?<TEXT>/i, "").replace(/<\/TEXT>[\s\S]*$/i, "");
  t = t.replace(/<(script|style|head|title)\b[\s\S]*?<\/\1>/gi, " ");
  const html = /<(?:html|body|p|div|font|br)\b[^>]*>/i.test(t);
  if (html) {
    t = t
      .replace(/\s+/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?(?:p|div|tr|li|h[1-6]|table|center|ul|ol)\b[^>]*>/gi, "\n")
      .replace(/<\/t[dh]>/gi, " ")
      .replace(/<[^>]+>/g, "");
  } else {
    t = t.replace(/<\/?(?:PAGE|TABLE|CAPTION|S|C|FN|F\d+)>/gi, "\n");
    // a plain-text release sets its contacts in a column beside the headline, a wide gap apart:
    // "Schering-Plough Announces Sale        Steve Galpin, Jr." — each column is its own line
    t = t.replace(/^[ \t]*(\S.*?\S)[ \t]{4,}(\S.*)$/gm, "$1\n$2");
  }
  return fromWindows1252(decode(t))
    .replace(/[\u00a0\u2002\u2003\u2009\u200b]/g, " ")
    .split("\n")
    // "[AMAZON.COM Graphic]", "[LOGO]": where an image sat; "( BW)(CA-AMGEN-INC)(AMGN)": Business
    // Wire's old routing code before a headline
    .map((l) => l.replace(/\[[^\]]{0,40}\]/g, " ").replace(/^\s*\(\s?BW\)(?:\s?\([^)]{1,40}\))*/, "").replace(/\s+/g, " ").trim())
    .filter((l) => l && !/^-{3,}$/.test(l.replace(/\s/g, "")))
    // a bullet set in a cell of its own, "•" then its text, is one line: a page of them otherwise
    // takes two lines each and pushes Cisco's 2022 dateline to line 40
    .reduce<string[]>((out, l) => {
      // an empty bullet before the dateline marks nothing: UBS ends a list with one
      if (out.length && BULLET_MARK.test(out[out.length - 1])) out[out.length - 1] = opensWithDateline(l) ? l : `• ${l}`;
      else out.push(l);
      return out;
    }, []);
}
/** A bullet's mark alone on its line: "•", and "o" or "◦" for a bullet under it. */
const BULLET_MARK = /^[•·▪●■◦o\uf0b7\uf0a7]$/;

const MONTH = String.raw`(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Za-z]*\.?`;
// "Sept. 1, 2004", and the day first as Europe writes it: "10 July 2017"
// and with no space after an abbreviation's point: "CINCINNATI, Nov.1, 2005 -"
const DATE = String.raw`(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,?\s+)?(?:${MONTH}(?:\s+|(?<=\.))\d{1,2}(?:st|nd|rd|th)?\b(?:,?\s*\d{4})?|\d{1,2}\s+${MONTH}\s+\d{4})`;
const PLACE_WORD = String.raw`(?:[A-Z][A-Za-z'’.-]*|of|de|la)`;
const PLACE = String.raw`${PLACE_WORD}(?:\s${PLACE_WORD}){0,3}`;
const CAPS_PLACE = String.raw`[A-Z][A-Z'’.-]+(?:\s[A-Z][A-Z'’.-]+){0,2}`;
// a state or country after the city, "the" allowed before it: "VELDHOVEN, the Netherlands,"
const STATE = String.raw`(?:,\s*(?:the\s)?[A-Z][A-Za-z.]*(?:\s[A-Z][A-Za-z.]*)?){0,2}`;
// a lone hyphen only with a space beside it: "2007 - The…", never the one inside "WAL-MART"
const DASH = String.raw`(?:--|—|–|\s-|-\s|/\s*PRNewswire[\w-]*\s*/|\(BUSINESS WIRE\)|\(PRNewswire\)|\(GLOBE NEWSWIRE\))`;
/** A joint release's second city: "OSAKA, Japan / PALO ALTO, Calif. –", "NEW YORK, N.Y. and BOULDER, Colo.," */
const SECOND_PLACE = String.raw`(?:\s*(?:/|and|&)\s*${CAPS_PLACE}${STATE})?`;
/** …and before a date, in any case: "Burbank, CA and Las Vegas, NV (February 6, 2006) —" */
const SECOND_PLACE_DATED = String.raw`(?:\s*(?:/|and|&)\s*${PLACE}${STATE})?`;
/** At the start of a line: "DEARBORN, Mich., Sept. 1, 2004 –", "New York, January 18 --" */
// the date in brackets too: "Burbank, CA and Las Vegas, NV (February 6, 2006) —"
const DATELINE = new RegExp(String.raw`^(${PLACE})${STATE}${SECOND_PLACE_DATED}[,\s]*(?:[—–-]\s*)?\(?${DATE}\)?\s*${DASH}`);
/** At the start of a line, with no date: "CUPERTINO, CALIFORNIA — Apple today…" — the place in capitals */
const DATELINE_UNDATED = new RegExp(String.raw`^(${CAPS_PLACE})${STATE}${SECOND_PLACE}\s*${DASH}\s*\S`);
/** Inside a run of text with no line breaks, where only a place in capitals with a date is trusted */
const DATELINE_IN_RUN = new RegExp(String.raw`(?:^|\s)((${CAPS_PLACE})${STATE}[,\s]*(?:[—–-]\s*)?${DATE}\s*${DASH})\s*\S`);
/**
 * "EXHIBIT 99 --", "NEWS RELEASE -", "Page 2 -", "GBP - British Pound" (a currency in a share-dealing
 * table): a word in the place's spot that is no place
 */
const NOT_A_PLACE = /^(?:EXHIBIT|EX|NEWS|PRESS|RELEASE|PAGE|FOR|CONTACT|CONTACTS|MEDIA|INVESTOR|INVESTORS|NOTE|SLIDE|ITEM|SECTION|TABLE|SOURCE|UPDATE|STATEMENT|AND|THE|USD|EUR|GBP|GBX|JPY|CHF|CAD|AUD|HKD|CNY|SEK|NOK|DKK|INR)\b/i;

/**
 * With no date before the dash, a place in capitals must open a sentence — "DETROIT – General Motors
 * (NYSE: GM) today reported…" — or carry its date after a wire's name, "SEATTLE -- (BUSINESS WIRE) --
 * January 23, 2003 --", or sit on a line short enough to be wrapped plain text. A contents line,
 * "CORE RESULTS - Reconciliation from IFRS® Accounting Standards results…", does none of these.
 */
const OPENS_SENTENCE = new RegExp(
  String.raw`\b(?:today|announced|announces|reported|reports|said|says|is|are|was|were|has|have|had|will|would)\b|${DATE}`,
  "i"
);

/** Whether `line` opens with a dateline — one with a date, when `dated`. */
function opensWithDateline(line: string, dated = false): boolean {
  const m = DATELINE.exec(line);
  if (m) return !NOT_A_PLACE.test(m[1]);
  const u = dated ? null : DATELINE_UNDATED.exec(line);
  return u !== null && !NOT_A_PLACE.test(u[1]) && (line.length < 70 || OPENS_SENTENCE.test(line.slice(u[0].length - 1)));
}

/**
 * …or one with no date whose sentence says "today": "…Third-Quarter 2022 Results DETROIT – General
 * Motors Co. (NYSE: GM) today reported…"
 */
const DATELINE_IN_RUN_TODAY = new RegExp(String.raw`(?:^|\s)((${CAPS_PLACE})${STATE}\s*${DASH})\s*(?=[A-Z].{0,100}?\btoday\b)`);

/** Where a dateline starts inside a run of text, or -1. */
function datelineInRun(run: string): number {
  for (const source of [DATELINE_IN_RUN, DATELINE_IN_RUN_TODAY]) {
    const re = new RegExp(source.source, "g");
    for (let m = re.exec(run); m; m = re.exec(run)) {
      if (!NOT_A_PLACE.test(m[2])) return m.index + m[0].indexOf(m[1]);
    }
  }
  return -1;
}

/**
 * Lines of the letterhead above a headline: exhibit labels, release markers, contacts and their
 * titles. The headline is looked for after the last of them.
 */
const LETTERHEAD = [
  /^(?:ex(?:hibit)?\.?\s*[-\s]?\s*(?:99|20)(?:\.\d+)?|EX-\d+(?:\.\d+)?)\b[\s.:-]*$/i,
  /^-?\s*(?:news|press)(?:\s+release)?\s*-?$/i,
  // but not "News Summary:", which heads the bullets under Cisco's headline
  /^(?:corporate\s+)?(?:news|statement|press\s+release|news\s+release|media\s+release|for\s+release|release)\b(?!\s+(?:summary|highlights)\b).{0,30}$/i,
  /^(?:for\s+)?immediate(?:ly)?\s*(?:release)?\b/i,
  /^release(?:d)?\s*(?:date)?\b/i,
  /^(?:media|investor|press|analyst|financial|news)?\s*(?:contacts?|inquiries|relations)\b/i,
  /\bcontacts?\s*:/i,
  /^quicklinks\b|click here to rapidly navigate/i,
  /^(?:the\s+)?(?:text\s+of\s+)?(?:the\s+)?(?:press|news)\s+release\b/i,
  /^note\s+to\s+(?:editors|analysts|reporters|media)\b/i,
  /\b(?:vice\s+president|director|manager|spokes(?:person|man|woman))\b.*\b(?:relations|communications|affairs|media)\b/i,
  /^(?:(?:corporate|investor|media|public|community|global|external|financial)\s+)+(?:communications|relations|affairs)\b/i,
  /\b(?:global|corporate|group)\s+communications$/i,
  /^(?:(?:senior|executive|group|corporate)\s+)*(?:vice\s+president|president|director|manager|spokes(?:person|man|woman))\b/i,
  // a foreign company's announcement markers: "Media Release · Communiqué aux médias · Medienmitteilung",
  // "Financial Results | Résultats financiers | Finanzergebnisse", "Not for release, publication or
  // distribution in…"
  /^media\s+release\b|\bmedienmitteilung\b|communiqu[eé]\s+aux\s+m[eé]dias|r[eé]sultats\s+financiers|\bfinanzergebnisse\b/i,
  /^-?\s*(?:investor\s+relations\s+|media\s+|press\s+|news\s+)?release\s*-?$/i,
  // a company's name alone on its line, as a letterhead sets it: "Shell plc", "Novartis International AG"
  /^[A-Z][\w&.,'’-]*(?:\s[\w&.,'’-]+){0,3}\s(?:plc|PLC|Inc\.?|Ltd\.?|Limited|AG|N\.V\.|S\.A\.|SE|Corp\.?|Corporation)$/,
  // a European postcode: "CH-4002 Basel", "D-69190 Walldorf"
  /^[A-Z]{1,2}-\d{4,5}\s+[A-Z]/,
  /^not\s+for\s+(?:release|publication|distribution)\b/i,
  // "1-7-1 Konan, Minato-ku Tokyo 108-0075", "No.12-043E": a Japanese address and release number
  /^\d+-\d+-\d+\s|\b\d{3}-\d{4}\b.*\b(?:Tokyo|Osaka|Japan)\b|\bNo\.\s?\d{2}-\d{3}E\b/i,
];
/**
 * Lines that are never a headline but say nothing about where one is: a date alone, a page number,
 * a rule, a table's heading, a court's caption. Unlike the letterhead they do not move the search —
 * "(Dollars in millions…)" under a 1997 headline is a table's, and the headline is above it.
 */
const NOISE = [
  new RegExp(String.raw`^(?:${DATE}|\d{1,2}/\d{1,2}/\d{2,4})$`, "i"),
  // "June 17, 2019 6:45 a.m. EDT | 4:45 a.m. MDT": when a release went out
  new RegExp(String.raw`^(?:${DATE}\b.*)?\d{1,2}:\d{2}\s*[ap]\.?m\b`, "i"),
  /^(?:notes\s+to\s+(?:the\s+)?)?(?:(?:interim|unaudited|condensed)\s+)*consolidated\s+(?:financial\s+)?(?:statements?|balance\s+sheets?)\b/i,
  /\band\s+(?:its\s+)?subsidiaries$/i,
  /^\(/,
  /\b(?:district|circuit|superior|bankruptcy)\s+court\b|^case\s+no\b/i,
  /^(?:page\s*)?\d+(?:\s+of\s+\d+)?$/i,
  /^part\s+[ivx]+\b/i,
  /^item\s+\d+[a-z]?\.?\s/i,
  /^legal\s+entity\s+identifier\b/i,
  // a numbered section of a form, and a letter's subject line: "4 - Details of the transaction(s)", "Re: …"
  /^\d{1,2}\s*[-–.)]\s+[A-Z]/,
  /^re:\s/i,
  /^herewith\b|\bwe\s+(?:hereby\s+)?furnish\b/i,
  // the desks a wire story was sent to: "Business Editors/Health/Medical Writers"
  /^business\s+editors\b/i,
  // a Swiss filer's "Ad hoc announcement pursuant to Art. 53 LR", which Novartis sets under the headline
  /^ad[\s-]hoc\s+announcement\b/i,
  // a place and a date with no dash, on a line of their own or before a label: "Basel, Switzerland,
  // January 28, 2013 Management announcement"
  new RegExp(String.raw`^${PLACE}${STATE}[,\s]+${DATE}\b(?!\s*${DASH})`),
];
/** A rule between lines: "-", "* * *", "|". */
const SEPARATOR = /^[|•·*_=\s-]+$/;
const URLISH = /(?:https?:\/\/|www\.|@[a-z0-9-]+\.[a-z])/i;
// and an international number: "+31 40 268 6494", "+44 (0) 207 934 5550"
const PHONE = /\(?\d{3}\)?[\s./-]\d{3}[\s.-]\d{4}|\b\d\.\d{3}\.\d{3}\.\d{4}\b|\+\d{1,3}[\s.-]?(?:\(\d+\)[\s.-]?)?\d{1,4}(?:[\s.-]\d{2,4}){2,}/;
// an address: "Suite 185", "P.O. Box 3707", "5959 Las Colinas Boulevard", a ZIP code — but not a
// headline that names a "Product Suite" and a "7/5 Nanometer Node" further on
const ADDRESS = new RegExp(
  [
    String.raw`\b(?:P\.?\s?O\.?\s?Box|Suite|Room|Floor)\s+#?\d`,
    String.raw`\b\d+\s+(?:[NSEW]\.?\s+)?(?:[A-Z][\w.'’-]*\s+){1,4}(?:Avenue|Ave\.?|Street|St\.?|Drive|Dr\.?|Road|Rd\.?|Boulevard|Blvd\.?|Parkway|Pkwy\.?|Plaza|Way|Lane|Place)\b`,
    String.raw`\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b`,
    String.raw`\bNYSE\s*(?:symbol|:)`,
    String.raw`\b(?:NYSE|NASDAQ|Nasdaq)\s*:\s*[A-Z]+\s*$`,
  ].join("|")
);

function isLetterhead(line: string): boolean {
  return LETTERHEAD.some((re) => re.test(line)) || URLISH.test(line) || PHONE.test(line) || ADDRESS.test(line);
}

function isBoilerplate(line: string): boolean {
  return isLetterhead(line) || NOISE.some((re) => re.test(line)) || SEPARATOR.test(line);
}

const ABBREV_END = /\b(?:Inc|Co|Corp|Ltd|L\.P|N\.A|U\.S|U\.K|Jr|Sr|No|St|Bros|Cos|Mfg|plc)\.$/i;
/** A line that could be a headline: words, not a sentence, not a scrap. */
function headlineLike(line: string): boolean {
  if (line.length < 12 || line.length > 260) return false;
  if (isBoilerplate(line)) return false;
  const words = line.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
  if (words.length < 4) return false;
  if (/^[•·*–—-]/.test(line)) return false;
  // a sentence of body text ends with a period; a headline almost never does
  if (/\.$/.test(line) && !ABBREV_END.test(line)) return false;
  if (/:$/.test(line)) return false;
  // a table row or a contents page: mostly figures
  const tokens = line.split(/\s+/);
  if (tokens.filter((t) => /^[(\-$]?[\d.,]+%?\)?$/.test(t)).length * 3 > tokens.length) return false;
  // a long line in sentence case is body text: a headline that long capitalises its words
  if (line.length > 220 && words.filter((w) => /^[A-Z]/.test(w)).length * 2 < words.length) return false;
  return true;
}

/** Whether `next` carries on the headline in `cur` rather than being a subheadline under it. */
function continues(cur: string, next: string): boolean {
  if (!next || isBoilerplate(cur) || isBoilerplate(next) || /^[•·*]/.test(next)) return false;
  if (/[.!?"”]$/.test(cur) && !ABBREV_END.test(cur)) return false;
  // "Boeing Sets 787 First Delivery Date" / "for Mid-First Quarter 2011"; and a line left on a comma
  if (/^[a-z(]/.test(next) || /[,;]$/.test(cur)) return true;
  // a line in capitals over one that is not is a headline over its subheadline
  if (inCapitals(cur) !== inCapitals(next)) return false;
  // a line cut after a word a headline cannot end on: "GE Announces Its Intent to Explore
  // Strategic Options for" / "Consumer & Industrial…", "…Elects to Leave After 18" / "Years of Service"
  if (WRAPS_AFTER.test(cur)) return true;
  // a subject on one line and its verb on the next: "THE BOARD OF DIRECTORS OF THE COCA-COLA
  // COMPANY" / "ELECTS ALEXIS M. HERMAN AS DIRECTOR"
  if (STARTS_WITH_VERB.test(next) && !HAS_VERB.test(cur)) return true;
  // the last words alone on their line: "…Federal Aviation Administration 787" / "Action",
  // "Walmart Board of Directors Adds Former Accenture" / "CFO Pamela Craig" — unless they repeat
  // the line above, as a label does: "Boeing Reports Second Quarter Results" / "Second Quarter 2024"
  // — and three words only without a figure, which a subheadline carries: "Revenue $11.1 billion"
  const n = next.split(/\s+/).length;
  if ((n <= 2 || (n === 3 && !/\d/.test(next))) && !/[.!?]$/.test(next) && !sharesPair(cur, next)) return true;
  // "FORD ANNOUNCES SENIOR MANAGEMENT CHANGES" / "WHILE CONTINUING PROGRESS ON TRANSFORMATION"
  if (!inCapitals(cur)) return false;
  // in capitals, a line that opens on a joining word carries on: "…THIRD-QUARTER RESULTS IN LINE" /
  // "WITH EXPECTATIONS, REAFFIRMS FULL-YEAR OUTLOOK"
  if (/^(?:AND|OR|FOR|TO|OF|IN|ON|AT|BY|AS|WITH|WHILE|AFTER|AMID|FROM|INTO|OVER|THROUGH|DESPITE|AHEAD)\b/.test(next)) return true;
  // and a short headline runs on over two lines: "TARGET CORPORATION FIRST QUARTER" / "EARNINGS PER
  // SHARE $0.48"; past 100 letters the second line is a subheadline in capitals too, and one that
  // opens on the line above's first two words starts a headline of its own: "AMERICAN EXPRESS Q3
  // 2026 RESULTS" / "AMERICAN EXPRESS RAISES…"
  const opening = (l: string) => l.split(/\s+/).slice(0, 2).join(" ");
  return cur.length + next.length <= 100 && opening(cur) !== opening(next);
}
const VERBS = String.raw`(?:reports?|announces?|names?|elects?|appoints?|declares?|completes?|adds?|rejects?|acquires?|` +
  String.raw`approves?|agrees?|launches|unveils|introduces|posts?|delivers?|raises?|sets?|plans?|updates?|reaffirms?|` +
  String.raw`provides?|issues?|prices?|increases?|expects?|to)`;
const STARTS_WITH_VERB = new RegExp(String.raw`^${VERBS}\b`, "i");
const HAS_VERB = new RegExp(String.raw`\b${VERBS}\b`, "i");
/** Whether two lines share a pair of words in a row. */
function sharesPair(a: string, b: string): boolean {
  const pairs = (s: string) => {
    const w = s.toLowerCase().split(/\W+/).filter(Boolean);
    return new Set(w.slice(1).map((x, i) => `${w[i]} ${x}`));
  };
  const pa = pairs(a);
  return [...pairs(b)].some((p) => pa.has(p));
}

/** A line that carries on from one before it rather than opening a headline: "AND THIRD QUARTER…" */
const STARTS_MID_PHRASE = /^(?:and|or|but|of|for|to|with|while|as)\s/i;

/**
 * The words a headline line can be cut after but cannot end on: joining words, a number, and the
 * verbs a release's headline turns on ("The Coca-Cola Company Reports" / "Fourth Quarter…").
 */
const WRAPS_AFTER = new RegExp(
  // "…for Combined Company Following" / "Close of Aetna Acquisition Transaction"
  String.raw`(?:^|\s)(?:and|or|but|for|to|of|in|on|at|by|as|with|from|into|the|a|an|its|their|&|following|including|during|between|through|against|via|` +
    // a number after a joining word: "…to Leave After 18" / "Years…", "…and $29.4 Billion" / "Capital…"
    // — but not a year after "of", which ends one: "…for Second Quarter of 2005" (where "Stellar Start
    // to 2021" / "Fastest Growth…" runs on)
    String.raw`(?:after|to|by|over|than|at|from|with)\s+\$?[\d.,]+%?|of\s+(?!(?:19|20)\d\d$)\$?[\d.,]+%?|(?:and|or)\s+\$?[\d.,]+%?(?:\s+(?:million|billion))?|` +
    String.raw`(?:reports?|announces?|names?|elects?|appoints?|declares?|completes?|adds?|rejects?|acquires?|` +
    String.raw`integrates?|expands?|explores?|sells?|buys?|launches|unveils|introduces|posts?|delivers?|raises?|` +
    // "updates" only: "…Delivery Update" is a noun and the line ends there
    String.raw`plans?|agrees?|updates|reaffirms?|provides?|issues?|prices?|increases?|expects?|` +
    String.raw`elected|appointed|named|promoted))$`,
  "i"
);

/** Written in capitals — "McDONALD'S REPORTS…" too: the one small letter is the name's own. */
function inCapitals(s: string): boolean {
  const letters = s.replace(/[^\p{L}]/gu, "");
  return letters.length > 0 && letters.replace(/[^\p{Ll}]/gu, "").length * 20 <= letters.length;
}

const SMALL = new Set(
  "a an and as at but by for from in into nor of off on onto or over per the to up upon via vs with".split(" ")
);
/** Words of four or more letters written in capitals as a rule, kept so in a recased headline. */
/**
 * Names a headline in capitals spells as words that are not written so: "JPMORGAN" is JPMorgan,
 * never "Jpmorgan"; "NVIDIA" stays in capitals.
 */
const CASED_NAMES = new Map(
  ("JPMorgan ExxonMobil UnitedHealth UnitedHealthcare NVIDIA FedEx PayPal BlackRock PepsiCo eBay iPhone iPad " +
    "YouTube GlaxoSmithKline AstraZeneca AmerisourceBergen LinkedIn DoorDash GlobalFoundries BioNTech MicroStrategy " +
    "AbbVie HubSpot ConocoPhillips ServiceNow CrowdStrike Salesforce.com").split(" ").map((n) => [n.toUpperCase(), n])
);
const ACRONYMS = new Set(
  "NYSE NASDAQ GAAP EBIT EBITDA NASA NHTSA OPEC NATO FDIC FINRA LIBOR SOFR ESOP HVAC LCD OLED SUVS CEOS IPOS ADRS REIT".split(" ")
);
/**
 * A headline written all in capitals, recased: "FORD'S 1993 PROFIT REFLECTED WORLDWIDE IMPROVEMENT"
 * → "Ford's 1993 Profit Reflected Worldwide Improvement". Words of up to three letters that are not
 * ordinary small words stay in capitals (IBM, GM, SUV, CEO), as do known longer acronyms and any
 * token with a digit, dot or ampersand in it (U.S., F-150, AT&T, 3M). A headline in mixed case is
 * the filer's own and is left alone.
 */
export function headlineCase(s: string): string {
  if (!inCapitals(s)) return s;
  let first = true;
  // a word is accented letters too: "NESTLÉ" → "Nestlé", never "NestlÉ"
  return s.replace(/[\p{L}\d][\p{L}'’.&\d-]*/gu, (w) => {
    const isFirst = first;
    first = false;
    if (/[\d&]/.test(w) && !/^\d+(?:ST|ND|RD|TH)$/.test(w)) return w;
    if (!w.includes("-")) return recaseWord(w, isFirst);
    // each part of a hyphenated word on its own, capitalised even when small, and kept in capitals
    // only when a known acronym: "NON-GAAP" → "Non-GAAP", "SPIN-OFF" → "Spin-Off", "WAL-MART" → "Wal-Mart"
    return w
      .split("-")
      .map((part) => (ACRONYMS.has(part) || SHORT_ACRONYMS.has(part) ? part : recaseWord(part, true, false)))
      .join("-");
  });
}

/** Three letters or fewer, in capitals as a rule, kept so inside a hyphenated word too: "CO-CEO". */
const SHORT_ACRONYMS = new Set("CEO CFO COO CTO CIO EPS IPO SUV GM IBM AI US UK EU".split(" "));

function recaseWord(w: string, isFirst: boolean, keepShort = true): string {
  if (!w) return w;
  if (/^\d+(?:ST|ND|RD|TH)$/.test(w)) return w.toLowerCase();
  if (/\.[A-Za-z]/.test(w)) return /^[A-Z]+\.(?:COM|NET)$/.test(w) ? w[0] + w.slice(1).toLowerCase() : w;
  const mc = /^(Ma?c)([A-Z]{3,})(['’]S)?$/.exec(w);
  if (mc) return mc[1] + mc[2][0] + mc[2].slice(1).toLowerCase() + (mc[3] ? mc[3].toLowerCase() : "");
  const bare = w.replace(/['’](?:S)?$/, "");
  if (ACRONYMS.has(bare)) return w;
  const cased = CASED_NAMES.get(bare);
  if (cased) return cased + w.slice(bare.length).toLowerCase();
  const low = w.toLowerCase();
  if (!isFirst && SMALL.has(low)) return low;
  if (keepShort && bare.length <= 3 && !SMALL.has(bare.toLowerCase()) && !COMMON_SHORT.has(bare.toLowerCase())) return w;
  return low[0].toUpperCase() + low.slice(1);
}
/** Ordinary short words that are not acronyms, so they are recased like any other word. */
const COMMON_SHORT = new Set(
  ("new top all one two six ten its his her our out set sets cut cuts buy buys pay pays sea air car cars net raw end ends " +
    "big low key far few law add adds act ask aid get gets hit hits job jobs lot may now old own put run see sky tax way win " +
    "won use war oil gas day sun bay hub bid bids fly fee fees due rise sir dr mr ms mrs not can has had are was who why " +
    "how yet off van vans bus box ice red year non pre " +
    // first names, which an all-capitals headline writes like an acronym
    "ann amy ben bob dan don guy hal jim joe ken kim lee max ned ray ron roy sam sue ted tim tom").split(/\s+/)
);

/** Tidies a headline: trademark marks and stray punctuation off, spacing even. */
function tidy(s: string): string {
  let t = s
    .replace(/[®™©℠]/g, "")
    // a footnote's number or a trademark's letters set on a word: "double digit core1 operating
    // income", "Novartis PluvictoTM approved" — never a model's number such as "PS5" or "F-150"
    .replace(/\b([A-Za-z]{4,}|[a-z]{2,3})[1-9]\b/g, "$1")
    // …and one after a word's comma or point: "Board endorses Sandoz spin-off,2" — never "3.5 bn"
    .replace(/(?<=[A-Za-z][,.;])\d{1,2}(?=\s|$)/g, "")
    .replace(/(?<=[a-z]{3})TM\b/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s"“'‘|:;,.–—-]+|[\s|:;,–—-]+$/g, "")
    .trim();
  // a closing quotation mark left over from a quoted title: "…in honor of Heinz Imhof”"
  if (/[”"]$/.test(t) && (t.match(/[“"]/g) ?? []).length < (t.match(/[”"]/g) ?? []).length) t = t.slice(0, -1).trim();
  return t;
}

/**
 * A 6-K's own document opens with the SEC's cover page — "REPORT OF FOREIGN PRIVATE ISSUER", the
 * registrant's address, the check boxes, often the signature — and the announcement follows it.
 * The lines after the last of the cover's own phrases in the first 70, looked for only until the
 * first paragraph of text — a signature at the end of a short announcement is not its cover. A
 * document with none of them, as every exhibit is, is left whole.
 */
const COVER_PAGE = new RegExp(
  [
    String.raw`report of foreign (?:private )?issuer`,
    String.raw`indicate by check mark`,
    String.raw`if\s+["“]yes["”]\s+is\s+marked`,
    String.raw`\(address of principal executive office`,
    String.raw`commission file (?:number|no)`,
    String.raw`registrant has duly caused this report`,
    String.raw`^by:?\s*/s/`,
    String.raw`^date:\s`,
    String.raw`^form 20-f\b.*form 40-f`,
    String.raw`^yes\b\s*:?\s*\S{0,2}\s+no\b`,
    String.raw`^(?:yes|no)\s*:?\s*\S{0,2}$`,
  ].join("|"),
  "i"
);
export function afterCoverPage(lines: string[]): string[] {
  let last = -1;
  for (let i = 0; i < Math.min(lines.length, 70); i++) {
    if (COVER_PAGE.test(lines[i])) last = i;
    else if (lines[i].length >= 200) break;
  }
  return last < 0 ? lines : lines.slice(last + 1);
}

/**
 * The lead paragraph of an announcement with no dateline, the way European and Asian companies
 * write them: "Shell plc (the ‘Company’) today announces…", "Alibaba Group Holding Limited (NYSE:
 * BABA and HKEX: 9988…) announces…". A long line where the company announces or reports, today or
 * under its exchange symbol; the headline is looked for above it, as above a dateline. Only a
 * dateline is looked for first, so a release that has one reads as before.
 */
const LEAD = new RegExp(
  String.raw`\btoday\b.{0,80}\b(?:announce[sd]?|report(?:s|ed)?|declare[sd]?|publishe[sd]|provide[sd]?|confirm(?:s|ed)?|unveil(?:s|ed)?|launch(?:es|ed)?|complete[sd]?)\b|` +
    String.raw`\b(?:announce[sd]?|report(?:s|ed)?|declare[sd]?|publishe[sd])\b.{0,40}\btoday\b|` +
    String.raw`\((?:NYSE|NASDAQ|Nasdaq|HKEX|SEHK|TSE|LSE|SIX|Euronext|NSE|BSE)\s*:[^)]{1,80}\).{0,160}\b(?:announce[sd]?|report(?:s|ed)?)\b`
);
export function findLead(lines: string[]): { line: number; at: number } | null {
  const i = lines.findIndex((l) => l.length >= 80 && l.length <= 2000 && LEAD.test(l));
  return i > 0 ? { line: i, at: 0 } : null;
}

/**
 * A Japanese company's 6-K names the release it carries under its cover: "List of materials /
 * Documents attached hereto: i) Press release entitled “Agreement to Transfer to Sony Certain
 * Epson Business Assets…”". That title is the headline. Null when the lines list none.
 */
export function listedRelease(lines: string[]): string | null {
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const line = lines[i];
    // in quotation marks the title may wrap over a few lines: "Press release, dated April 19, 2001,
    // announcing, "Novartis group" / "Sales up by 11%…""; the closing mark says where it ends
    const window = lines.slice(i, i + 4).join(" ");
    const m =
      /press release,?\s+(?:dated\s+[^"“]{6,30}?,?\s+)?(?:entitled|titled|announcing,?)\s*["“]([^"”]{12,260})["”]/i.exec(window) ??
      /press release:?\s+((?:Announcement|Notice)\b.{12,250})$/i.exec(line) ??
      /press release:\s*(.{12,260})$/i.exec(line) ??
      /press release,?\s+(?:dated\s+[^"“]{6,30}?,?\s+)?announcing[\s:–—-]+(.{12,260})$/i.exec(line);
    if (!m) continue;
    let title = tidy(headlineCase(tidy(m[1])));
    if (/\.$/.test(title) && !ABBREV_END.test(title)) title = title.slice(0, -1);
    return title[0].toUpperCase() + title.slice(1);
  }
  return null;
}

/** How many lines from the top a dateline may sit. */
export const DATELINE_WITHIN = 40;

/**
 * Where the dateline is: its line, and where on that line it starts (past 0 only inside a run of
 * text with no line breaks). Null when the lines have none — the document is not a press release.
 */
export function findDateline(lines: string[]): { line: number; at: number } | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // a dateline wrapped mid-date opens a short line and finishes on the next — dated, or the last
    // line of a headline in capitals would read as a place: "TWO PUBLIC CORPORATIONS" / "MINNEAPOLIS…"
    const next = lines[i + 1] ?? "";
    if (opensWithDateline(line) || (line.length < 60 && next && !opensWithDateline(next) && opensWithDateline(`${line} ${next}`, true))) {
      return { line: i, at: 0 };
    }
    if (line.length > 260) {
      const at = datelineInRun(line);
      if (at >= 0) return { line: i, at };
    }
  }
  return null;
}

/**
 * The press release's headline, or null when the document is not a press release or no headline
 * can be told apart from its letterhead. Read from the text above the dateline: the headline is
 * the first line there that reads as one after the letterhead, contacts and release markers,
 * joined with the line it wraps onto. Subheadlines and bullets under it are left out.
 */
export function pressReleaseHeadline(doc: string): string | null {
  // a press release's dateline is near the top: the furthest down a real one sat in the sample was
  // line 30, under a page of contacts; one further down is a place and date inside something else
  const lines = afterCoverPage(textLines(doc)).slice(0, DATELINE_WITHIN);
  const listed = listedRelease(lines);
  if (listed) return listed;
  const datelined = findDateline(lines);
  const dateline = datelined ?? findLead(lines);
  if (!dateline) return resultsHeadline(lines);
  const head = lines.slice(0, dateline.line);
  if (dateline.at > 0) head.push(...splitRun(lines[dateline.line].slice(0, dateline.at)));
  const blocks = headlineBlocks(head);
  let lastLetterhead = -1;
  blocks.forEach((b, i) => {
    if (isLetterhead(joined(b))) lastLetterhead = i;
  });
  let at = blocks.findIndex((b, i) => i > lastLetterhead && candidate(b));
  // a headline above the letterhead is taken only under a dateline: the lead paragraph is a weaker mark
  if (at < 0 && datelined) at = blocks.findIndex(candidate);
  return at < 0 ? null : finish(candidate(blocks[at])!);
}

/**
 * The lines above a dateline as headline candidates, each joined with the lines it wraps onto, so
 * a headline whose first line is short still counts. A run of text with no line breaks in it (the
 * hidden text of a scanned release) is split at its letterhead and bullets first, and the bullets
 * under a headline are left out.
 */
function headlineBlocks(lines: string[]): string[][] {
  let head = lines.flatMap((l) => (l.length > 260 ? splitRun(l) : [l]));
  const firstBullet = head.findIndex((l) => /^[•·▪●■*]/.test(l));
  if (firstBullet >= 0) head = head.slice(0, firstBullet);
  // a short line just above the bullets labels them ("Fourth-Quarter 2009") and is no wrap, unless
  // the line before cannot end there: "Walmart Reports" / "Third Quarter Results"
  const labelsBullets = (j: number, above: string) =>
    firstBullet >= 0 && j === head.length - 1 && head[j].split(/\s+/).length <= 3 && !WRAPS_AFTER.test(above);
  const blocks: string[][] = [];
  for (let i = 0; i < head.length; i++) {
    const block = [head[i]];
    while (i + 1 < head.length && !labelsBullets(i + 1, block.join(" ")) && continues(block.join(" "), head[i + 1])) {
      block.push(head[++i]);
    }
    blocks.push(block);
  }
  return blocks;
}

// a word broken at a line end rejoins without a space: "Record-" / "Setting Sales Pace"
const joined = (b: string[]) => b.reduce((s, l) => (/\w-$/.test(s) ? s + l : `${s} ${l}`));
const opens = (s: string) => headlineLike(s) && !STARTS_MID_PHRASE.test(s);
/** The block as a headline — or its first line alone, when what it ran on into makes it too long. */
const candidate = (b: string[]) => (opens(joined(b)) ? joined(b) : opens(b[0]) ? b[0] : null);
/** A candidate as a title: a page number before it dropped, capitals recased, stray marks tidied. */
function finish(text: string): string | null {
  const headline = tidy(headlineCase(tidy(text.replace(/^\d{1,2}\s+(?=[A-Z])/, ""))));
  return headline.length >= 12 ? headline : null;
}

/**
 * A results release with no dateline and no lead paragraph — JPMorgan's, Walmart's, Exxon's, Tesla's
 * deliveries — opens on its headline under the letterhead: "JPMORGAN CHASE REPORTS THIRD-QUARTER
 * 2022 NET INCOME OF $9.7 BILLION…", "Tesla Q1 2017 Vehicle Production and Deliveries". With
 * nothing else to mark the document a release, the first line that could be a headline is taken
 * only when it announces results; a shareholder letter ("Dear Fellow Shareholders"), a set of
 * statements, a call's transcript or a slide deck's title gives nothing.
 */
const RESULTS_HEADLINE = new RegExp(
  String.raw`\b(?:reports?|reported|announces?|posts?|delivers?|releases?|raises?)\b.{0,120}\b(?:results|earnings|net income|EPS|revenues?|sales|profits?|guidance)\b|` +
    String.raw`\b(?:first|second|third|fourth)[\s-]quarter\b.{0,80}\b(?:results|update|deliveries|earnings)\b|` +
    String.raw`\bQ[1-4]\b.{0,80}\b(?:results|update|deliveries|earnings)\b|\bvehicle production\b`,
  "i"
);
const TRAILING_DATE = new RegExp(String.raw`\s+${DATE}$`);
const NOT_RESULTS = /\b(?:transcript|conference call|earnings call|presentation|supplement(?:al|ary)?|statements? of)\b/i;
/** How far down such a headline may sit: below a letterhead, never under a page of anything else. */
const RESULTS_REACH = 15;
function resultsHeadline(lines: string[]): string | null {
  const first = headlineBlocks(lines.slice(0, RESULTS_REACH)).find((b) => !isLetterhead(joined(b)) && candidate(b));
  const text = first && candidate(first)!;
  if (!text || !RESULTS_HEADLINE.test(text) || NOT_RESULTS.test(text)) return null;
  // a deck's first page names itself and its day: "EARNINGS RELEASE Q1 FY 2027 Results October 22, 2026"
  return finish(text.replace(/^(?:earnings|news|press|media)\s+release\s*[:–—-]?\s+/i, "").replace(TRAILING_DATE, ""));
}

/**
 * A run of text with no line breaks — the hidden text behind a scanned release — as candidate
 * lines: cut at its first bullet, which ends the headline, and at its last link, phone number or
 * "News" marker, which ends the letterhead before it.
 */
function splitRun(run: string): string[] {
  const tokens = run.split(/[•·▪●■]/)[0].split(/\s+/);
  let cut = -1;
  tokens.forEach((t, i) => {
    if (URLISH.test(t) || PHONE.test(t) || /^news$/i.test(t)) cut = i;
    // the time it went out: "For Release: Tuesday, Oct. 25, 2022, at 6:30 a.m. ET"
    if (/^(?:ET|EST|EDT|CT|CST|CDT|PT|PST|PDT|GMT|CET)$/.test(t) && /^[ap]\.?m\.?$/i.test(tokens[i - 1] ?? "")) cut = i;
  });
  const rest = tokens.slice(cut + 1).join(" ").trim();
  return rest ? [rest] : [];
}

const UA = { "User-Agent": "News Charts Research marcusowens94@gmail.com" };
const ARCHIVES = "https://www.sec.gov";

/** One EDGAR request, with the contact User-Agent EDGAR requires. */
export function edgarFetch(url: string): Promise<Response> {
  return fetch(url, { headers: UA });
}

/** What reading one filing found: its headline, or null for none, and the document it came from. */
export interface HeadlineRead {
  headline: string | null;
  exhibit: string | null;
}

/** An accession number as EDGAR's paths write it: "0000037996-04-000228". */
function dashed(accession: string): string {
  return `${accession.slice(0, 10)}-${accession.slice(10, 12)}-${accession.slice(12)}`;
}

/** How many of a filing's press-release exhibits are read before it is taken to have none. */
const EXHIBITS_READ = 2;

/**
 * Reads one 8-K or 6-K for its press release's headline: the filing's index page, then its first
 * press-release exhibits (or, for a filing from before about 2001, its full submission text, which
 * is small then), then a 6-K's own document. Two to four requests. Null when EDGAR did not answer —
 * a failure, not an answer, and the filing is tried again on a later run; a filing EDGAR does not
 * have reads as having none.
 */
export async function readFilingHeadline(
  cik: string | number,
  accession: string,
  get: (url: string) => Promise<Response> = edgarFetch
): Promise<HeadlineRead | null> {
  const base = `${ARCHIVES}/Archives/edgar/data/${Number(cik)}/${accession}`;
  const index = await get(`${base}/${dashed(accession)}-index.htm`);
  if (index.status === 404) return { headline: null, exhibit: null };
  if (!index.ok) return null;
  const { exhibits, submission, documents, primary } = releaseExhibits(await index.text());
  const name = (href: string) => href.split("/").pop() ?? null;
  // the exhibits first, then a 6-K's own document, where many foreign companies put the announcement
  const toRead = [...exhibits.slice(0, EXHIBITS_READ), ...(primary ? [primary] : [])];
  for (const href of toRead) {
    const doc = await get(ARCHIVES + href);
    if (!doc.ok) return doc.status === 404 ? { headline: null, exhibit: null } : null;
    const headline = pressReleaseHeadline(decodeDocument(await doc.arrayBuffer()));
    if (headline) return { headline, exhibit: name(href) };
  }
  if (toRead.length) return { headline: null, exhibit: name(toRead[0]) };
  // a filing from before the per-document index: its exhibits are inside the full submission text
  if (!documents && submission) {
    const doc = await get(ARCHIVES + submission);
    if (!doc.ok) return doc.status === 404 ? { headline: null, exhibit: null } : null;
    for (const exhibit of exhibitsInSubmission(decodeDocument(await doc.arrayBuffer())).slice(0, EXHIBITS_READ)) {
      const headline = pressReleaseHeadline(exhibit);
      if (headline) return { headline, exhibit: submission.split("/").pop() ?? null };
    }
  }
  return { headline: null, exhibit: null };
}

/**
 * A filing the reading applies to, from the title `lib/sec.ts` gave it: an 8-K — "(8-K 8.01)",
 * "(8-K)", "(8-K/A 5.02)", or "8-K filing" for one whose items predate 2004 — or a foreign
 * company's 6-K, which `lib/sec.ts` can only call "6-K filing".
 */
export const RELEASE_TITLE = /: (?:(.*) \((8-K(?:\/A)?)(?: (\d\.\d\d))?\)|(8-K|6-K) filing)$/;

/**
 * Whether an 8-K can carry a press release worth asking for, from the items it lists. Since 2004 a
 * release comes with exhibits (9.01), or with the items companies announce — results, a disclosure,
 * other events, an officer change, a deal closing (2.02, 7.01, 8.01, 5.02, 2.01) — which some
 * filers attach one to without listing 9.01. An 8-K with none of those, such as a shareholder vote,
 * is not asked about: of the 541 8-Ks filed since 2004 in the sample, that skipped 37, of which 36
 * had no exhibit and the other was a bank's capital covenant. One from before 2004 used other item
 * numbers, and one that lists no items is unknown: both are asked, and so is every 6-K, which
 * lists none.
 */
const ANNOUNCING_ITEMS = new Set(["9.01", "2.02", "7.01", "8.01", "5.02", "2.01"]);
export function mayCarryRelease(ev: { title: string; description?: string; externalId?: string }): boolean {
  if (!RELEASE_TITLE.test(ev.title) || !/^\d{18}$/.test(ev.externalId ?? "")) return false;
  const items = ev.description?.match(/^Items? (.*)$/)?.[1];
  if (!items) return true;
  const codes = items.split(" · ").map((c) => c.split(" ")[0]);
  if (!codes.some((c) => c.includes("."))) return true;
  return codes.some((c) => ANNOUNCING_ITEMS.has(c));
}

/**
 * A filing retitled with its press release's headline: "Boeing Co: Other events (8-K 8.01)" becomes
 * "Boeing Co: Boeing Sets 787 First Delivery Date for Mid-First Quarter 2011 (8-K 8.01)", and
 * "NIO Inc.: 6-K filing" becomes "NIO Inc.: NIO Inc. Provides April 2023 Delivery Update (6-K)". The
 * form and item stay at the end, where the timeline's filing stacks read them, and the item's name
 * moves into the description.
 */
export function withHeadline<E extends { title: string; description?: string }>(ev: E, headline: string): E {
  const m = RELEASE_TITLE.exec(ev.title);
  if (!m) return ev;
  const prefix = ev.title.slice(0, m.index);
  const form = m[2] ?? m[4];
  const code = m[3];
  const label = m[1] ?? `${m[4]} filing`;
  const named = m[1] ? `${label} (${form}${code ? ` ${code}` : ""})` : label;
  return {
    ...ev,
    title: `${prefix}: ${headline} (${form}${code ? ` ${code}` : ""})`,
    description: [`${named}. The headline is the press release's, filed with it.`, ev.description].filter(Boolean).join(" "),
  };
}
