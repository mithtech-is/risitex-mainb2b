import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatINR } from "@/lib/format";
import { Container } from "@/components/site/container";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { ProductHero } from "@/components/product/product-hero";
import {
  getWholesaleProduct,
  getWholesaleProducts,
} from "@/lib/wholesale-products";
import { getCategoryTree, deepestPath } from "@/lib/categories";
import type { Product } from "@/data/products";
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
        <ProductHero
          product={product}
          galleryImages={galleryImages}
          sizeChartGarment={sizeChartGarment}
        />

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
  // Only two charts remain: Jeans and Inner Boxer.
  const hay = `${p.subcategory ?? ""} ${p.eyebrow ?? ""}`.toLowerCase();
  if (/boxer|brief|trunk|inner/.test(hay)) return "Inner Boxer";
  if (/jean|denim/.test(hay)) return "Jeans";
  return undefined;
}

function ProductCardRow({
  items,
}: {
  items: Pick<
    Product,
    "slug" | "name" | "eyebrow" | "mrpMajor" | "images" | "image"
  >[];
}) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
      {items.map((item) => {
        const imageUrl = item.images?.[0] ?? item.image;
        return (
          <Link
            key={item.slug}
            href={`/wholesale/p/${item.slug}`}
            className="group overflow-hidden rounded-lg border border-border-subtle bg-surface-raised transition duration-fast hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="aspect-[4/5] w-full overflow-hidden bg-surface-sunken">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt={item.name}
                  className="h-full w-full object-cover transition duration-fast group-hover:scale-[1.03]"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-micro text-text-muted">
                  No image
                </div>
              )}
            </div>
            <div className="p-4">
              <p className="text-micro text-text-muted">{item.eyebrow}</p>
              <h3 className="mt-2 text-heading-sm text-text-primary">
                {item.name}
              </h3>
              {item.mrpMajor ? (
                <p className="mt-3 text-body-sm text-text-primary">
                  {formatINR(item.mrpMajor)}{" "}
                  <span className="text-micro font-normal text-text-muted">
                    MRP
                  </span>
                </p>
              ) : null}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
