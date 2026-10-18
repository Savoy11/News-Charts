import Link from "next/link";

/** Enough to show the family without turning a 500-fund trust into a wall of chips. */
const SHOWN = 10;

/**
 * The other funds a fund's registrant files, per EDGAR (2026-10-17 proposal 8) — the one
 * "related" a fund page can claim without a judgement.
 *
 * A fund the site holds is a plain link. One it does not is dashed and `nofollow`: following it
 * asks for the fund to be gathered rather than opening a page, and a suggestion is a promise about
 * what is here. `nofollow` keeps crawlers from walking a whole trust into first-visit gathers,
 * which the attempt ledger would bound anyway.
 */
export default function FundSiblings({
  registrantCik,
  funds,
}: {
  registrantCik: string;
  funds: { ticker: string; name: string; held: boolean }[];
}) {
  const shown = funds.slice(0, SHOWN);
  const more = funds.length - shown.length;
  const anyUnheld = shown.some((f) => !f.held);
  return (
    <section data-fund-siblings className="mb-4 text-xs text-slate-500">
      <p className="mb-1.5">
        Other funds from the same registrant (
        <a
          href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${registrantCik}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-slate-600 underline-offset-2 hover:text-sky-300"
        >
          EDGAR CIK {Number(registrantCik)}
        </a>
        ){anyUnheld && " — dashed ones are not on News Charts yet; opening one asks for it"}:
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {shown.map((f) => (
          <li key={f.ticker}>
            <Link
              href={`/company/${encodeURIComponent(f.ticker)}`}
              title={f.name}
              rel={f.held ? undefined : "nofollow"}
              data-held={f.held ? "true" : "false"}
              className={`inline-block max-w-[16rem] truncate rounded-full border px-2.5 py-0.5 hover:border-emerald-600 hover:text-emerald-300 ${
                f.held ? "border-slate-700 text-slate-300" : "border-dashed border-slate-700 text-slate-400"
              }`}
            >
              <span className="font-semibold">{f.ticker}</span> <span className="text-slate-500">{f.name}</span>
            </Link>
          </li>
        ))}
        {more > 0 && <li className="self-center">and {more} more</li>}
      </ul>
    </section>
  );
}
