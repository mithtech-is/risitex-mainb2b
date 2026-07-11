import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@risitex/ui/components";
import { Container } from "@/components/site/container";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { type Product } from "@/data/products";
import { getWholesaleProducts } from "@/lib/wholesale-products";
import {
  getCategoryTree,
  findByHandle,
  descendantHandles,
  type CategoryNode,
} from "@/lib/categories";
import { SignedOut, SignedIn } from "@/components/auth/signed-out";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { WishlistHeart } from "@/components/wishlist/wishlist-heart";
import { CatalogueSearch } from "@/components/catalogue/catalogue-search";
import { FilterDropdown } from "@/components/catalogue/filter-dropdown";

export const metadata: Metadata = {
  title: "Wholesale catalogue",
  description:
    "Full RISITEX catalogue with MOQ, master carton, tier pricing, and lead time visible against every SKU.",
};

type Search = {
  cat?: string; // category handle (hierarchical)
  q?: string;
  color?: string;
  size?: string;
  fabric?: string;
  moq_max?: string;
  price_max?: string;
  availability?: string;
  sort?: string;
};

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "default", label: "Newest" },
  { value: "name", label: "Name (A–Z)" },
  { value: "price_asc", label: "Price — low to high" },
  { value: "price_desc", label: "Price — high to low" },
  { value: "moq_asc", label: "MOQ — low to high" },
  { value: "moq_desc", label: "MOQ — high to low" },
];

function parseCsv(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Fabric value from a product's spec sheet, if present. */
function fabricOf(p: Product): string | undefined {
  return p.specs.find((sp) => sp.label.toLowerCase() === "fabric")?.value;
}

function applyFilters(
  products: Product[],
  s: Search,
  catHandleSet: Set<string> | null,
): Product[] {
  let out = products;
  if (s.q && s.q.trim()) {
    const q = s.q.trim().toLowerCase();
    out = out.filter((p) => {
      const hay = [
        p.name,
        p.eyebrow,
        p.description,
        ...p.variants.map((v) => v.sku),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }
  if (catHandleSet) {
    out = out.filter((p) =>
      (p.categoryHandles ?? []).some((h) => catHandleSet.has(h)),
    );
  }
  if (s.availability === "in_stock") {
    out = out.filter((p) =>
      p.variants.some((v) => v.inventoryState !== "out_of_stock"),
    );
  }
  const colors = parseCsv(s.color);
  if (colors.length) {
    out = out.filter((p) =>
      p.swatches.some((sw) => colors.includes(sw.value.toLowerCase())),
    );
  }
  const sizes = parseCsv(s.size);
  if (sizes.length) {
    out = out.filter((p) =>
      p.sizes.some((sz) => sizes.includes(sz.toLowerCase())),
    );
  }
  const fabrics = parseCsv(s.fabric);
  if (fabrics.length) {
    out = out.filter((p) => {
      const f = fabricOf(p);
      return f ? fabrics.includes(f.toLowerCase()) : false;
    });
  }
  const moqMax = Number(s.moq_max);
  if (Number.isFinite(moqMax) && moqMax > 0) {
    out = out.filter((p) => (p.moq ?? 0) <= moqMax);
  }
  const priceMax = Number(s.price_max);
  if (Number.isFinite(priceMax) && priceMax > 0) {
    out = out.filter((p) => (p.priceMajor ?? 0) <= priceMax);
  }
  switch (s.sort) {
    case "name":
      out = [...out].sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "price_asc":
      out = [...out].sort((a, b) => (a.priceMajor ?? 0) - (b.priceMajor ?? 0));
      break;
    case "price_desc":
      out = [...out].sort((a, b) => (b.priceMajor ?? 0) - (a.priceMajor ?? 0));
      break;
    case "moq_asc":
      out = [...out].sort((a, b) => (a.moq ?? 0) - (b.moq ?? 0));
      break;
    case "moq_desc":
      out = [...out].sort((a, b) => (b.moq ?? 0) - (a.moq ?? 0));
      break;
  }
  return out;
}

function withParam(s: Search, key: keyof Search, value: string | undefined) {
  const next: Search = { ...s };
  if (value === undefined || value === "") delete next[key];
  else next[key] = value;
  const qs = new URLSearchParams(
    Object.entries(next).filter(([, v]) => v !== undefined) as [string, string][],
  ).toString();
  return qs ? `/wholesale/catalogue?${qs}` : "/wholesale/catalogue";
}

function toggleCsv(current: string | undefined, value: string): string {
  const set = new Set(parseCsv(current));
  const lower = value.toLowerCase();
  if (set.has(lower)) set.delete(lower);
  else set.add(lower);
  return Array.from(set).join(",");
}

export default async function WholesaleCataloguePage({
  searchParams,
}: {
  searchParams?: Promise<Search>;
}) {
  const s = (await searchParams) ?? {};
  const [all, tree] = await Promise.all([
    getWholesaleProducts(),
    getCategoryTree(),
  ]);

  // Resolve the selected category node → the set of its own + descendant
  // handles, so selecting "Men" or "Jeans" matches everything beneath it.
  const activeNode = s.cat ? findByHandle(tree, s.cat) : null;
  const catHandleSet = activeNode
    ? new Set(descendantHandles(activeNode))
    : null;

  const filtered = applyFilters(all, s, catHandleSet);

  // How many products live under a category node (incl. descendants).
  const countUnder = (node: CategoryNode): number => {
    const handles = new Set(descendantHandles(node));
    return all.filter((p) =>
      (p.categoryHandles ?? []).some((h) => handles.has(h)),
    ).length;
  };

  // Facets computed from the unfiltered set so the sidebar stays clickable.
  const colorFacets = Array.from(
    new Map(
      all.flatMap((p) =>
        p.swatches.map((sw) => [sw.value.toLowerCase(), sw] as const),
      ),
    ).values(),
  );
  const sizeFacets = Array.from(
    new Set(all.flatMap((p) => p.sizes.map((sz) => sz))),
  )
    .filter((sz) => sz && sz !== "—" && sz !== "per-metre")
    .sort();
  const fabricFacets = Array.from(
    new Set(all.map(fabricOf).filter((f): f is string => !!f)),
  ).sort();
  const moqOptions = [50, 100, 200, 500];
  const priceOptions = [500, 1000, 2000, 5000];

  const activeColors = parseCsv(s.color);
  const activeSizes = parseCsv(s.size);
  const activeFabrics = parseCsv(s.fabric);
  const moqMax = Number(s.moq_max);
  const priceMax = Number(s.price_max);

  const filtersActive =
    !!s.q ||
    !!s.cat ||
    !!s.availability ||
    activeColors.length > 0 ||
    activeSizes.length > 0 ||
    activeFabrics.length > 0 ||
    (Number.isFinite(moqMax) && moqMax > 0) ||
    (Number.isFinite(priceMax) && priceMax > 0) ||
    (s.sort && s.sort !== "default");

  return (
    <Container>
      <div className="pt-6">
        <Breadcrumb
          items={[
            { href: "/", label: "Home" },
            { href: "/wholesale", label: "Wholesale" },
            { href: "/wholesale/catalogue", label: "Catalogue" },
          ]}
        />
      </div>
      <header className="border-b border-border-subtle py-10">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-micro text-text-muted">Wholesale</p>
            <h1 className="mt-2 text-display-lg text-text-primary">
              The full catalogue, priced for volume.
            </h1>
            <p className="mt-3 max-w-prose text-body-md text-text-muted">
              {filtered.length} of {all.length} SKUs shown.{" "}
              <SignedOut>Sign in to unlock your tier pricing.</SignedOut>
              <SignedIn>Tier pricing applied to your account.</SignedIn>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SignedOut>
              <Button asChild>
                <Link href="/auth/sign-in">Sign in</Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/auth/sign-up">Register</Link>
              </Button>
            </SignedOut>
            <SignedIn>
              <Button asChild>
                <Link href="/b2b/dashboard">Open dashboard</Link>
              </Button>
              <SignOutButton variant="secondary" />
            </SignedIn>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-6 py-8">
        <CatalogueSearch />

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown label="Category">
            <div className="max-h-80 space-y-1 overflow-y-auto">
              <FacetLink
                href={withParam(s, "cat", undefined)}
                active={!s.cat}
                label={`All (${all.length})`}
              />
              {tree.length === 0 ? (
                <p className="px-2 py-1 text-caption text-text-muted">
                  No categories yet.
                </p>
              ) : (
                tree.map((node) => (
                  <CategoryTreeNav
                    key={node.id}
                    node={node}
                    depth={0}
                    activeHandle={s.cat}
                    search={s}
                    countUnder={countUnder}
                  />
                ))
              )}
            </div>
          </FilterDropdown>

          <FilterDropdown label="Availability">
            <div className="space-y-1">
              <FacetLink
                href={withParam(s, "availability", undefined)}
                active={!s.availability}
                label="Any"
              />
              <FacetLink
                href={withParam(
                  s,
                  "availability",
                  s.availability === "in_stock" ? undefined : "in_stock",
                )}
                active={s.availability === "in_stock"}
                label="In stock"
              />
            </div>
          </FilterDropdown>

          {sizeFacets.length > 0 && (
            <FilterDropdown label="Size">
              <div className="flex flex-wrap gap-2">
                {sizeFacets.map((sz) => {
                  const active = activeSizes.includes(sz.toLowerCase());
                  return (
                    <Link
                      key={sz}
                      href={withParam(s, "size", toggleCsv(s.size, sz))}
                      aria-pressed={active}
                      className={[
                        "inline-flex h-7 min-w-9 items-center justify-center rounded-md px-2 text-caption font-mono transition-colors duration-fast",
                        active
                          ? "bg-action-primary-bg text-action-primary-text"
                          : "border border-border-subtle text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
                      ].join(" ")}
                    >
                      {sz}
                    </Link>
                  );
                })}
              </div>
            </FilterDropdown>
          )}

          <FilterDropdown label="Price">
            <div className="space-y-1">
              <FacetLink
                href={withParam(s, "price_max", undefined)}
                active={!s.price_max}
                label="Any"
              />
              {priceOptions.map((n) => (
                <FacetLink
                  key={n}
                  href={withParam(s, "price_max", String(n))}
                  active={s.price_max === String(n)}
                  label={`≤ ₹${n.toLocaleString()}`}
                />
              ))}
            </div>
          </FilterDropdown>

          {colorFacets.length > 0 && (
            <FilterDropdown label="Color">
              <div className="flex flex-wrap gap-2">
                {colorFacets.map((sw) => {
                  const active = activeColors.includes(sw.value.toLowerCase());
                  return (
                    <Link
                      key={sw.value}
                      href={withParam(s, "color", toggleCsv(s.color, sw.value))}
                      aria-pressed={active}
                      title={sw.name}
                      className={[
                        "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-caption transition-colors duration-fast",
                        active
                          ? "bg-action-primary-bg text-action-primary-text"
                          : "border border-border-subtle text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
                      ].join(" ")}
                    >
                      <span
                        aria-hidden
                        className="inline-block h-3 w-3 rounded-full ring-1 ring-border-subtle"
                        style={{ backgroundColor: sw.hex }}
                      />
                      {sw.name}
                    </Link>
                  );
                })}
              </div>
            </FilterDropdown>
          )}

          {fabricFacets.length > 0 && (
            <FilterDropdown label="Material">
              <div className="space-y-1">
                {fabricFacets.map((f) => (
                  <FacetLink
                    key={f}
                    href={withParam(s, "fabric", toggleCsv(s.fabric, f))}
                    active={activeFabrics.includes(f.toLowerCase())}
                    label={f}
                  />
                ))}
              </div>
            </FilterDropdown>
          )}

          <FilterDropdown label="MOQ">
            <div className="space-y-1">
              <FacetLink
                href={withParam(s, "moq_max", undefined)}
                active={!s.moq_max}
                label="Any"
              />
              {moqOptions.map((n) => (
                <FacetLink
                  key={n}
                  href={withParam(s, "moq_max", String(n))}
                  active={s.moq_max === String(n)}
                  label={`≤ ${n} pcs`}
                />
              ))}
            </div>
          </FilterDropdown>

          <FilterDropdown label="Sort">
            <div className="space-y-1">
              {SORT_OPTIONS.map((opt) => (
                <FacetLink
                  key={opt.value}
                  href={withParam(
                    s,
                    "sort",
                    opt.value === "default" ? undefined : opt.value,
                  )}
                  active={
                    (s.sort ?? "default") === opt.value ||
                    (!s.sort && opt.value === "default")
                  }
                  label={opt.label}
                />
              ))}
            </div>
          </FilterDropdown>

          {filtersActive && (
            <Link
              href="/wholesale/catalogue"
              className="ml-1 text-caption text-text-muted hover:text-text-primary"
            >
              Clear all
            </Link>
          )}
        </div>

        {/* Product grid */}
        <div>
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-border-subtle bg-surface-sunken p-12 text-center">
              <h3 className="text-heading-md text-text-primary">
                No products match these filters
              </h3>
              <p className="mt-2 text-body-md text-text-muted">
                Try a broader category, widening MOQ/price, or clearing all
                filters.
              </p>
              <Button asChild variant="secondary" className="mt-4">
                <Link href="/wholesale/catalogue">Clear all</Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
              {filtered.map((p, idx) => (
                <Link
                  key={p.slug}
                  href={`/wholesale/p/${p.slug}`}
                  className="group flex flex-col rounded-lg border border-border-subtle bg-surface-raised overflow-hidden transition-all duration-fast hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="aspect-[4/3] relative bg-surface-sunken">
                    <Image
                      src={p.image ?? "/demo/products/photo-01.jpg"}
                      alt={p.name}
                      fill
                      priority={idx < 3}
                      sizes="(min-width: 1280px) 33vw, (min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                      className="object-cover transition-transform duration-normal group-hover:scale-[1.02]"
                    />
                  </div>
                  <div className="flex flex-col gap-1 p-4">
                    <span className="text-micro text-text-muted uppercase tracking-wider">
                      {p.eyebrow}
                    </span>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-heading-sm text-text-primary group-hover:text-action-primary-bg transition-colors duration-fast">
                        {p.name}
                      </h3>
                      <WishlistHeart slug={p.slug} productName={p.name} />
                    </div>
                    {p.moq && (
                      <span className="mt-1 text-caption font-medium text-text-secondary">
                        MOQ {p.moq.toLocaleString()} pcs
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}

/** Recursive, indented category tree in the filter sidebar. */
function CategoryTreeNav({
  node,
  depth,
  activeHandle,
  search,
  countUnder,
}: {
  node: CategoryNode;
  depth: number;
  activeHandle: string | undefined;
  search: Search;
  countUnder: (n: CategoryNode) => number;
}) {
  const count = countUnder(node);
  const active = activeHandle === node.handle;
  return (
    <div>
      <Link
        href={withParam(search, "cat", node.handle)}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        className={[
          "block rounded-sm py-1 pr-2 text-body-sm transition-colors duration-fast",
          active
            ? "bg-surface-sunken font-medium text-text-primary"
            : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
        ].join(" ")}
      >
        {node.name}
        <span className="ml-1 text-caption text-text-muted">({count})</span>
      </Link>
      {node.children.map((child) => (
        <CategoryTreeNav
          key={child.id}
          node={child}
          depth={depth + 1}
          activeHandle={activeHandle}
          search={search}
          countUnder={countUnder}
        />
      ))}
    </div>
  );
}

function FacetBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-caption text-text-muted uppercase tracking-wider">
        {title}
      </h3>
      <div className="mt-2 space-y-1">{children}</div>
    </div>
  );
}

function FacetLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={[
        "block rounded-sm px-2 py-1 text-body-sm transition-colors duration-fast",
        active
          ? "bg-surface-sunken font-medium text-text-primary"
          : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}
