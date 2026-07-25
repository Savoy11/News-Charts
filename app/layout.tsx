import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import SettingsMenu from "@/components/SettingsMenu";
import { SITE_NAME, SITE_URL } from "@/lib/seo";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const DEFAULT_TITLE = "Chronolens — Research any topic on a timeline";
const DEFAULT_DESCRIPTION =
  "See news, earnings, SEC filings, and historical events on a single timeline — pegged to the stock price for public companies.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Subject pages set their own title; this template frames it. `default` is the home/fallback.
  title: { default: DEFAULT_TITLE, template: `%s · ${SITE_NAME}` },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: { card: "summary_large_image", title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} min-h-screen bg-slate-950 font-sans text-slate-200 antialiased`}>
        <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-black tracking-tight text-slate-100">
              chrono<span className="text-sky-400">lens</span>
            </Link>
            <div className="flex items-center gap-3">
              <Link
                href="/explore"
                className="text-xs font-semibold text-slate-400 transition-colors hover:text-slate-200"
              >
                Explore
              </Link>
              <Link
                href="/compare"
                className="text-xs font-semibold text-slate-400 transition-colors hover:text-slate-200"
              >
                Compare
              </Link>
              <Link
                href="/following"
                className="text-xs font-semibold text-slate-400 transition-colors hover:text-slate-200"
              >
                Following
              </Link>
              <span className="hidden text-xs text-slate-500 sm:inline">Timelines for analysts</span>
              <SettingsMenu />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mt-16 border-t border-slate-800/80 py-6">
          <div className="mx-auto max-w-6xl px-4 text-xs text-slate-600">
            <p>
              Chronolens is a research tool, not investment advice. Price data from Yahoo Finance,
              filings from SEC EDGAR, recent news from GDELT, historical newspapers from the
              Library of Congress (Chronicling America), historical context from Wikipedia
              (CC BY-SA).
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
