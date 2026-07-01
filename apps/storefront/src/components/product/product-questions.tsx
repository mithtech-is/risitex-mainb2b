"use client";

import * as React from "react";
import { Button } from "@risitex/ui/components";
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
    <section className="rounded-md border border-border-subtle bg-surface-raised p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-heading-sm text-text-primary">Questions and Answers</h2>
        <QuestionSubmit productId={productId} />
      </div>
      {displayQuestions.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {displayQuestions.map((q) => (
            <li key={q.id}>
              <p className="text-body-sm font-medium text-text-primary">
                Q. {q.question}
              </p>
              {q.answer ? (
                <p className="mt-1 text-body-sm text-text-secondary">
                  A. {q.answer}
                </p>
              ) : (
                <p className="mt-1 text-caption text-text-muted italic">
                  Awaiting answer
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-body-sm text-text-secondary">
          No questions yet — submit one above.
        </p>
      )}
    </section>
  );
}
