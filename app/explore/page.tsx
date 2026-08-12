import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import SearchBox from "@/components/SearchBox";
import AdSlot from "@/components/AdSlot";
import { absolute, subjectPath, SITE_NAME, type SubjectKind } from "@/lib/seo";
import { listIndexedSubjects } from "@/lib/subjects-index";
import { CURATED } from "@/lib/suggestions";

export const revalidate = 3600;

const TITLE = "Explore timelines";
const DESCRIPTION =
  "Browse every company, topic, and industry on News Charts — timelines of news, filings, earnings, and history.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absolute("/explore") },
  openGraph: { title: `${TITLE} · ${SITE_NAME}`, description: DESCRIPTION, url: absolute("/explore") },
};

interface Entry {
  name: string;
  href: string;
  count: number | null;
}

const SECTIONS: { kind: SubjectKind; heading: string; blurb: string }[] = [
  { kind: "company", heading: "Companies", blurb: "News, SEC filings and earnings pegged to the stock price." },
  { kind: "topic", heading: "Topics", blurb: "The full history of a subject, oldest to newest." },
  { kind: "industry", heading: "Industries", blurb: "Sector timelines that merge peer companies and their regulation." },
];

function Group({ heading, blurb, entries }: { heading: string; blurb: string; entries: Entry[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-slate-100">{heading}</h2>
        <p className="text-xs text-slate-500">{blurb}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {entries.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            className="group rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-sky-700/60 hover:text-sky-300"
          >
            {e.name}
            {e.count !== null && (
              <span className="ml-1.5 text-[11px] text-slate-600 group-hover:text-slate-500">
                {e.count}
              </span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function ExplorePage() {
  const subjects = await listIndexedSubjects(1, 5000);

  /**
   * A failed read must not be cached as an answer.
   *
   * This page is prerendered at build and revalidated hourly, so an unreachable database at
   * build time used to bake an empty listing into the output — and a build machine that cannot
   * reach the production database is the normal case, not an edge one. `noStore()` opts *this*
   * render out of the cache, so the fallback is shown once and the next request tries again,
   * rather than a wrong page being published with an hour's shelf life.
   */
  if (subjects === null) noStore();

  // DB-backed when available; otherwise the curated seed pool so the page is never empty.
  const byKind: Record<SubjectKind, Entry[]> = { company: [], topic: [], industry: [] };
  if (subjects?.length) {
    for (const s of subjects) {
      byKind[s.kind].push({ name: s.name, href: subjectPath(s.kind, s.slug, s.ticker), count: s.count });
    }
  } else {
    for (const c of CURATED) {
      const kind: SubjectKind = c.kind === "company" ? "company" : "topic";
      byKind[kind].push({ name: c.label, href: c.href, count: null });
    }
  }

  const total = subjects?.length || CURATED.length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-sky-400">Directory</p>
          <h1 className="text-2xl font-black leading-tight text-slate-100">{TITLE}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {total} timeline{total === 1 ? "" : "s"} to explore. Or search for anything above.
          </p>
        </div>
        <SearchBox />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div>
          {SECTIONS.map((sec) => (
            <Group key={sec.kind} heading={sec.heading} blurb={sec.blurb} entries={byKind[sec.kind]} />
          ))}
        </div>
        <aside className="space-y-4">
          <AdSlot />
          <AdSlot format="rectangle" />
        </aside>
      </div>
    </div>
  );
}
