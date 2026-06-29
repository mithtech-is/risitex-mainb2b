"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandPalette,
  CommandPaletteProvider,
  CommandSeparator,
  useCommandPalette,
} from "@risitex/ui/components";
import { Search, ShoppingBag, Store, Tag, UserRound } from "lucide-react";
import { PRODUCTS, CATEGORY_LABELS, type Product } from "@/data/products";

/**
 * SearchPaletteRoot — provider that hosts the palette. Wrap the topnav (or
 * any subtree) so the children can render the trigger button via
 * useCommandPalette(). The palette itself mounts here once and is portaled
 * into a Dialog, so it doesn't matter where the provider sits.
 */
export function SearchPaletteRoot({ children }: { children: React.ReactNode }) {
  return (
    <CommandPaletteProvider>
      {children}
      <SearchPaletteContent />
    </CommandPaletteProvider>
  );
}

export function SearchPaletteTrigger() {
  // Renders a search button that opens the palette.
  const ctx = useCommandPalette();
  return (
    <button
      type="button"
      onClick={() => ctx.setOpen(true)}
      aria-label="Search"
      className="inline-flex h-9 items-center gap-2 rounded-md border border-border-subtle bg-surface-raised px-3 text-body-sm text-text-muted transition-colors duration-fast hover:border-border-strong"
    >
      <Search className="h-4 w-4" />
      <span className="hidden md:inline">Search the catalogue</span>
      <kbd className="hidden md:inline-flex h-5 select-none items-center rounded border border-border-subtle bg-surface-sunken px-1.5 text-micro font-medium text-text-muted">
        ⌘K
      </kbd>
    </button>
  );
}

function SearchPaletteContent() {
  const router = useRouter();
  const { setOpen } = useCommandPalette();

  const go = (href: string) => {
    router.push(href);
    setTimeout(() => setOpen(false), 0);
  };

  return (
    <CommandPalette>
      <CommandEmpty>No matches. Try a different word.</CommandEmpty>

      <CommandGroup heading="Quick links">
        <CommandItem
          icon={<Store className="h-4 w-4" />}
          onSelect={() => go("/products")}
          shortcut="G P"
        >
          Browse catalogue
        </CommandItem>
        <CommandItem
          icon={<Tag className="h-4 w-4" />}
          onSelect={() => go("/wholesale/catalogue")}
          shortcut="G W"
        >
          Wholesale catalogue
        </CommandItem>
        <CommandItem
          icon={<ShoppingBag className="h-4 w-4" />}
          onSelect={() => go("/b2b/carts")}
          shortcut="G C"
        >
          Open cart
        </CommandItem>
        <CommandItem
          icon={<UserRound className="h-4 w-4" />}
          onSelect={() => go("/b2b/dashboard")}
          shortcut="G A"
        >
          B2B dashboard
        </CommandItem>
      </CommandGroup>

      <CommandSeparator />

      <CommandGroup heading="Categories">
        {Object.entries(CATEGORY_LABELS).map(([slug, label]) => (
          <CommandItem
            key={slug}
            value={`${slug} ${label}`}
            onSelect={() => go(`/products?category=${slug}`)}
          >
            {label}
          </CommandItem>
        ))}
      </CommandGroup>

      <CommandSeparator />

      <CommandGroup heading="Products">
        {PRODUCTS.map((p: Product) => (
          <CommandItem
            key={p.slug}
            value={`${p.name} ${p.eyebrow} ${p.swatches
              .map((s) => s.name)
              .join(" ")} ${p.variants
              .map((v) => v.sku)
              .join(" ")}`}
            onSelect={() => go(`/wholesale/p/${p.slug}`)}
          >
            <span className="flex flex-col">
              <span>{p.name}</span>
              <span className="text-caption text-text-muted">
                {p.eyebrow} · ₹{p.priceMajor.toLocaleString("en-IN")}
              </span>
            </span>
          </CommandItem>
        ))}
      </CommandGroup>
    </CommandPalette>
  );
}

/**
 * Convenience: a "/" wrapper that uses Next router for client-side nav inside
 * CommandItems without exposing useRouter to consumers. Not currently used
 * but exported for future use.
 */
export function CommandLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="contents">
      {children}
    </Link>
  );
}
