"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@risitex/ui/components";
import type { Product } from "@/data/products";
import { formatINR } from "@/lib/format";
import { ProductGallery } from "@/components/product/product-gallery";
import { B2bBuyPanel } from "@/components/product/b2b-buy-panel";
import { ColourSelector } from "@/components/product/colour-selector";
import { SizeChartModal } from "@/components/product/size-chart-modal";
import { WishlistHeart } from "@/components/wishlist/wishlist-heart";
import { SignedIn, SignedOut } from "@/components/auth/signed-out";

/**
 * Interactive PDP hero. Holds the selected colour and drives — from Medusa
 * variant data only — the gallery, colour cards, title, and the colour-scoped
 * Bulk Order Grid. Adding a new colour variant + its images in the admin makes
 * a new card appear automatically; no code changes required.
 */
export function ProductHero({
  product,
  galleryImages,
  sizeChartGarment,
}: {
  product: Product;
  /** Shared product images — fallback gallery when a colour has none. */
  galleryImages: string[];
  sizeChartGarment?: string;
}) {
  const swatches = product.swatches ?? [];
  const [selectedColour, setSelectedColour] = React.useState<string>(
    swatches[0]?.value ?? "",
  );

  const hasColours = swatches.length > 1;
  const selectedName = swatches.find((s) => s.value === selectedColour)?.name;

  // Gallery: the selected colour's own images, falling back to the shared
  // product gallery when that colour hasn't had images uploaded yet.
  const colourImages = product.imagesByColour?.[selectedColour];
  const heroImages =
    colourImages && colourImages.length > 0 ? colourImages : galleryImages;

  const title =
    hasColours && selectedName ? `${product.name} — ${selectedName}` : product.name;

  // MRP for the selected colour (per-variant), falling back to the product MRP.
  const mrp = product.mrpByColour?.[selectedColour] ?? product.mrpMajor;

  return (
    <div className="grid grid-cols-1 gap-10 py-10 lg:grid-cols-12 lg:gap-12">
      <section className="lg:col-span-6">
        {/* key forces the gallery to reset to image 1 when the colour changes */}
        <ProductGallery
          key={selectedColour}
          images={heroImages}
          productName={title}
        />
      </section>

      <section className="lg:col-span-6">
        <p className="text-micro text-text-muted">Wholesale - {product.eyebrow}</p>
        <div className="mt-2 flex items-start justify-between gap-3">
          <h1 className="font-display text-display-lg text-text-primary">{title}</h1>
          <WishlistHeart
            slug={product.slug}
            productName={product.name}
            className="mt-1 h-10 w-10"
          />
        </div>
        {mrp ? (
          <p className="mt-3 text-heading-md text-text-primary">
            {formatINR(mrp)}{" "}
            <span className="text-body-sm font-normal text-text-muted">
              / pc · MRP (incl. GST)
            </span>
          </p>
        ) : null}

        {hasColours && (
          <div className="mt-6">
            <ColourSelector
              swatches={swatches}
              imagesByColour={product.imagesByColour}
              fallbackImage={product.image ?? galleryImages[0]}
              value={selectedColour}
              onChange={setSelectedColour}
            />
          </div>
        )}

        <div className="mt-8">
          <SignedIn>
            <B2bBuyPanel product={product} selectedColour={selectedColour} />
          </SignedIn>
          <SignedOut>
            <div className="rounded-md border border-border-subtle bg-surface-sunken p-6 text-center">
              <p className="text-heading-sm text-text-primary">
                Sign in to view wholesale pricing
              </p>
              <p className="mt-2 text-body-sm text-text-muted">
                Tier pricing, MOQ ladder, volume discounts, bulk-order matrix,
                and Add-to-Cart unlock for approved B2B buyers only.
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
  );
}
