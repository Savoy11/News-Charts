"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FOLLOW_EVENT, listFollows, unfollow, type FollowedSubject } from "@/lib/follow";

const KIND: Record<FollowedSubject["kind"], { label: string; cls: string }> = {
  company: { label: "Company", cls: "border-sky-700/50 bg-sky-500/15 text-sky-300" },
  topic: { label: "Topic", cls: "border-violet-700/50 bg-violet-500/15 text-violet-300" },
  industry: { label: "Industry", cls: "border-emerald-700/50 bg-emerald-500/15 text-emerald-300" },
};

function since(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function FollowingList() {
  // null until mounted: localStorage is client-only, so rendering it on the server would mismatch
  const [items, setItems] = useState<FollowedSubject[] | null>(null);

  useEffect(() => {
    const refresh = () => setItems(listFollows());
    refresh();
    window.addEventListener(FOLLOW_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(FOLLOW_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  if (items === null) return null;

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">
        You’re not following anything yet. Open a company or topic and hit{" "}
        <span className="font-semibold text-slate-400">Follow</span> — it’s kept in this browser,
        and each subject will flag what’s new since you last looked.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((s) => {
        const k = KIND[s.kind];
        return (
          <li
            key={s.href}
            className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3 transition-colors hover:border-slate-700"
          >
            <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${k.cls}`}>
              {k.label}
            </span>
            <Link href={s.href} className="min-w-0 flex-1 text-sm font-semibold text-slate-200 hover:text-sky-300">
              {s.label}
            </Link>
            <span className="hidden text-[11px] text-slate-600 sm:inline">followed {since(s.followedAt)}</span>
            <button
              onClick={() => unfollow(s.href)}
              className="shrink-0 text-[11px] font-semibold text-slate-600 hover:text-red-400"
            >
              unfollow
            </button>
          </li>
        );
      })}
    </ul>
  );
}
