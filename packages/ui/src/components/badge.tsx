"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full ring-1 whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral:
          "bg-surface-sunken text-text-secondary ring-border-subtle",
        accent:
          "bg-brand-accent-surface text-brand-accent ring-brand-accent-muted/30",
        success:
          "bg-feedback-success-bg text-feedback-success-text ring-feedback-success-border",
        warning:
          "bg-feedback-warning-bg text-feedback-warning-text ring-feedback-warning-border",
        danger:
          "bg-feedback-danger-bg text-feedback-danger-text ring-feedback-danger-border",
        info:
          "bg-feedback-info-bg text-feedback-info-text ring-feedback-info-border",
        inverse:
          "bg-surface-inverse text-text-on-inverse ring-border-strong",
      },
      size: {
        xs: "px-1.5 py-0 text-micro",
        sm: "px-2 py-0.5 text-caption",
        md: "px-2.5 py-1 text-body-sm",
      },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & {
    /** Optional 6px leading dot in the matching tone */
    dot?: boolean;
  };

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, size, dot, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ tone, size }), className)}
      {...props}
    >
      {dot && (
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full bg-current"
        />
      )}
      {children}
    </span>
  ),
);
Badge.displayName = "Badge";

export { badgeVariants };
