"use client";

import * as React from "react";
import { Wallet, CalendarClock, AlertTriangle } from "lucide-react";
import { formatINR } from "./price-block";
import { cn } from "./utils";

export type CreditTerms = {
  /** Approved credit limit in major rupees */
  limitMajor: number;
  /** Currently used credit in major rupees */
  usedMajor: number;
  /** Net payment terms in days, e.g. 30 */
  netDays: number;
  /** Optional overdue amount */
  overdueMajor?: number;
  /** Tier label e.g. "Gold" */
  tierLabel?: string;
};

export type CreditTermsPanelProps = {
  terms: CreditTerms;
  className?: string;
};

/**
 * CreditTermsPanel — shown on the B2B account home and at checkout when the
 * account is on credit terms. Visualises limit utilisation and surfaces
 * overdue invoices.
 */
export function CreditTermsPanel({ terms, className }: CreditTermsPanelProps) {
  const available = Math.max(0, terms.limitMajor - terms.usedMajor);
  const utilisationPct = terms.limitMajor === 0 ? 0 : Math.min(100, (terms.usedMajor / terms.limitMajor) * 100);
  const overdue = terms.overdueMajor && terms.overdueMajor > 0;

  return (
    <section
      className={cn(
        "rounded-lg border border-border-subtle bg-surface-raised p-6 numerics-tabular",
        className,
      )}
    >
      <header className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-text-muted" />
          <p className="text-micro text-text-muted">Credit terms</p>
        </div>
        {terms.tierLabel && (
          <span className="inline-flex items-center rounded-full bg-brand-accent-surface px-2 py-0.5 text-caption text-brand-accent ring-1 ring-brand-accent-muted/30">
            {terms.tierLabel} tier
          </span>
        )}
      </header>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
        <div>
          <p className="text-micro text-text-muted">Credit limit</p>
          <p className="mt-1 font-display text-heading-md text-text-primary">
            {formatINR(terms.limitMajor)}
          </p>
        </div>
        <div>
          <p className="text-micro text-text-muted">Used</p>
          <p className="mt-1 font-display text-heading-md text-text-primary">
            {formatINR(terms.usedMajor)}
          </p>
        </div>
        <div>
          <p className="text-micro text-text-muted">Available</p>
          <p
            className={cn(
              "mt-1 font-display text-heading-md",
              available === 0
                ? "text-feedback-danger-text"
                : "text-feedback-success-text",
            )}
          >
            {formatINR(available)}
          </p>
        </div>
      </div>

      {/* Utilisation bar */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between text-caption text-text-muted">
          <span>Utilisation</span>
          <span>{utilisationPct.toFixed(0)}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-border-subtle">
          <div
            className={cn(
              "h-full transition-all duration-base",
              utilisationPct > 90
                ? "bg-feedback-danger-text"
                : utilisationPct > 70
                  ? "bg-feedback-warning-text"
                  : "bg-feedback-success-text",
            )}
            style={{ width: `${utilisationPct}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-caption text-text-muted">
        <CalendarClock className="h-3.5 w-3.5" />
        Net {terms.netDays} payment terms
      </div>

      {overdue && (
        <div className="mt-4 flex items-start gap-2 rounded-md bg-feedback-danger-bg p-3 text-feedback-danger-text ring-1 ring-feedback-danger-border">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="text-body-sm font-medium">
              {formatINR(terms.overdueMajor!)} overdue.
            </p>
            <p className="text-caption">
              New orders will hold until cleared. Reach out via the contact
              form to settle.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
