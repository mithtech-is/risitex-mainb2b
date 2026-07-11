"use client";

import * as React from "react";
import { ChevronDown, Check, Package } from "lucide-react";
import { cn } from "@risitex/ui/components";

export type CourierOption = {
  id: string;
  name: string;
  estimatedDelivery: string;
  chargeRupees: number;
};

export type DeliverySelectorProps = {
  options: CourierOption[];
  value?: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
};

export function DeliveryCompanySelector({
  options,
  value,
  onValueChange,
  disabled,
}: DeliverySelectorProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const handleSelect = (id: string) => {
    onValueChange(id);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Select logistics partner"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-md border px-3 text-body-md",
          "bg-surface-raised",
          "transition-shadow duration-fast ease-standard",
          "focus-visible:border-border-focus focus-visible:shadow-focus-halo focus-visible:outline-none",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          open ? "border-border-focus shadow-focus-halo" : "border-border-subtle",
        )}
      >
        {selected ? (
          <span className="flex flex-1 items-center gap-2 text-left">
            <Package className="h-4 w-4 shrink-0 text-text-muted" />
            <span className="flex-1 truncate text-text-primary">
              {selected.name}
            </span>
          </span>
        ) : (
          <span className="text-text-muted">Select a logistics partner</span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-text-muted transition-transform duration-fast",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Logistics partners"
          className={cn(
            "absolute left-0 right-0 top-full z-popover mt-1 overflow-hidden rounded-lg",
            "bg-surface-raised shadow-popover outline-none",
            "animate-fade-down",
          )}
        >
          <div
            className="max-h-[280px] overflow-y-auto p-1"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const items = listRef.current?.querySelectorAll<HTMLElement>("[role='option']");
                if (!items?.length) return;
                const currentIndex = Array.from(items).findIndex((el) => el.dataset.selected === "true");
                const nextIndex =
                  e.key === "ArrowDown"
                    ? Math.min(currentIndex + 1, items.length - 1)
                    : Math.max(currentIndex - 1, 0);
                items[nextIndex]?.focus();
                items[nextIndex]?.scrollIntoView({ block: "nearest" });
              }
            }}
          >
            {options.map((option, idx) => {
              const isSelected = option.id === value;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-selected={isSelected ? "true" : "false"}
                  tabIndex={idx === 0 ? 0 : -1}
                  onClick={() => handleSelect(option.id)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-sm px-2 py-2 text-left outline-none",
                    "transition-colors duration-fast",
                    isSelected
                      ? "bg-surface-sunken"
                      : "hover:bg-surface-sunken focus-visible:bg-surface-sunken",
                  )}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-background">
                    <Package className="h-4 w-4 text-brand-accent" />
                  </div>
                  <div className="flex flex-1 items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="text-body-sm font-medium text-text-primary">
                        {option.name}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isSelected && (
                        <Check className="h-4 w-4 shrink-0 text-brand-accent" />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
