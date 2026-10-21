import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { LEGAL_DRAFT } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Not investment advice",
  description: "What News Charts is, what it is not, and the limits of its data.",
  robots: LEGAL_DRAFT ? { index: false, follow: false } : undefined,
};

/** The full form of the footer's one line (NC-124). Each limit named here is one the site has. */
export default function DisclaimerPage() {
  return (
    <LegalPage title="Not investment advice">
      <p>
        News Charts is a research tool. It puts news, filings, earnings and other events on a
        timeline beside a security&apos;s price so you can look into what was happening around a
        move. <strong>Nothing on this site is investment, financial, legal or tax advice</strong>, or
        a recommendation to buy, sell or hold anything.
      </p>

      <h2>We are not your adviser</h2>
      <p>
        News Charts is not a broker, dealer or registered investment adviser, and it does not know
        your circumstances or goals. Talk to a qualified professional before making investment
        decisions.
      </p>

      <h2>Close in time is not cause</h2>
      <p>
        The site shows which events happened near a price move. That two things happened close
        together does not mean one caused the other. &ldquo;Biggest moves&rdquo;, sector standings
        and compare views describe what happened over a window; they do not explain or predict it.
      </p>

      <h2>The data has limits</h2>
      <ul>
        <li>
          Prices, filings, news and historical records come from third parties (listed in the
          footer) and may be delayed, incomplete or wrong. The site is not real-time.
        </li>
        <li>
          Which events appear, and how they are labelled and grouped, is decided by automated
          matching that makes mistakes — an article can be about a different company with a
          similar name, or be missed entirely.
        </li>
        <li>
          If you connect your own AI model, its rankings and summaries are its own and can be wrong.
        </li>
        <li>Past price movements say nothing reliable about future ones.</li>
      </ul>

      <h2>Check the source</h2>
      <p>
        Every event links to where it came from. Before relying on anything here, read the original
        filing, article or record.
      </p>
    </LegalPage>
  );
}
