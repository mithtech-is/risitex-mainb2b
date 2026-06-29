"use client";

import * as React from "react";
import { Input, type InputProps } from "./input";

export const GSTIN_REGEX =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/;

export type GSTINInputProps = Omit<InputProps, "maxLength" | "type"> & {
  /** Called when validity changes (after every keystroke once length ≥ 15) */
  onValidChange?: (valid: boolean) => void;
};

export const GSTINInput = React.forwardRef<HTMLInputElement, GSTINInputProps>(
  ({ onValidChange, onChange, ...props }, ref) => {
    return (
      <Input
        ref={ref}
        type="text"
        inputMode="text"
        maxLength={15}
        placeholder="22ABCDE1234F1Z5"
        className="font-mono uppercase tracking-wider"
        onChange={(e) => {
          const v = e.target.value.toUpperCase();
          e.target.value = v;
          if (onValidChange && v.length === 15) {
            onValidChange(GSTIN_REGEX.test(v));
          } else if (onValidChange && v.length === 0) {
            onValidChange(true);
          }
          onChange?.(e);
        }}
        {...props}
      />
    );
  },
);
GSTINInput.displayName = "GSTINInput";
