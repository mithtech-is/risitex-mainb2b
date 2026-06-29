"use client";

import * as React from "react";
import { cn } from "./utils";

export type SidebarItem = {
  href: string;
  label: string;
  icon?: React.ReactNode;
  /** Optional badge count */
  badge?: number;
};

export type SidebarGroup = {
  heading?: string;
  items: SidebarItem[];
};

export type DashboardSidebarProps = {
  brand: React.ReactNode;
  groups: SidebarGroup[];
  /** Current active href (exact match) */
  activeHref?: string;
  /** Footer slot for theme switch, account etc. */
  footer?: React.ReactNode;
  /** Renderer for items so the consumer can use Next Link / etc. */
  renderItem?: (
    item: SidebarItem,
    isActive: boolean,
    inner: React.ReactNode,
  ) => React.ReactNode;
  className?: string;
};

export function DashboardSidebar({
  brand,
  groups,
  activeHref,
  footer,
  renderItem,
  className,
}: DashboardSidebarProps) {
  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex h-14 items-center gap-2 border-b border-border-subtle px-4">
        {brand}
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Primary">
        {groups.map((g, gi) => (
          <div
            key={g.heading ?? gi}
            className={cn(gi > 0 && "mt-4")}
          >
            {g.heading && (
              <p className="px-2 pb-1.5 text-micro text-text-muted">
                {g.heading}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {g.items.map((item) => {
                const isActive = activeHref === item.href;
                const inner = (
                  <div
                    className={cn(
                      "flex h-9 items-center gap-2 rounded-md px-2 text-body-sm transition-colors duration-fast",
                      isActive
                        ? "bg-surface-sunken text-text-primary"
                        : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
                    )}
                  >
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute left-0 h-5 w-0.5 rounded-r-full bg-brand-accent"
                      />
                    )}
                    {item.icon && (
                      <span className="inline-flex h-4 w-4 items-center justify-center text-text-muted">
                        {item.icon}
                      </span>
                    )}
                    <span className="flex-1 truncate">{item.label}</span>
                    {typeof item.badge === "number" && item.badge > 0 && (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-feedback-warning-bg px-1 text-[10px] font-medium text-feedback-warning-text numerics-tabular">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    )}
                  </div>
                );
                return (
                  <li key={item.href} className="relative">
                    {renderItem ? (
                      renderItem(item, isActive, inner)
                    ) : (
                      <a href={item.href} className="block">
                        {inner}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      {footer && (
        <div className="border-t border-border-subtle px-3 py-3">{footer}</div>
      )}
    </div>
  );
}
