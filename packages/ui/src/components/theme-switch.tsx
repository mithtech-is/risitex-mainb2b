"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/**
 * Single-icon theme toggle. The root layout seeds data-theme before hydration;
 * this control persists the explicit user choice and updates instantly.
 *
 * SSR note: next-themes can't know the user's resolved theme until after
 * mount (it reads localStorage on the client). If we let `aria-label`,
 * `title`, or the icon render based on `resolvedTheme` during SSR, React
 * throws a hydration mismatch as soon as the client sees a different
 * theme than the server's "no preference" default. We gate ALL three
 * theme-dependent attributes on `mounted` so the server and the first
 * client paint produce identical HTML.
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

  const isDark = mounted && resolvedTheme === "dark";
  const Icon = isDark ? Sun : Moon;
  const label = !mounted
    ? "Toggle theme"
    : isDark
      ? "Switch to light theme"
      : "Switch to dark theme";
  const title = !mounted ? "Toggle theme" : isDark ? "Light theme" : "Dark theme";

  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onClick={update}
      className={[
        "inline-flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors duration-fast hover:bg-surface-sunken hover:text-text-primary focus-visible:ring-focus",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      // Stops React from blowing up if a userscript / extension mangles
      // the attributes between SSR and hydration.
      suppressHydrationWarning
    >
      {mounted ? (
        <Icon className="h-4.5 w-4.5 transition-transform duration-normal" />
      ) : (
        <span className="h-4.5 w-4.5" aria-hidden />
      )}
    </button>
  );
}
