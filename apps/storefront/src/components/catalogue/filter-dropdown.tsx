"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";

export function FilterDropdown({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDetailsElement>(null);

  // Exclusive/accordion: opening this filter closes every other open one.
  const handleToggle = () => {
    const el = ref.current;
    if (el?.open) {
      document
        .querySelectorAll<HTMLDetailsElement>("details.filter-dd[open]")
        .forEach((d) => {
          if (d !== el) d.open = false;
        });
    }
  };

  // Close when clicking outside this dropdown.
  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <details ref={ref} onToggle={handleToggle} className="filter-dd group relative">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-border-subtle bg-surface-raised px-3 text-body-sm text-text-primary transition-colors duration-fast hover:bg-surface-sunken">
        {label}
        <ChevronDown className="h-4 w-4 text-text-muted transition-transform duration-fast group-open:rotate-180" />
      </summary>
      <div className="absolute left-0 top-full z-popover mt-1 min-w-[220px] animate-fade-down rounded-lg border border-border-subtle bg-surface-raised p-3 shadow-popover">
        {children}
      </div>
    </details>
  );
}
