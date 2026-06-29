"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "./utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-overlay bg-surface-overlay backdrop-blur-modal",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=open]:fade-in data-[state=closed]:fade-out",
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = "SheetOverlay";

const sheetVariants = cva(
  "fixed z-modal bg-surface-raised shadow-modal outline-none flex flex-col",
  {
    variants: {
      side: {
        right:
          "inset-y-0 right-0 h-full w-full max-w-[480px] data-[state=open]:animate-slide-right",
        left:
          "inset-y-0 left-0 h-full w-full max-w-[480px] data-[state=open]:animate-slide-right",
        top: "inset-x-0 top-0 max-h-[80vh]",
        bottom:
          "inset-x-0 bottom-0 max-h-[80vh] data-[state=open]:animate-slide-up rounded-t-xl",
      },
    },
    defaultVariants: { side: "right" },
  },
);

export type SheetContentProps = React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> &
  VariantProps<typeof sheetVariants> & {
    hideClose?: boolean;
  };

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, hideClose, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), className)}
      {...props}
    >
      {side === "bottom" && (
        <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-border-strong" />
      )}
      {!hideClose && (
        <DialogPrimitive.Close
          className={cn(
            "absolute right-4 top-4 z-10 rounded-md p-1 text-text-muted",
            "transition-colors duration-fast hover:bg-surface-sunken hover:text-text-primary",
            "focus-visible:ring-focus",
          )}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
      {children}
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = "SheetContent";

export const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col gap-1 border-b border-border-subtle px-6 py-4",
      className,
    )}
    {...props}
  />
);

export const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex items-center justify-end gap-2 border-t border-border-subtle px-6 py-4 mt-auto",
      className,
    )}
    {...props}
  />
);

export const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-heading-md text-text-primary", className)}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";

export const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-body-md text-text-secondary", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";
