import type { Metadata } from "next";
import { LegalPage, PolicySection, PolicyList } from "@/components/site/legal-page";

export const metadata: Metadata = {
  title: "Shipping Policy",
  description:
    "RISITEX dispatch timelines, delivery coverage, shipping charges, COD limits, and tracking.",
  alternates: { canonical: "/shipping-policy" },
};

export default function ShippingPolicyPage() {
  return (
    <LegalPage
      title="Shipping Policy"
      effective="June 2026"
      breadcrumbLabel="Shipping Policy"
      intro={
        <p>
          Orders are shipped from our facilities in Tamil Nadu through trusted
          courier partners across India.
        </p>
      }
    >
      <PolicySection heading="Processing & dispatch">
        <p>
          Orders are typically processed and dispatched within 1–3 business
          days. During sale periods or peak demand, dispatch may take slightly
          longer. You’ll receive an update when your order ships.
        </p>
      </PolicySection>

      <PolicySection heading="Delivery coverage & timelines">
        <p>
          We deliver across India. Estimated delivery after dispatch:
        </p>
        <PolicyList
          items={[
            "Metro cities: 2–4 business days",
            "Other cities and towns: 4–7 business days",
            "Remote / serviceable PIN codes: up to 10 business days",
          ]}
        />
      </PolicySection>

      <PolicySection heading="Courier partners">
        <p>
          We ship via Bluedart, Delhivery, DTDC, Shiprocket, Ekart, XpressBees,
          and Ecom Express depending on your location and serviceability.
        </p>
      </PolicySection>

      <PolicySection heading="Shipping charges">
        <p>
          Shipping is free on orders above ₹2,500. A flat shipping fee applies
          to smaller orders and is shown at checkout before payment.
        </p>
      </PolicySection>

      <PolicySection heading="Cash on Delivery">
        <p>
          Cash on Delivery, where available, is offered only for orders up to
          ₹10,000. Higher-value orders are payable online at checkout.
        </p>
      </PolicySection>

      <PolicySection heading="Tracking your order">
        <p>
          Tracking details are shared once your order is dispatched. You can
          follow your shipment any time from{" "}
          <a
            href="/b2b/orders"
            className="text-text-primary underline underline-offset-4"
          >
            your orders
          </a>{" "}
          — each order has a live status timeline and a link to the courier’s
          tracking page.
        </p>
      </PolicySection>
    </LegalPage>
  );
}
