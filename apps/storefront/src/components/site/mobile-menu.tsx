"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, Search } from "lucide-react";
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
  { href: "/wholesale/catalogue", label: "Catalogue" },
  { href: "/contact", label: "Contact Us" },
];

export function MobileMenu() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [mq, setMq] = React.useState("");

  const mobileSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = mq.trim();
    if (term) {
      router.push(`/wholesale/catalogue?q=${encodeURIComponent(term)}`);
      setOpen(false);
      setMq("");
    }
  };

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
          <form onSubmit={mobileSearch} role="search" className="relative mb-4">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <input
              type="text"
              value={mq}
              onChange={(e) => setMq(e.currentTarget.value)}
              placeholder="Search products"
              aria-label="Search products"
              className="h-10 w-full rounded-full bg-surface-sunken pl-10 pr-4 text-body-sm text-text-primary placeholder:text-text-muted outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
            />
          </form>
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
