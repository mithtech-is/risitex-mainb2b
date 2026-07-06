import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@risitex/ui/components";
import { Container } from "@/components/site/container";
import { SignedOut } from "@/components/auth/signed-out";
import { B2bPriceGate } from "@/components/b2b/b2b-price-gate";
import { getWholesaleProducts } from "@/lib/wholesale-products";
import { CATEGORY_LABELS, type Product } from "@/data/products";
import {
  getCategoryTree,
  findByHandle,
  descendantHandles,
  pathToHandle,
  deepestPath,
  type CategoryNode,
} from "@/lib/categories";
import { WishlistHeart } from "@/components/wishlist/wishlist-heart";

export const metadata: Metadata = {
  title: "Product Catalogue",
  description:
    "RISITEX wholesale product catalogue browsable by category — innerwear, bottom wear, jeans, and more at factory-direct pricing.",
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams?: Promise<{ cat?: string; category?: string }>;
}) {
  const params = (await searchParams) ?? {};
  // `cat` = Medusa category handle (hierarchical). `category` kept for
  // backwards-compatible legacy links (men/women/…).
  const catHandle = params.cat;

  const [all, tree] = await Promise.all([
    getWholesaleProducts(),
    getCategoryTree(),
  ]);

  const activeNode = catHandle ? findByHandle(tree, catHandle) : null;

  // Products under the selected node (self + descendants). Legacy `?category=`
  // still filters by the flat metadata category so old links don't 404.
  let products: Product[];
  if (activeNode) {
    const handles = new Set(descendantHandles(activeNode));
    products = all.filter((p) =>
      (p.categoryHandles ?? []).some((h) => handles.has(h)),
    );
  } else if (params.category && params.category.toLowerCase() !== "all") {
    const legacy = params.category.toLowerCase();
    products = all.filter((p) => p.category === legacy);
  } else {
    products = all;
  }

  // Drill-down: the trail of ancestors (for going back up) and the children
  // of the current node (for going deeper). At the root we list top-level
  // categories.
  const trail = catHandle ? pathToHandle(tree, catHandle) : [];
  const options: CategoryNode[] = activeNode ? activeNode.children : tree;

  const countUnder = (node: CategoryNode): number => {
    const handles = new Set(descendantHandles(node));
    return all.filter((p) =>
      (p.categoryHandles ?? []).some((h) => handles.has(h)),
    ).length;
  };

  const eyebrowFor = (p: Product): string => {
    const path = deepestPath(tree, p.categoryHandles ?? []);
    if (path.length) return path[path.length - 1]!.name;
    return CATEGORY_LABELS[p.category];
  };

  return (
    <>
      <section className="border-b border-border-subtle">
        <Container>
          <div className="py-16">
            <p className="text-micro text-text-muted">Catalogue</p>
            <h1 className="mt-2 text-display-lg text-text-primary">
              Wholesale Product Catalogue
            </h1>
            <p className="mt-3 max-w-2xl text-body-lg text-text-secondary">
              {activeNode
                ? `${products.length} SKUs in ${trail.map((t) => t.name).join(" › ")}.`
                : `${all.length} SKUs across the full range.`}{" "}
              <B2bPriceGate
                approved={<span>Wholesale pricing visible — account approved.</span>}
                pending={<span>Wholesale pricing visible after account approval.</span>}
                unauthenticated={<span>Sign in to see your personalised tier pricing.</span>}
              />
            </p>
          </div>
        </Container>
      </section>

      <section className="border-b border-border-subtle">
        <Container>
          <div className="space-y-3 pb-6">
            {/* Breadcrumb trail — click any level to jump back up. */}
            <div className="flex flex-wrap items-center gap-2 text-body-sm">
              <Link
                href="/products"
                className={
                  !catHandle
                    ? "rounded-full bg-action-primary-bg px-4 py-1.5 text-action-primary-text font-medium"
                    : "rounded-full border border-border-subtle px-4 py-1.5 text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary"
                }
              >
                All
              </Link>
              {trail.map((node, i) => {
                const isLast = i === trail.length - 1;
                return (
                  <span key={node.handle} className="flex items-center gap-2">
                    <span className="text-text-muted">›</span>
                    <Link
                      href={`/products?cat=${node.handle}`}
                      className={
                        isLast
                          ? "rounded-full bg-action-primary-bg px-4 py-1.5 text-action-primary-text font-medium"
                          : "rounded-full border border-border-subtle px-4 py-1.5 text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary"
                      }
                    >
                      {node.name}
                    </Link>
                  </span>
                );
              })}
            </div>

            {/* Drill-down: children of the current node (or top-level roots). */}
            {options.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {options.map((node) => (
                  <Link
                    key={node.id}
                    href={`/products?cat=${node.handle}`}
                    className="rounded-full border border-border-subtle px-4 py-1.5 text-body-sm text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary"
                  >
                    {node.name}
                    <span className="ml-1 text-caption text-text-muted">
                      ({countUnder(node)})
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Container>
      </section>

      <section className="py-10">
        <Container>
          {products.length === 0 ? (
            <div className="rounded-lg border border-border-subtle bg-surface-sunken p-12 text-center">
              <h3 className="text-heading-md text-text-primary">
                No products in this category yet
              </h3>
              <p className="mt-2 text-body-md text-text-muted">
                Pick another category, or browse the full catalogue.
              </p>
              <Button asChild variant="secondary" className="mt-4">
                <Link href="/products">View all</Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              {products.map((p, idx) => (
                <Link
                  key={p.slug}
                  href={`/wholesale/p/${p.slug}`}
                  className="group block rounded-lg focus-visible:ring-focus"
                >
                  <article className="rounded-lg border border-border-subtle overflow-hidden transition-all duration-base group-hover:shadow-raised">
                    <div className="aspect-square relative bg-surface-sunken ring-1 ring-border-subtle">
                      <Image
                        src={p.image ?? "/demo/products/photo-01.jpg"}
                        alt={p.name}
                        fill
                        priority={idx < 4}
                        sizes="(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 100vw"
                        className="object-cover transition-transform duration-normal group-hover:scale-[1.02]"
                      />
                    </div>
                    <div className="p-4">
                      <p className="text-caption text-text-muted uppercase tracking-wider">
                        {eyebrowFor(p)}
                      </p>
                      <div className="mt-1 flex items-start justify-between gap-2">
                        <h2 className="text-body-md font-medium text-text-primary">
                          {p.name}
                        </h2>
                        <WishlistHeart slug={p.slug} productName={p.name} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-caption">
                        <div>
                          <span className="text-text-muted">MOQ</span>
                          <p className="text-text-primary">
                            {p.moq ? `${p.moq} pcs` : "—"}
                          </p>
                        </div>
                        <B2bPriceGate
                          approved={
                            <div>
                              <span className="text-text-muted">Price</span>
                              <p className="text-text-primary">
                                {p.priceMajor > 0
                                  ? `₹${p.priceMajor.toLocaleString("en-IN")}${p.unit ?? ""}`
                                  : "On request"}
                              </p>
                            </div>
                          }
                          unauthenticated={
                            <div>
                              <span className="text-text-muted">Price</span>
                              <p className="text-text-muted italic">
                                Login to view
                              </p>
                            </div>
                          }
                        />
                      </div>
                      <B2bPriceGate
                        approved={
                          p.tiers && p.tiers.length > 0 ? (
                            <p className="mt-2 text-caption text-brand-accent">
                              From ₹{p.tiers[p.tiers.length - 1]!.pricePerUnitMajor}
                              {p.unit ?? ""} @ {p.tiers[p.tiers.length - 1]!.minQty}+
                            </p>
                          ) : null
                        }
                      />
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          )}
          <SignedOut>
            <div className="mt-10 rounded-lg border border-border-subtle bg-surface-sunken p-8 text-center">
              <h3 className="text-heading-md text-text-primary">
                See Your Personalised Pricing
              </h3>
              <p className="mt-2 text-body-md text-text-secondary">
                Sign in to view tier-specific pricing, volume discounts, and
                place orders.
              </p>
              <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-3">
                <Button asChild>
                  <Link href="/auth/sign-in">Sign In</Link>
                </Button>
                <Button variant="secondary" asChild>
                  <Link href="/auth/sign-up">Apply for Account</Link>
                </Button>
              </div>
            </div>
          </SignedOut>
        </Container>
      </section>
    </>
  );
}
