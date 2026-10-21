import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { BROWSER_STORAGE, CONTACT, LEGAL_DRAFT, OPERATOR } from "@/lib/legal";
import { MAX_QUERY, SEARCH_LOG_RETENTION_DAYS } from "@/lib/searchLog";
import { REQUEST_RETENTION_DAYS } from "@/lib/ingest/queue";
import { REQUEST_WINDOW_MS, SWEEP_EVERY_MS, TERMS_WINDOW_MS } from "@/lib/rateLimit";

/** "a minute", "an hour", "5 minutes" — a limiter window as the page says it. */
function span(ms: number): string {
  const [n, unit] = ms >= 3_600_000 ? [ms / 3_600_000, "hour"] : [ms / 60_000, "minute"];
  return n === 1 ? `${unit === "hour" ? "an" : "a"} ${unit}` : `${n} ${unit}s`;
}

export const metadata: Metadata = {
  title: "Privacy",
  description: "What News Charts stores, where, and for how long.",
  robots: LEGAL_DRAFT ? { index: false, follow: false } : undefined,
};

/**
 * Written from what the code does, not from a template (NC-124). The numbers are imported from the
 * code that enforces them, and `check:legal` fails if the site stores something in the browser
 * that the table below does not list.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <p>
        News Charts is run by {OPERATOR}. It has no accounts and no sign-in, and it does not sell or
        share personal information. This page says exactly what it keeps.
      </p>

      <h2>What we keep on our server</h2>
      <ul>
        <li>
          <strong>Searches.</strong> The words you type into the search box, cut to {MAX_QUERY}{" "}
          characters, with what the site matched them to. They are kept so we can tell whether
          search finds what people look for, and deleted after {SEARCH_LOG_RETENTION_DAYS} days.
          Nothing is stored with them that could identify you — no IP address, browser details,
          session or account.
        </li>
        <li>
          <strong>Requests for pages we don&apos;t have yet.</strong> When you open a security or
          topic the site has not collected, its name is queued so the next update can fetch it.
          Requests nobody repeats are deleted after {REQUEST_RETENTION_DAYS} days. Again, nothing
          about you is stored with them.
        </li>
        <li>
          <strong>Your IP address, briefly.</strong> To stop any one visitor overloading the site,
          the server counts recent requests per IP address, in memory only: page requests over{" "}
          {span(REQUEST_WINDOW_MS)}, and Federal Register searches, with the search terms, over{" "}
          {span(TERMS_WINDOW_MS)}. Each count is cleared within {span(SWEEP_EVERY_MS)} of its window
          ending and is never written down. The company that hosts the site may keep its own access
          logs; [hosting provider and its log retention, once chosen].
        </li>
      </ul>

      <h2>What stays in your browser</h2>
      <p>
        Your settings, follows and notes are kept in your own browser&apos;s storage, not on our
        server. Clearing your browser&apos;s site data removes them. News Charts sets no cookies of
        its own.
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="py-1 pr-3">Stored item</th>
            <th className="py-1 pr-3">What it holds</th>
            <th className="py-1">Kept</th>
          </tr>
        </thead>
        <tbody>
          {BROWSER_STORAGE.map((s) => (
            <tr key={s.prefix} className="border-t border-slate-800">
              <td className="py-1 pr-3 font-mono text-[11px]">{s.prefix}</td>
              <td className="py-1 pr-3">{s.what}</td>
              <td className="py-1">{s.where === "sessionStorage" ? "until you close the tab" : "until you clear it"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Your own API keys</h2>
      <p>
        If you connect your own AI model or add a New York Times or Guardian key, the key stays in
        your browser and your browser sends it straight to that provider. It never reaches a News
        Charts server, and we never see your prompts, results, or the articles fetched with it —
        those are shown to you and not saved. A browser holding a key never loads advertising on
        News Charts, so no ad script runs beside it. Your use of those services is governed by
        their own terms and privacy policies.
      </p>

      <h2>Other sites your browser contacts</h2>
      <ul>
        <li>
          Some events show a small picture taken from the publisher&apos;s page. Your browser loads it
          from that publisher, which can see your IP address, as with any image on the web.
        </li>
        <li>Links to articles, filings and sources open those sites, under their own privacy policies.</li>
        <li>
          [Advertising: none runs today. When it does, name the ad network, what it collects, and
          how to opt out — and any consent banner the target regions require (NC-125).]
        </li>
      </ul>

      <h2>Children</h2>
      <p>News Charts is not directed at children under 13 and does not knowingly collect their information.</p>

      <h2>Changes and contact</h2>
      <p>
        If this page changes, the date at the top changes with it. Questions: {CONTACT}.
      </p>
    </LegalPage>
  );
}
