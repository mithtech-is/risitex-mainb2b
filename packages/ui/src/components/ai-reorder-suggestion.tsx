"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Button } from "./button";
import { formatINR } from "./price-block";
import { cn } from "./utils";

export type AiReorderSuggestionProps = {
  sku: string;
  productName: string;
  suggestedQty: number;
  /** Tier price for the suggested qty */
  unitPriceMajor: number;
  /** AI confidence 0..1 */
  confidence: number;
  /** Short rationale shown beneath the suggestion */
  rationale: string;
  /** Optional accent colour for swatch */
  swatchHex?: string;
  onAccept?: () => void;
  onDismiss?: () => void;
  className?: string;
};

export function AiReorderSuggestion({
  sku,
  productName,
  suggestedQty,
  unitPriceMajor,
  confidence,
  rationale,
  swatchHex,
  onAccept,
  onDismiss,
  className,
}: AiReorderSuggestionProps) {
  const lineTotal = suggestedQty * unitPriceMajor;
  const conf = Math.round(confidence * 100);

  return (
    <article
      className={cn(
        "rounded-lg border border-brand-accent-muted/30 bg-brand-accent-surface p-5 numerics-tabular",
        className,
      )}
    >
      <header className="flex items-start gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-accent text-text-on-accent">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-micro text-brand-accent">AI reorder · {conf}% confidence</p>
          <p className="mt-1 font-mono text-caption text-text-muted">{sku}</p>
          <h3 className="mt-0.5 text-body-md font-medium text-text-primary">
            {productName}
          </h3>
        </div>
        {swatchHex && (
          <span
            aria-hidden
            className="inline-block h-6 w-6 shrink-0 rounded-full ring-1 ring-border-strong"
            style={{ background: swatchHex }}
          />
        )}
      </header>

      <p className="mt-3 text-body-md text-text-secondary">{rationale}</p>

      <dl className="mt-4 grid grid-cols-3 gap-4">
        <Stat label="Suggest" value={suggestedQty.toLocaleString()} unit="pcs" />
        <Stat label="At" value={formatINR(unitPriceMajor)} unit="/ pc" />
        <Stat label="Total" value={formatINR(lineTotal)} highlight />
      </dl>

      <div className="mt-5 flex items-center gap-2">
        <Button size="sm" onClick={onAccept}>
          Accept &amp; add
        </Button>
        <Button size="sm" variant="tertiary" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </article>
  );
}

function Stat({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: string;
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <dt className="text-micro text-text-muted">{label}</dt>
      <dd
        className={cn(
          "mt-0.5",
          highlight
            ? "text-heading-md font-semibold text-brand-accent"
            : "text-body-md font-medium text-text-primary",
        )}
      >
        {value}
        {unit && (
          <span className="ml-1 text-caption text-text-muted">{unit}</span>
        )}
      </dd>
    </div>
  );
}
