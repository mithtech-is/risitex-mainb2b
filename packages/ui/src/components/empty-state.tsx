"use client";

import * as React from "react";
import { cn } from "./utils";

export type EmptyStateProps = {
  /** Optional decorative line-art icon */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-16 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-surface-sunken text-text-muted">
          {icon}
        </div>
      )}
      <h3 className="text-heading-md text-text-primary">{title}</h3>
      {description && (
        <p className="max-w-prose text-body-md text-text-muted">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
