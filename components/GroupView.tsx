"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SignalPanel from "./SignalPanel";
import EventList from "./EventList";
import { DEFAULT_PREFS, loadPrefs, openPrefs, PREFS_EVENT, type Prefs } from "@/lib/prefs";
import type { TimelineEvent } from "@/lib/types";

export default function GroupView({ name }: { name: string }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [extra, setExtra] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const refresh = () => {
      setPrefs(loadPrefs());
      setReady(true);
    };
    refresh();
    window.addEventListener(PREFS_EVENT, refresh);
    return () => window.removeEventListener(PREFS_EVENT, refresh);
  }, []);

  const group = prefs.groups.find((g) => g.name === name);
  const tickers = group?.tickers ?? [];

  useEffect(() => {
    if (!ready || !tickers.length) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/group?tickers=${encodeURIComponent(tickers.join(","))}`)
      .then((r) => r.json())
      .then((json) => !cancelled && setEvents(json.events ?? []))
      .catch(() => !cancelled && setEvents([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [ready, tickers.join(",")]);

  if (!ready) return <p className="text-sm text-slate-500">Loading your groups…</p>;

  if (!group) {
    return (
      <p className="text-sm text-slate-500">
        No group called “{name}” in this browser.{" "}
        <button onClick={openPrefs} className="font-semibold text-emerald-400 hover:text-emerald-300">
          Create it in settings
        </button>
        .
      </p>
    );
  }

  if (!tickers.length) {
    return (
      <p className="text-sm text-slate-500">
        “{name}” has no tickers yet.{" "}
        <button onClick={openPrefs} className="font-semibold text-emerald-400 hover:text-emerald-300">
          Add some in settings
        </button>
        . Companies must have been ingested before they can appear here.
      </p>
    );
  }

  const merged = [...events, ...extra].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Members:</span>
        {tickers.map((t) => (
          <Link
            key={t}
            href={`/company/${t}`}
            className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:border-emerald-600 hover:text-emerald-300"
          >
            {t}
          </Link>
        ))}
        <button
          onClick={openPrefs}
          className="ml-auto text-xs font-semibold text-slate-500 hover:text-emerald-300"
        >
          edit group
        </button>
      </div>

      <SignalPanel tickers={tickers} onExtraEvents={setExtra} />

      <div className="mb-4 flex items-baseline gap-2">
        <h2 className="text-lg font-bold text-slate-100">Group timeline</h2>
        <span className="text-xs text-slate-500">
          {loading ? "loading…" : `${merged.length} events`}
        </span>
      </div>

      {merged.length ? (
        <EventList events={merged} />
      ) : (
        !loading && (
          <p className="text-sm text-slate-500">
            No events for these tickers yet — they need to be ingested first.
          </p>
        )
      )}
    </div>
  );
}
