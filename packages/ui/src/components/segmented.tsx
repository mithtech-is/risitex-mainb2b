"use client";

import * as React from "react";
import { cn } from "./utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
};

export type SegmentedProps<T extends string> = {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentedOption<T>[];
  size?: "sm" | "md";
  className?: string;
};

/**
 * Pill-shaped segmented control. Selected item floats on white with shadow.
 * Sizes: sm (32) · md (40 default).
 */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  size = "md",
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-surface-sunken p-1",
        size === "sm" ? "h-8" : "h-10",
        className,
      )}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onValueChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm px-3 text-body-md transition-all duration-fast ease-standard",
              size === "sm" ? "h-6" : "h-8",
              isActive
                ? "bg-surface-raised text-text-primary shadow-rest"
                : "text-text-secondary hover:text-text-primary",
              "focus-visible:ring-focus",
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
