"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  ChevronDown,
  ArrowRight,
  Shirt,
  Layers,
  Package,
  Ruler,
  Palette,
  LayoutGrid,
} from "lucide-react";
import { MEDUSA_BASE_URL } from "@/lib/medusa";
import { Container } from "./container";

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

type Cat = {
  id: string;
  name: string;
  handle: string;
  rank: number;
  parentId: string | null;
  children: Cat[];
};

type FlatCat = {
  id: string;
  name: string;
  handle: string;
  rank?: number | null;
  parent_category_id?: string | null;
};

const byRank = (a: Cat, b: Cat) =>
  a.rank - b.rank || a.name.localeCompare(b.name);

const CATEGORY_ICONS: Record<string, typeof Shirt> = {
  jeans: Layers,
  boxers: Shirt,
  innerwear: Package,
  pyjamas: Ruler,
  shirts: Shirt,
  trousers: Ruler,
};

const FALLBACK_ICONS: (typeof Shirt)[] = [
  Shirt,
  Layers,
  Package,
  Ruler,
  Palette,
  LayoutGrid,
];

/**
 * Shown when Medusa returns no categories — i.e. locally with the backend down,
 * or before the fetch resolves. Mirrors the live site's tree (Innerwear /
 * Bottom Wear) so the mega-menu is visible for preview instead of collapsing to
 * a plain link. On a server WITH categories, the real tree replaces this.
 */
const FALLBACK_TREE: Cat[] = [
  {
    id: "fb-innerwear",
    name: "Innerwear",
    handle: "innerwear",
    rank: 0,
    parentId: null,
    children: [
      { id: "fb-inner-boxer", name: "Inner Boxer", handle: "inner-boxer", rank: 0, parentId: "fb-innerwear", children: [] },
      { id: "fb-boxer-shorts", name: "Boxer Shorts", handle: "boxer-shorts", rank: 1, parentId: "fb-innerwear", children: [] },
    ],
  },
  {
    id: "fb-bottomwear",
    name: "Bottom Wear",
    handle: "bottom-wear",
    rank: 1,
    parentId: null,
    children: [
      { id: "fb-pyjamas", name: "Pyjamas", handle: "pyjamas", rank: 0, parentId: "fb-bottomwear", children: [] },
      { id: "fb-jeans", name: "Jeans", handle: "jeans", rank: 1, parentId: "fb-bottomwear", children: [] },
    ],
  },
];

function useCategoryTree() {
  const [roots, setRoots] = React.useState<Cat[]>(FALLBACK_TREE);

  React.useEffect(() => {
    let alive = true;
    fetch(
      `${MEDUSA_BASE_URL}/store/product-categories?limit=200&fields=id,name,handle,rank,parent_category_id`,
      { headers: { "x-publishable-api-key": PUB_KEY } },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { product_categories?: FlatCat[] } | null) => {
        if (!alive || !data) return;
        const flat: Cat[] = (data.product_categories ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          handle: c.handle,
          rank: c.rank ?? 0,
          parentId: c.parent_category_id ?? null,
          children: [],
        }));
        const byId = new Map(flat.map((c) => [c.id, c]));
        const rootList: Cat[] = [];
        for (const c of flat) {
          const parent = c.parentId ? byId.get(c.parentId) : null;
          if (parent) parent.children.push(c);
          else rootList.push(c);
        }
        rootList.sort(byRank);
        rootList.forEach((r) => r.children.sort(byRank));
        // Keep the fallback visible if the backend returned nothing.
        if (rootList.length > 0) setRoots(rootList);
      })
      .catch(() => {
        // Network error / no backend → the fallback tree stays.
      });
    return () => {
      alive = false;
    };
  }, []);

  return roots;
}

const catHref = (handle?: string) =>
  handle
    ? `/wholesale/catalogue?cat=${encodeURIComponent(handle)}`
    : "/wholesale/catalogue";

export function CatalogueMega() {
  const pathname = usePathname() ?? "";
  const active =
    pathname.startsWith("/wholesale/catalogue") ||
    pathname.startsWith("/products");
  const roots = useCategoryTree();
  const hasMenu = roots.length > 0;
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const openNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (hasMenu) setOpen(true);
  };
  const closeSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  };
  const closeNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(false);
  };

  React.useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  if (!hasMenu) {
    return (
      <li>
        <Link
          href="/wholesale/catalogue"
          aria-current={active ? "page" : undefined}
          className={[
            "relative block rounded-full px-4 py-2 text-body-sm font-medium transition-all duration-fast",
            active
              ? "bg-text-primary text-text-on-inverse"
              : "text-text-secondary hover:bg-text-primary hover:text-text-on-inverse",
          ].join(" ")}
        >
          Catalogue
        </Link>
      </li>
    );
  }

  return (
    <li onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <Link
        href="/wholesale/catalogue"
        aria-current={active ? "page" : undefined}
        aria-expanded={open}
        onKeyDown={(e) => e.key === "Escape" && closeNow()}
        className={[
          "relative flex items-center gap-1 rounded-full px-4 py-2 text-body-sm font-medium transition-all duration-fast",
          active || open
            ? "bg-text-primary text-text-on-inverse"
            : "text-text-secondary hover:bg-text-primary hover:text-text-on-inverse",
        ].join(" ")}
      >
        Catalogue
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-base ease-standard ${
            open ? "rotate-180" : "rotate-0"
          }`}
          aria-hidden
        />
      </Link>

      {/* Full-width mega panel */}
      <div
        className={`absolute inset-x-0 top-[100%] z-popover transition-all duration-base ease-standard ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0"
        }`}
        onMouseEnter={openNow}
        onMouseLeave={closeSoon}
        role="region"
        aria-label="Catalogue categories"
      >
        <div className="mt-2 border-y border-border-subtle bg-surface-raised shadow-[0_20px_60px_-16px_rgba(20,20,18,0.16)]">
          <Container>
            <div className="grid grid-cols-12 gap-0 py-6">
              {/* Categories section */}
              <div className="col-span-8 flex gap-0">
                {/* Column: By Category */}
                <div className="flex-1 border-r border-border-subtle pr-6">
                  <p className="mb-4 px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                    By Category
                  </p>
                  <div className="space-y-0.5">
                    {roots.map((root, i) => {
                      const Icon = (CATEGORY_ICONS[root.handle.toLowerCase()] ??
                        FALLBACK_ICONS[i % FALLBACK_ICONS.length]) as typeof Shirt;
                      return (
                        <Link
                          key={root.id}
                          href={catHref(root.handle)}
                          onClick={closeNow}
                          className="group/item flex items-center gap-3 rounded-xl px-3 py-3 transition-colors duration-fast hover:bg-surface-sunken"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-text-muted transition-colors duration-fast group-hover/item:bg-brand-accent/10 group-hover/item:text-brand-accent">
                            <Icon className="h-5 w-5" aria-hidden />
                          </span>
                          <div className="min-w-0">
                            <p className="text-body-sm font-medium text-text-primary">
                              {root.name}
                            </p>
                            <p className="truncate text-caption text-text-muted">
                              {root.children.length > 0
                                ? root.children
                                    .slice(0, 3)
                                    .map((c) => c.name)
                                    .join(", ")
                                : "Browse collection"}
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>

                {/* Column: By Collection / subcategories */}
                <div className="flex-1 pl-6">
                  <p className="mb-4 px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                    Quick Links
                  </p>
                  <div className="space-y-0.5">
                    <QuickLink
                      href="/wholesale/catalogue"
                      label="All Products"
                      desc="Browse the full catalogue"
                      onNavigate={closeNow}
                    />
                    <QuickLink
                      href="/wholesale/catalogue?availability=in_stock"
                      label="In Stock"
                      desc="Ready-to-ship items"
                      onNavigate={closeNow}
                    />
                    <QuickLink
                      href="/wholesale/catalogue?sort=price_asc"
                      label="Price — Low to High"
                      desc="Best value first"
                      onNavigate={closeNow}
                    />
                    <QuickLink
                      href="/wholesale/catalogue?sort=name"
                      label="A — Z"
                      desc="Alphabetical product listing"
                      onNavigate={closeNow}
                    />
                  </div>
                </div>
              </div>

              {/* Right panel — stats + CTA */}
              <div className="col-span-4 pl-6">
                <p className="mb-4 px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                  Why RISITEX
                </p>

                <div className="space-y-3">
                  <div className="rounded-xl border border-border-subtle bg-surface-background p-4">
                    <p className="font-display text-[28px] font-semibold leading-none text-brand-accent">
                      60+
                    </p>
                    <p className="mt-1 text-caption text-text-muted">
                      Years of textile manufacturing
                    </p>
                  </div>
                  <div className="rounded-xl border border-border-subtle bg-surface-background p-4">
                    <p className="font-display text-[28px] font-semibold leading-none text-brand-accent">
                      100%
                    </p>
                    <p className="mt-1 text-caption text-text-muted">
                      Quality inspected & GST invoiced
                    </p>
                  </div>
                </div>

                <Link
                  href="/wholesale/catalogue"
                  onClick={closeNow}
                  className="group/cta mt-4 flex items-center justify-between rounded-xl bg-text-primary px-4 py-3.5 text-text-on-inverse transition-opacity duration-fast hover:opacity-90"
                >
                  <div>
                    <p className="text-body-sm font-semibold">
                      Browse full catalogue
                    </p>
                    <p className="text-caption opacity-70">
                      Factory-direct · GST invoiced
                    </p>
                  </div>
                  <ArrowRight
                    className="h-5 w-5 shrink-0 transition-transform duration-fast group-hover/cta:translate-x-1"
                    aria-hidden
                  />
                </Link>
              </div>
            </div>

            {/* Bottom bar */}
            <div className="flex items-center border-t border-border-subtle py-3">
              <div className="flex items-center gap-4">
                <BottomLink href="/about" label="About RISITEX" onNavigate={closeNow} />
                <BottomLink href="/auth/sign-up" label="Become a partner" onNavigate={closeNow} />
                <BottomLink href="/contact" label="Contact sales" onNavigate={closeNow} />
              </div>
            </div>
          </Container>
        </div>
      </div>
    </li>
  );
}

function QuickLink({
  href,
  label,
  desc,
  onNavigate,
}: {
  href: string;
  label: string;
  desc: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="group/ql flex items-center gap-3 rounded-xl px-3 py-3 transition-colors duration-fast hover:bg-surface-sunken"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-text-muted transition-colors duration-fast group-hover/ql:bg-brand-accent/10 group-hover/ql:text-brand-accent">
        <LayoutGrid className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-body-sm font-medium text-text-primary">{label}</p>
        <p className="truncate text-caption text-text-muted">{desc}</p>
      </div>
    </Link>
  );
}

function BottomLink({
  href,
  label,
  onNavigate,
}: {
  href: string;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="text-caption text-text-muted transition-colors duration-fast hover:text-text-primary"
    >
      {label}
    </Link>
  );
}
