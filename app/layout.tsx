import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import SettingsMenu from "@/components/SettingsMenu";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Chronolens — Research any topic on a timeline",
  description:
    "See news, earnings, SEC filings, and historical events on a single timeline — pegged to the stock price for public companies.",
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
