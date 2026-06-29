"use client";

import * as React from "react";
import { Calculator } from "lucide-react";
import { MoneyInput } from "./money-input";
import { Label } from "./label";
import { formatINR } from "./price-block";
import { cn } from "./utils";

export type MarginCalculatorProps = {
  /** Wholesale / tier price per unit (what the distributor pays us) */
  costPerUnitMajor: number;
  /** Default suggested retail price (for the prefill); falls back to 2× cost */
  suggestedRetailMajor?: number;
  /** GST percentage applied at retail (default 5% for textile) */
  retailGstPct?: number;
  className?: string;
};

/**
 * Margin Calculator — for distributors deciding their MRP.
 *
 * Renders: cost-in (fixed), MRP-out (editable, prefilled with suggested
 * retail), GST line, gross margin %, gross margin per piece. Updating MRP
 * updates the numbers live.
 *
 * Per-piece view by default; toggle to per-carton if the calling component
 * passes cartonSize via context (not implemented here — keep it simple).
 */
export function MarginCalculator({
  costPerUnitMajor,
  suggestedRetailMajor,
  retailGstPct = 5,
  className,
}: MarginCalculatorProps) {
  const initialMrp = suggestedRetailMajor ?? Math.round(costPerUnitMajor * 2);
  const [mrpInput, setMrpInput] = React.useState<string>(String(initialMrp));

  const mrp = Number(mrpInput);
  const valid = !isNaN(mrp) && mrp > 0;

  const gstAmount = valid ? mrp * (retailGstPct / 100) : 0;
  const mrpExGst = valid ? mrp - gstAmount : 0;
  const grossMargin = valid ? mrpExGst - costPerUnitMajor : 0;
  const grossMarginPct =
    valid && mrpExGst > 0 ? (grossMargin / mrpExGst) * 100 : 0;
  const markup =
    valid && costPerUnitMajor > 0
      ? ((mrpExGst - costPerUnitMajor) / costPerUnitMajor) * 100
      : 0;

  const profitable = grossMargin > 0;

  return (
    <section
      className={cn(
        "rounded-lg border border-border-subtle bg-surface-raised",
        className,
      )}
    >
      <header className="flex items-center gap-2 border-b border-border-subtle px-6 py-4">
        <Calculator className="h-4 w-4 text-text-muted" />
        <p className="text-micro text-text-muted">Margin calculator</p>
      </header>

      <div className="grid grid-cols-1 gap-6 px-6 py-5 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Your cost / piece</Label>
          <div className="flex h-10 items-center rounded-md border border-border-subtle bg-surface-sunken px-3 text-body-md text-text-primary numerics-tabular">
            {formatINR(costPerUnitMajor)}
          </div>
          <p className="text-caption text-text-muted">
            From your current tier
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mrp" required>
            Your selling MRP / piece
          </Label>
          <MoneyInput
            id="mrp"
            value={mrpInput}
            min="0"
            onChange={(e) => setMrpInput(e.currentTarget.value)}
          />
          <p className="text-caption text-text-muted">
            Editable — try different prices
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border-subtle bg-surface-sunken px-6 py-5 numerics-tabular md:grid-cols-4">
        <Stat label="MRP excl. GST" value={valid ? formatINR(mrpExGst) : "—"} hint={`GST ${retailGstPct}%`} />
        <Stat
          label="Gross margin / piece"
          value={valid ? formatINR(grossMargin) : "—"}
          tone={profitable ? "ok" : "warn"}
        />
        <Stat
          label="Gross margin %"
          value={valid ? `${grossMarginPct.toFixed(1)}%` : "—"}
          tone={profitable ? "ok" : "warn"}
        />
        <Stat
          label="Mark-up"
          value={valid ? `${markup.toFixed(0)}%` : "—"}
        />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-micro text-text-muted">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-heading-md font-semibold",
          tone === "warn"
            ? "text-feedback-danger-text"
            : tone === "ok"
              ? "text-feedback-success-text"
              : "text-text-primary",
        )}
      >
        {value}
      </dd>
      {hint && <span className="text-caption text-text-muted">{hint}</span>}
    </div>
  );
}
