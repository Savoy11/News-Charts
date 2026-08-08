"use client";

import { useState } from "react";
import {
  PROVIDERS,
  type AiConfig,
  type ProviderId,
  callModel,
  clearConfig,
  saveConfig,
} from "@/lib/ai/client";

/**
 * The single place model settings are edited. Rendered inside the header dialog;
 * nothing here ever talks to a Chronolens server.
 */
export default function AiSettingsForm({
  config,
  onSaved,
}: {
  config: AiConfig | null;
  onSaved?: (c: AiConfig | null) => void;
}) {
  const [provider, setProvider] = useState<ProviderId>(config?.provider ?? "anthropic");
  const [model, setModel] = useState(config?.model ?? PROVIDERS.anthropic.defaultModel);
  const [apiKey, setApiKey] = useState(config?.apiKey ?? "");
  const [baseUrl, setBaseUrl] = useState(
    config?.baseUrl ?? PROVIDERS[config?.provider ?? "anthropic"].defaultBaseUrl ?? ""
  );
  const [status, setStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  function pickProvider(id: ProviderId) {
    setProvider(id);
    setModel(PROVIDERS[id].defaultModel);
    setBaseUrl(PROVIDERS[id].defaultBaseUrl ?? "");
    setStatus(null);
  }

  async function test() {
    setTesting(true);
    setStatus("testing…");
    try {
      const text = await callModel(
        { provider, model, apiKey, baseUrl },
        "Reply with the single word: ok",
        16
      );
      setStatus(text.trim() ? `connected — replied “${text.trim().slice(0, 24)}”` : "empty reply");
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setTesting(false);
    }
  }

  const needsKey = !PROVIDERS[provider].keyOptional;
  const canSave = model.trim().length > 0 && (!needsKey || apiKey.trim().length > 0);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Provider
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => (
            <button
              key={id}
              onClick={() => pickProvider(id)}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                provider === id
                  ? "border-fuchsia-600 bg-fuchsia-600/15 text-fuchsia-300"
                  : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
              }`}
            >
              {PROVIDERS[id].label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{PROVIDERS[provider].hint}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-400">
          Model
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            spellCheck={false}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-200 focus:border-fuchsia-600 focus:outline-none"
          />
        </label>
        <label className="text-xs font-medium text-slate-400">
          API key{PROVIDERS[provider].keyOptional ? " (optional)" : ""}
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder={PROVIDERS[provider].keyOptional ? "not needed locally" : "sk-…"}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-200 focus:border-fuchsia-600 focus:outline-none"
          />
        </label>
        {PROVIDERS[provider].defaultBaseUrl && (
          <label className="text-xs font-medium text-slate-400 sm:col-span-2">
            Endpoint
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              spellCheck={false}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-200 focus:border-fuchsia-600 focus:outline-none"
            />
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={!canSave}
          onClick={() => {
            const next = { provider, model: model.trim(), apiKey: apiKey.trim(), baseUrl };
            saveConfig(next);
            onSaved?.(next);
            setStatus("saved to this browser");
          }}
          className="rounded-md bg-fuchsia-600/80 px-3.5 py-2 text-xs font-semibold text-white hover:bg-fuchsia-600 disabled:opacity-40"
        >
          Save
        </button>
        <button
          onClick={test}
          disabled={testing || !canSave}
          className="rounded-md border border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:border-slate-500 disabled:opacity-40"
        >
          Test connection
        </button>
        {config && (
          <button
            onClick={() => {
              clearConfig();
              onSaved?.(null);
              setApiKey("");
              setStatus("removed from this browser");
            }}
            className="ml-auto rounded-md border border-slate-800 px-3 py-2 text-xs font-semibold text-slate-500 hover:border-red-900 hover:text-red-400"
          >
            Forget key
          </button>
        )}
      </div>

      {status && <p className="text-xs text-slate-400">{status}</p>}

      <p className="rounded-md border border-slate-800 bg-slate-950/60 p-3 text-[11px] leading-relaxed text-slate-500">
        Your key is stored in <strong className="text-slate-400">this browser only</strong> and is
        sent directly to the provider you choose — it never reaches a Chronolens server, and we
        never see your prompts or results. This adds an AI search box over the timeline; the
        timeline itself — news, filings and reports — is served by Chronolens over the internet, so
        it isn’t available offline.
      </p>
    </div>
  );
}
