"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";
import { cn } from "./utils";

/**
 * Command palette — Cmd+K global search.
 *
 * Mount once near the app shell. Use `useCommandPalette` to read/write the
 * open state. The palette itself is a wrapper around cmdk inside a Dialog.
 *
 * Consumers compose their own actions/results — this primitive only provides
 * the chrome and the keyboard binding.
 */

type Ctx = {
  open: boolean;
  setOpen: (open: boolean) => void;
};
const CommandPaletteCtx = React.createContext<Ctx | null>(null);

export function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open]);

  return (
    <CommandPaletteCtx.Provider value={{ open, setOpen }}>
      {children}
    </CommandPaletteCtx.Provider>
  );
}

export function useCommandPalette(): Ctx {
  const ctx = React.useContext(CommandPaletteCtx);
  if (!ctx) {
    throw new Error("useCommandPalette must be used inside CommandPaletteProvider");
  }
  return ctx;
}

export type CommandPaletteProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placeholder?: string;
  children: React.ReactNode;
  className?: string;
};

export function CommandPalette({
  open: openProp,
  onOpenChange,
  placeholder = "Search the catalogue, jump to a page…",
  children,
  className,
}: CommandPaletteProps) {
  const ctx = React.useContext(CommandPaletteCtx);
  const open = openProp ?? ctx?.open ?? false;
  const setOpen = onOpenChange ?? ctx?.setOpen ?? (() => {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className={cn(
          "max-w-[640px] overflow-hidden p-0",
          className,
        )}
        hideClose
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search the catalogue and jump to pages with the keyboard.
        </DialogDescription>
        <CommandPrimitive className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border-subtle px-4">
            <Search className="h-4 w-4 text-text-muted" />
            <CommandPrimitive.Input
              placeholder={placeholder}
              className="flex h-12 w-full bg-transparent text-body-lg text-text-primary placeholder:text-text-muted focus:outline-none"
            />
            <kbd className="hidden h-6 select-none items-center rounded border border-border-subtle bg-surface-sunken px-1.5 text-micro font-medium text-text-muted sm:inline-flex">
              ESC
            </kbd>
          </div>
          <CommandPrimitive.List className="max-h-[400px] overflow-y-auto p-2">
            {children}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}

export const CommandEmpty = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Empty asChild>
    <div
      ref={ref}
      className={cn(
        "px-2 py-8 text-center text-body-md text-text-muted",
        className,
      )}
      {...props}
    />
  </CommandPrimitive.Empty>
));
CommandEmpty.displayName = "CommandEmpty";

export const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5",
      "[&_[cmdk-group-heading]]:text-micro [&_[cmdk-group-heading]]:text-text-muted",
      className,
    )}
    {...props}
  />
));
CommandGroup.displayName = "CommandGroup";

export const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item> & {
    shortcut?: string;
    icon?: React.ReactNode;
  }
>(({ className, children, shortcut, icon, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center gap-3 rounded-md px-3 py-2 text-body-md text-text-primary outline-none",
      "data-[selected=true]:bg-surface-sunken",
      "data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed",
      className,
    )}
    {...props}
  >
    {icon && (
      <span className="inline-flex h-5 w-5 items-center justify-center text-text-muted">
        {icon}
      </span>
    )}
    <span className="flex-1">{children}</span>
    {shortcut && (
      <kbd className="ml-auto h-5 select-none items-center rounded border border-border-subtle bg-surface-sunken px-1.5 text-micro font-medium text-text-muted inline-flex">
        {shortcut}
      </kbd>
    )}
  </CommandPrimitive.Item>
));
CommandItem.displayName = "CommandItem";

export const CommandSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator asChild>
    <div
      ref={ref}
      className={cn("my-1 h-px bg-border-subtle", className)}
      {...props}
    />
  </CommandPrimitive.Separator>
));
CommandSeparator.displayName = "CommandSeparator";
