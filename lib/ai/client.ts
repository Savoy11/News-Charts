"use client";

import { parseScoreReply } from "../scoreReply";
import { dataBlock, untrustedNotice } from "../enrich/untrusted";

/**
 * Bring-your-own-model.
 *
 * Every call in this file runs in the visitor's browser and goes straight to their
 * chosen provider. The key is held in localStorage and is never sent to a News Charts
 * server, never logged, and never included in any request to our own origin — that is
 * what makes "your key never leaves your machine" a true statement rather than a promise.
 */

export type ProviderId = "anthropic" | "openai" | "google" | "compatible";

export interface ProviderInfo {
  label: string;
  /** free text, because provider model ids change faster than this file does */
  defaultModel: string;
  defaultBaseUrl?: string;
  keyOptional?: boolean;
  hint: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: {
    label: "Anthropic",
    defaultModel: "claude-haiku-4-5-20251001",
    hint: "Key from console.anthropic.com. Haiku is the cheap, fast choice for ranking.",
  },
  openai: {
    label: "OpenAI",
    defaultModel: "gpt-4o-mini",
    defaultBaseUrl: "https://api.openai.com/v1",
    hint: "Key from platform.openai.com.",
  },
  google: {
    label: "Google Gemini",
    defaultModel: "gemini-2.0-flash",
    hint: "Key from aistudio.google.com.",
  },
  compatible: {
    label: "Local or OpenAI-compatible",
    defaultModel: "llama3.1",
    defaultBaseUrl: "http://localhost:11434/v1",
    keyOptional: true,
    hint: "Ollama, LM Studio, Groq, OpenRouter — anything exposing /chat/completions. Nothing leaves your machine at all with a local model.",
  },
};

export interface AiConfig {
  provider: ProviderId;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

const STORAGE_KEY = "news-charts:ai:v1";

export function loadConfig(): AiConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AiConfig;
    return parsed.provider && parsed.model ? parsed : null;
  } catch {
    return null;
  }
}

/** Fired whenever the stored model config changes, so open panels re-read it. */
export const CONFIG_EVENT = "news-charts:ai-config";
/** Asks the header's settings dialog to open, from anywhere in the app. */
export const OPEN_SETTINGS_EVENT = "news-charts:open-settings";

export function saveConfig(config: AiConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new Event(CONFIG_EVENT));
}

export function clearConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CONFIG_EVENT));
}

export function openSettings(): void {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}

/** One prompt in, one string out — the only shape the rest of the app needs. */
export async function callModel(config: AiConfig, prompt: string, maxTokens = 1500): Promise<string> {
  if (config.provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        // required for calls made straight from a browser
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTokens,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(await describeError(res));
    const json = await res.json();
    return json?.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
  }

  if (config.provider === "google") {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: maxTokens },
      }),
    });
    if (!res.ok) throw new Error(await describeError(res));
    const json = await res.json();
    return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  // openai + anything speaking the same protocol, including local runtimes
  const base = (config.baseUrl || PROVIDERS[config.provider].defaultBaseUrl || "").replace(/\/$/, "");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(await describeError(res));
  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? "";
}

async function describeError(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  if (res.status === 401 || res.status === 403) return "Rejected — check the API key.";
  if (res.status === 404) return "Model or endpoint not found — check the model name.";
  if (res.status === 429) return "Rate limited by the provider.";
  return `${res.status}: ${body.slice(0, 160)}`;
}

export interface RankableEvent {
  id: string;
  date: string;
  title: string;
}

/**
 * At or above this a ranked entry counts as a match. One constant, so the filter and the panel's
 * "showing N of M" count can never disagree (NC-087).
 */
export const RANK_CUTOFF = 0.35;

export interface RankResult {
  scores: Map<string, number>;
  /**
   * Entries that were sent but came back without a usable score — a junk or truncated reply.
   * Kept apart from a low score, because nobody judged them.
   */
  unscored: Set<string>;
}

/**
 * Score how well each event answers the visitor's question. Batched so a long
 * timeline costs a handful of requests rather than one per event.
 *
 * Headlines go in as a delimited data block (the same treatment the operator's scorer gets,
 * NC-153), and the reply is read with the same strict validator: an item must name an entry that
 * was sent and carry a score in [0, 1]. A batch whose reply is unusable used to leave all forty
 * entries unscored, which the filter then read as 0 and hid — the model's failure shown to the
 * visitor as its verdict (NC-087). Those entries are now reported as unscored instead.
 */
export async function rankEvents(
  config: AiConfig,
  events: RankableEvent[],
  instruction: string,
  onProgress?: (done: number, total: number) => void
): Promise<RankResult> {
  const BATCH = 40;
  const scores = new Map<string, number>();
  const unscored = new Set<string>();

  for (let i = 0; i < events.length; i += BATCH) {
    const chunk = events.slice(i, i + BATCH);
    const items = chunk.map((e, n) => ({ i: n + 1, date: e.date, title: e.title.replace(/\s+/g, " ").slice(0, 180) }));

    const prompt =
      `A researcher is reading a timeline and wants: ${JSON.stringify(instruction)}\n\n` +
      `Score how well each entry matches that request.\n` +
      `1.0 = squarely what they asked for\n` +
      `0.5 = related but not central\n` +
      `0.0 = unrelated to the request\n\n` +
      `The entries, one JSON object per line, numbered by "i":\n` +
      `${untrustedNotice("entries")}\n\n` +
      `${dataBlock("entries", items)}\n\n` +
      `Reply with ONLY a JSON array, one object per entry: [{"i":1,"s":0.9}, ...]`;

    const reply = parseScoreReply(await callModel(config, prompt), chunk.length);
    chunk.forEach((ev, n) => {
      const s = reply.scores.get(n + 1);
      if (s === undefined) unscored.add(ev.id);
      else scores.set(ev.id, s);
    });
    onProgress?.(Math.min(i + BATCH, events.length), events.length);
  }

  return { scores, unscored };
}

/**
 * Keep what the visitor's model judged relevant, best matches first — and what it never managed
 * to judge, after them. Anything the ranking did not cover (an event type switched on after it
 * ran) stays outside it, as before.
 */
export function applyRanking<T extends { id: string }>(
  events: T[],
  ranking: { scores: Map<string, number>; unscored: Set<string> } | null
): T[] {
  if (!ranking) return events;
  const matched = events
    .filter((e) => (ranking.scores.get(e.id) ?? -1) >= RANK_CUTOFF)
    .sort((a, b) => (ranking.scores.get(b.id) ?? 0) - (ranking.scores.get(a.id) ?? 0));
  return [...matched, ...events.filter((e) => ranking.unscored.has(e.id))];
}
