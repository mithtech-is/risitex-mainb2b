import type { Metadata } from "next";
import { LegalPage, PolicySection, PolicyList } from "@/components/site/legal-page";

export const metadata: Metadata = {
  title: "Return, Refund & Cancellation Policy",
  description:
    "RISITEX return window, return conditions, refunds, order cancellation, and exchanges.",
  alternates: { canonical: "/refund-policy" },
};

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Return, Refund & Cancellation Policy"
      effective="June 2026"
      breadcrumbLabel="Returns & Refunds"
      intro={
        <p>
          We want you to love what you receive. If something isn’t right, here
          is how returns, refunds, cancellations, and exchanges work.
        </p>
      }
    >
      <PolicySection heading="Returns">
        <p>
          Customers may request returns within <strong>7 days of delivery</strong>{" "}
          for eligible products.
        </p>
      </PolicySection>

      <PolicySection heading="Return conditions">
        <PolicyList
          items={[
            "Product must be unused.",
            "Original tags must be attached.",
            "Original packaging should be available.",
            "Product should not show signs of wear, washing, or damage.",
          ]}
        />
      </PolicySection>

      <PolicySection heading="Non-returnable items">
        <PolicyList
          items={["Customized products", "Gift cards", "Promotional clearance items"]}
        />
      </PolicySection>

      <PolicySection heading="Refunds">
        <p>
          Refunds are processed after a successful quality inspection. Refund
          timelines may vary depending on your payment method, and are credited
          to the original payment method or your RISITEX wallet.
        </p>
      </PolicySection>

      <PolicySection heading="Order cancellation">
        <p>
          Orders may be cancelled before dispatch. Once shipped, cancellation
          requests may not be accepted.
        </p>
      </PolicySection>

      <PolicySection heading="Exchange">
        <p>Size exchanges are subject to stock availability.</p>
      </PolicySection>

      <PolicySection heading="How to start a return">
        <p>
          Submit a return request through customer support at{" "}
          <a
            href="mailto:risitexindia@gmail.com"
            className="text-text-primary underline underline-offset-4"
          >
            risitexindia@gmail.com
          </a>{" "}
          with your order number.
        </p>
      </PolicySection>
    </LegalPage>
  );
}
