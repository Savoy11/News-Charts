/** Promo banner for the CAEP desktop app. Point href at the product page once it exists. */
export default function CaepPromo() {
  return (
    <div className="rounded-xl border border-emerald-800/60 bg-gradient-to-r from-emerald-950 to-slate-900 p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
        From the maker of Chronolens
      </p>
      <h3 className="mt-1 text-lg font-bold text-slate-100">
        CAEP — Crypto Asset Evaluation Platform
      </h3>
      <p className="mt-1 text-sm text-slate-400">
        Institutional-grade crypto risk scoring, staking analysis, and reserves monitoring.
        Local-first: your keys never leave your machine.
      </p>
      <span className="mt-3 inline-block rounded-md bg-emerald-600/20 px-3 py-1 text-sm font-semibold text-emerald-300">
        Coming soon
      </span>
    </div>
  );
}
