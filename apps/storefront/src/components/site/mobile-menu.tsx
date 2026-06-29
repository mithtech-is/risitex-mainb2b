"use client";

import * as React from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  ThemeSwitch,
} from "@risitex/ui/components";

const NAV = [
  { href: "/about", label: "About" },
  { href: "/products", label: "Catalogue" },
  { href: "/contact", label: "Contact Us" },
];

export function MobileMenu() {
  const [open, setOpen] = React.useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-surface-sunken hover:text-text-primary transition-colors duration-fast lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-full max-w-[360px]">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <ul className="space-y-3">
            {NAV.map((l) => (
              <li key={l.href}>
                <SheetClose asChild>
                  <Link
                    href={l.href}
                    className="block text-body-md text-text-primary hover:text-brand-accent transition-colors duration-fast"
                  >
                    {l.label}
                  </Link>
                </SheetClose>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t border-border-subtle px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <SheetClose asChild>
              <Link
                href="/b2b/dashboard"
                className="text-body-md text-text-primary hover:text-brand-accent transition-colors duration-fast"
              >
                Account
              </Link>
            </SheetClose>
            <ThemeSwitch />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
