"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "./utils";

export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-border-subtle">
      <SliderPrimitive.Range className="absolute h-full bg-brand-accent" />
    </SliderPrimitive.Track>
    {(props.value ?? props.defaultValue ?? [0]).map((_, i) => (
      <SliderPrimitive.Thumb
        key={i}
        className={cn(
          "block h-4 w-4 rounded-full border-2 border-brand-accent bg-surface-raised shadow-rest",
          "transition-shadow duration-fast ease-standard",
          "focus-visible:ring-focus",
          "hover:shadow-raised",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      />
    ))}
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;
