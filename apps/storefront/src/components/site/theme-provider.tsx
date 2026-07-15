"use client";

import * as React from "react";
import { ThemeProvider as NextThemeProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    /*
     * Dark by default for everyone arriving fresh.
     *
     * `enableSystem` is OFF deliberately: with it on, "defaultTheme" is only a
     * fallback for browsers that report no preference, so anyone whose OS is
     * set to light would still land on the light site — which is not what
     * "default to dark" means. Off, `defaultTheme` is the true first-visit
     * state and the toggle still works; the choice persists per-visitor under
     * `storageKey`, so changing it is a one-click, permanent opt-out.
     */
    <NextThemeProvider
      attribute="data-theme"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
      storageKey="risitex-theme"
    >
      {children}
    </NextThemeProvider>
  );
}
