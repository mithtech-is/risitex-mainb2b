"use client";

import * as React from "react";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { formatINR } from "./price-block";
import { cn } from "./utils";

export type BundleItem = {
  id: string;
  name: string;
  variantLabel: string;
  swatchHex: string;
  pricePerUnitMajor: number;
  /** Optional placeholder image */
  placeholderTone?: string;
};

export type FrequentlyBoughtTogetherProps = {
  items: BundleItem[];
  /** Discount percentage when buying all selected items together */
  bundleDiscountPct?: number;
  onAddBundle?: (items: BundleItem[]) => void;
  className?: string;
};

/**
 * Frequently Bought Together — the AI cross-sell block beneath the PDP.
 *
 * Renders the current product + recommended items as checkable cards.
 * Buyer toggles items in/out and sees the live total update with the bundle
 * discount. One CTA adds the entire selected set to cart.
 */
export function FrequentlyBoughtTogether({
  items,
  bundleDiscountPct = 8,
  onAddBundle,
  className,
}: FrequentlyBoughtTogetherProps) {
  const [selected, setSelected] = React.useState<Record<string, boolean>>(
    Object.fromEntries(items.map((i) => [i.id, true])),
  );

  const toggle = (id: string) =>
    setSelected((s) => ({ ...s, [id]: !s[id] }));

  const selectedItems = items.filter((i) => selected[i.id]);
  const subtotal = selectedItems.reduce(
    (s, i) => s + i.pricePerUnitMajor,
    0,
  );
  const discount = subtotal * (bundleDiscountPct / 100);
  const total = subtotal - discount;

  return (
    <section className={cn("py-12", className)}>
      <div className="flex items-baseline gap-2">
        <Sparkles className="h-4 w-4 text-brand-accent" />
        <p className="text-micro text-text-muted">Frequently bought together</p>
      </div>
      <h2 className="mt-2 font-display text-heading-xl text-text-primary">
        Buyers usually pair these.
      </h2>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-8">
          <ul className="flex flex-wrap items-center gap-3 md:gap-4">
            {items.map((it, i) => (
              <React.Fragment key={it.id}>
                <li className="flex w-[180px] flex-col gap-2">
                  <label
                    className={cn(
                      "relative block aspect-square cursor-pointer overflow-hidden rounded-sm bg-image-plate ring-1 transition-shadow duration-fast",
                      selected[it.id]
                        ? "ring-2 ring-brand-accent"
                        : "ring-border-subtle hover:ring-border-strong",
                    )}
                  >
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{
                        background: it.placeholderTone ?? "var(--paper-100)",
                      }}
                    >
                      <span className="font-display text-[56px] leading-none text-text-muted/30">
                        {it.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div
                      aria-hidden
                      className="absolute bottom-0 left-0 right-0 h-1 opacity-70"
                      style={{ background: it.swatchHex }}
                    />
                    <span className="absolute left-2 top-2">
                      <Checkbox
                        checked={!!selected[it.id]}
                        onCheckedChange={() => toggle(it.id)}
                      />
                    </span>
                  </label>
                  <p className="text-body-sm font-medium text-text-primary">
                    {it.name}
                  </p>
                  <p className="text-caption text-text-muted">
                    {it.variantLabel}
                  </p>
                  <p className="text-mono-sm text-text-primary numerics-tabular">
                    {formatINR(it.pricePerUnitMajor)}
                  </p>
                </li>
                {i < items.length - 1 && (
                  <Plus className="h-5 w-5 shrink-0 text-text-muted" />
                )}
              </React.Fragment>
            ))}
          </ul>
        </div>

        <aside className="lg:col-span-4">
          <div className="rounded-lg bg-surface-raised p-6 shadow-rest">
            <p className="text-micro text-text-muted">Bundle total</p>
            <p className="mt-2 font-display text-display-lg text-text-primary numerics-tabular">
              {formatINR(total)}
            </p>
            <ul className="mt-3 space-y-1 text-caption text-text-muted numerics-tabular">
              <li className="flex justify-between">
                <span>Items × {selectedItems.length}</span>
                <span>{formatINR(subtotal)}</span>
              </li>
              <li className="flex justify-between text-feedback-success-text">
                <span>Bundle discount ({bundleDiscountPct}%)</span>
                <span>− {formatINR(discount)}</span>
              </li>
            </ul>
            <Button
              className="mt-5 w-full"
              size="lg"
              disabled={selectedItems.length === 0}
              onClick={() => onAddBundle?.(selectedItems)}
            >
              Add bundle to cart
            </Button>
          </div>
        </aside>
      </div>
    </section>
  );
}
