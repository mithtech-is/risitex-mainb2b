import "server-only";
import { medusa } from "./medusa";
import { PRODUCTS, type Product } from "@/data/products";

/**
 * Product loader with graceful fallback.
 *
 * If the Medusa backend has products + a configured publishable key, return
 * them — adapted to the storefront's local `Product` shape. Otherwise (no
 * backend, no key, or zero products in store), fall back to bundled fixtures.
 *
 * Phase 16 wiring is intentionally permissive: the storefront has to be
 * inspectable even with the backend down, because the backend's
 * publishable-key plumbing is a Phase 6 follow-up.
 */
export async function listProducts(): Promise<Product[]> {
  try {
    if (!process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY) {
      return PRODUCTS;
    }
    const result = await medusa().store.product.list({ limit: 50 });
    if (!result.products?.length) return PRODUCTS;
    return result.products.map(adaptMedusaProduct);
  } catch {
    return PRODUCTS;
  }
}

export async function getProductBySlug(
  slug: string,
): Promise<Product | undefined> {
  try {
    if (!process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY) {
      return PRODUCTS.find((p) => p.slug === slug);
    }
    const result = await medusa().store.product.list({
      handle: slug,
      limit: 1,
    });
    const first = result.products?.[0];
    if (!first) return PRODUCTS.find((p) => p.slug === slug);
    return adaptMedusaProduct(first);
  } catch {
    return PRODUCTS.find((p) => p.slug === slug);
  }
}

/**
 * Bridge between Medusa's product shape and the storefront's. Many fields
 * (tiers, MOQ, carton size, lead time) live in our custom modules — for now
 * we read them from product.metadata if present, else fall back to undefined.
 *
 * This adapter intentionally stays loose. Sharpening the contract is a later
 * phase once we know which fields Medusa enriches by default and which we
 * decorate via custom modules.
 */
type MedusaProduct = {
  id: string;
  title: string;
  handle?: string | null;
  description?: string | null;
  thumbnail?: string | null;
  metadata?: Record<string, unknown> | null;
  variants?: Array<{
    id: string;
    sku?: string | null;
    title?: string | null;
    inventory_quantity?: number | null;
    calculated_price?: { calculated_amount?: number | null } | null;
  }> | null;
};

function adaptMedusaProduct(p: MedusaProduct): Product {
  const meta = (p.metadata ?? {}) as Record<string, unknown>;
  const slug = (p.handle ?? p.id).toString();
  const category =
    (meta.category as Product["category"]) ??
    inferCategoryFromTitle(p.title);

  const variants =
    p.variants?.map((v) => ({
      id: v.id,
      sku: v.sku ?? v.id,
      size: parseSizeFromTitle(v.title ?? "") ?? "—",
      colour: parseColourFromTitle(v.title ?? "") ?? "default",
      inventoryState:
        (v.inventory_quantity ?? 0) > 10
          ? ("in_stock" as const)
          : (v.inventory_quantity ?? 0) > 0
            ? ("low_stock" as const)
            : ("out_of_stock" as const),
      stockCount: v.inventory_quantity ?? undefined,
    })) ?? [];

  const priceMinor =
    p.variants?.[0]?.calculated_price?.calculated_amount ?? 0;

  return {
    slug,
    name: p.title,
    eyebrow: (meta.eyebrow as string) ?? humaniseCategory(category),
    category,
    priceMajor: Math.round(priceMinor / 100),
    description: p.description ?? "",
    specs: (meta.specs as Product["specs"]) ?? [],
    swatches: (meta.swatches as Product["swatches"]) ?? [
      { value: "default", name: "Default", hex: "#F1ECDF" },
    ],
    sizes: (meta.sizes as string[]) ?? ["—"],
    variants,
    moq: meta.moq as number | undefined,
    cartonSize: meta.cartonSize as number | undefined,
    leadTimeDays: meta.leadTimeDays as number | undefined,
    tiers: meta.tiers as Product["tiers"],
    unit: meta.unit as string | undefined,
    mrpMajor: meta.mrpMajor as number | undefined,
  };
}

function inferCategoryFromTitle(_title: string): Product["category"] {
  // Men-only catalogue.
  return "men";
}

function humaniseCategory(_c: Product["category"]): string {
  return "Men";
}

function parseSizeFromTitle(t: string): string | undefined {
  const m = t.match(/\b(XS|S|M|L|XL|XXL|2XL|3XL|28|30|32|34|36|38)\b/i);
  return m?.[0]?.toUpperCase();
}

function parseColourFromTitle(t: string): string | undefined {
  const colours = ["white", "black", "natural", "indigo", "olive", "khadi", "madder", "sand", "ink", "sage"];
  const lower = t.toLowerCase();
  for (const c of colours) if (lower.includes(c)) return c;
  return undefined;
}
