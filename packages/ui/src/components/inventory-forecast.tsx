"use client";

import * as React from "react";
import { TrendChart } from "./trend-chart";
import { cn } from "./utils";

export type InventoryForecastProps = {
  sku: string;
  productName: string;
  currentStock: number;
  reorderPoint: number;
  /** Daily demand forecast for the next N days */
  forecast: number[];
  /** Days until stock runs out at current demand */
  daysOfCover: number;
  className?: string;
};

/**
 * InventoryForecast — for B2B retailers managing stock on their side.
 * Shows current stock, reorder point, days-of-cover, and a forecast curve.
 */
export function InventoryForecast({
  sku,
  productName,
  currentStock,
  reorderPoint,
  forecast,
  daysOfCover,
  className,
}: InventoryForecastProps) {
  const stockHealth: "good" | "low" | "critical" =
    daysOfCover > 21
      ? "good"
      : daysOfCover > 7
        ? "low"
        : "critical";

  return (
    <article
      className={cn(
        "rounded-lg border border-border-subtle bg-surface-raised p-5 numerics-tabular",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-caption text-text-muted">{sku}</p>
          <h3 className="mt-1 text-body-md font-medium text-text-primary">
            {productName}
          </h3>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-caption ring-1",
            stockHealth === "good"
              ? "bg-feedback-success-bg text-feedback-success-text ring-feedback-success-border"
              : stockHealth === "low"
                ? "bg-feedback-warning-bg text-feedback-warning-text ring-feedback-warning-border"
                : "bg-feedback-danger-bg text-feedback-danger-text ring-feedback-danger-border",
          )}
        >
          {daysOfCover} days cover
        </span>
      </header>

      <dl className="mt-4 grid grid-cols-3 gap-4">
        <Stat label="On hand" value={currentStock.toLocaleString()} />
        <Stat label="Reorder at" value={reorderPoint.toLocaleString()} />
        <Stat
          label="Avg daily"
          value={(
            forecast.reduce((s, n) => s + n, 0) / Math.max(1, forecast.length)
          ).toFixed(0)}
        />
      </dl>

      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="text-caption text-text-muted">
          {forecast.length}-day forecast
        </p>
        <TrendChart
          data={forecast}
          width={160}
          height={36}
          showLastDot
          ariaLabel={`${productName} demand forecast`}
        />
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-micro text-text-muted">{label}</dt>
      <dd className="mt-0.5 text-body-md font-medium text-text-primary">
        {value}
      </dd>
    </div>
  );
}
