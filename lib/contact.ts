/**
 * The User-Agent every request this project makes to a public service sends (batch 92).
 *
 * The services ask an automated client to say who it is and how to reach its operator. The SEC's
 * fair-access policy asks for a company name and a contact address ("Sample Company Name
 * AdminContact@<sample company domain>.com") and refuses EDGAR requests without one. Wikimedia's
 * policy asks for contact information too.
 *
 * The address is the build's own contact, which the owner sets in `NEWS_CHARTS_CONTACT`
 * (.env.local). It is never written in the code: the owner asked, on 2026-11-05, that their
 * personal address not be used, and on 2026-11-12 that it be used for now, set in `.env.local` alone
 * (batch 146). Without it the name goes alone, and sec.gov may refuse a request
 * (403). That refusal is the adapter's ordinary refusal, reported as such, and nothing is stored
 * from it.
 */
export const CLIENT_NAME = "News Charts Research";

const ADDRESS = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[A-Za-z]{2,}$/;

/** The owner's build contact, or null when it is unset or not an address. */
export function contactAddress(): string | null {
  const v = process.env.NEWS_CHARTS_CONTACT?.trim();
  return v && ADDRESS.test(v) ? v : null;
}

/** The User-Agent as sent: the client's name, and the contact address when one is set. */
export function userAgent(): string {
  const address = contactAddress();
  return address ? `${CLIENT_NAME} ${address}` : CLIENT_NAME;
}

/**
 * Headers carrying the User-Agent. They are read each time a request is built, not when a module
 * loads: a script loads `.env.local` in its own body, after every module it imports has run.
 */
export const UA: Readonly<Record<string, string>> = Object.freeze(
  Object.defineProperty({}, "User-Agent", { get: userAgent, enumerable: true }) as Record<string, string>,
);
