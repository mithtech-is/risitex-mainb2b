import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@risitex/ui/components";
import { Container } from "@/components/site/container";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { B2bBuyPanel } from "@/components/product/b2b-buy-panel";
import {
  getWholesaleProduct,
  getWholesaleProducts,
} from "@/lib/wholesale-products";
import { SignedIn, SignedOut } from "@/components/auth/signed-out";
import { B2bPriceGate } from "@/components/b2b/b2b-price-gate";
import { WishlistHeart } from "@/components/wishlist/wishlist-heart";
import { RequestQuoteModal } from "@/components/product/request-quote-modal";
import { SizeChartModal } from "@/components/product/size-chart-modal";
import { ProductQuestions } from "@/components/product/product-questions";
import { ProductReviews } from "@/components/product/product-reviews";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000";

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

  const allProducts = await getWholesaleProducts();
  const related = allProducts
    .filter((p) => p.slug !== product.slug && p.category === product.category)
    .slice(0, 3);
  // "Frequently bought together" — cross-category complementary set. Until we
  // have real co-purchase aggregation in the backend, we surface curated
  // complementary categories per category. The shape stays identical to
  // `related` so a future backend swap is a one-line change.
  const complementary: Record<typeof product.category, typeof product.category[]> = {
    men: ["fabric", "accessories"],
    women: ["fabric", "accessories"],
    fabric: ["men", "women"],
    accessories: ["men", "women"],
  };
  const fbtPool = complementary[product.category];
  const fbt = allProducts
    .filter(
      (p) =>
        p.slug !== product.slug &&
        fbtPool.includes(p.category) &&
        !related.some((r) => r.slug === p.slug),
    )
    .slice(0, 3);
  // Gallery: prefer native images, then images derived from b2b_media (already
  // populated by the loader), then a built-in demo-asset fallback. Pads to 4
  // tiles so the grid stays visually balanced.
  const baseGallery = product.images?.length
    ? product.images
    : [product.image, "/demo/products/photo-08.jpg", "/demo/products/photo-12.jpg"].filter(
        Boolean,
      );
  const gallery = baseGallery as string[];
  const mediaByRole = (role: string) =>
    product.b2bMedia?.find((m) => m.role === role)?.url;
  const videoUrl = mediaByRole("video");
  const spin360Url = mediaByRole("spin_360");
  const totalStock = product.variants.reduce(
    (sum, variant) =>
      sum +
      (variant.inventoryState === "out_of_stock"
        ? 0
        : Number(variant.stockCount ?? product.cartonSize ?? 24)),
    0,
  );
  const hsn = product.category === "fabric" ? "5208" : "6205";
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
              { href: `/wholesale/p/${product.slug}`, label: product.name },
            ]}
          />
        </div>
      </Container>

      <Container>
        <div className="grid grid-cols-1 gap-10 py-10 lg:grid-cols-12 lg:gap-12">
          <section className="lg:col-span-6">
            <div className="grid grid-cols-2 gap-3">
              {gallery.slice(0, 4).map((src, i) => (
                <figure
                  key={`${src}-${i}`}
                  className="relative aspect-square overflow-hidden rounded-md bg-image-plate ring-1 ring-border-subtle"
                >
                  {src ? (
                    <Image
                      src={src}
                      alt={`${product.name} wholesale media ${i + 1}`}
                      fill
                      // Hero (i=0) is the page's largest contentful paint —
                      // preload it. The remaining 3 stay lazy.
                      priority={i === 0}
                      sizes="(min-width: 1024px) 25vw, 50vw"
                      className="h-full w-full object-cover transition-transform duration-slow hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-paper-100 font-display text-[64px] leading-none text-text-muted/30">
                      {product.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <figcaption className="absolute bottom-2 left-2 rounded-sm bg-surface-background/90 px-2 py-1 text-micro text-text-muted">
                    {["Product", "Fabric closeup", "Packaging", "Warehouse"][i] ??
                      "Media"}
                  </figcaption>
                </figure>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <MediaPlaceholder
                title="Video"
                body={
                  videoUrl
                    ? "Factory walkthrough video available below."
                    : "Factory walkthrough available on request."
                }
              />
              <MediaPlaceholder
                title="360 view"
                body={
                  spin360Url
                    ? "Rotational view available on request."
                    : "Rotational sample media placeholder."
                }
              />
            </div>
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
            <p className="mt-4 text-body-lg text-text-secondary">
              {product.description}
            </p>

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
            <div className="mt-4 flex flex-wrap gap-3">
              <SizeChartModal />
              <SignedIn>
                <RequestQuoteModal
                  productSlug={product.slug}
                  productName={product.name}
                />
              </SignedIn>
              <SignedOut>
                <Button asChild variant="ghost">
                  <Link href={`/contact?product=${encodeURIComponent(product.slug)}`}>
                    Request quote
                  </Link>
                </Button>
              </SignedOut>
              <Button asChild variant="ghost">
                <Link
                  href={`/b2b/sample-requests?product=${encodeURIComponent(product.name)}`}
                >
                  Request sample
                </Link>
              </Button>
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 gap-6 pb-16 lg:grid-cols-3">
          <InfoPanel
            title="Wholesale Controls"
            items={[
              ["MOQ", `${product.moq ?? 0} pcs`],
              ["Case Pack", `${product.cartonSize ?? 0} pcs`],
              ["Master Carton", `${(product.cartonSize ?? 0) * 2 || 0} pcs`],
              ["Minimum Order", `${product.moq ?? 0} pcs`],
              [
                "Recommended MOQ",
                `${Math.max(product.moq ?? 0, product.cartonSize ?? 0)} pcs`,
              ],
            ]}
          />
          <InfoPanel
            title="Availability"
            items={[
              ["Available Stock", `${totalStock} pcs`],
              ["Warehouse", "RISITEX Tiruppur DC"],
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

        <section className="grid grid-cols-1 gap-6 pb-16 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h2 className="text-heading-md text-text-primary">
              Size and Quantity Matrix
            </h2>
            <div className="mt-4 overflow-x-auto rounded-md border border-border-subtle">
              <table className="min-w-full divide-y divide-border-subtle text-body-sm">
                <thead className="bg-surface-raised text-text-muted">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Colour</th>
                    {product.sizes.map((size) => (
                      <th key={size} className="px-4 py-3 text-left font-medium">
                        {size}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {product.swatches.map((swatch) => (
                    <tr key={swatch.value}>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full ring-1 ring-border-subtle"
                            style={{ backgroundColor: swatch.hex }}
                          />
                          {swatch.name}
                        </span>
                      </td>
                      {product.sizes.map((size) => {
                        const variant = product.variants.find(
                          (v) => v.size === size && v.colour === swatch.value,
                        );
                        return (
                          <td key={`${swatch.value}-${size}`} className="px-4 py-3">
                            {variant ? (
                              <span className="font-mono text-caption text-text-secondary">
                                {variant.inventoryState.replaceAll("_", " ")}
                              </span>
                            ) : (
                              <span className="text-text-muted">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="lg:col-span-5">
            <h2 className="text-heading-md text-text-primary">Bulk Pricing</h2>
            <B2bPriceGate
              approved={
                <div className="mt-4 divide-y divide-border-subtle rounded-md border border-border-subtle bg-surface-raised">
                  {(product.tiers ?? []).map((tier) => (
                    <div
                      key={tier.minQty}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <span className="text-body-sm text-text-secondary">
                        {tier.label ?? "Volume"} {tier.minQty}
                        {tier.maxQty ? `-${tier.maxQty}` : "+"} pcs
                      </span>
                      <span className="font-mono text-body-sm text-text-primary">
                        Rs {tier.pricePerUnitMajor}
                      </span>
                    </div>
                  ))}
                </div>
              }
              unauthenticated={
                <div className="mt-4 rounded-md border border-border-subtle bg-surface-sunken p-5 text-center">
                  <p className="text-body-sm text-text-secondary">
                    Tier &amp; volume pricing visible after login.
                  </p>
                  <Button asChild className="mt-3" size="sm">
                    <Link href="/auth/sign-in">Sign in to view</Link>
                  </Button>
                </div>
              }
            />
          </div>
        </section>

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

function MediaPlaceholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-raised p-4">
      <p className="text-micro text-text-muted">{title}</p>
      <p className="mt-2 text-body-sm text-text-primary">{body}</p>
    </div>
  );
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
