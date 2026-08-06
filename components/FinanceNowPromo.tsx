/**
 * Cross-promotion banner for Finance Now, rendered on eight reader-facing pages.
 *
 * Was `CaepPromo`, naming the product "CAEP — Crypto Asset Evaluation Platform".
 * That name is retired and the description had gone stale with it: the product
 * is no longer crypto-only, it covers equities, funds and macro too. The old
 * subtitle could not simply be renamed because it *was* the acronym.
 *
 * No href yet — neither edition has a public URL. Deliberately left as a
 * "Coming soon" card rather than a link to a placeholder, since a dead link on
 * eight pages costs more than a missing one.
 */
export default function FinanceNowPromo() {
  return (
    <div className="rounded-xl border border-emerald-800/60 bg-gradient-to-r from-emerald-950 to-slate-900 p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
        From the maker of News Charts
      </p>
      <h3 className="mt-1 text-lg font-bold text-slate-100">
        Finance Now
      </h3>
      <p className="mt-1 text-sm text-slate-400">
        Institutional-grade research across crypto, equities, funds, and macro —
        risk scoring, staking analysis, and reserves monitoring. The desktop
        edition is local-first: your keys never leave your machine.
      </p>
      <span className="mt-3 inline-block rounded-md bg-emerald-600/20 px-3 py-1 text-sm font-semibold text-emerald-300">
        Coming soon
      </span>
    </div>
  );
}
