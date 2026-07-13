"use client";

import * as React from "react";
import { Star } from "lucide-react";
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

  const average =
    displayReviews.length > 0
      ? displayReviews.reduce((s, r) => s + r.rating, 0) / displayReviews.length
      : 0;

  const distribution = React.useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const r of displayReviews) {
      const idx = Math.min(5, Math.max(1, Math.round(r.rating))) - 1;
      counts[idx]!++;
    }
    return counts;
  }, [displayReviews]);

  return (
    <section className="rounded-xl border border-border-subtle bg-surface-raised p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border-subtle pb-5">
        <div>
          <p className="text-micro uppercase tracking-[0.14em] text-text-muted">
            Verified feedback
          </p>
          <h2 className="mt-1.5 font-display text-heading-lg text-text-primary">
            Ratings &amp; Reviews
          </h2>
        </div>
        <ReviewSubmit productId={productId} />
      </div>

      {displayReviews.length > 0 ? (
        <>
          {/* Summary + distribution */}
          <div className="mt-6 grid grid-cols-1 gap-6 border-b border-border-subtle pb-6 sm:grid-cols-12">
            <div className="flex flex-col items-start sm:col-span-4">
              <p className="text-heading-xl text-text-primary numerics-tabular">
                {average.toFixed(1)}
              </p>
              <Stars rating={Math.round(average)} size="lg" />
              <p className="mt-2 text-body-sm text-text-secondary">
                {displayReviews.length.toLocaleString()} review
                {displayReviews.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="sm:col-span-8">
              <ul className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = distribution[star - 1] ?? 0;
                  const pct =
                    displayReviews.length === 0
                      ? 0
                      : (count / displayReviews.length) * 100;
                  return (
                    <li key={star} className="flex items-center gap-2">
                      <span className="w-3 text-caption text-text-muted numerics-tabular">
                        {star}
                      </span>
                      <Star className="h-3 w-3 shrink-0 fill-current text-text-muted" />
                      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-text-primary transition-[width] duration-slow ease-standard"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-6 text-right text-caption text-text-muted numerics-tabular">
                        {count}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* Review list */}
          <ul className="mt-6 space-y-4">
            {displayReviews.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-border-subtle bg-surface-background p-4"
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-accent-surface text-body-sm font-medium text-brand-accent"
                  >
                    {(r.customer_name || "?").trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-body-sm font-medium text-text-primary">
                        {r.customer_name}
                      </span>
                    </div>
                    <div className="mt-1">
                      <Stars rating={r.rating} />
                    </div>
                    {r.title && (
                      <h3 className="mt-2 text-body-md font-medium text-text-primary">
                        {r.title}
                      </h3>
                    )}
                    <p className="mt-1.5 text-body-sm leading-relaxed text-text-secondary">
                      {r.body}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-8 flex flex-col items-center justify-center px-6 py-10 text-center">
          <span
            aria-hidden
            className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface-sunken ring-1 ring-border-subtle"
          >
            <Star className="h-6 w-6 text-text-muted" />
          </span>
          <p className="font-display text-heading-sm text-text-primary">
            No reviews yet
          </p>
          <p className="mt-2 max-w-sm text-body-sm leading-relaxed text-text-muted">
            Be the first to share your experience — verified buyers help other
            businesses order with confidence.
          </p>
        </div>
      )}
    </section>
  );
}

function Stars({
  rating,
  size = "sm",
}: {
  rating: number;
  size?: "sm" | "lg";
}) {
  const dim = size === "lg" ? "h-5 w-5" : "h-3.5 w-3.5";
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`${dim} ${
            i <= rating ? "fill-current text-text-primary" : "text-border-strong"
          }`}
        />
      ))}
    </span>
  );
}
