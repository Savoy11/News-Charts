"use client";

import { useEffect, useRef, useState } from "react";
import {
  CONFIG_EVENT,
  PROVIDERS,
  type AiConfig,
  type RankableEvent,
  loadConfig,
  openSettings,
  rankEvents,
} from "@/lib/ai/client";

export interface AiRanking {
  instruction: string;
  scores: Map<string, number>;
}

interface Props {
  events: RankableEvent[];
  ranking: AiRanking | null;
  onRanking: (r: AiRanking | null) => void;
}

export default function AiPanel({ events, ranking, onRanking }: Props) {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // settings live in the header dialog; re-read whenever they change there
  useEffect(() => {
    const refresh = () => setConfig(loadConfig());
    refresh();
    window.addEventListener(CONFIG_EVENT, refresh);
    return () => window.removeEventListener(CONFIG_EVENT, refresh);
  }, []);

  async function run() {
    if (!config) {
      openSettings();
      return;
    }
    if (!instruction.trim() || busy) return;
    setBusy(true);
    setError(null);
    setProgress(`0 / ${events.length}`);
    try {
      const scores = await rankEvents(config, events, instruction.trim(), (done, total) =>
        setProgress(`${done} / ${total}`)
      );
      onRanking({ instruction: instruction.trim(), scores });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-slate-800 bg-slate-900/40">
      <div className="flex flex-wrap items-center gap-2 p-2">
        <span className="rounded bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">
          AI search
        </span>

        <input
          ref={inputRef}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder={
            config
              ? "Narrow this timeline — e.g. “antitrust and regulation” or “product launches”"
              : "Connect your own model to search this timeline with AI"
          }
          disabled={busy}
          className="min-w-[14rem] flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:border-fuchsia-600 focus:outline-none disabled:opacity-60"
        />

        <button
          onClick={run}
          disabled={busy}
          className="rounded-md bg-fuchsia-600/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-fuchsia-600 disabled:opacity-50"
        >
          {busy ? progress ?? "…" : config ? "Rank" : "Connect"}
        </button>

        {ranking && (
          <button
            onClick={() => onRanking(null)}
            className="rounded-md border border-slate-700 px-2 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200"
          >
            clear
          </button>
        )}

        <button
          onClick={openSettings}
          title="Open model settings"
          className="ml-auto text-xs font-semibold text-slate-500 hover:text-slate-300"
        >
          {config ? `${PROVIDERS[config.provider].label} · ${config.model}` : "set up"}
        </button>
      </div>

      {error && <p className="px-3 pb-2 text-xs text-red-400">{error}</p>}

      {ranking && !busy && (
        <p className="px-3 pb-2 text-xs text-slate-500">
          Ranked for <span className="text-fuchsia-300">“{ranking.instruction}”</span> — showing{" "}
          {[...ranking.scores.values()].filter((s) => s >= 0.35).length} of {events.length} entries,
          best matches first.
        </p>
      )}

    </div>
  );
}
