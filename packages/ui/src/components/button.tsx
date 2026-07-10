"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "./utils";

/*
 * Button — the most-touched primitive in the system.
 *
 * Variants (blueprint §24):
 *   primary       → brand action (indigo bg)
 *   secondary     → quiet action (paper bg + border)
 *   tertiary      → link-like text button (no bg, accent text on hover)
 *   danger        → destructive (madder bg)
 *   danger-soft   → destructive in a quiet skin (madder text, paper bg)
 *   ghost         → low chrome (transparent bg, hover surface)
 *   icon          → square icon-only (40×40 default)
 *
 * Sizes: xs (28) · sm (32) · md (40 default) · lg (48)
 *
 * Loading: spinner replaces left icon, label dims to 70%, width preserved.
 * Disabled: 50% opacity, cursor-not-allowed.
 *
 * Pass `asChild` to render the button as a Link or another component while
 * keeping all the styles + a11y wiring.
 */
const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium",
    // Subtle premium press feedback app-wide; transform transitions too.
    "transition-all duration-fast ease-standard active:translate-y-px motion-reduce:active:translate-y-0",
    "focus-visible:ring-focus disabled:opacity-50 disabled:cursor-not-allowed",
  ),
  {
    variants: {
      variant: {
        primary:
          "bg-action-primary-bg text-action-primary-text hover:bg-action-primary-bg-hover active:bg-action-primary-bg-active",
        secondary:
          "bg-action-secondary-bg text-action-secondary-text border border-border-subtle hover:bg-action-secondary-bg-hover",
        tertiary:
          "bg-transparent text-text-primary hover:text-brand-accent underline-offset-4 hover:underline",
        danger:
          "bg-action-danger-bg text-action-danger-text hover:bg-action-danger-bg-hover",
        "danger-soft":
          "bg-feedback-danger-bg text-feedback-danger-text border border-feedback-danger-border hover:opacity-90",
        ghost:
          "bg-transparent text-text-primary hover:bg-surface-sunken",
        icon: "bg-transparent text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
      },
      size: {
        xs: "h-7 px-2 text-body-sm",
        sm: "h-8 px-3 text-body-sm",
        md: "h-10 px-5 text-body-md",
        lg: "h-12 px-6 text-body-md",
      },
    },
    compoundVariants: [
      { variant: "icon", size: "xs", className: "w-7 px-0" },
      { variant: "icon", size: "sm", className: "w-8 px-0" },
      { variant: "icon", size: "md", className: "w-10 px-0" },
      { variant: "icon", size: "lg", className: "w-12 px-0" },
    ],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    isLoading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
  };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild,
      isLoading,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    if (asChild) {
      // Radix Slot requires exactly one React element child. If a caller
      // passes text, multiple elements, or a fragment, fall back to a real
      // button so the page does not crash. The asChild "wrap a Link" pattern
      // still works for the common single-element case.
      const childArray = React.Children.toArray(children);
      const onlyChild = childArray[0];
      if (childArray.length === 1 && React.isValidElement(onlyChild)) {
        return (
          <Slot
            ref={ref}
            className={cn(buttonVariants({ variant, size }), className)}
            {...props}
          >
            {onlyChild}
          </Slot>
        );
      }
    }
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : leftIcon}
        {/* Lay the label out as a centered flex row. Tailwind Preflight sets
            `svg { display:block }`, so an icon passed as a raw child alongside
            text would otherwise stack ABOVE the label and get clipped by the
            button's fixed height. inline-flex keeps icon + text on one line. */}
        <span
          className={cn("inline-flex items-center", isLoading && "opacity-70")}
        >
          {children}
        </span>
        {!isLoading && rightIcon}
      </button>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
