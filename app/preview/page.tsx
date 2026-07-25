"use client";

/**
 * TEMPORARY preview harness (not for merge). Feeds representative sample data into the new
 * components so they can be seen without a database or live sources. Delete before shipping.
 */

import HorizontalTimeline from "@/components/HorizontalTimeline";
import EventList from "@/components/EventList";
import BiggestMoves from "@/components/BiggestMoves";
import CompareView from "@/components/CompareView";
import type { TimelineEvent, PricePoint } from "@/lib/types";
import type { CompareSubject } from "@/lib/compare";

// a self-contained placeholder "photo" so the thumbnail layout is visible without external hosts
const SAMPLE_IMG =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='220'><rect width='400' height='220' fill='#1e293b'/><circle cx='130' cy='84' r='36' fill='#334155'/><rect x='0' y='150' width='400' height='70' fill='#334155'/><text x='200' y='128' font-size='17' fill='#64748b' text-anchor='middle' font-family='sans-serif'>sample image</text></svg>`
  );

const ev = (
  id: string,
  date: string,
  type: TimelineEvent["type"],
  title: string,
  yearOnly = false,
  imageUrl?: string
): TimelineEvent => ({ id, date, type, title, source: "Sample", url: "#", yearOnly, imageUrl });

// A topic-shaped timeline: sparse year-only history, then busy modern clusters (to show stacking
// on the horizontal view and Year → Month grouping + "Year only" on the list view).
const TOPIC_EVENTS: TimelineEvent[] = [
  ev("h1", "1817-01-01", "history", "Karl von Drais builds the draisine, the first two-wheeler", true, SAMPLE_IMG),
  ev("h2", "1885-01-01", "history", "Rover safety bicycle sets the modern template", true),
  ev("h3", "1903-01-01", "history", "First Tour de France is held", true),
  ev("h4", "1970-01-01", "history", "US bike boom; imports triple", true),
  ev("p1", "2019-04-12", "press", "City doubles its protected bike-lane budget"),
  ev("n1", "2023-05-02", "news", "E-bike sales surge 40% year over year", false, SAMPLE_IMG),
  ev("n2", "2023-05-11", "news", "Metro bikeshare passes 10 million rides"),
  ev("n3", "2023-05-19", "news", "New carbon-frame safety standard proposed", false, SAMPLE_IMG),
  ev("n4", "2023-06-02", "news", "Battery recall hits three e-bike brands", false, SAMPLE_IMG),
  ev("n5", "2023-06-21", "news", "Cargo bikes gain last-mile delivery share"),
  ev("n6", "2023-11-08", "news", "Winter ridership hits a record in northern cities"),
  ev("n7", "2024-02-14", "news", "Tariff review targets imported components"),
  ev("n8", "2024-02-27", "news", "Major manufacturer moves assembly onshore"),
  ev("n9", "2024-03-05", "news", "Insurers pilot e-bike coverage"),
];

// Deterministic daily price series (weekends skipped) with two clear single-day moves, so the
// "Biggest moves" panel and the compare overlay have something to find.
function makePrices(seed: number, jumpUp: number, jumpDown: number): PricePoint[] {
  const out: PricePoint[] = [];
  let v = 100;
  const start = Date.UTC(2024, 0, 2);
  for (let i = 0, day = 0; out.length < 150; i++) {
    const d = new Date(start + i * 86_400_000);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    let chg = Math.sin((day + seed) / 6) / 90; // gentle deterministic drift
    if (day === jumpUp) chg = 0.11;
    if (day === jumpDown) chg = -0.085;
    v = v * (1 + chg);
    out.push({ time: d.toISOString().slice(0, 10), value: Number(v.toFixed(2)) });
    day++;
  }
  return out;
}

const A_PRICES = makePrices(0, 60, 118);
const B_PRICES = makePrices(9, 95, 40);

// events dated on the two move days of A_PRICES, so the pairing lands on them
const COMPANY_EVENTS: TimelineEvent[] = [
  ev("e1", A_PRICES[59].time, "earnings", "Q2 earnings beat; guidance raised"),
  ev("e2", A_PRICES[117].time, "filing", "8-K: supply agreement terminated"),
  ev("e3", A_PRICES[30].time, "news", "Analyst upgrade to Buy"),
  ev("e4", A_PRICES[90].time, "news", "Product launch coverage"),
];

const SUBJECT_A: CompareSubject = {
  kind: "company",
  key: "NVDA",
  label: "NVIDIA (NVDA)",
  href: "#",
  events: COMPANY_EVENTS,
  prices: A_PRICES,
};
const SUBJECT_B: CompareSubject = {
  kind: "company",
  key: "AMD",
  label: "AMD (AMD)",
  href: "#",
  events: [ev("b1", B_PRICES[94].time, "earnings", "Q2 earnings inline")],
  prices: B_PRICES,
};

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="text-lg font-bold text-slate-100">{title}</h2>
      <p className="mb-3 text-xs text-slate-500">{note}</p>
      {children}
    </section>
  );
}

export default function PreviewPage() {
  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-400">Preview · sample data</p>
        <h1 className="text-2xl font-black text-slate-100">Component preview</h1>
        <p className="mt-1 text-sm text-slate-500">
          The new components rendered with representative sample data (no database / live sources in
          this environment). Hover a stack, drag the mini-map, hover the price lines.
        </p>
      </div>

      <Section
        title="Horizontal timeline — stacking + mini-map"
        note="Busy 2023–24 collapses into stacks; drag the mini-map below the track. Try the zoom buttons and the ⚙ settings."
      >
        <HorizontalTimeline events={TOPIC_EVENTS} />
      </Section>

      <Section
        title="List view — Year → Month grouping"
        note="Year dividers and 'Month YYYY' headers; the year-only history events sit under their year as 'Year only', not a fake Jan 1."
      >
        <EventList events={TOPIC_EVENTS} order="asc" />
      </Section>

      <Section
        title="Company — Biggest moves"
        note="Largest single-day moves, each paired with a nearby earlier event for context."
      >
        <BiggestMoves prices={A_PRICES} events={COMPANY_EVENTS} onSelectDate={() => {}} />
      </Section>

      <Section
        title="Compare — two subjects on one axis"
        note="Growth-of-100 price overlay with each side's return and the spread, a shared-axis event strip, and a combined timeline."
      >
        <CompareView a={SUBJECT_A} b={SUBJECT_B} />
      </Section>
    </div>
  );
}
