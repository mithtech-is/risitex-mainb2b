"use client";

import * as React from "react";
import { History } from "lucide-react";
import { Button } from "./button";
import { QuantityStepper } from "./quantity-stepper";
import { formatINR } from "./price-block";
import { cn } from "./utils";

export type QuickReorderRowProps = {
  sku: string;
  productName: string;
  variantLabel: string;
  swatchHex: string;
  unitPriceMajor: number;
  /** Suggested reorder qty based on last order or AI */
  suggestedQty: number;
  /** Last ordered date (ISO) */
  lastOrderedAt?: string;
  /** MOQ enforcement */
  moq?: number;
  onAdd?: (qty: number) => void;
  className?: string;
};

export function QuickReorderRow({
  sku,
  productName,
  variantLabel,
  swatchHex,
  unitPriceMajor,
  suggestedQty,
  lastOrderedAt,
  moq,
  onAdd,
  className,
}: QuickReorderRowProps) {
  const [qty, setQty] = React.useState(suggestedQty);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-border-subtle py-4 last:border-b-0 md:flex-row md:items-center md:gap-4",
        className,
      )}
    >
      <div className="relative h-12 w-12 shrink-0 rounded-sm bg-image-plate ring-1 ring-border-subtle">
        <div
          aria-hidden
          className="absolute bottom-0 left-0 right-0 h-1"
          style={{ background: swatchHex }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-caption text-text-muted">{sku}</p>
        <p className="text-body-md font-medium text-text-primary">
          {productName}
        </p>
        <p className="text-caption text-text-muted">
          {variantLabel}
          {lastOrderedAt && (
            <>
              {" · "}
              <span className="inline-flex items-center gap-1">
                <History className="h-3 w-3" />
                Last ordered {new Date(lastOrderedAt).toLocaleDateString()}
              </span>
            </>
          )}
        </p>
      </div>
      <div className="flex items-center gap-3 numerics-tabular">
        <span className="text-mono-sm text-text-secondary">
          {formatINR(unitPriceMajor)} / pc
        </span>
        <QuantityStepper
          size="sm"
          value={qty}
          onValueChange={setQty}
          min={moq ?? 1}
          max={9999}
        />
      </div>
      <Button size="sm" onClick={() => onAdd?.(qty)} className="md:w-auto">
        Add {qty} pcs
      </Button>
    </div>
  );
}
