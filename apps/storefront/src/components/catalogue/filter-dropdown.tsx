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
  return (
    <details className="group relative">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-border-subtle bg-surface-raised px-3 text-body-sm text-text-primary">
        {label}
        <ChevronDown className="h-4 w-4 text-text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute left-0 top-full z-popover mt-1 min-w-[220px] rounded-lg border border-border-subtle bg-surface-raised p-3 shadow-popover">
        {children}
      </div>
    </details>
  );
}
