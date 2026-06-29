"use client";

import * as React from "react";
import { cn } from "./utils";

export type TrendChartProps = {
  /** Sequence of numeric values to plot */
  data: number[];
  /** Width in px (default fills container) */
  width?: number;
  /** Height in px */
  height?: number;
  /** Stroke colour — defaults to brand accent */
  stroke?: string;
  /** Fill colour for the area beneath the curve */
  fill?: string;
  /** Show last-value pulse dot */
  showLastDot?: boolean;
  /** Optional accessible label */
  ariaLabel?: string;
  className?: string;
};

/**
 * TrendChart — minimal SVG area chart. No chart library dependency.
 *
 * Pure aesthetic — no axes, no labels, no tooltips. Pair with a number
 * elsewhere (e.g. inside a StatCard) for context.
 */
export function TrendChart({
  data,
  width = 120,
  height = 32,
  stroke = "var(--brand-accent)",
  fill,
  showLastDot,
  ariaLabel,
  className,
}: TrendChartProps) {
  if (data.length === 0) {
    return <div style={{ width, height }} className={cn("opacity-30", className)} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const step = data.length > 1 ? width / (data.length - 1) : 0;
  const points = data.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return { x, y };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");

  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role={ariaLabel ? "img" : "presentation"}
      aria-label={ariaLabel}
      className={cn("overflow-visible", className)}
    >
      <path d={areaPath} fill={fill ?? "currentColor"} opacity={0.08} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {showLastDot && last && (
        <circle cx={last.x} cy={last.y} r={2.5} fill={stroke} />
      )}
    </svg>
  );
}
