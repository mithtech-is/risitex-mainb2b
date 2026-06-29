"use client";

import * as React from "react";
import { cn } from "./utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  hasError?: boolean;
  /** Optional left adornment, e.g. ₹ glyph for MoneyInput */
  leftAdornment?: React.ReactNode;
  /** Optional right adornment */
  rightAdornment?: React.ReactNode;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, hasError, leftAdornment, rightAdornment, type = "text", ...props }, ref) => {
    if (leftAdornment || rightAdornment) {
      return (
        <div
          className={cn(
            "flex h-10 items-center rounded-md border bg-surface-raised",
            "transition-shadow duration-fast ease-standard",
            "focus-within:border-border-focus focus-within:shadow-focus-halo",
            hasError ? "border-feedback-danger-text" : "border-border-subtle",
            className,
          )}
        >
          {leftAdornment && (
            <span className="pl-3 pr-1 text-text-muted">{leftAdornment}</span>
          )}
          <input
            ref={ref}
            type={type}
            aria-invalid={hasError ? true : undefined}
            className="flex-1 bg-transparent px-3 text-body-md text-text-primary placeholder:text-text-muted focus:outline-none disabled:opacity-50"
            {...props}
          />
          {rightAdornment && (
            <span className="pl-1 pr-3 text-text-muted">{rightAdornment}</span>
          )}
        </div>
      );
    }
    return (
      <input
        ref={ref}
        type={type}
        aria-invalid={hasError ? true : undefined}
        className={cn(
          "h-10 w-full rounded-md border bg-surface-raised px-3 text-body-md text-text-primary",
          "placeholder:text-text-muted",
          "transition-shadow duration-fast ease-standard",
          "focus-visible:border-border-focus focus-visible:shadow-focus-halo focus-visible:outline-none",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          hasError ? "border-feedback-danger-text" : "border-border-subtle",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
