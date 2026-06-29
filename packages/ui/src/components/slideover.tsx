"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
  SheetClose,
} from "./sheet";
import { cn } from "./utils";

/**
 * Slideover — named wrapper around Sheet for ops contexts.
 *
 * Three width presets per the blueprint §13:
 *   sm  → 480 (default — detail panel)
 *   md  → 720 (wide — list + detail split)
 *   full → 100vw on mobile, ~90vw desktop
 *
 * Always slides from the right on desktop, bottom on mobile. Use `Sheet`
 * directly when you need top/left edges or for the storefront cart drawer.
 */
export const Slideover = Sheet;
export const SlideoverTrigger = SheetTrigger;
export const SlideoverClose = SheetClose;
export const SlideoverHeader = SheetHeader;
export const SlideoverFooter = SheetFooter;
export const SlideoverTitle = SheetTitle;
export const SlideoverDescription = SheetDescription;

export type SlideoverContentProps = React.ComponentPropsWithoutRef<
  typeof SheetContent
> & {
  width?: "sm" | "md" | "full";
};

export const SlideoverContent = React.forwardRef<
  React.ElementRef<typeof SheetContent>,
  SlideoverContentProps
>(({ width = "sm", className, ...props }, ref) => {
  const widthClass =
    width === "full"
      ? "max-w-none sm:max-w-[90vw]"
      : width === "md"
        ? "max-w-[720px]"
        : "max-w-[480px]";
  return (
    <SheetContent
      ref={ref}
      side="right"
      className={cn(widthClass, className)}
      {...props}
    />
  );
});
SlideoverContent.displayName = "SlideoverContent";
