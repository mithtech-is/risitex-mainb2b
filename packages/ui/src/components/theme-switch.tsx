"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/**
 * Single-icon theme toggle. The root layout seeds data-theme before hydration;
 * this control persists the explicit user choice and updates instantly.
 */
export function ThemeSwitch({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const update = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  const isDark = resolvedTheme === "dark";
  const Icon = isDark ? Sun : Moon;

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
      onClick={update}
      className={[
        "inline-flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors duration-fast hover:bg-surface-sunken hover:text-text-primary focus-visible:ring-focus",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {mounted ? (
        <Icon className="h-4.5 w-4.5 transition-transform duration-normal" />
      ) : (
        <span className="h-4.5 w-4.5" aria-hidden />
      )}
    </button>
  );
}
