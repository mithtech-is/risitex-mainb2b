"use client";

import * as React from "react";
import { cn } from "./utils";

/**
 * Card — surface primitive. Default elevation is `rest`. Use `elevation` to
 * lift; use `flat` for a transparent variant that still carries the radius
 * and padding (useful inside another card).
 */
export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  elevation?: "flat" | "rest" | "raised";
  interactive?: boolean;
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, elevation = "rest", interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-lg bg-surface-raised",
        elevation === "rest" && "shadow-rest",
        elevation === "raised" && "shadow-raised",
        interactive &&
          "transition-shadow duration-fast ease-standard hover:shadow-raised",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col gap-1 px-6 pt-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-heading-md text-text-primary", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-body-sm text-text-muted", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

export const CardBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("px-6 py-4", className)} {...props} />
));
CardBody.displayName = "CardBody";

export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center justify-end gap-2 px-6 py-4 border-t border-border-subtle",
      className,
    )}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";
