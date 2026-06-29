"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "./utils";

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-[18px] w-[18px] shrink-0 rounded-xs border border-border-strong bg-surface-raised",
      "transition-colors duration-fast ease-standard",
      "focus-visible:ring-focus",
      "data-[state=checked]:bg-brand-accent data-[state=checked]:border-brand-accent data-[state=checked]:text-text-on-accent",
      "data-[state=indeterminate]:bg-brand-accent data-[state=indeterminate]:border-brand-accent data-[state=indeterminate]:text-text-on-accent",
      "disabled:opacity-50 disabled:cursor-not-allowed",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center">
      <Check className="h-3 w-3 data-[state=indeterminate]:hidden" strokeWidth={3} />
      <Minus className="hidden h-3 w-3 data-[state=indeterminate]:block" strokeWidth={3} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;
