"use client";

import * as React from "react";
import { cn } from "./utils";

export type DistributionItem = {
  label: string;
  value: number;
  /** Optional accent colour token override, e.g. var(--feedback-success-text) */
  colour?: string;
};

export type DistributionBarProps = {
  items: DistributionItem[];
  /** Format values for display, e.g. (n) => `₹${n.toLocaleString()}` */
  formatValue?: (n: number) => string;
  /** Max rows shown; the rest collapse under "+N more" */
  maxRows?: number;
  className?: string;
};

/**
 * DistributionBar — horizontal bar list. Sorted leaders-first, with each
 * row showing a label, a bar, and the value. Linear-style.
 */
export function DistributionBar({
  items,
  formatValue = (n) => n.toLocaleString("en-IN"),
  maxRows = 6,
  className,
}: DistributionBarProps) {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const max = sorted[0]?.value ?? 1;
  const head = sorted.slice(0, maxRows);
  const tail = sorted.slice(maxRows);
  const tailSum = tail.reduce((s, t) => s + t.value, 0);

  return (
    <ul className={cn("flex flex-col gap-2.5 numerics-tabular", className)}>
      {head.map((it) => {
        const pct = max === 0 ? 0 : (it.value / max) * 100;
        return (
          <li key={it.label} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-body-sm text-text-secondary">
              {it.label}
            </span>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${pct}%`,
                  background: it.colour ?? "var(--brand-accent)",
                }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-body-sm text-text-primary">
              {formatValue(it.value)}
            </span>
          </li>
        );
      })}
      {tail.length > 0 && (
        <li className="flex items-center gap-3 text-caption text-text-muted">
          <span className="w-32 shrink-0 truncate">+{tail.length} more</span>
          <span className="flex-1" />
          <span className="w-20 shrink-0 text-right">{formatValue(tailSum)}</span>
        </li>
      )}
    </ul>
  );
}
