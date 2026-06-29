"use client";

import * as React from "react";
import { cn } from "./utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  hasError?: boolean;
};

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, hasError, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={hasError ? true : undefined}
      className={cn(
        "block w-full rounded-md border bg-surface-raised px-3 py-2 text-body-md text-text-primary",
        "placeholder:text-text-muted resize-y min-h-[64px]",
        "transition-shadow duration-fast ease-standard",
        "focus-visible:border-border-focus focus-visible:shadow-focus-halo focus-visible:outline-none",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        hasError ? "border-feedback-danger-text" : "border-border-subtle",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
