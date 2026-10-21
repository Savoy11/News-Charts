import Link from "next/link";
import { LEGAL_DRAFT, LEGAL_UPDATED } from "@/lib/legal";

/** The frame the terms, privacy and disclaimer pages share: title, draft notice, date, prose. */
export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-1 py-6">
      <h1 className="text-2xl font-bold text-slate-100">{title}</h1>
      <p className="mt-1 text-xs text-slate-400">Last updated {LEGAL_UPDATED}</p>
      {LEGAL_DRAFT && (
        <p data-legal-draft className="mt-4 rounded-md border border-amber-900/60 bg-amber-950/30 p-3 text-sm text-amber-200/90">
          <strong>Draft.</strong> This page has not yet been reviewed by a lawyer and may change
          before News Charts launches. Text in [brackets] is still to be filled in.
        </p>
      )}
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-slate-300 [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-100 [&_li]:ml-5 [&_li]:list-disc [&_a]:text-sky-300 [&_a]:underline [&_th]:text-left [&_th]:font-semibold [&_td]:align-top">
        {children}
      </div>
      <p className="mt-10 text-xs text-slate-400">
        <Link href="/legal/terms">Terms</Link> · <Link href="/legal/privacy">Privacy</Link> ·{" "}
        <Link href="/legal/disclaimer">Not investment advice</Link>
      </p>
    </article>
  );
}
