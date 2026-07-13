"use client";

import * as React from "react";
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
    <section className="rounded-lg border border-border-subtle bg-surface-raised p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-heading-md text-text-primary">Questions &amp; Answers</h2>
          {displayQuestions.length > 0 && (
            <span className="text-body-sm text-text-muted">
              ({displayQuestions.length})
            </span>
          )}
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
        <p className="mt-4 text-body-sm text-text-secondary">
          No questions yet — submit one above.
        </p>
      )}
    </section>
  );
}
