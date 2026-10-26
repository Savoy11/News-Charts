/**
 * A company's EDGAR title cleaned for use outside SEC filings. Its own module, as `secForms` is,
 * so the relevance scorer can read it without loading the EDGAR ticker index that `lib/sec.ts`
 * carries (batch 56).
 */

// legal suffixes that Wikipedia titles don't carry — stripped iteratively, so
// "Alibaba Group Holding Limited" → "Alibaba Group", "Tesla, Inc." → "Tesla". The dots are
// optional because the loop strips a final "." first: "S.A." arrives as "S.A", which the old
// "s\.a\." could never match, and companies were searched as "Spotify Technology S.A" and the
// like. Only a whole word goes: "ASSOCIATED BANC-CORP" keeps its "CORP", "XChange TEC.INC" does not.
// The letters may also be spaced, as some older titles write them: "TELEFONICA S A", "HEINEKEN
// HOLDING N V", "DEUTSCHE LUFTHANSA A G", "NATUZZI S P A" — and the public company's forms, which
// left "CRH PUBLIC" (CRH PUBLIC LTD CO), "Osotspa Public" (Osotspa Public Co Ltd) and "Medtronic
// Public" (batch 28).
const LEGAL_SUFFIX =
  /(?<=^|[\s,.])(?:public(?:[\s,]+(?:limited|ltd|company|co)\.?)+|incorporated|inc|corporation|corp|company|co|limited|ltd|plc|llc|l\.l\.c|holdings?|s\.?\s?a\.?\s?(?:b|p\.?\s?i)?\.?\s+de\s+c\.?\s?v|s\.?\s?a\.?\s?b|s\.?\s?a|n\.?\s?v|l\.?\s?p|s\.?\s?p\.?\s?a|a\/s|ab|asa|oyj|tbk|a\s?g|se)\.?$/i;

/** The legal suffixes a registration tag can follow. */
const SUFFIX_BEFORE_TAG = "(?:incorporated|inc|corporation|corp|company|co|limited|ltd|plc|llc|lp|ag|ab)";

// a slash straight after a legal suffix starts a place: "Blue Acquisition Corp/Cayman",
// "Imperial Petroleum Inc./Marshall Islands", "Melar Acquisition Corp. I/Cayman"
const TAG_AFTER_SUFFIX = new RegExp(`^(.*(?:^|[\\s,])${SUFFIX_BEFORE_TAG}\\.?(?:\\s+[ivx]+)?)\\/.*$`, "i");

// …and so does a bracket after one: "ACUITY INC. (DE)", "TREES Corp (Colorado)", "Eco Wave Power
// Global AB (publ)". One before the suffix is the name's own: "Banco Santander (Brasil) S.A." is
// told from Banco Santander by it.
const BRACKET_AFTER_SUFFIX = new RegExp(`^(.*(?:^|[\\s,])${SUFFIX_BEFORE_TAG}\\.?)\\s*\\([^)]*\\)$`, "i");

/**
 * The steps that take off a registration tag and nothing else, so the legal form stays: "MOODYS
 * CORP /DE/" is "MOODYS CORP" to them.
 */
const TAG: [RegExp, string][] = [
  [/\s*\\.*$/, ""], // a backslash never belongs to a name: "INC \TX\", "PLC\UK"
  [/\s+\/.*$/, ""], // nor does a slash after a space: "Inc. / Delaware", "BANCSHARES /"
  [TAG_AFTER_SUFFIX, "$1"],
  [BRACKET_AFTER_SUFFIX, "$1"],
  [/\s*\/\s*[a-z]{2,5}\/?$/i, ""],
  [/\s+DE$/, ""], // Delaware, without the slash: "US BANCORP DE", "BROADWAY FINANCIAL CORP DE"
  [/\/$/, ""], // a bare trailing slash: "TOYOTA MOTOR CORP/"
];

/**
 * The cleanup steps, in order. Each one applies only when the name keeps a letter, so a name is
 * never cut down to digits: "1847 Holdings LLC" stays "1847 Holdings", since a news search for
 * "1847" finds the year.
 */
const CLEANUP: [RegExp, string][] = [
  ...TAG,
  [/[,.&/]\s*$/, ""],
  [/\s+and$/i, ""], // what "& Co" leaves as "&", "and Company" leaves as "and": "Eli Lilly and Company"
  [LEGAL_SUFFIX, ""],
];

function clean(title: string, steps: [RegExp, string][]): string {
  let s = title.trim();
  let prev = "";
  while (prev !== s) {
    prev = s;
    for (const [re, to] of steps) {
      const next = s.replace(re, to).trim();
      if (/[a-z]/i.test(next)) s = next;
    }
  }
  return s || title;
}

/**
 * The everyday name of a company, for looking it up outside SEC filings.
 *
 * EDGAR also tags many titles with a state or re-registration marker — "BANK OF AMERICA CORP
 * /DE/", "WELLS FARGO & COMPANY/MN", "COSTCO WHOLESALE CORP /NEW", and with a space, "APPLE
 * COMPUTER INC/ FA" in Apple's own former names — and leaves a bare "&" once the
 * suffix after it goes ("ELI LILLY & Co"). Both used to survive into the name, so news and
 * Federal Register searches asked for "Wells Fargo & Company/MN" and found nothing: the owner's
 * 2026-10-18 count returned 0 of 0 hits for Wells Fargo and Bank of America.
 *
 * Batch 26 measured what still survived across the index: a bare trailing slash ("TOYOTA MOTOR
 * CORP/"), a backslash tag ("RUSH ENTERPRISES INC \TX\", "AMARIN CORP PLC\UK"), a place after a
 * slash ("Blue Acquisition Corp/Cayman", "Alight, Inc. / Delaware"), and the legal forms in
 * `LEGAL_SUFFIX` ("Ferrari N.V", "Energy Transfer LP", "GENMAB A/S"). A slash inside a name
 * stays: "CULLEN/FROST BANKERS", "M/I HOMES", "DATA I/O". Batch 28 added the spaced forms, a
 * bracketed tag after the suffix and a bare trailing "DE" (`CLEANUP`).
 */
export function commonName(title: string): string {
  return clean(title, CLEANUP);
}

/**
 * A title without its registration tag and with its legal form kept: "MOODYS CORP /DE/" → "MOODYS
 * CORP", "PULTEGROUP INC/MI/" → "PULTEGROUP INC", "GENMAB A/S" as it is. The relevance scorer
 * names a company by the words of its title, and the tag gave Moody's the name "/de/" and Pulte
 * "inc/mi/" (batch 56, set aside by the 2026-10-25 audit).
 */
export function withoutTag(title: string): string {
  return clean(title, TAG);
}
