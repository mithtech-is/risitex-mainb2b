import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@risitex/ui/components";
import { Container } from "@/components/site/container";
import { SignedOut, SignedIn } from "@/components/auth/signed-out";
import { getWholesaleProducts } from "@/lib/wholesale-products";
import { CATEGORY_LABELS } from "@/data/products";
import { WishlistHeart } from "@/components/wishlist/wishlist-heart";

export const metadata: Metadata = {
  title: "Product Catalogue",
  description:
    "RISITEX wholesale product catalogue — innerwear, loungewear, fabrics, and accessories at factory-direct pricing.",
};

const CATEGORIES = ["All", ...Object.values(CATEGORY_LABELS)] as const;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams?: Promise<{ category?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const selectedCat = (params.category ?? "all").toLowerCase();

  // Source of truth: same loader as /wholesale/catalogue. This guarantees the
  // card slugs always resolve at the PDP and the price/MOQ render values are
  // tier-aware when the buyer is signed in.
  const all = await getWholesaleProducts();
  const products =
    selectedCat === "all"
      ? all
      : all.filter((p) => p.category === selectedCat);

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
              {all.length} SKUs across innerwear, loungewear, fabric, and
              accessories.{" "}
              <SignedOut>Sign in to see your personalised tier pricing.</SignedOut>
              <SignedIn>Tier pricing applied to your account.</SignedIn>
            </p>
          </div>
        </Container>
      </section>

      <section className="border-b border-border-subtle">
        <Container>
          <div className="flex flex-wrap gap-2 pb-6">
            {CATEGORIES.map((cat) => {
              const key = cat.toLowerCase();
              const isActive = selectedCat === key || (cat === "All" && selectedCat === "all");
              return (
                <Link
                  key={cat}
                  href={cat === "All" ? "/products" : `/products?category=${key}`}
                  className={
                    isActive
                      ? "rounded-full bg-action-primary-bg px-4 py-1.5 text-action-primary-text text-body-sm font-medium"
                      : "rounded-full border border-border-subtle px-4 py-1.5 text-body-sm text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary"
                  }
                >
                  {cat}
                </Link>
              );
            })}
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
                Try a different filter, or browse the full catalogue.
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
                        {CATEGORY_LABELS[p.category]}
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
                        <SignedIn>
                          <div>
                            <span className="text-text-muted">Price</span>
                            <p className="text-text-primary">
                              {p.priceMajor > 0
                                ? `₹${p.priceMajor.toLocaleString("en-IN")}${p.unit ?? ""}`
                                : "On request"}
                            </p>
                          </div>
                        </SignedIn>
                        <SignedOut>
                          <div>
                            <span className="text-text-muted">Price</span>
                            <p className="text-text-muted italic">
                              Login to view
                            </p>
                          </div>
                        </SignedOut>
                      </div>
                      <SignedIn>
                        {p.tiers && p.tiers.length > 0 && (
                          <p className="mt-2 text-caption text-brand-accent">
                            From ₹{p.tiers[p.tiers.length - 1]!.pricePerUnitMajor}
                            {p.unit ?? ""} @ {p.tiers[p.tiers.length - 1]!.minQty}+
                          </p>
                        )}
                      </SignedIn>
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
