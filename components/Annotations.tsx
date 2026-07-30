"use client";

import { useEffect, useState } from "react";
import {
  ANNOTATIONS_EVENT,
  MAX_TEXT,
  addAnnotation,
  loadAnnotations,
  removeAnnotation,
  type Annotation,
  type AnnotationKind,
} from "@/lib/annotations";

/**
 * A reader's own notes, pinned to dates on this subject's timeline.
 *
 * Held in this browser and never sent anywhere — the same rule as follows, prefs and the
 * BYO-model key. That is what makes a trading journal usable here: a thesis or an entry price is
 * exactly the kind of thing nobody should hand to a server they don't run, and because it never
 * leaves, there is no account to create and nothing to leak.
 */

const KINDS: { key: AnnotationKind; label: string }[] = [
  { key: "note", label: "Note" },
  { key: "entry", label: "Entry" },
  { key: "exit", label: "Exit" },
];

const today = () => new Date().toISOString().slice(0, 10);

export default function Annotations({ path }: { path: string }) {
  const [list, setList] = useState<Annotation[]>([]);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState<AnnotationKind>("note");
  const [text, setText] = useState("");

  // Read after mount, never during render: the server has no localStorage, and reading it in a
  // first render would make the markup disagree with itself on hydration.
  useEffect(() => {
    const refresh = () => setList(loadAnnotations(path));
    refresh();
    window.addEventListener(ANNOTATIONS_EVENT, refresh);
    // another tab writing the same subject's notes should show up here too
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(ANNOTATIONS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [path]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setList(addAnnotation(path, { date, kind, text }));
    setText("");
  }

  return (
    <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-200">Your notes</h3>
        <span className="text-[11px] text-slate-500">
          {list.length ? `${list.length} on this timeline · ` : ""}kept in this browser, never sent
          anywhere
        </span>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="ml-auto rounded-md border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-400 transition-colors hover:border-cyan-600 hover:text-cyan-300"
        >
          {open ? "Close" : "Add a note"}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-3 flex flex-wrap items-start gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Date this note is about"
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
          />
          <div className="flex rounded-md border border-slate-700">
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                aria-pressed={kind === k.key}
                className={`px-2.5 py-1 text-xs font-semibold first:rounded-l-md last:rounded-r-md ${
                  kind === k.key ? "bg-cyan-600/25 text-cyan-300" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
            placeholder="Why this date matters to you…"
            aria-label="Note text"
            className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="rounded-md bg-cyan-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-cyan-500 disabled:opacity-40"
          >
            Save
          </button>
        </form>
      )}

      {list.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {list.map((a) => (
            <li key={a.id} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 shrink-0 rounded border border-cyan-700/50 bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-300">
                {a.kind}
              </span>
              <span className="shrink-0 font-mono text-slate-500">{a.date}</span>
              <span className="min-w-0 flex-1 break-words text-slate-300">{a.text}</span>
              <button
                onClick={() => setList(removeAnnotation(path, a.id))}
                title="Delete this note"
                aria-label={`Delete note from ${a.date}`}
                className="shrink-0 rounded px-1 text-slate-600 transition-colors hover:text-red-400"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
