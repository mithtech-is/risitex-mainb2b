"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "./utils";

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-5 w-8 shrink-0 cursor-pointer items-center rounded-full",
      "transition-colors duration-fast ease-standard",
      "focus-visible:ring-focus",
      "data-[state=checked]:bg-brand-accent data-[state=unchecked]:bg-border-strong",
      "disabled:opacity-50 disabled:cursor-not-allowed",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none block h-4 w-4 rounded-full bg-surface-raised shadow-rest",
        "transition-transform duration-fast ease-standard",
        "data-[state=checked]:translate-x-[14px] data-[state=unchecked]:translate-x-0.5",
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;
