"use client";

import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cn } from "./utils";

export const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root
    ref={ref}
    className={cn("flex flex-col gap-2", className)}
    {...props}
  />
));
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

export const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      "aspect-square h-[18px] w-[18px] rounded-full border border-border-strong bg-surface-raised",
      "transition-colors duration-fast ease-standard",
      "focus-visible:ring-focus",
      "data-[state=checked]:border-brand-accent",
      "disabled:opacity-50 disabled:cursor-not-allowed",
      className,
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
      <span className="block h-2 w-2 rounded-full bg-brand-accent" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
));
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;
