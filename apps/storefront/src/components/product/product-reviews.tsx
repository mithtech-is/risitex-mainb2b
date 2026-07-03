"use client";

import * as React from "react";
import { MEDUSA_BASE_URL } from "@/lib/medusa";
import { ReviewSubmit } from "./review-submit";

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

type Review = {
  id: string;
  customer_name: string;
  rating: number;
  title: string | null;
  body: string;
};

export function ProductReviews({
  productId,
  metadataReviews,
}: {
  productId: string;
  metadataReviews?: { rating: number; buyer_type: string; body: string }[];
}) {
  const [reviews, setReviews] = React.useState<Review[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch(
      `${MEDUSA_BASE_URL}/store/product-reviews?product_id=${encodeURIComponent(productId)}`,
      { headers: { "x-publishable-api-key": PUB_KEY } },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) {
          setReviews(data?.reviews ?? []);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [productId]);

  const displayReviews = loaded
    ? reviews
    : (metadataReviews ?? []).map((r, i) => ({
      id: `meta-${i}`,
      customer_name: r.buyer_type,
      rating: r.rating,
      title: null,
      body: r.body,
    }));

  return (
    <section className="rounded-md border border-border-subtle bg-surface-raised p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-heading-sm text-text-primary">Ratings and Reviews</h2>
        <ReviewSubmit productId={productId} />
      </div>
      {displayReviews.length > 0 ? (
        <>
          <p className="mt-2 text-body-sm text-text-secondary">
            {(
              displayReviews.reduce((s, r) => s + r.rating, 0) /
              displayReviews.length
            ).toFixed(1)}
            /5 average across {displayReviews.length} review{displayReviews.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-3 space-y-3">
            {displayReviews.map((r) => (
              <li
                key={r.id}
                className="rounded-sm border border-border-subtle bg-surface-background p-3"
              >
                <p className="text-caption text-text-muted">
                  {r.customer_name} · {r.rating}/5
                  {r.title ? ` · ${r.title}` : ""}
                </p>
                <p className="mt-1 text-body-sm text-text-primary">{r.body}</p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-3 text-body-sm text-text-secondary">
          No reviews yet — be the first to review.
        </p>
      )}
    </section>
  );
}
