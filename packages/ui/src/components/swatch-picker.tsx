"use client";

import * as React from "react";
import { cn } from "./utils";

export type Swatch = {
  value: string;
  /** Display name shown in tooltip + aria */
  name: string;
  /** Hex value rendered as the swatch dot */
  hex: string;
  outOfStock?: boolean;
};

export type SwatchPickerProps = {
  value?: string;
  onValueChange?: (value: string) => void;
  swatches: Swatch[];
  size?: "sm" | "md";
  className?: string;
};

export function SwatchPicker({
  value,
  onValueChange,
  swatches,
  size = "md",
  className,
}: SwatchPickerProps) {
  return (
    <div
      role="radiogroup"
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {swatches.map((sw) => {
        const isSelected = sw.value === value;
        const dim = size === "sm" ? "h-5 w-5" : "h-7 w-7";
        return (
          <button
            key={sw.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={sw.name}
            title={sw.name}
            disabled={sw.outOfStock}
            onClick={() => onValueChange?.(sw.value)}
            className={cn(
              "relative rounded-full transition-shadow duration-fast ease-standard",
              "focus-visible:ring-focus",
              isSelected
                ? "ring-2 ring-brand-accent ring-offset-2 ring-offset-surface-raised"
                : "ring-1 ring-border-strong",
              sw.outOfStock && "opacity-40 cursor-not-allowed",
              dim,
            )}
            style={{ background: sw.hex }}
          >
            {sw.outOfStock && (
              <span
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    "linear-gradient(to bottom right, transparent calc(50% - 0.5px), currentColor calc(50% - 0.5px), currentColor calc(50% + 0.5px), transparent calc(50% + 0.5px))",
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
