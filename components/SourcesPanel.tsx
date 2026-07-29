import { loadSourceContributions, loadSubject, type SourceContribution } from "@/lib/store/read";
import { requiresLicenceCredit } from "@/lib/sourceLabel";

/**
 * Which feeds actually contributed to this subject, and how their last attempt went.
 *
 * A page rendering with three of eleven feeds down looks completely healthy — the timeline is
 * full, nothing is obviously missing, and anyone debugging it starts in the wrong place. This
 * is the panel that tells "the source returned nothing" apart from "we never asked" and from
 * "we were rate limited", which is the same distinction `source_fetches` exists to record.
 *
 * It doubles as the per-source attribution the licences want: every contributing source is
 * named here with its licence, next to the count of what it actually provided.
 */

/** Green contributed, amber asked-but-empty, red failed, grey never asked. */
function statusOf(s: SourceContribution): { dot: string; label: string } {
  if (s.lastOutcome === "throttled") return { dot: "bg-amber-400", label: "rate limited" };
  if (s.lastOutcome === "error") return { dot: "bg-red-400", label: "failed" };
  if (s.events > 0) return { dot: "bg-emerald-400", label: `${s.events} event${s.events === 1 ? "" : "s"}` };
  if (s.lastFetchedAt) return { dot: "bg-slate-500", label: "nothing returned" };
  return { dot: "bg-slate-700", label: "not asked" };
}

function ago(at: Date | null): string {
  if (!at) return "";
  const mins = Math.max(0, Math.round((Date.now() - at.getTime()) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

export default async function SourcesPanel({ slug }: { slug: string }) {
  let sources: SourceContribution[] = [];
  try {
    const subject = await loadSubject(slug);
    if (!subject) return null;
    sources = await loadSourceContributions(subject.id);
  } catch {
    // the panel is diagnostics, never a dependency — a page must not fail because of it
    return null;
  }
  if (!sources.length) return null;

  const contributing = sources.filter((s) => s.events > 0).length;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-200">Sources</h2>
        <span className="text-[11px] text-slate-500">
          {contributing} of {sources.length} contributing
        </span>
      </div>
      <ul className="space-y-1.5">
        {sources.map((s) => {
          const status = statusOf(s);
          return (
            <li key={s.key} className="flex items-start gap-2 text-[11px] leading-snug">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-slate-300">{s.name}</span>
                <span className="block text-slate-500">
                  {status.label}
                  {s.lastFetchedAt ? ` · ${ago(s.lastFetchedAt)}` : ""}
                </span>
                {/* Attribution and licence, rendered where the count is — crediting a source
                    next to what it gave us is the honest form.

                    Not truncated where the licence *requires* the credit. CC BY-SA obliges
                    naming the contributors and the licence wherever the text is reused, and a
                    requirement that disappears at a narrow viewport is not met. Courtesy credit
                    for public-domain and open-data sources still truncates. */}
                <span
                  data-source-credit={s.key}
                  className={`block text-slate-600 ${requiresLicenceCredit(s.key) ? "" : "truncate"}`}
                  title={`${s.attribution} — ${s.license}`}
                >
                  {s.attribution} · {s.license}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
