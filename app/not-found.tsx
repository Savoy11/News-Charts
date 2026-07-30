import SearchBox from "@/components/SearchBox";

/**
 * Reached for two different situations, and the copy has to be true of both.
 *
 * A wrong URL is one. The other — now the common one — is a real subject nobody has ingested
 * yet: pages read only the database, so a genuine ticker we have not indexed lands here too.
 * "Nothing found" was accurate when a page view could still fetch it live and only a bad URL
 * got this far. It is now misleading, because the far more likely reader is someone who typed a
 * perfectly real company and is being told it does not exist.
 *
 * The request has already been recorded by the time this renders, so the honest thing is to say
 * so. `notFound()` still sets a 404: this is not a page worth indexing, whatever the reason.
 */
export default function NotFound() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <h1 className="text-3xl font-black text-slate-100">Not on News Charts yet</h1>
      <p className="mt-2 max-w-lg text-slate-400">
        We build timelines from a stored corpus rather than fetching one while you wait, so a
        subject we haven&apos;t gathered yet has nothing to show.
      </p>
      <p className="mt-3 max-w-lg text-sm text-slate-500">
        If you searched for a real company or topic, it&apos;s been noted — the next scheduled
        refresh works through the most-requested first. Meanwhile, try a ticker like{" "}
        <span className="text-slate-400">AAPL</span> or a broader topic like{" "}
        <span className="text-slate-400">bicycle</span>.
      </p>
      <div className="mt-6 flex w-full justify-center">
        <SearchBox large />
      </div>
    </div>
  );
}
