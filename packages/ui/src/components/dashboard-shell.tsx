"use client";

import * as React from "react";
import { cn } from "./utils";

export type DashboardShellProps = {
  sidebar: React.ReactNode;
  topbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

/**
 * DashboardShell — sidebar (240 / collapsible 56) + topbar (56) + content
 * grid. Used by B2B, sales-rep, and warehouse dashboard routes.
 *
 * Children render inside the right column; sidebar handles its own scroll;
 * topbar is sticky to the top.
 */
export function DashboardShell({
  sidebar,
  topbar,
  children,
  className,
}: DashboardShellProps) {
  return (
    <div className={cn("flex min-h-screen bg-surface-background", className)}>
      <aside className="hidden w-60 shrink-0 border-r border-border-subtle bg-surface-raised md:flex md:flex-col">
        {sidebar}
      </aside>
      <div className="flex flex-1 flex-col">
        {topbar && (
          <header className="sticky top-0 z-sticky flex h-14 items-center gap-3 border-b border-border-subtle bg-surface-background/90 px-6 backdrop-blur-modal">
            {topbar}
          </header>
        )}
        <main className="flex-1 px-6 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
