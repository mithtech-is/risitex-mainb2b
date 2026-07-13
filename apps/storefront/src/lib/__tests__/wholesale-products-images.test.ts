import { describe, it, expect } from "vitest";
import { mapMedusaToProduct } from "../wholesale-products";

type LiveArg = Parameters<typeof mapMedusaToProduct>[0];

// Regression: the PDP colour selector swaps the gallery using
// product.imagesByColour[selectedColour]. Admins attach per-colour images via
// the native variant "Media" section (exposed by the store API as
// variant.images), NOT variant.metadata.images. The loader must read that
// native source so selecting "black" shows the black images instead of falling
// back to the shared (blue) product gallery.
function makeLive(): LiveArg {
  return {
    id: "prod_test",
    handle: "ankle-fitted-jeans",
    title: "ankle fitted jeans",
    // Option titles carry a trailing space in real data ("colour ").
    options: [
      { title: "colour ", values: [{ value: "black" }, { value: "blue" }] },
      { title: "size ", values: [{ value: "30" }] },
    ],
    variants: [
      {
        id: "v_black_30",
        sku: null,
        title: "black / 30",
        metadata: { mrp: 250, pack_size: 1 },
        options: [
          { value: "black", option: { title: "colour " } },
          { value: "30", option: { title: "size " } },
        ],
        images: [
          { url: "http://x/black-1.jpg" },
          { url: "http://x/black-2.jpg" },
        ],
      },
      {
        id: "v_blue_30",
        sku: null,
        title: "blue / 30",
        metadata: { mrp: 250, pack_size: 1 },
        options: [
          { value: "blue", option: { title: "colour " } },
          { value: "30", option: { title: "size " } },
        ],
        images: [{ url: "http://x/blue-1.jpg" }],
      },
    ],
    // Shared product-level gallery (what the bug incorrectly falls back to).
    images: [{ url: "http://x/product-shared.jpg" }],
  };
}

describe("mapMedusaToProduct — per-colour images", () => {
  it("populates imagesByColour from native variant media (variant.images)", () => {
    const product = mapMedusaToProduct(makeLive());
    expect(product.imagesByColour?.black).toEqual([
      "http://x/black-1.jpg",
      "http://x/black-2.jpg",
    ]);
    expect(product.imagesByColour?.blue).toEqual(["http://x/blue-1.jpg"]);
  });

  it("still reads legacy variant.metadata.images and unions with native", () => {
    const live = makeLive();
    // A colour whose gallery was seeded the legacy way (metadata.images only).
    live.variants!.push({
      id: "v_green_30",
      sku: null,
      title: "green / 30",
      metadata: { mrp: 250, pack_size: 1, images: ["http://x/green-1.jpg"] },
      options: [
        { value: "green", option: { title: "colour " } },
        { value: "30", option: { title: "size " } },
      ],
      images: [],
    });
    const product = mapMedusaToProduct(live);
    expect(product.imagesByColour?.green).toEqual(["http://x/green-1.jpg"]);
  });
});
