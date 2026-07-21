"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import AiSettingsForm from "./AiSettingsForm";
import {
  CONFIG_EVENT,
  OPEN_SETTINGS_EVENT,
  PROVIDERS,
  type AiConfig,
  loadConfig,
} from "@/lib/ai/client";

export default function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [config, setConfig] = useState<AiConfig | null>(null);

  useEffect(() => setMounted(true), []);

  const refresh = useCallback(() => setConfig(loadConfig()), []);

  useEffect(() => {
    refresh();
    const openHandler = () => setOpen(true);
    window.addEventListener(CONFIG_EVENT, refresh);
    window.addEventListener(OPEN_SETTINGS_EVENT, openHandler);
    // keep multiple tabs in step
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CONFIG_EVENT, refresh);
      window.removeEventListener(OPEN_SETTINGS_EVENT, openHandler);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  // escape to close, and don't let the page scroll behind the dialog
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Settings"
        aria-label="Settings"
        aria-haspopup="dialog"
        className="relative rounded-md border border-slate-800 px-2 py-1 text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200"
      >
        <span aria-hidden className="text-sm">
          ⚙
        </span>
        {config && (
          <span
            aria-hidden
            title="A model is connected"
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-fuchsia-500 ring-2 ring-slate-950"
          />
        )}
      </button>

      {/*
        Portalled to <body>: the header uses backdrop-blur, and a backdrop-filter makes the
        header a containing block for position:fixed descendants — the dialog would otherwise
        be trapped inside the header bar instead of covering the viewport.
      */}
      {open &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center"
            onClick={() => setOpen(false)}
          >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            onClick={(e) => e.stopPropagation()}
            className="my-8 w-full max-w-xl rounded-xl border border-slate-800 bg-slate-900 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-100">Settings</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close settings"
                className="rounded px-2 text-lg leading-none text-slate-500 hover:text-slate-200"
              >
                ×
              </button>
            </div>

            <div className="space-y-2 p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="text-sm font-bold text-slate-200">AI model</h3>
                <span className="text-xs text-slate-500">
                  {config
                    ? `connected — ${PROVIDERS[config.provider].label} · ${config.model}`
                    : "not connected"}
                </span>
              </div>
              <p className="pb-1 text-xs leading-relaxed text-slate-500">
                Connect your own model to search timelines in plain language — “antitrust and
                regulation”, “product launches”. Chronolens works fully without this; it only adds
                the AI search box.
              </p>
              <AiSettingsForm config={config} onSaved={setConfig} />
            </div>
          </div>
          </div>,
          document.body
        )}
    </>
  );
}
