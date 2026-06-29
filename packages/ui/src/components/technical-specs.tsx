"use client";

import * as React from "react";
import { cn } from "./utils";

export type SpecGroup = {
  heading: string;
  specs: { label: string; value: string; mono?: boolean }[];
};

export type TechnicalSpecsProps = {
  groups: SpecGroup[];
  className?: string;
};

/**
 * Technical Specifications — a printable grouped spec list. Used on PDPs as
 * an alternative to the Accordion when buyers want every number at a glance.
 */
export function TechnicalSpecs({ groups, className }: TechnicalSpecsProps) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border-subtle bg-surface-raised",
        className,
      )}
    >
      <header className="border-b border-border-subtle px-6 py-4">
        <p className="text-micro text-text-muted">Technical specifications</p>
        <h2 className="mt-1 text-heading-md text-text-primary">
          Every number, no rounding.
        </h2>
      </header>
      <div className="divide-y divide-border-subtle">
        {groups.map((g) => (
          <div key={g.heading} className="px-6 py-5">
            <h3 className="text-caption text-text-muted uppercase tracking-wide">
              {g.heading}
            </h3>
            <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
              {g.specs.map((s) => (
                <div
                  key={s.label}
                  className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2 last:border-b-0"
                >
                  <dt className="text-body-md text-text-muted">{s.label}</dt>
                  <dd
                    className={cn(
                      "text-body-md text-text-primary text-right",
                      s.mono && "font-mono numerics-tabular",
                    )}
                  >
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
