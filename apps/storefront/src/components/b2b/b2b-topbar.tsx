"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, ShoppingBag } from "lucide-react";

export type B2bTopbarProps = {
  title: string;
  subtitle?: string;
  rightActions?: React.ReactNode;
  onOpenMobileNav?: () => void;
};

export function B2bTopbar({ title, subtitle, rightActions, onOpenMobileNav }: B2bTopbarProps) {
  return (
    <div className="flex w-full items-center gap-3">
      {onOpenMobileNav && (
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open menu"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-surface-sunken hover:text-text-primary transition-colors duration-fast md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="truncate font-display text-heading-md text-text-primary">
          {title}
        </h1>
        {subtitle && (
          <p className="text-caption text-text-muted truncate">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {rightActions}
        <Link
          href="/wholesale/catalogue"
          className="hidden h-9 items-center gap-1.5 rounded-md border border-border-subtle bg-surface-raised px-3 text-body-sm text-text-secondary transition-colors duration-fast hover:text-text-primary md:inline-flex"
        >
          <ShoppingBag className="h-4 w-4" />
          Catalogue
        </Link>
      </div>
    </div>
  );
}
