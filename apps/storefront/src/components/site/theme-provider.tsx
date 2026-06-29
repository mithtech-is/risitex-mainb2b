"use client";

import * as React from "react";
import { ThemeProvider as NextThemeProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="risitex-theme"
    >
      {children}
    </NextThemeProvider>
  );
}
