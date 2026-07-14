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
 * Loads the live Medusa category tree (roots + one level of children) on mount
 * — the same source as the catalogue filters. Loading eagerly lets the trigger
 * decide immediately whether to be a dropdown (categories exist) or a plain
 * link (none yet), so there's never an empty/broken panel.
 */
function useCategoryTree() {
  const [roots, setRoots] = React.useState<Cat[]>([]);

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
        setRoots(rootList);
      })
      .catch(() => {
        /* offline / aborted — trigger stays a plain link */
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

/** Shared active/hover underline — offset with an explicit px so it never
 *  overlaps the label (the scale has no 1.5 key, which caused the strikethrough). */
function Underline({ show }: { show: boolean }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute -bottom-[7px] left-0 h-[2px] rounded-full bg-text-primary transition-all duration-base ease-standard ${
        show ? "w-full" : "w-0 group-hover:w-full"
      }`}
    />
  );
}

/** One subcategory row — colour shift + slide-in chevron on hover. */
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
      className="group/sub flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-body-sm text-text-secondary transition-colors duration-fast hover:bg-surface-sunken hover:text-text-primary focus-visible:bg-surface-sunken focus-visible:text-text-primary focus-visible:outline-none"
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
 * Premium Catalogue nav item.
 *  - No categories yet → a clean plain link (no dropdown).
 *  - Categories exist → hovering/focusing drops a full-width premium mega-panel:
 *    one column per root category with its subcategories + a featured CTA,
 *    aligned to the site container. Data-driven from Medusa.
 *
 * Spacing note: @risitex/ui REPLACES Tailwind's spacing scale (only
 * 0,px,0.5,1,2,3,4,5,6,8,10,12,16,20,24,32) — off-scale keys (14, 56, 64, 1.5,
 * 2.5…) emit no CSS. All sizing here is on-scale or explicit [px]. The panel is
 * `absolute top-[100%]` on the sticky header (its backdrop-blur is the
 * containing block) so it sits flush + full width regardless of nav height.
 */
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
    closeTimer.current = setTimeout(() => setOpen(false), 150);
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

  // No categories yet → plain link, identical to the other nav items.
  if (!hasMenu) {
    return (
      <li>
        <Link
          href="/wholesale/catalogue"
          aria-current={active ? "page" : undefined}
          className={`group relative text-body-md transition-colors duration-fast ${
            active
              ? "text-text-primary"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          Catalogue
          <Underline show={active} />
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
        className={`group relative flex items-center gap-1 text-body-md transition-colors duration-fast ${
          active || open
            ? "text-text-primary"
            : "text-text-secondary hover:text-text-primary"
        }`}
      >
        Catalogue
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-base ease-standard ${
            open ? "rotate-180" : "rotate-0"
          }`}
          aria-hidden
        />
        <Underline show={active || open} />
      </Link>

      {/* Full-width panel anchored to the header bottom (see class note above). */}
      <div
        className={`absolute inset-x-0 top-[100%] z-popover transition-all duration-base ease-standard ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0"
        }`}
        onMouseEnter={openNow}
        onMouseLeave={closeSoon}
        role="region"
        aria-label="Catalogue categories"
      >
        <div className="border-t border-border-subtle bg-surface-raised shadow-[0_24px_48px_-20px_rgba(20,20,18,0.22)]">
          <Container>
            <div className="flex items-stretch gap-8 py-8 lg:gap-12">
              {/* Category sections */}
              <div className="flex flex-1 flex-wrap gap-8 lg:gap-12">
                {roots.map((root) => (
                  <div key={root.id} className="min-w-[196px] flex-1">
                    <Link
                      href={catHref(root.handle)}
                      onClick={closeNow}
                      className="group/head mb-3 flex items-center gap-1 px-3 text-caption font-semibold uppercase tracking-[0.16em] text-text-muted transition-colors duration-fast hover:text-text-primary"
                    >
                      {root.name}
                      <ArrowRight className="h-3 w-3 -translate-x-1 opacity-0 transition-all duration-fast group-hover/head:translate-x-0 group-hover/head:opacity-100" aria-hidden />
                    </Link>
                    <ul className="flex flex-col gap-0.5 border-t border-border-subtle pt-2">
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
                ))}
              </div>

              {/* Featured CTA */}
              <Link
                href="/wholesale/catalogue"
                onClick={closeNow}
                className="group/cta relative flex w-[280px] shrink-0 flex-col justify-end overflow-hidden rounded-2xl bg-action-primary-bg p-6 text-action-primary-text transition-colors duration-base hover:bg-action-primary-bg-hover"
              >
                <span
                  aria-hidden
                  className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-action-primary-text/[0.08] transition-transform duration-base group-hover/cta:scale-125"
                />
                <ArrowRight
                  className="absolute right-6 top-6 h-5 w-5 text-action-primary-text/50 transition-transform duration-base group-hover/cta:translate-x-1"
                  aria-hidden
                />
                <span className="text-caption font-semibold uppercase tracking-[0.16em] text-action-primary-text/60">
                  Wholesale
                </span>
                <span className="mt-2 text-heading-md font-semibold leading-tight">
                  Browse the full range
                </span>
                <span className="mt-2 text-body-sm text-action-primary-text/70">
                  Factory-direct pricing · GST invoiced
                </span>
                <span className="mt-5 inline-flex items-center gap-1 text-body-sm font-medium">
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
