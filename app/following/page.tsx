import type { Metadata } from "next";
import FollowingList from "@/components/FollowingList";
import SearchBox from "@/components/SearchBox";
import AdSlot from "@/components/AdSlot";
import CaepPromo from "@/components/CaepPromo";

// Personal, browser-only list — nothing to index.
export const metadata: Metadata = {
  title: "Following",
  robots: { index: false },
};

export default function FollowingPage() {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-sky-400">Following</p>
          <h1 className="text-2xl font-black leading-tight text-slate-100">Subjects you follow</h1>
          <p className="mt-1 text-sm text-slate-500">
            Kept in this browser. Each subject flags what’s new since your last visit.
          </p>
        </div>
        <SearchBox />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <FollowingList />
        <aside className="space-y-4">
          <AdSlot />
          <CaepPromo />
        </aside>
      </div>
    </div>
  );
}
