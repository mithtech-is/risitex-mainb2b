import type { Metadata } from "next";
import { Container } from "@/components/site/container";
import { Breadcrumb } from "@/components/site/breadcrumb";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Answers to common questions about orders, tracking, returns, refunds, and payments at RISITEX.",
  alternates: { canonical: "/faq" },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "How can I track my order?",
    a: "Tracking information is shared after dispatch. You can follow your shipment any time from your account orders, where each order shows a live status timeline.",
  },
  {
    q: "Can I change my shipping address after placing an order?",
    a: "Contact support immediately. Changes are subject to the order’s status — once an order is shipped, the address can no longer be changed.",
  },
  {
    q: "How do I request a return?",
    a: "Submit a return request through customer support with your order number. Returns are accepted within 7 days of delivery for eligible products.",
  },
  {
    q: "When will I receive my refund?",
    a: "Refunds are generally processed after return inspection. Timelines vary by payment method and are credited to your original payment method or RISITEX wallet.",
  },
  {
    q: "Are products genuine?",
    a: "Yes. All products sold on RISITEX are genuine and quality checked.",
  },
  {
    q: "What payment methods are accepted?",
    a: "UPI, Debit Cards, Credit Cards, Net Banking, and other supported options. Cash on Delivery is available for orders up to ₹10,000.",
  },
  {
    q: "Do you offer wholesale pricing?",
    a: "Yes. RISITEX runs a wholesale programme with tiered pricing and minimum order quantities. Apply for a wholesale account to access trade pricing.",
  },
];

export default function FaqPage() {
  return (
    <Container>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQS.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        }}
      />
      <div className="pt-6">
        <Breadcrumb
          items={[
            { href: "/", label: "Home" },
            { href: "#", label: "FAQ" },
          ]}
        />
      </div>

      <header className="border-b border-border-subtle py-10">
        <p className="text-micro text-text-muted">Help</p>
        <h1 className="mt-2 text-display-lg text-text-primary">
          Frequently asked questions
        </h1>
        <p className="mt-3 max-w-2xl text-body-md text-text-secondary">
          Quick answers on orders, tracking, returns, and payments. Still stuck?{" "}
          <a
            href="/contact"
            className="text-text-primary underline underline-offset-4"
          >
            Contact us
          </a>
          .
        </p>
      </header>

      <div className="max-w-2xl divide-y divide-border-subtle py-4">
        {FAQS.map((f) => (
          <details key={f.q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-heading-sm text-text-primary">
              {f.q}
              <span className="text-text-muted transition-transform duration-fast group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-body-md text-text-secondary">{f.a}</p>
          </details>
        ))}
      </div>
    </Container>
  );
}
