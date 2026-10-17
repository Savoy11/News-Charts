/**
 * The forms only a fund registrant files, matched against the label `lib/sec.ts` writes at the
 * end of a filing's title. Its own module so the relevance floor can read it without loading the
 * EDGAR ticker index that `lib/sec.ts` carries.
 */
export const REGISTRANT_FORM = /\((?:N-CSRS?|N-30D|N-CEN|NPORT-P|485APOS|485BPOS|497K?|N-1A)\)$/;
