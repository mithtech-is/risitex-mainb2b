/**
 * Product fixtures — used until Medusa SDK wiring lands in Phase 16. Shape is
 * intentionally close to a Medusa-style product so swapping in real data is a
 * one-line change at the loader boundary.
 */

export type Variant = {
  id: string;
  sku: string;
  /** Size code, e.g. S/M/L/XL or 28/30/32 (or "—" if not size-bound) */
  size: string;
  /** Colourway value matching one of the swatches */
  colour: string;
  /** Current inventory state */
  inventoryState:
  | "in_stock"
  | "low_stock"
  | "out_of_stock"
  | "backorder"
  | "pre_order"
  | "made_to_order"
  | "reserved"
  | "discontinued";
  /** Numeric stock for low_stock badge */
  stockCount?: number;
  /** How many individual pieces this variant contains when sold as a pack.
   *  1 (or absent) = a single piece. e.g. a "30-36" pack of 4 → 4. */
  packSize?: number;
};

export type Swatch = {
  value: string;
  name: string;
  hex: string;
};

export type Product = {
  slug: string;
  /** Live Medusa product id (set by the live loaders; absent for fixtures).
   *  Needed to call /store/b2b-sales/products/:id/pricing. */
  medusaId?: string;
  name: string;
  eyebrow: string;
  /** RISITEX is a men-only catalogue. Kept as a named type so the field
   *  stays explicit and future segments (if ever added) extend here. */
  category: "men";
  /** FR-2.02 PIX sub-category, e.g. "Woven Inner Boxer", "Boxer Shorts",
   *  "Lounge Shorts", "Pyjama". Optional; drives PLP sub-category filtering. */
  subcategory?: string;
  /** FR-2.02 pattern, e.g. "Solid", "Check", "Print". Optional. */
  pattern?: string;
  /** Handles of the Medusa Product Categories this product is linked to
   *  (leaf + any explicitly-tagged ancestors). Drives the hierarchical
   *  catalogue filter and the PDP breadcrumb. Empty for demo fixtures that
   *  aren't linked to a live category. */
  categoryHandles?: string[];
  /** Base wholesale catalogue price in major rupees */
  priceMajor: number;
  /** Optional MRP in major rupees */
  mrpMajor?: number;
  /** B2B unit suffix shown beside price */
  unit?: string;
  /** Primary product image URL (Medusa thumbnail). When absent, cards
   *  and the PDP fall back to the placeholder plate. */
  image?: string;
  /** Additional gallery image URLs for the PDP. */
  images?: string[];
  /** Per-colour image galleries, keyed by swatch value. Sourced from each
   *  colour variant's `metadata.images` (admin uploads). When a colour has no
   *  images the PDP falls back to the shared product `images`. */
  imagesByColour?: Record<string, string[]>;
  /** Per-colour MRP (retail price), keyed by swatch value. Sourced from each
   *  colour variant's `metadata.mrp`. PDP shows the selected colour's MRP,
   *  falling back to `mrpMajor`. */
  mrpByColour?: Record<string, number>;
  /** Long description (PDP) */
  description: string;
  /** Bullet specs */
  specs: { label: string; value: string }[];
  swatches: Swatch[];
  sizes: string[];
  /** Variants matrix — every (size, colour) combo */
  variants: Variant[];
  /** B2B tier pricing — optional */
  tiers?: {
    minQty: number;
    maxQty: number | null;
    pricePerUnitMajor: number;
    label?: string;
  }[];
  /** MOQ for wholesale buyers (min order qty from the B2B quantity rule) */
  moq?: number;
  /** Max order qty from the B2B quantity rule (null/undefined = no cap) */
  maxQty?: number;
  /** Master carton size */
  cartonSize?: number;
  /** Lead time in days for B2B */
  leadTimeDays?: number;
  /** Role-tagged demo media (video / 360 / warehouse / factory / etc.). When
   *  real assets land, the PDP keeps reading the same shape — seeder is a
   *  drop-in replacement. */
  b2bMedia?: { role: string; url: string; alt?: string }[];
  /** Downloadable documents — catalogue PDFs, spec sheets, compliance. */
  documents?: { type: string; title: string; url: string }[];
  /** Product reviews. */
  reviews?: { rating: number; buyer_type: string; body: string }[];
  /** Common buyer Q&A. */
  questions?: { question: string; answer: string }[];
  /** Distributor / dealer testimonials. */
  testimonials?: { name: string; quote: string }[];
};

export const PRODUCTS: Product[] = [];

export function getProduct(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

export function getProductsByCategory(
  category?: Product["category"] | "all",
): Product[] {
  if (!category || category === "all") return PRODUCTS;
  return PRODUCTS.filter((p) => p.category === category);
}

export const CATEGORY_LABELS: Record<Product["category"], string> = {
  men: "Men",
};
