"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "./utils";

export type QuantityStepperProps = {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Optional MOQ context: when set, decrement below `min` is disabled */
  moq?: number;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
};

/**
 * Quantity stepper honouring MOQ rules. Long-press isn't included by default
 * to keep the primitive boring; build it in the calling component if needed.
 */
export function QuantityStepper({
  value,
  onValueChange,
  min = 0,
  max = 99999,
  step = 1,
  moq,
  size = "md",
  disabled,
  className,
}: QuantityStepperProps) {
  const effectiveMin = moq && moq > min ? moq : min;
  const dec = () => onValueChange(Math.max(effectiveMin, value - step));
  const inc = () => onValueChange(Math.min(max, value + step));
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Number(e.target.value);
    if (Number.isNaN(n)) return;
    onValueChange(Math.max(effectiveMin, Math.min(max, n)));
  };

  const h = size === "sm" ? "h-8" : "h-10";
  const btn = size === "sm" ? "w-8" : "w-10";

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-border-subtle bg-surface-raised numerics-tabular",
        h,
        disabled && "opacity-50",
        className,
      )}
    >
      <button
        type="button"
        onClick={dec}
        disabled={disabled || value <= effectiveMin}
        aria-label="Decrease"
        className={cn(
          "inline-flex items-center justify-center text-text-secondary",
          "transition-colors duration-fast hover:text-text-primary disabled:opacity-30",
          btn,
          h,
        )}
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="number"
        value={value}
        onChange={onChange}
        disabled={disabled}
        min={effectiveMin}
        max={max}
        step={step}
        className={cn(
          "w-14 bg-transparent text-center text-body-md text-text-primary outline-none",
          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        )}
      />
      <button
        type="button"
        onClick={inc}
        disabled={disabled || value >= max}
        aria-label="Increase"
        className={cn(
          "inline-flex items-center justify-center text-text-secondary",
          "transition-colors duration-fast hover:text-text-primary disabled:opacity-30",
          btn,
          h,
        )}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
