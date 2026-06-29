"use client";

import * as React from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "./utils";
import { formatINR } from "./price-block";

export type Tier = {
  /** Inclusive lower bound of the quantity range */
  minQty: number;
  /** Inclusive upper bound, or null for the top tier */
  maxQty: number | null;
  /** Price per unit in major rupees at this tier */
  pricePerUnitMajor: number;
  /** Display label for the bracket (e.g. "Gold"); optional */
  label?: string;
};

export type TierLadderProps = {
  tiers: Tier[];
  /** Current selected quantity — drives the "you are here" indicator */
  currentQuantity?: number;
  /** Optional unit suffix shown in nudge copy ("pcs", "metres") */
  unitLabel?: string;
  className?: string;
};

/**
 * Horizontal staircase. Each tier is a column showing the price + range.
 * Current tier highlights with accent surface + accent rule.
 * Achieved tiers (left of current) get a check dot.
 * Next tier shows a nudge ("Add 60 to save ₹5/pc").
 */
export function TierLadder({
  tiers,
  currentQuantity,
  unitLabel = "pcs",
  className,
}: TierLadderProps) {
  const currentIndex = React.useMemo(() => {
    if (typeof currentQuantity !== "number") return -1;
    return tiers.findIndex(
      (t) =>
        currentQuantity >= t.minQty &&
        (t.maxQty === null || currentQuantity <= t.maxQty),
    );
  }, [tiers, currentQuantity]);

  const nextTier = currentIndex >= 0 ? tiers[currentIndex + 1] : undefined;
  const currentTier = currentIndex >= 0 ? tiers[currentIndex] : undefined;
  const nudge =
    nextTier && currentTier && typeof currentQuantity === "number"
      ? {
          delta: nextTier.minQty - currentQuantity,
          saving:
            (currentTier.pricePerUnitMajor - nextTier.pricePerUnitMajor) *
            nextTier.minQty,
          newPrice: nextTier.pricePerUnitMajor,
        }
      : null;

  return (
    <div className={cn("flex flex-col gap-3 numerics-tabular", className)}>
      <div className="grid gap-px overflow-hidden rounded-lg ring-1 ring-border-subtle"
        style={{ gridTemplateColumns: `repeat(${tiers.length}, minmax(0, 1fr))` }}
      >
        {tiers.map((tier, i) => {
          const isCurrent = i === currentIndex;
          const isAchieved = currentIndex >= 0 && i < currentIndex;
          const isLocked = currentIndex >= 0 && i > currentIndex;
          return (
            <div
              key={i}
              className={cn(
                "relative flex flex-col items-center gap-1 px-2 py-3 text-center",
                isCurrent
                  ? "bg-brand-accent-surface"
                  : "bg-surface-raised",
                isLocked && "opacity-60",
              )}
            >
              {isCurrent && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-[2px] bg-brand-accent"
                />
              )}
              <div className="flex items-center gap-1">
                {isAchieved && (
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 rounded-full bg-feedback-success-text"
                  />
                )}
                <span
                  className={cn(
                    "text-mono-md",
                    isCurrent ? "text-brand-accent" : "text-text-primary",
                  )}
                >
                  {formatINR(tier.pricePerUnitMajor)}
                </span>
              </div>
              <span className="text-caption text-text-muted">
                {tier.minQty.toLocaleString()}
                {tier.maxQty === null ? "+" : `–${tier.maxQty.toLocaleString()}`}
              </span>
              {tier.label && (
                <span className="text-micro text-text-muted">{tier.label}</span>
              )}
            </div>
          );
        })}
      </div>

      {currentIndex >= 0 && (
        <p className="text-caption text-text-muted">
          You are here ·{" "}
          <span className="font-medium text-text-primary">
            {currentQuantity?.toLocaleString()} {unitLabel}
          </span>
        </p>
      )}

      {nudge && (
        <div className="flex items-start gap-2 rounded-md bg-brand-accent-surface px-3 py-2 text-body-sm text-brand-accent">
          <ArrowUp className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Add{" "}
            <strong className="font-medium">
              {nudge.delta.toLocaleString()} {unitLabel}
            </strong>{" "}
            to unlock{" "}
            <strong className="font-medium">
              {formatINR(nudge.newPrice)} / {unitLabel.replace(/s$/, "")}
            </strong>{" "}
            (save approx {formatINR(nudge.saving)})
          </span>
        </div>
      )}
    </div>
  );
}
