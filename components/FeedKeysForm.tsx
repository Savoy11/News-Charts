"use client";

import { useEffect, useState } from "react";
import { BYO_FEEDS, clearFeedKeys, loadFeedKeys, saveFeedKeys, type FeedKeys } from "@/lib/feedKeys";

/**
 * Your own key for the licensed newspaper archives.
 *
 * The copy here has to be straight about *why* this exists, because it looks like a chore. It is
 * not a paywall workaround and it is not about privacy — it is that NYT's and the Guardian's free
 * API terms are non-commercial. Read through a key this site owns, this site is the licensee,
 * which an ad-supported product is not allowed to be. Read through the visitor's key, they are.
 */
export default function FeedKeysForm() {
  const [keys, setKeys] = useState<FeedKeys>({});
  const [status, setStatus] = useState("");

  useEffect(() => setKeys(loadFeedKeys()), []);

  const stored = loadFeedKeys();
  const anyStored = BYO_FEEDS.some((f) => stored[f.id]);

  return (
    <div className="space-y-3">
      {BYO_FEEDS.map((feed) => (
        <label key={feed.id} className="block">
          <span className="mb-1 flex flex-wrap items-baseline gap-2 text-xs font-semibold text-slate-300">
            {feed.label}
            <span className="font-normal text-slate-500">{feed.where}</span>
          </span>
          <input
            // a handle for the browser checks: the AI settings key field is also a password
            // input and sits above this one, so "the first password field" was the wrong one
            data-feed-key={feed.id}
            type="password"
            value={keys[feed.id] ?? ""}
            onChange={(e) => setKeys({ ...keys, [feed.id]: e.target.value })}
            placeholder="paste your key"
            className="w-full min-w-0 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
          />
          <span className="mt-1 block text-[11px] text-slate-500">{feed.hint}</span>
        </label>
      ))}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            saveFeedKeys(keys);
            setStatus("Saved. Reload a timeline to see your feeds.");
          }}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
        >
          Save keys
        </button>
        {anyStored && (
          <button
            type="button"
            onClick={() => {
              clearFeedKeys();
              setKeys({});
              setStatus("Forgotten.");
            }}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:border-slate-600 hover:text-slate-200"
          >
            Forget keys
          </button>
        )}
      </div>

      {status && <p className="text-xs text-slate-400">{status}</p>}

      <p className="rounded-md border border-slate-800 bg-slate-950/60 p-3 text-[11px] leading-relaxed text-slate-500">
        Your keys are stored in <strong className="text-slate-400">this browser only</strong> and
        are sent directly to the publisher — they never reach a News Charts server. Articles
        fetched with them are shown to you and{" "}
        <strong className="text-slate-400">never saved</strong>: they were fetched under your
        licence, not ours, so keeping them would make this site the redistributor. That is the
        whole reason this is your key rather than ours.
      </p>
    </div>
  );
}
