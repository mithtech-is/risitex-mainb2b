"use client";

import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Input, type InputProps } from "./input";
import { cn } from "./utils";

export type DatePickerProps = Omit<InputProps, "type" | "leftAdornment"> & {
  /** YYYY-MM-DD format */
  value?: string;
  onValueChange?: (value: string) => void;
};

/**
 * DatePicker — wraps the native `<input type="date">` with RISITEX styling.
 *
 * Why native: zero bundle cost, accessible by default, Indian-locale-aware on
 * mobile, supports `min`/`max` natively. A custom Radix-Calendar popover
 * variant can land later if richer behaviour (range, presets) is needed.
 */
export const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(
  ({ value, onValueChange, onChange, className, ...props }, ref) => {
    return (
      <Input
        ref={ref}
        type="date"
        value={value}
        leftAdornment={<CalendarIcon className="h-4 w-4" />}
        onChange={(e) => {
          onChange?.(e);
          onValueChange?.(e.currentTarget.value);
        }}
        className={cn("[&::-webkit-calendar-picker-indicator]:opacity-0", className)}
        {...props}
      />
    );
  },
);
DatePicker.displayName = "DatePicker";
