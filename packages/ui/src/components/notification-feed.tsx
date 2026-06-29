"use client";

import * as React from "react";
import { cn } from "./utils";

export type NotificationItem = {
  id: string;
  /** Dot colour token */
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "accent";
  title: React.ReactNode;
  description?: React.ReactNode;
  /** ISO timestamp */
  at: string;
  /** Optional callback when row is clicked */
  href?: string;
};

export type NotificationFeedProps = {
  items: NotificationItem[];
  /** Optional title for the panel */
  title?: string;
  className?: string;
};

const TONE_BG: Record<NonNullable<NotificationItem["tone"]>, string> = {
  neutral: "bg-border-strong",
  success: "bg-feedback-success-text",
  warning: "bg-feedback-warning-text",
  danger: "bg-feedback-danger-text",
  info: "bg-feedback-info-text",
  accent: "bg-brand-accent",
};

export function NotificationFeed({
  items,
  title = "Activity",
  className,
}: NotificationFeedProps) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border-subtle bg-surface-raised",
        className,
      )}
    >
      <header className="border-b border-border-subtle px-5 py-3">
        <p className="text-micro text-text-muted">{title}</p>
      </header>
      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-body-sm text-text-muted">
          Nothing yet.
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {items.map((it) => {
            const inner = (
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                    TONE_BG[it.tone ?? "neutral"],
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm text-text-primary">{it.title}</p>
                  {it.description && (
                    <p className="mt-0.5 text-caption text-text-muted">
                      {it.description}
                    </p>
                  )}
                  <p className="mt-0.5 text-caption text-text-muted">
                    {new Date(it.at).toLocaleString()}
                  </p>
                </div>
              </div>
            );
            return (
              <li key={it.id}>
                {it.href ? (
                  <a
                    href={it.href}
                    className="block px-5 py-3 transition-colors duration-fast hover:bg-surface-sunken"
                  >
                    {inner}
                  </a>
                ) : (
                  <div className="px-5 py-3">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
