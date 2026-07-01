"use client";

import type { Metadata } from "next";
import * as React from "react";
import { Container } from "@/components/site/container";
import { Breadcrumb } from "@/components/site/breadcrumb";

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
  const [openIndex, setOpenIndex] = React.useState<number | null>(null);
  const headerRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        const nextIndex = (index + 1) % FAQS.length;
        headerRefs.current[nextIndex]?.focus();
        break;
      case "ArrowUp":
        e.preventDefault();
        const prevIndex = (index - 1 + FAQS.length) % FAQS.length;
        headerRefs.current[prevIndex]?.focus();
        break;
      case "Home":
        e.preventDefault();
        headerRefs.current[0]?.focus();
        break;
      case "End":
        e.preventDefault();
        headerRefs.current[FAQS.length - 1]?.focus();
        break;
    }
  };

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
        <h1 className="mt-2 text-display-lg text-text-primary font-display">
          Frequently asked questions
        </h1>
        <p className="mt-3 max-w-2xl text-body-md text-text-secondary">
          Quick answers on orders, tracking, returns, and payments. Still stuck?{" "}
          <a
            href="/contact"
            className="text-text-primary underline underline-offset-4 font-medium"
          >
            Contact us
          </a>
          .
        </p>
      </header>

      <div className="max-w-2xl divide-y divide-border-subtle py-4">
        {FAQS.map((f, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={f.q} className="py-4">
              <h2 className="text-heading-sm">
                <button
                  type="button"
                  ref={(el) => {
                    headerRefs.current[i] = el;
                  }}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${i}`}
                  id={`faq-header-${i}`}
                  onClick={() => toggle(i)}
                  onKeyDown={(e) => handleKeyDown(e, i)}
                  className="flex w-full items-center justify-between gap-4 text-left font-display text-text-primary hover:text-action-primary-bg transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 py-2 rounded"
                >
                  <span>{f.q}</span>
                  <span
                    className={`text-text-muted text-xl transform transition-transform duration-normal ${
                      isOpen ? "rotate-45 text-action-primary-bg" : ""
                    }`}
                  >
                    +
                  </span>
                </button>
              </h2>
              <div
                id={`faq-answer-${i}`}
                role="region"
                aria-labelledby={`faq-header-${i}`}
                className={`transition-all duration-normal overflow-hidden ${
                  isOpen ? "max-h-[200px] opacity-100 mt-2" : "max-h-0 opacity-0"
                }`}
              >
                <p className="text-body-md text-text-secondary leading-relaxed pb-2">
                  {f.a}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Container>
  );
}
