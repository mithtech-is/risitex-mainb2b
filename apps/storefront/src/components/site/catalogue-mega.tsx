"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
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

/**
 * Lazily loads the live Medusa category tree (roots + one level of children),
 * the same source of truth as the catalogue filters. Fetch fires on first
 * hover so it never costs a request on pages the menu is never opened on.
 */
function useCategoryTree(shouldLoad: boolean) {
  const [roots, setRoots] = React.useState<Cat[]>([]);
  const started = React.useRef(false);

  React.useEffect(() => {
    if (!shouldLoad || started.current) return;
    started.current = true;
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
        setRoots(rootList);
      })
      .catch(() => {
        /* offline / aborted — the trigger still links to the full catalogue */
      });
    return () => {
      alive = false;
    };
  }, [shouldLoad]);

  return roots;
}

function catHref(handle?: string) {
  return handle
    ? `/wholesale/catalogue?cat=${encodeURIComponent(handle)}`
    : "/wholesale/catalogue";
}

/** One subcategory row — Jockey-style colour shift + slide-in chevron on hover. */
function SubLink({
  name,
  href,
  onNavigate,
}: {
  name: string;
  href: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="group/sub flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-body-sm text-text-secondary transition-colors duration-fast hover:bg-surface-sunken hover:text-text-primary focus-visible:bg-surface-sunken focus-visible:text-text-primary focus-visible:outline-none"
    >
      <span className="truncate">{name}</span>
      <ChevronRight
        className="h-4 w-4 shrink-0 -translate-x-1 text-text-muted opacity-0 transition-all duration-fast group-hover/sub:translate-x-0 group-hover/sub:opacity-100 group-hover/sub:text-text-primary"
        aria-hidden
      />
    </Link>
  );
}

/**
 * Premium full-width Catalogue mega-menu. Hovering (or focusing) "Catalogue"
 * drops a bar spanning the whole header: category columns (each root category
 * with its subcategories) on the left, a featured CTA panel on the right — all
 * aligned to the site container. Data-driven from Medusa so new admin
 * categories appear with zero code change. Desktop only; the mobile sheet keeps
 * its simple list.
 */
export function CatalogueMega() {
  const pathname = usePathname() ?? "";
  const active =
    pathname.startsWith("/wholesale/catalogue") ||
    pathname.startsWith("/products");
  const [open, setOpen] = React.useState(false);
  const roots = useCategoryTree(open);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const openNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };
  const closeNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(false);
  };

  React.useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  return (
    <li onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <Link
        href="/wholesale/catalogue"
        aria-current={active ? "page" : undefined}
        aria-expanded={open}
        onKeyDown={(e) => e.key === "Escape" && closeNow()}
        className={`group relative flex items-center gap-1 text-body-md transition-colors duration-fast ${
          active || open
            ? "text-text-primary"
            : "text-text-secondary hover:text-text-primary"
        }`}
      >
        Catalogue
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-base ease-standard ${
            open ? "rotate-180" : "rotate-0"
          }`}
          aria-hidden
        />
        <span
          className={`pointer-events-none absolute -bottom-1.5 left-0 h-px bg-text-primary transition-all duration-base ease-standard ${
            active || open ? "w-full" : "w-0 group-hover:w-full"
          }`}
          aria-hidden
        />
      </Link>

      {/* Full-width panel, pinned just below the sticky header (h-14 = 56px). */}
      <div
        className={`fixed inset-x-0 top-14 z-popover transition-all duration-base ease-standard ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0"
        }`}
        onMouseEnter={openNow}
        onMouseLeave={closeSoon}
        role="region"
        aria-label="Catalogue categories"
      >
        <div className="border-b border-border-subtle bg-surface-raised shadow-[0_26px_40px_-16px_rgba(20,20,18,0.16)]">
          <Container>
            <div className="flex items-stretch gap-8 py-8 lg:gap-10">
              {/* Category sections */}
              <div className="flex flex-1 flex-wrap gap-6 lg:gap-8">
                {roots.length === 0 ? (
                  <div className="flex w-48 flex-col gap-2">
                    <div className="h-3 w-24 animate-pulse rounded bg-surface-sunken" />
                    <div className="h-9 w-full animate-pulse rounded bg-surface-sunken" />
                    <div className="h-9 w-full animate-pulse rounded bg-surface-sunken" />
                    <div className="h-9 w-3/4 animate-pulse rounded bg-surface-sunken" />
                  </div>
                ) : (
                  roots.map((root) => (
                    <div key={root.id} className="min-w-[190px] flex-1">
                      <Link
                        href={catHref(root.handle)}
                        onClick={closeNow}
                        className="mb-2.5 block px-3 text-caption font-semibold uppercase tracking-[0.16em] text-text-muted transition-colors duration-fast hover:text-text-primary"
                      >
                        {root.name}
                      </Link>
                      <div className="mx-3 h-px bg-border-subtle" />
                      <ul className="mt-2 flex flex-col gap-0.5">
                        {(root.children.length > 0 ? root.children : [root]).map(
                          (child) => (
                            <li key={child.id}>
                              <SubLink
                                name={child.name}
                                href={catHref(child.handle)}
                                onNavigate={closeNow}
                              />
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  ))
                )}
              </div>

              {/* Featured CTA */}
              <Link
                href="/wholesale/catalogue"
                onClick={closeNow}
                className="group/cta relative flex w-64 shrink-0 flex-col justify-end overflow-hidden rounded-2xl bg-action-primary-bg p-6 text-action-primary-text transition-colors duration-base hover:bg-action-primary-bg-hover"
              >
                <span
                  aria-hidden
                  className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-action-primary-text/10 transition-transform duration-base group-hover/cta:scale-125"
                />
                <ArrowRight
                  className="absolute right-5 top-5 h-5 w-5 text-action-primary-text/50 transition-transform duration-base group-hover/cta:translate-x-1"
                  aria-hidden
                />
                <span className="text-caption font-semibold uppercase tracking-[0.16em] text-action-primary-text/60">
                  Wholesale
                </span>
                <span className="mt-1.5 text-heading-sm font-semibold leading-tight">
                  Browse the full range
                </span>
                <span className="mt-2 text-body-sm text-action-primary-text/70">
                  500+ products · factory-direct pricing
                </span>
                <span className="mt-4 inline-flex items-center gap-1.5 text-body-sm font-medium">
                  Shop all products
                  <ArrowRight className="h-4 w-4 transition-transform duration-base group-hover/cta:translate-x-1" />
                </span>
              </Link>
            </div>
          </Container>
        </div>
      </div>
    </li>
  );
}
