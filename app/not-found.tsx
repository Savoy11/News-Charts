import SearchBox from "@/components/SearchBox";
import CorpusExamples from "@/components/CorpusExamples";

/**
 * Reached for three situations, and the copy has to be true of all of them.
 *
 * A wrong URL is one. A subject the bounded first pass (lib/ingest/firstPass.ts) tried and
 * could not resolve — no Wikipedia article, no ticker in the EDGAR index — is the second. The
 * third is a first pass that could not run at all: the attempt ledger's cooldown, a saturated
 * ingest pool, or a database outage, all of which shed to this notice by design rather than
 * queueing. So the copy says the gather runs on a first search and that this one either
 * resolved to nothing or could not run — not that "we just looked", which the shed path
 * would make a lie.
 *
 * The request has already been recorded by the time this renders, so the honest thing is to say
 * so. `notFound()` still sets a 404: this is not a page worth indexing, whatever the reason.
 */
export default function NotFound() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <h1 className="text-3xl font-black text-slate-100">Not on Chronolens yet</h1>
      <p className="mt-2 max-w-lg text-slate-400">
        A first search runs a quick gather — Wikipedia, SEC filings, price history — and this
        one couldn&apos;t be turned into a timeline. That usually means the name doesn&apos;t
        match an article or ticker those sources know, or the gather couldn&apos;t run just now.
      </p>
      <p className="mt-3 max-w-lg text-sm text-slate-500">
        Your search has been noted — the scheduled refresh digs deeper than the quick pass and
        works through the most-requested subjects first.
      </p>
      {/* Drawn from the corpus, never hardcoded: this page used to offer "AAPL" and "bicycle" by
          name, so a visitor sent here by a miss could follow the example straight into a second
          miss. See CorpusExamples, and cf9d820 for the same fix on the homepage. */}
      <CorpusExamples />
      <div className="mt-6 flex w-full justify-center">
        <SearchBox large />
      </div>
    </div>
  );
}
