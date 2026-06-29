"use client";

import * as React from "react";
import { Lock } from "lucide-react";
import { Badge } from "./badge";
import { cn } from "./utils";

/**
 * Indian INR formatter — uses Indian digit grouping (1,23,456 not 123,456).
 */
export function formatINR(amountMajor: number): string {
  const [intPart, decPart] = amountMajor.toFixed(2).split(".");
  if (!intPart) return `₹${amountMajor.toFixed(2)}`;
  let result = intPart;
  if (intPart.length > 3) {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    const groupedRest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    result = `${groupedRest},${last3}`;
  }
  return `₹${result}${decPart && decPart !== "00" ? `.${decPart}` : ""}`;
}

export type PriceBlockProps = {
  /** Current price in major rupees */
  priceMajor: number;
  /** Optional MRP in major rupees; rendered struck-through */
  mrpMajor?: number;
  /** Tax annotation, typically "excl. GST" for wholesale accounts */
  taxAnnotation?: "incl" | "excl" | "none";
  /** Unit suffix, e.g. "/ pc", "/ metre" */
  unit?: string;
  /** Visual size of the price */
  size?: "sm" | "md" | "lg";
  /** Tier-locked mode: shows ₹—— with a lock icon and the given hint */
  locked?: boolean;
  lockedHint?: string;
  /** Optional save line, e.g. "Save ₹21 at 1,000+ pcs" */
  savingsCopy?: string;
  className?: string;
};

export function PriceBlock({
  priceMajor,
  mrpMajor,
  taxAnnotation = "none",
  unit,
  size = "md",
  locked,
  lockedHint,
  savingsCopy,
  className,
}: PriceBlockProps) {
  const hasDiscount = !locked && !!mrpMajor && mrpMajor > priceMajor;
  const discountPct = hasDiscount
    ? Math.round(((mrpMajor! - priceMajor) / mrpMajor!) * 100)
    : 0;

  const priceSize =
    size === "lg" ? "text-heading-lg" : size === "sm" ? "text-mono-sm" : "text-mono-md";

  if (locked) {
    return (
      <div className={cn("flex flex-col gap-1 numerics-tabular", className)}>
        <div className={cn("text-text-primary", priceSize, "flex items-baseline gap-1")}>
          <span>₹——</span>
          {unit && <span className="text-caption text-text-muted">{unit}</span>}
        </div>
        <p className="flex items-center gap-1 text-caption text-text-muted">
          <Lock className="h-3 w-3" />
          {lockedHint ?? "Sign in to see wholesale price"}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1 numerics-tabular", className)}>
      <div className="flex items-baseline gap-2">
        <span className={cn("text-text-primary", priceSize)}>
          {formatINR(priceMajor)}
        </span>
        {unit && <span className="text-caption text-text-muted">{unit}</span>}
        {taxAnnotation === "incl" && (
          <span className="text-caption text-text-muted">incl. GST</span>
        )}
        {taxAnnotation === "excl" && (
          <span className="text-caption text-text-muted">excl. GST</span>
        )}
      </div>
      {hasDiscount && (
        <div className="flex items-center gap-2">
          <span className="text-mono-sm text-text-muted line-through">
            MRP {formatINR(mrpMajor!)}
          </span>
          <Badge tone="success" size="xs">
            −{discountPct}%
          </Badge>
        </div>
      )}
      {savingsCopy && (
        <p className="text-caption text-text-muted">{savingsCopy}</p>
      )}
    </div>
  );
}
