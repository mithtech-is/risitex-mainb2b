"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { Badge } from "./badge";
import { cn } from "./utils";

export type Review = {
  id: string;
  author: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title?: string;
  body: string;
  createdAt: string;
  verifiedPurchase?: boolean;
  /** Optional photo URLs */
  photos?: string[];
  /** "Size: M" / "Colour: Indigo" annotations */
  variantNotes?: string[];
};

export type ReviewsBlockProps = {
  reviews: Review[];
  /** Aggregate count if reviews is paginated */
  totalCount?: number;
  className?: string;
};

export function ReviewsBlock({
  reviews,
  totalCount,
  className,
}: ReviewsBlockProps) {
  const total = totalCount ?? reviews.length;
  const avg =
    reviews.length === 0
      ? 0
      : reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;

  const distribution = React.useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const r of reviews) counts[r.rating - 1]!++;
    return counts;
  }, [reviews]);

  if (reviews.length === 0) {
    return (
      <div className={cn("border-t border-border-subtle py-8", className)}>
        <h2 className="text-heading-lg text-text-primary">Reviews</h2>
        <p className="mt-3 text-body-md text-text-muted">
          No reviews yet — be the first to leave one.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("border-t border-border-subtle py-10", className)}>
      <h2 className="text-heading-xl text-text-primary">Reviews</h2>

      {/* Summary + distribution */}
      <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-12">
        <div className="md:col-span-4">
          <p className="text-display-lg text-text-primary numerics-tabular">
            {avg.toFixed(1)}
          </p>
          <Stars rating={Math.round(avg)} size="lg" />
          <p className="mt-2 text-body-md text-text-muted">
            {total.toLocaleString()} review{total === 1 ? "" : "s"}
          </p>
        </div>
        <div className="md:col-span-8">
          <ul className="space-y-2">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = distribution[star - 1] ?? 0;
              const pct = reviews.length === 0 ? 0 : (count / reviews.length) * 100;
              return (
                <li key={star} className="flex items-center gap-3">
                  <span className="w-8 text-caption text-text-muted numerics-tabular">
                    {star}
                  </span>
                  <Star className="h-3 w-3 fill-current text-text-muted" />
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className="absolute inset-y-0 left-0 bg-brand-accent"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-10 text-caption text-text-muted text-right numerics-tabular">
                    {count}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Reviews list */}
      <ul className="mt-10 space-y-8">
        {reviews.map((r) => (
          <li
            key={r.id}
            className="border-t border-border-subtle pt-6 first:border-t-0 first:pt-0"
          >
            <div className="flex flex-wrap items-center gap-3">
              <Stars rating={r.rating} />
              {r.verifiedPurchase && (
                <Badge tone="success" size="xs">
                  Verified purchase
                </Badge>
              )}
              <span className="text-caption text-text-muted">
                {new Date(r.createdAt).toLocaleDateString()}
              </span>
            </div>
            {r.title && (
              <h3 className="mt-3 text-heading-sm text-text-primary">
                {r.title}
              </h3>
            )}
            <p className="mt-2 text-body-md text-text-secondary">{r.body}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-caption text-text-muted">
              <span>{r.author}</span>
              {r.variantNotes?.map((note) => (
                <span key={note} className="inline-flex items-center gap-1">
                  · {note}
                </span>
              ))}
            </div>
            {r.photos && r.photos.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {r.photos.map((src) => (
                  <div
                    key={src}
                    className="h-16 w-16 overflow-hidden rounded-sm bg-image-plate ring-1 ring-border-subtle"
                  >
                    {/* Photo plate placeholder until image hosting is wired */}
                    <div className="h-full w-full bg-paper-100" />
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
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
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            dim,
            i <= rating
              ? "fill-current text-ochre-500"
              : "text-border-strong",
          )}
        />
      ))}
    </span>
  );
}
