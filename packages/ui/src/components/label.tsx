"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const labelVariants = cva("inline-flex items-center gap-1 select-none", {
  variants: {
    size: {
      micro: "text-micro text-text-muted",
      caption: "text-caption text-text-secondary",
      body: "text-body-md text-text-primary",
    },
  },
  defaultVariants: { size: "caption" },
});

export type LabelProps = React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
  VariantProps<typeof labelVariants> & {
    required?: boolean;
    asChild?: boolean;
  };

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  LabelProps
>(({ className, size, required, asChild, children, ...props }, ref) => {
  // When asChild is set, Radix's Slot requires exactly one child element.
  // Skip the `*` marker — the consumer is supplying their own element and
  // can add a required indicator themselves.
  if (asChild) {
    return (
      <LabelPrimitive.Root
        ref={ref}
        asChild
        className={cn(labelVariants({ size }), className)}
        {...props}
      >
        {children}
      </LabelPrimitive.Root>
    );
  }
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(labelVariants({ size }), className)}
      {...props}
    >
      {children}
      {required && (
        <span aria-hidden className="text-feedback-danger-text">
          *
        </span>
      )}
    </LabelPrimitive.Root>
  );
});
Label.displayName = "Label";
