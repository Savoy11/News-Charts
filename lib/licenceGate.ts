/**
 * The licence gate on the read path (batch 186, the terms reading of 2026-11-25).
 *
 * `assertCommercialOk` (lib/ingest/store.ts) keeps a non-commercial source out of the corpus. It says
 * nothing about a row stored while that source was still thought cleared: DefiLlama's incident list was
 * ingested from July 2026 under an "open data" reading its Terms of Use of 24 June 2025 do not support
 * ("personal, non-commercial purposes"; no republishing "without permission"). Taking the feed off the
 * ingest path stops new rows; this takes the stored ones off a public page. Yahoo's headline feed joined
 * it in batch 189 (id 6), by the owner's call of 2026-11-26. Currents (id 11) stays until it answers in
 * writing; see its row in the registry.
 *
 * In `COMMERCIAL_MODE` a row every one of whose attestations is a non-commercial source's is not shown.
 * A row another source attests too stays: the fact is then on the page by that source's licence. Outside
 * commercial mode, on the owner's own machine, nothing is withheld.
 *
 * The ids are written out so the read path needs no ingest code, as `ALSO_ON_SOURCE_IDS` are;
 * check:commercial-mode holds them to the registry's `commercialOk: false` rows.
 */
export const NON_COMMERCIAL_SOURCE_IDS: readonly number[] = [6, 7, 8, 9, 10, 11, 12, 13, 14, 18];

/**
 * Whether Currents' headlines are on the pages, which is when its credit must be (batch 189). Its terms
 * ask for "an attribution to Currents News API Service beside the display of data obtained from" it,
 * preferably a link reading "Powered by Currents News API". The footer shows that link while the
 * registry clears the source, and not before: a credit for data the pages do not hold says something
 * untrue. It follows the list above, so there is no second switch to forget.
 */
export const CURRENTS_SOURCE_ID = 11;
export const CURRENTS_CLEARED: boolean = !NON_COMMERCIAL_SOURCE_IDS.includes(CURRENTS_SOURCE_ID);
export const CURRENTS_CREDIT = { text: "Powered by Currents News API", href: "https://currentsapi.services/" } as const;

/** The same switch as `commercialMode()` in lib/ingest/store.ts, read here without its imports. */
const commercialMode = (env: Record<string, string | undefined> = process.env) => env.COMMERCIAL_MODE === "true";

/** Whether a stored row is withheld from the page: in commercial mode, attested only by non-commercial sources. */
export function withheldByLicence(attestedBy: readonly (number | string)[] | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (!commercialMode(env) || !attestedBy?.length) return false;
  return attestedBy.every((id) => NON_COMMERCIAL_SOURCE_IDS.includes(Number(id)));
}
