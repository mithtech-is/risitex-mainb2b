"use client";

import * as React from "react";
import { cn } from "@risitex/ui/components";
import type { Swatch } from "@/data/products";

export type ColourSelectorProps = {
  swatches: Swatch[];
  /** Per-colour image galleries, keyed by swatch value. */
  imagesByColour?: Record<string, string[]>;
  /** Fallback thumbnail when a colour has no images. */
  fallbackImage?: string;
  value: string;
  onChange: (value: string) => void;
};

/**
 * Horizontal colour picker for the PDP. Every colour variant renders as a card
 * with its own thumbnail + name — generated entirely from the product's
 * swatches (Medusa colour option values), no hardcoding. Selecting a colour
 * drives the gallery + bulk-order grid in the parent.
 */
export function ColourSelector({
  swatches,
  imagesByColour,
  fallbackImage,
  value,
  onChange,
}: ColourSelectorProps) {
  if (swatches.length <= 1) return null;

  return (
    <div>
      <p className="text-body-sm text-text-secondary">
        Colour: <span className="text-text-muted">{swatches.find((s) => s.value === value)?.name ?? ""}</span>
      </p>
      <div className="mt-3 flex flex-wrap gap-3" role="radiogroup" aria-label="Colour">
        {swatches.map((sw) => {
          const thumb = imagesByColour?.[sw.value]?.[0] ?? fallbackImage;
          const active = sw.value === value;
          return (
            <button
              key={sw.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={sw.name}
              onClick={() => onChange(sw.value)}
              className={cn(
                "group flex w-[112px] flex-col items-center gap-2 rounded-md border p-1 transition-colors duration-fast",
                active
                  ? "border-text-primary ring-1 ring-text-primary"
                  : "border-border-subtle hover:border-border-strong",
              )}
            >
              <span className="block h-[120px] w-full overflow-hidden rounded-sm bg-surface-sunken">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt={sw.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span
                    className="block h-full w-full"
                    style={{ backgroundColor: sw.hex }}
                    aria-hidden
                  />
                )}
              </span>
              <span
                className={cn(
                  "text-caption",
                  active ? "font-medium text-text-primary" : "text-text-secondary",
                )}
              >
                {sw.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
