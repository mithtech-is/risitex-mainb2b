"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Container } from "@/components/site/container";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { Reveal } from "@/components/site/reveal";

const FAQS: { q: string; a: string }[] = [
  {
    q: "Do you offer wholesale pricing and MOQs?",
    a: "Yes. RISITEX runs a wholesale programme with tier-based pricing and minimum order quantities that flex with your volume. Apply for a business account to unlock trade pricing.",
  },
  {
    q: "Who can buy on RISITEX?",
    a: "Our platform is for verified retailers, distributors, and business buyers. Approved accounts get access to wholesale pricing, MOQ ladders, and bulk ordering.",
  },
  {
    q: "How can I track my order?",
    a: "Tracking is shared after dispatch. Every order shows a live status timeline in your account, from approval through production, dispatch, and delivery.",
  },
  {
    q: "Can I change my shipping address after ordering?",
    a: "Contact support immediately. Changes are subject to the order’s status — once an order is shipped, the address can no longer be changed.",
  },
  {
    q: "How do I request a return?",
    a: "Submit a return request through customer support with your order number. Returns are accepted within 7 days of delivery for eligible products.",
  },
  {
    q: "When will I receive my refund?",
    a: "Refunds are processed after return inspection. Timelines vary by payment method and are credited to your original payment method or RISITEX wallet.",
  },
  {
    q: "What payment methods are accepted?",
    a: "UPI, debit cards, credit cards, net banking, and other supported options. GST-compliant invoices are issued for every order.",
  },
  {
    q: "Are products genuine and quality-checked?",
    a: "Yes. Every batch is inspected against a fixed quality standard before dispatch, so consistency holds from the first carton to the last.",
  },
];

export default function FaqPage() {
  const [openIndex, setOpenIndex] = React.useState<number | null>(null);
  const headerRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // Opening a question closes any other that was open.
  const toggle = (index: number) =>
    setOpenIndex(openIndex === index ? null : index);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        headerRefs.current[(index + 1) % FAQS.length]?.focus();
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        headerRefs.current[(index - 1 + FAQS.length) % FAQS.length]?.focus();
        break;
      }
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

      <header className="relative overflow-hidden border-b border-border-subtle py-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-[280px] w-[280px] rounded-full bg-ochre-400/10 blur-3xl"
        />
        <Reveal className="relative">
          <p className="text-micro font-semibold uppercase tracking-[0.2em] text-brand-accent">
            Help Centre
          </p>
          <h1 className="mt-3 font-display text-display-lg text-text-primary md:text-display-xl">
            Frequently asked questions
          </h1>
          <p className="mt-4 max-w-2xl text-body-lg text-text-secondary">
            Quick answers on wholesale, orders, tracking, returns, and payments.
            Still stuck?{" "}
            <a
              href="/contact"
              className="font-medium text-text-primary underline underline-offset-4"
            >
              Talk to our team
            </a>
            .
          </p>
        </Reveal>
      </header>

      <div className="max-w-3xl py-8">
        <ul className="space-y-3">
          {FAQS.map((f, i) => {
            const isOpen = openIndex === i;
            return (
              <Reveal key={f.q} delay={(i % 4) * 50}>
                <li
                  className={`overflow-hidden rounded-xl border bg-surface-raised transition-colors duration-base ease-standard ${
                    isOpen ? "border-border-strong" : "border-border-subtle"
                  }`}
                >
                  <h2>
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
                      className="flex w-full items-center justify-between gap-4 p-5 text-left font-display text-heading-sm text-text-primary transition-colors duration-fast hover:text-brand-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      <span>{f.q}</span>
                      <span
                        aria-hidden
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-base ease-standard ${
                          isOpen
                            ? "rotate-180 bg-brand-accent text-white"
                            : "bg-surface-sunken text-text-muted"
                        }`}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </span>
                    </button>
                  </h2>
                  <div
                    id={`faq-answer-${i}`}
                    role="region"
                    aria-labelledby={`faq-header-${i}`}
                    className={`grid transition-all duration-base ease-standard ${
                      isOpen
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="px-5 pb-5 text-body-md leading-relaxed text-text-secondary">
                        {f.a}
                      </p>
                    </div>
                  </div>
                </li>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </Container>
  );
}
