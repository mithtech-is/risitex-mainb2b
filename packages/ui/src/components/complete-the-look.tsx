"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "./button";
import { formatINR } from "./price-block";
import { cn } from "./utils";

export type LookItem = {
  id: string;
  href: string;
  name: string;
  pricePerUnitMajor: number;
  placeholderTone?: string;
};

export type CompleteTheLookProps = {
  items: LookItem[];
  className?: string;
};

/**
 * Complete the look — editorial-style upsell. Shown beneath an editorial PDP
 * variant. Items render as a horizontal carousel on mobile and a 4-column
 * grid on desktop.
 */
export function CompleteTheLook({ items, className }: CompleteTheLookProps) {
  return (
    <section className={cn("py-12", className)}>
      <p className="text-micro text-text-muted">Complete the look</p>
      <h2 className="mt-2 font-display text-heading-xl text-text-primary">
        Style with.
      </h2>
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
        {items.map((it) => (
          <a
            key={it.id}
            href={it.href}
            className="group block rounded-lg focus-visible:ring-focus"
          >
            <div
              className="aspect-[4/5] w-full rounded-md ring-1 ring-border-subtle transition-shadow duration-base group-hover:shadow-raised"
              style={{ background: it.placeholderTone ?? "var(--paper-100)" }}
            />
            <p className="mt-3 text-body-md font-medium text-text-primary">
              {it.name}
            </p>
            <p className="mt-1 text-mono-sm text-text-primary numerics-tabular">
              {formatINR(it.pricePerUnitMajor)}
            </p>
          </a>
        ))}
      </div>
      <Button asChild variant="tertiary" className="mt-6">
        <a href="/products">
          View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </a>
      </Button>
    </section>
  );
}
