"use client";

import * as React from "react";
import { MessageCircleQuestion } from "lucide-react";
import { MEDUSA_BASE_URL } from "@/lib/medusa";
import { QuestionSubmit } from "./question-submit";

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

type Question = {
  id: string;
  question: string;
  answer: string | null;
  customer_name: string;
};

export function ProductQuestions({
  productId,
  metadataQuestions,
}: {
  productId: string;
  metadataQuestions?: { question: string; answer: string }[];
}) {
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch(
      `${MEDUSA_BASE_URL}/store/product-questions?product_id=${encodeURIComponent(productId)}`,
      { headers: { "x-publishable-api-key": PUB_KEY } },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) {
          setQuestions(data?.questions ?? []);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [productId]);

  const displayQuestions = loaded
    ? questions
    : (metadataQuestions ?? []).map((q) => ({
        id: q.question,
        question: q.question,
        answer: q.answer,
        customer_name: "Buyer",
      }));

  return (
    <section className="rounded-xl border border-border-subtle bg-surface-raised p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border-subtle pb-5">
        <div>
          <p className="text-micro uppercase tracking-[0.14em] text-text-muted">
            Ask the manufacturer
          </p>
          <h2 className="mt-1.5 flex items-baseline gap-2 font-display text-heading-lg text-text-primary">
            Questions &amp; Answers
            {displayQuestions.length > 0 && (
              <span className="text-body-md font-normal text-text-muted numerics-tabular">
                {displayQuestions.length}
              </span>
            )}
          </h2>
        </div>
        <QuestionSubmit productId={productId} />
      </div>

      {displayQuestions.length > 0 ? (
        <ul className="mt-6 space-y-4">
          {displayQuestions.map((q) => (
            <li
              key={q.id}
              className="rounded-lg border border-border-subtle bg-surface-background p-4"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-accent-surface text-caption font-semibold text-brand-accent"
                >
                  Q
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm font-medium text-text-primary">
                    {q.question}
                  </p>
                  <p className="mt-1 text-caption text-text-muted">
                    Asked by {q.customer_name}
                  </p>
                </div>
              </div>

              {q.answer ? (
                <div className="mt-3 ml-10 flex items-start gap-3 rounded-md bg-surface-sunken p-3">
                  <span
                    aria-hidden
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-raised text-caption font-semibold text-text-secondary"
                  >
                    A
                  </span>
                  <p className="min-w-0 flex-1 text-body-sm leading-relaxed text-text-secondary">
                    {q.answer}
                  </p>
                </div>
              ) : (
                <p className="mt-3 ml-10 text-caption italic text-text-muted">
                  Awaiting answer
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-8 flex flex-col items-center justify-center px-6 py-10 text-center">
          <span
            aria-hidden
            className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface-sunken ring-1 ring-border-subtle"
          >
            <MessageCircleQuestion className="h-6 w-6 text-text-muted" />
          </span>
          <p className="font-display text-heading-sm text-text-primary">
            No questions yet
          </p>
          <p className="mt-2 max-w-sm text-body-sm leading-relaxed text-text-muted">
            Have a question about sizing, fabric, MOQ or lead time? Ask our team
            — we usually reply within a few hours.
          </p>
        </div>
      )}
    </section>
  );
}
