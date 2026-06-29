"use client";

import * as React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "./utils";

export type StatCardProps = {
  label: string;
  /** Pre-formatted display value */
  value: string;
  /** Optional unit suffix shown after the value, smaller */
  unit?: string;
  /** Delta percentage vs prior period — signed */
  deltaPct?: number;
  /** Optional comparison label, e.g. "vs last 30 days" */
  deltaLabel?: string;
  /** Right-aligned slot — sparkline, icon, etc. */
  rightSlot?: React.ReactNode;
  tone?: "default" | "muted" | "accent";
  /** Smaller variant for densely packed strips */
  dense?: boolean;
  className?: string;
};

export function StatCard({
  label,
  value,
  unit,
  deltaPct,
  deltaLabel,
  rightSlot,
  tone = "default",
  dense,
  className,
}: StatCardProps) {
  const isPositive = typeof deltaPct === "number" && deltaPct >= 0;
  return (
    <div
      className={cn(
        "rounded-lg ring-1 numerics-tabular",
        tone === "muted"
          ? "bg-surface-sunken ring-border-subtle"
          : tone === "accent"
            ? "bg-brand-accent-surface ring-brand-accent-muted/30"
            : "bg-surface-raised ring-border-subtle",
        dense ? "p-4" : "p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-micro text-text-muted truncate">{label}</p>
          <p
            className={cn(
              "mt-1 font-display text-text-primary",
              dense ? "text-heading-md" : "text-heading-xl",
            )}
          >
            {value}
            {unit && (
              <span className="ml-1 text-body-sm text-text-muted font-sans">
                {unit}
              </span>
            )}
          </p>
        </div>
        {rightSlot && (
          <div className="shrink-0 text-text-muted">{rightSlot}</div>
        )}
      </div>
      {typeof deltaPct === "number" && (
        <p
          className={cn(
            "mt-3 inline-flex items-center gap-1 text-caption",
            isPositive ? "text-feedback-success-text" : "text-feedback-danger-text",
          )}
        >
          {isPositive ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )}
          {Math.abs(deltaPct).toFixed(1)}%
          {deltaLabel && (
            <span className="text-text-muted ml-1">· {deltaLabel}</span>
          )}
        </p>
      )}
    </div>
  );
}
