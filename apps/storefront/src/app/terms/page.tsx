import type { Metadata } from "next";
import { LegalPage, PolicySection } from "@/components/site/legal-page";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "The terms that govern your use of the RISITEX website and your purchases.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      effective="June 2026"
      breadcrumbLabel="Terms & Conditions"
      intro={<p>By using the RISITEX website, you agree to these terms.</p>}
    >
      <PolicySection heading="1. Eligibility">
        <p>
          Users must provide accurate information while creating accounts and
          placing orders.
        </p>
      </PolicySection>

      <PolicySection heading="2. Products">
        <p>
          Product colours and appearance may vary slightly due to screen
          settings.
        </p>
      </PolicySection>

      <PolicySection heading="3. Pricing">
        <p>
          Prices may change without prior notice. Applicable taxes are charged
          during checkout.
        </p>
      </PolicySection>

      <PolicySection heading="4. Orders">
        <p>
          RISITEX reserves the right to cancel orders due to pricing errors,
          stock issues, suspected fraud, or operational constraints.
        </p>
      </PolicySection>

      <PolicySection heading="5. Payments">
        <p>
          Payments are processed through secure third-party payment gateways.
          Cash on Delivery, where offered, is available only for orders up to
          ₹10,000.
        </p>
      </PolicySection>

      <PolicySection heading="6. Intellectual property">
        <p>
          All website content — including logos, images, text, graphics, and
          designs — belongs to RISITEX unless otherwise stated.
        </p>
      </PolicySection>

      <PolicySection heading="7. User conduct">
        <p>
          Users shall not misuse the website, upload harmful content, or
          attempt unauthorized access.
        </p>
      </PolicySection>

      <PolicySection heading="8. Limitation of liability">
        <p>
          RISITEX shall not be liable for indirect, incidental, or
          consequential damages arising from website usage.
        </p>
      </PolicySection>

      <PolicySection heading="9. Governing law">
        <p>These terms are governed by the laws of India.</p>
      </PolicySection>
    </LegalPage>
  );
}
