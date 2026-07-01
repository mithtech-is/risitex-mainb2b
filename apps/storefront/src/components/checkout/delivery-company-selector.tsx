"use client";

import * as React from "react";
import { Search, ChevronDown, Check, Package } from "lucide-react";
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
  const [search, setSearch] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.estimatedDelivery.toLowerCase().includes(q),
    );
  }, [options, search]);

  React.useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
    }
  };

  const handleSelect = (id: string) => {
    onValueChange(id);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Select delivery company"
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
            <span className="shrink-0 text-caption text-text-muted">
              {selected.estimatedDelivery}
            </span>
            <span className="shrink-0 font-mono text-body-sm text-text-secondary">
              ₹{selected.chargeRupees.toLocaleString("en-IN")}
            </span>
          </span>
        ) : (
          <span className="text-text-muted">Select a delivery company</span>
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
          aria-label="Delivery companies"
          className={cn(
            "absolute left-0 right-0 top-full z-popover mt-1 overflow-hidden rounded-lg",
            "bg-surface-raised shadow-popover outline-none",
            "animate-fade-down",
          )}
        >
          <div className="flex items-center gap-2 border-b border-border-subtle px-3">
            <Search className="h-4 w-4 shrink-0 text-text-muted" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              placeholder="Search courier..."
              aria-label="Search delivery companies"
              className="flex h-10 w-full bg-transparent text-body-md text-text-primary placeholder:text-text-muted focus:outline-none"
            />
          </div>

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
            {filtered.length === 0 ? (
              <div className="px-2 py-6 text-center text-body-sm text-text-muted">
                No couriers found
              </div>
            ) : (
              filtered.map((option, idx) => {
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
                        <div className="text-caption text-text-muted">
                          {option.estimatedDelivery}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-body-sm text-text-secondary">
                          ₹{option.chargeRupees.toLocaleString("en-IN")}
                        </span>
                        {isSelected && (
                          <Check className="h-4 w-4 shrink-0 text-brand-accent" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
