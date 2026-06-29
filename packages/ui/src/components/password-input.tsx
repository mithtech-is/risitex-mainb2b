"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input, type InputProps } from "./input";

export type PasswordInputProps = Omit<InputProps, "type" | "rightAdornment">;

/**
 * Password field with a show/hide eye toggle. Drop-in replacement for
 * `<Input type="password" />` — forwards every Input prop (ref, value,
 * onChange, name, autoComplete, minLength, hasError, etc.).
 *
 * The toggle button is `tabIndex={-1}` so keyboard tabbing skips straight to
 * the next field, and `type="button"` so it never submits the form.
 */
export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  (props, ref) => {
    const [show, setShow] = React.useState(false);
    return (
      <Input
        ref={ref}
        type={show ? "text" : "password"}
        rightAdornment={
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="flex items-center justify-center text-text-muted transition-colors duration-fast hover:text-text-primary focus-visible:text-text-primary focus:outline-none"
          >
            {show ? (
              <EyeOff className="h-4 w-4" aria-hidden />
            ) : (
              <Eye className="h-4 w-4" aria-hidden />
            )}
          </button>
        }
        {...props}
      />
    );
  },
);
PasswordInput.displayName = "PasswordInput";
