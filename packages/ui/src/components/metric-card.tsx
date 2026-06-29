"use client";

import * as React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card } from "./card";
import { cn } from "./utils";

export type MetricCardProps = {
  label: string;
  /** Pre-formatted display value (we don't do the formatting) */
  value: string;
  /** Delta percentage relative to prior period */
  deltaPct?: number;
  /** Optional sparkline node (chart lib's component) */
  sparkline?: React.ReactNode;
  className?: string;
};

export function MetricCard({
  label,
  value,
  deltaPct,
  sparkline,
  className,
}: MetricCardProps) {
  const isPositive = typeof deltaPct === "number" && deltaPct >= 0;
  return (
    <Card className={cn("flex flex-col gap-3 p-5", className)}>
      <p className="text-micro text-text-muted">{label}</p>
      <p className="text-heading-xl text-text-primary numerics-tabular">{value}</p>
      <div className="flex items-end justify-between gap-3">
        {typeof deltaPct === "number" ? (
          <p
            className={cn(
              "inline-flex items-center gap-1 text-caption",
              isPositive ? "text-feedback-success-text" : "text-feedback-danger-text",
            )}
          >
            {isPositive ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )}
            {Math.abs(deltaPct).toFixed(1)}%
          </p>
        ) : (
          <span />
        )}
        {sparkline && <div className="h-8 flex-1 max-w-[120px]">{sparkline}</div>}
      </div>
    </Card>
  );
}
