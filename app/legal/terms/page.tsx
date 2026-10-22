import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";
import { CONTACT, GOVERNING_LAW, LEGAL_DRAFT, OPERATOR } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using News Charts.",
  robots: LEGAL_DRAFT ? { index: false, follow: false } : undefined,
};

/** A draft for legal review (NC-124), written around how the site actually works. */
export default function TermsPage() {
  return (
    <LegalPage title="Terms">
      <p>
        These terms cover your use of News Charts, run by {OPERATOR} (&ldquo;we&rdquo;). By using the
        site you agree to them. If you don&apos;t agree, please don&apos;t use it.
      </p>

      <h2>What the site is</h2>
      <p>
        A free research tool for exchange-traded securities, offered for people in the United
        States. It is not investment advice — see{" "}
        <Link href="/legal/disclaimer">Not investment advice</Link>, which is part of these terms.
      </p>

      <h2>Using it fairly</h2>
      <ul>
        <li>Use the site for your own research.</li>
        <li>
          Don&apos;t copy or download its content in bulk, run automated scraping against it, try to
          get around its rate limits, or resell or republish what it shows as your own service.
        </li>
        <li>Don&apos;t try to break, overload or gain unauthorised access to the site.</li>
      </ul>

      <h2>Other people&apos;s content</h2>
      <p>
        Much of what the site shows belongs to others or is public record: filings from the SEC,
        historical newspapers from the Library of Congress, rules from the Federal Register, policy
        decisions from the Federal Reserve, inflation reports from the Bureau of Labor Statistics,
        vehicle recalls from the National Highway Traffic Safety Administration, press releases from
        the U.S. Department of Justice, material from the
        Internet Archive, text from Wikipedia under CC BY-SA, and headlines that
        link to their publishers. Those sources&apos; own terms and licences apply to their content.
        We link to the original wherever we can.
      </p>

      <h2>Your own keys</h2>
      <p>
        If you connect your own AI model or a New York Times or Guardian key, you use that service
        under your own agreement with it, and you are responsible for following its terms. Articles
        fetched with your key are shown to you and not stored by us. See{" "}
        <Link href="/legal/privacy">Privacy</Link>.
      </p>

      <h2>No warranty</h2>
      <p>
        The site is provided &ldquo;as is&rdquo;. We don&apos;t promise it will be accurate, complete,
        available or free of errors, and we may change or stop any part of it at any time.
      </p>

      <h2>Limits on liability</h2>
      <p>
        To the extent the law allows, we are not liable for any loss arising from your use of the
        site or reliance on its content, including investment losses. [Liability cap and any
        jurisdiction-specific wording, for legal review.]
      </p>

      <h2>Changes, law and contact</h2>
      <p>
        We may update these terms; the date at the top shows when. Continuing to use the site after
        a change means you accept it. These terms are governed by the laws of {GOVERNING_LAW}.
        Questions: {CONTACT}.
      </p>
    </LegalPage>
  );
}
