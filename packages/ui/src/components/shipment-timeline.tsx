"use client";

import * as React from "react";
import {
  CheckCircle2,
  Clock,
  PackageCheck,
  PackageSearch,
  Truck,
  XCircle,
} from "lucide-react";
import { cn } from "./utils";

export type ShipmentEvent = {
  status: string;
  label: string;
  at?: string;
  description?: string;
};

export type ShipmentTimelineProps = {
  /** Events in chronological order */
  events: ShipmentEvent[];
  /** Current active status */
  currentStatus: string;
  /** Optional tracking number */
  trackingNumber?: string;
  /** Optional carrier name */
  carrier?: string;
  className?: string;
};

function iconFor(status: string): React.ReactNode {
  const s = status.toLowerCase();
  if (s.includes("delivered")) return <CheckCircle2 className="h-4 w-4" />;
  if (s.includes("cancel") || s.includes("rto") || s.includes("lost"))
    return <XCircle className="h-4 w-4" />;
  if (s.includes("picked") || s.includes("transit"))
    return <Truck className="h-4 w-4" />;
  if (s.includes("label") || s.includes("created"))
    return <PackageCheck className="h-4 w-4" />;
  if (s.includes("attempt")) return <PackageSearch className="h-4 w-4" />;
  return <Clock className="h-4 w-4" />;
}

export function ShipmentTimeline({
  events,
  currentStatus,
  trackingNumber,
  carrier,
  className,
}: ShipmentTimelineProps) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border-subtle bg-surface-raised",
        className,
      )}
    >
      <header className="border-b border-border-subtle px-5 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-micro text-text-muted">Shipment</p>
          {trackingNumber && (
            <p className="text-mono-sm text-text-primary numerics-tabular">
              {carrier ? `${carrier} · ` : ""}{trackingNumber}
            </p>
          )}
        </div>
      </header>
      <ol className="relative px-5 py-5">
        {events.map((ev, i) => {
          const isCurrent =
            ev.status.toLowerCase() === currentStatus.toLowerCase();
          const isPast =
            events.findIndex(
              (e) =>
                e.status.toLowerCase() === currentStatus.toLowerCase(),
            ) > i;
          const reached = isCurrent || isPast;
          return (
            <li
              key={`${ev.status}-${i}`}
              className="relative flex gap-3 pb-5 last:pb-0"
            >
              {i < events.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-3 top-7 h-full w-px",
                    reached ? "bg-brand-accent" : "bg-border-subtle",
                  )}
                />
              )}
              <span
                aria-hidden
                className={cn(
                  "relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-2",
                  isCurrent
                    ? "bg-brand-accent text-text-on-accent ring-brand-accent-muted/30"
                    : reached
                      ? "bg-feedback-success-bg text-feedback-success-text ring-feedback-success-border"
                      : "bg-surface-sunken text-text-muted ring-border-subtle",
                )}
              >
                {iconFor(ev.status)}
              </span>
              <div className="flex-1 pb-1 pt-0.5">
                <p
                  className={cn(
                    "text-body-md font-medium",
                    reached ? "text-text-primary" : "text-text-muted",
                  )}
                >
                  {ev.label}
                </p>
                {ev.description && (
                  <p className="text-caption text-text-muted">
                    {ev.description}
                  </p>
                )}
                {ev.at && (
                  <p className="text-caption text-text-muted">
                    {new Date(ev.at).toLocaleString()}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
