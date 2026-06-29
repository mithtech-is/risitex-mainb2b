"use client";

import * as React from "react";
import { cn } from "./utils";

export type PageHeaderProps = {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-start justify-between gap-4 md:flex-row md:items-end",
        className,
      )}
    >
      <div>
        {eyebrow && (
          <p className="text-micro text-text-muted">{eyebrow}</p>
        )}
        <h1 className="mt-2 text-heading-xl text-text-primary">{title}</h1>
        {description && (
          <p className="mt-2 max-w-prose text-body-md text-text-muted">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
