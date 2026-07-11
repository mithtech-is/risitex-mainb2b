import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@risitex/ui/components";
import { Container } from "@/components/site/container";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { B2bBuyPanel } from "@/components/product/b2b-buy-panel";
import { ProductGallery } from "@/components/product/product-gallery";
import {
  getWholesaleProduct,
  getWholesaleProducts,
} from "@/lib/wholesale-products";
import { getCategoryTree, deepestPath } from "@/lib/categories";
import { SignedIn, SignedOut } from "@/components/auth/signed-out";
import { B2bPriceGate } from "@/components/b2b/b2b-price-gate";
import { WishlistHeart } from "@/components/wishlist/wishlist-heart";
import { SizeChartModal } from "@/components/product/size-chart-modal";
import { ProductQuestions } from "@/components/product/product-questions";
import { ProductReviews } from "@/components/product/product-reviews";



type Params = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getWholesaleProduct(slug);
  if (!product) return { title: "Not found" };
  return {
    title: `Wholesale - ${product.name}`,
    description: `${product.description} Wholesale pricing from MOQ ${
      product.moq ?? "available"
    } pcs.`,
  };
}

export default async function WholesalePdpPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const product = await getWholesaleProduct(slug);
  if (!product) notFound();

  const sizeChartGarment = garmentFromProduct(product);

  const [allProducts, categoryTree] = await Promise.all([
    getWholesaleProducts(),
    getCategoryTree(),
  ]);
  // Live category path (Men → Bottom Wear → Jeans → Slim) for the breadcrumb.
  const categoryPath = deepestPath(categoryTree, product.categoryHandles ?? []);
  const related = allProducts
    .filter((p) => p.slug !== product.slug && p.category === product.category)
    .slice(0, 3);
  // "Frequently bought together" — men-only catalogue, so surface other men
  // SKUs not already shown in the related set.
  const fbt = allProducts
    .filter(
      (p) =>
        p.slug !== product.slug &&
        !related.some((r) => r.slug === p.slug),
    )
    .slice(0, 3);
  // Gallery: the product's REAL images only (native uploads or loader-derived
  // b2b_media) — no demo padding. A single-image product then renders one
  // large image via <ProductGallery> instead of a lonely half-width tile.
  const galleryImages = (
    product.images?.length
      ? product.images
      : product.image
        ? [product.image]
        : []
  ).filter((u): u is string => !!u);
  const totalStock = product.variants.reduce(
    (sum, variant) =>
      sum +
      (variant.inventoryState === "out_of_stock"
        ? 0
        : Number(variant.stockCount ?? product.cartonSize ?? 24)),
    0,
  );
  const hsn = "6205";
  const gst = product.priceMajor > 1000 ? "12%" : "5%";

  return (
    <>
      <Container>
        <div className="pt-6">
          <Breadcrumb
            items={[
              { href: "/", label: "Home" },
              { href: "/wholesale", label: "Wholesale" },
              { href: "/wholesale/catalogue", label: "Catalogue" },
              ...categoryPath.map((c) => ({
                href: `/wholesale/catalogue?cat=${c.handle}`,
                label: c.name,
              })),
              { href: `/wholesale/p/${product.slug}`, label: product.name },
            ]}
          />
        </div>
      </Container>

      <Container>
        <div className="grid grid-cols-1 gap-10 py-10 lg:grid-cols-12 lg:gap-12">
          <section className="lg:col-span-6">
            <ProductGallery
              images={galleryImages}
              productName={product.name}
            />
          </section>

          <section className="lg:col-span-6">
            <p className="text-micro text-text-muted">
              Wholesale - {product.eyebrow}
            </p>
            <div className="mt-2 flex items-start justify-between gap-3">
              <h1 className="font-display text-display-lg text-text-primary">
                {product.name}
              </h1>
              <WishlistHeart
                slug={product.slug}
                productName={product.name}
                className="mt-1 h-10 w-10"
              />
            </div>

            <div className="mt-8">
              <SignedIn>
                <B2bBuyPanel product={product} />
              </SignedIn>
              <SignedOut>
                <div className="rounded-md border border-border-subtle bg-surface-sunken p-6 text-center">
                  <p className="text-heading-sm text-text-primary">
                    Sign in to view wholesale pricing
                  </p>
                  <p className="mt-2 text-body-sm text-text-muted">
                    Tier pricing, MOQ ladder, volume discounts, bulk-order
                    matrix, and Add-to-Cart unlock for approved B2B buyers
                    only.
                  </p>
                  <div className="mt-5 inline-flex flex-wrap items-center justify-center gap-3">
                    <Button asChild>
                      <Link href="/auth/sign-in">Sign in</Link>
                    </Button>
                    <Button asChild variant="secondary">
                      <Link href="/auth/sign-up">Register</Link>
                    </Button>
                  </div>
                </div>
              </SignedOut>
            </div>
            <div className="mt-4">
              <SizeChartModal garment={sizeChartGarment} />
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 gap-6 pb-16 lg:grid-cols-3">
          <InfoPanel
            title="Wholesale Controls"
            items={[
              ["MOQ", `${product.moq ?? 0} pcs`],
              ["Minimum Order", `${product.moq ?? 0} pcs`],
            ]}
          />
          <InfoPanel
            title="Availability"
            items={[
              ["Available Stock", `${totalStock} pcs`],
              ["Warehouse", "RISITEX Bangalore DC"],
              ["Lead Time", `${product.leadTimeDays ?? 0} days`],
              [
                "Production Time",
                `${Math.max((product.leadTimeDays ?? 14) - 4, 7)} days`,
              ],
              [
                "Availability",
                totalStock > 0 ? "Ready for wholesale" : "Made to order",
              ],
            ]}
          />
          <InfoPanel
            title="Technical Specifications"
            items={[
              ["HSN", hsn],
              ["GST", gst],
              [
                "Fabric",
                product.specs.find((s) => /fabric/i.test(s.label))?.value ??
                  product.eyebrow,
              ],
              [
                "Composition",
                product.specs.find((s) => /composition/i.test(s.label))?.value ??
                  "B2B textile grade",
              ],
              [
                "Weight",
                product.specs.find((s) => /gsm|weight/i.test(s.label))?.value ??
                  "As per spec sheet",
              ],
              ["Country of Origin", "India"],
            ]}
          />
        </div>

        <section className="grid grid-cols-1 gap-6 pb-16 lg:grid-cols-3">
          <TextPanel
            title="Distributor Notes"
            body={
              product.testimonials?.find((t) => /distributor|distribut/i.test(t.name))
                ?.quote ??
              "Priority dispatch is available for carton-aligned orders and territory-backed replenishment plans."
            }
          />
          <TextPanel
            title="Dealer Notes"
            body={
              product.testimonials?.find((t) => /chain|outlet|dealer|metro/i.test(t.name))
                ?.quote ??
              "Samples can be requested before bulk confirmation. Dealer packs are optimized for size-curve planning."
            }
          />
          <TextPanel
            title="Business FAQs"
            body="Purchase orders, wallet payments, credit terms, GST invoices, and sample requests are supported from the B2B dashboard."
          />
        </section>

        <section className="grid grid-cols-1 gap-6 pb-16 lg:grid-cols-2">
          <ProductQuestions
            productId={product.medusaId ?? product.slug}
            metadataQuestions={product.questions}
          />
          <ProductReviews
            productId={product.medusaId ?? product.slug}
            metadataReviews={product.reviews}
          />
        </section>

        <section className="pb-16">
          <h2 className="font-display text-heading-lg text-text-primary">
            Product Description
          </h2>
          <ul className="mt-6 list-disc space-y-2 pl-6 text-body-md text-text-secondary">
            {(
              (product as { descriptionBullets?: string[] }).descriptionBullets
                ?.length
                ? (product as { descriptionBullets?: string[] })
                    .descriptionBullets!
                : product.description
                    .split(/[.\n]+/)
                    .map((s) => s.trim())
                    .filter(Boolean)
            ).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>

        {related.length > 0 && (
          <section className="pb-10">
            <h2 className="text-heading-md text-text-primary">Related products</h2>
            <p className="mt-1 text-body-sm text-text-muted">
              Same category, available for wholesale dispatch.
            </p>
            <ProductCardRow items={related} />
          </section>
        )}

        {fbt.length > 0 && (
          <section className="pb-16">
            <h2 className="text-heading-md text-text-primary">
              Frequently purchased together
            </h2>
            <p className="mt-1 text-body-sm text-text-muted">
              Complementary lines other buyers commonly add to the same order.
            </p>
            <ProductCardRow items={fbt} />
          </section>
        )}
      </Container>
    </>
  );
}

function garmentFromProduct(p: {
  subcategory?: string;
  eyebrow?: string;
}): string | undefined {
  const hay = `${p.subcategory ?? ""} ${p.eyebrow ?? ""}`.toLowerCase();
  if (/boxer|brief|trunk|inner/.test(hay)) return "Innerwear";
  if (/vest/.test(hay)) return "Vest";
  if (/t-?shirt|tee/.test(hay)) return "T-Shirt";
  if (/jean|denim/.test(hay)) return "Jeans";
  if (/trouser|chino|pant/.test(hay)) return "Trouser";
  if (/shirt/.test(hay)) return "Shirt";
  return undefined;
}

function InfoPanel({
  title,
  items,
}: {
  title: string;
  items: [string, string][];
}) {
  return (
    <section className="rounded-md border border-border-subtle bg-surface-raised p-5">
      <h2 className="text-heading-sm text-text-primary">{title}</h2>
      <dl className="mt-4 space-y-3">
        {items.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-body-sm text-text-muted">{label}</dt>
            <dd className="text-right text-body-sm text-text-primary">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function TextPanel({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-md border border-border-subtle bg-surface-raised p-5">
      <h2 className="text-heading-sm text-text-primary">{title}</h2>
      <p className="mt-3 text-body-sm text-text-secondary">{body}</p>
    </section>
  );
}

function ProductCardRow({
  items,
}: {
  items: { slug: string; name: string; eyebrow: string; moq?: number; priceMajor: number }[];
}) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
      {items.map((item) => (
        <Link
          key={item.slug}
          href={`/wholesale/p/${item.slug}`}
          className="rounded-md border border-border-subtle bg-surface-raised p-4 transition-colors duration-fast hover:bg-surface-sunken"
        >
          <p className="text-micro text-text-muted">{item.eyebrow}</p>
          <h3 className="mt-2 text-heading-sm text-text-primary">{item.name}</h3>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-body-sm text-text-muted">MOQ {item.moq ?? 0} pcs</p>
            <B2bPriceGate
              approved={
                item.priceMajor > 0 ? (
                  <p className="font-mono text-body-sm text-text-primary">
                    ₹{item.priceMajor}
                  </p>
                ) : null
              }
            />
          </div>
        </Link>
      ))}
    </div>
  );
}
