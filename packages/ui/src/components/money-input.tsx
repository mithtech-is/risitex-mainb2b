"use client";

import * as React from "react";
import { Input, type InputProps } from "./input";

export type MoneyInputProps = Omit<InputProps, "leftAdornment" | "type"> & {
  /** ISO currency code; defaults to INR for the ₹ glyph */
  currencyCode?: "INR" | "USD" | "EUR";
};

const SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
};

/**
 * MoneyInput — Input with a currency glyph prefix and tabular numerals.
 * Value semantics are the consumer's responsibility (major vs minor units).
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ currencyCode = "INR", className, ...props }, ref) => (
    <Input
      ref={ref}
      type="number"
      inputMode="decimal"
      step="0.01"
      leftAdornment={SYMBOLS[currencyCode]}
      className={`numerics-tabular ${className ?? ""}`}
      {...props}
    />
  ),
);
MoneyInput.displayName = "MoneyInput";
