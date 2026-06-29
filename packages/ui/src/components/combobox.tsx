"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "./utils";

export type ComboboxItem<T extends string = string> = {
  value: T;
  label: React.ReactNode;
  /** Optional search keyword string */
  keywords?: string[];
  group?: string;
  disabled?: boolean;
};

export type ComboboxProps<T extends string = string> = {
  value?: T;
  onValueChange?: (value: T) => void;
  items: ComboboxItem<T>[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
};

/**
 * Combobox — cmdk inside a Radix popover. Type-ahead filter, keyboard
 * navigation (up/down/enter/esc). For huge lists (>200) consider providing a
 * server-side searcher and a custom Combobox; this default is for static
 * lists.
 */
export function Combobox<T extends string = string>({
  value,
  onValueChange,
  items,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results.",
  className,
  triggerClassName,
  disabled,
}: ComboboxProps<T>) {
  const [open, setOpen] = React.useState(false);
  const selected = items.find((i) => i.value === value);
  const groups = React.useMemo(() => {
    const m = new Map<string, ComboboxItem<T>[]>();
    for (const item of items) {
      const g = item.group ?? "";
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(item);
    }
    return m;
  }, [items]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-border-subtle",
            "bg-surface-raised px-3 text-body-md text-text-primary",
            "transition-shadow duration-fast ease-standard",
            "focus-visible:border-border-focus focus-visible:shadow-focus-halo focus-visible:outline-none",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            triggerClassName,
          )}
        >
          <span className={cn(!selected && "text-text-muted")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 text-text-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[--radix-popover-trigger-width] p-0", className)} sideOffset={4}>
        <CommandPrimitive className="overflow-hidden rounded-lg">
          <div className="flex items-center gap-2 border-b border-border-subtle px-3">
            <Search className="h-4 w-4 text-text-muted" />
            <CommandPrimitive.Input
              placeholder={searchPlaceholder}
              className="flex h-10 w-full bg-transparent text-body-md text-text-primary placeholder:text-text-muted focus:outline-none"
            />
          </div>
          <CommandPrimitive.List className="max-h-[280px] overflow-y-auto p-1">
            <CommandPrimitive.Empty className="px-2 py-6 text-center text-body-sm text-text-muted">
              {emptyText}
            </CommandPrimitive.Empty>
            {Array.from(groups.entries()).map(([group, gItems]) => (
              <CommandPrimitive.Group
                key={group || "_root"}
                heading={group || undefined}
                className={cn(
                  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5",
                  "[&_[cmdk-group-heading]]:text-micro [&_[cmdk-group-heading]]:text-text-muted",
                )}
              >
                {gItems.map((item) => (
                  <CommandPrimitive.Item
                    key={item.value}
                    value={[item.value, ...(item.keywords ?? [])].join(" ")}
                    disabled={item.disabled}
                    onSelect={() => {
                      onValueChange?.(item.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-body-md text-text-primary outline-none",
                      "data-[selected=true]:bg-surface-sunken",
                      "data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed",
                    )}
                  >
                    {item.label}
                    {item.value === value && (
                      <Check className="ml-auto h-4 w-4 text-brand-accent" />
                    )}
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.Group>
            ))}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  );
}
