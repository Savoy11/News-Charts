import type { ServedFrom as Source } from "@/lib/page-data";

/**
 * Small honesty badge: whether this render came out of the database or had to hit
 * the upstream APIs. Also the quickest way to see the read-through cache working.
 */
export default function ServedFrom({ source }: { source: Source }) {
  const stored = source === "database";
  return (
    <span
      title={
        stored
          ? "Served from the News Charts database"
          : "Fetched live from the sources and stored for next time"
      }
      className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
        stored
          ? "border-teal-800/60 bg-teal-500/10 text-teal-400"
          : "border-slate-700 bg-slate-800/40 text-slate-500"
      }`}
    >
      {stored ? "stored" : "live"}
    </span>
  );
}
