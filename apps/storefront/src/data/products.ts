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
  /** e.g. "men", "women", "fabric", "accessories" */
  category: "men" | "women" | "fabric" | "accessories";
  /** FR-2.02 PIX sub-category, e.g. "Woven Inner Boxer", "Boxer Shorts",
   *  "Lounge Shorts", "Pyjama". Optional; drives PLP sub-category filtering. */
  subcategory?: string;
  /** FR-2.02 pattern, e.g. "Solid", "Check", "Print". Optional. */
  pattern?: string;
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
  /** MOQ for wholesale buyers */
  moq?: number;
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

export const PRODUCTS: Product[] = [
  {
    slug: "poplin-shirt-natural",
    name: "Poplin shirt",
    eyebrow: "Men · Shirts",
    category: "men",
    priceMajor: 1899,
    mrpMajor: 2400,
    image: "/demo/products/photo-01.jpg",
    images: [
      "/demo/products/photo-01.jpg",
      "/demo/products/photo-02.jpg",
      "/demo/products/photo-03.jpg",
    ],
    description:
      "Cotton poplin shirt in 60s yarn count. Pre-shrunk, hand-finished placket, French seams. Cut for an easy fit through the chest with a clean tapered waist.",
    specs: [
      { label: "Fabric", value: "100% cotton poplin · 110 GSM" },
      { label: "Yarn count", value: "60s" },
      { label: "Construction", value: "Plain weave" },
      { label: "Finish", value: "Pre-shrunk, mercerised" },
      { label: "Care", value: "Cold wash, line dry, iron warm" },
      { label: "Origin", value: "Tamil Nadu, India" },
    ],
    swatches: [
      { value: "natural", name: "Natural", hex: "#F1ECDF" },
      { value: "indigo", name: "Indigo", hex: "#2A3F7A" },
      { value: "olive", name: "Olive", hex: "#5C6438" },
    ],
    sizes: ["XS", "S", "M", "L", "XL"],
    variants: [
      { id: "v1", sku: "TX-OPL-N-XS-NAT", size: "XS", colour: "natural", inventoryState: "in_stock" },
      { id: "v2", sku: "TX-OPL-N-S-NAT", size: "S", colour: "natural", inventoryState: "in_stock" },
      { id: "v3", sku: "TX-OPL-N-M-NAT", size: "M", colour: "natural", inventoryState: "low_stock", stockCount: 4 },
      { id: "v4", sku: "TX-OPL-N-L-NAT", size: "L", colour: "natural", inventoryState: "in_stock" },
      { id: "v5", sku: "TX-OPL-N-XL-NAT", size: "XL", colour: "natural", inventoryState: "out_of_stock" },
      { id: "v6", sku: "TX-OPL-N-S-IND", size: "S", colour: "indigo", inventoryState: "in_stock" },
      { id: "v7", sku: "TX-OPL-N-M-IND", size: "M", colour: "indigo", inventoryState: "in_stock" },
      { id: "v8", sku: "TX-OPL-N-L-IND", size: "L", colour: "indigo", inventoryState: "in_stock" },
      { id: "v9", sku: "TX-OPL-N-M-OLV", size: "M", colour: "olive", inventoryState: "in_stock" },
      { id: "v10", sku: "TX-OPL-N-L-OLV", size: "L", colour: "olive", inventoryState: "made_to_order" },
    ],
    moq: 240,
    cartonSize: 24,
    leadTimeDays: 14,
    tiers: [
      { minQty: 1, maxQty: 49, pricePerUnitMajor: 1899 },
      { minQty: 50, maxQty: 249, pricePerUnitMajor: 1100, label: "Bronze" },
      { minQty: 250, maxQty: 499, pricePerUnitMajor: 950, label: "Silver" },
      { minQty: 500, maxQty: 999, pricePerUnitMajor: 880, label: "Gold" },
      { minQty: 1000, maxQty: null, pricePerUnitMajor: 820, label: "Platinum" },
    ],
  },
  {
    slug: "handloom-stole",
    name: "Handloom stole",
    eyebrow: "Women · Accessories",
    category: "women",
    priceMajor: 2599,
    mrpMajor: 3200,
    image: "/demo/products/photo-04.jpg",
    images: [
      "/demo/products/photo-04.jpg",
      "/demo/products/photo-05.jpg",
      "/demo/products/photo-06.jpg",
    ],
    description:
      "Woven on a handloom in Erode. Soft cotton-silk blend with subtle slub. Reversible weave reveals a contrast warp.",
    specs: [
      { label: "Fabric", value: "70/30 cotton-silk · 220 GSM" },
      { label: "Dimensions", value: "210 × 80 cm" },
      { label: "Origin", value: "Erode, Tamil Nadu" },
      { label: "Care", value: "Dry clean only" },
    ],
    swatches: [
      { value: "madder", name: "Madder", hex: "#A14826" },
      { value: "sage", name: "Sage", hex: "#5C8C50" },
      { value: "ink", name: "Ink", hex: "#0F0F0D" },
    ],
    sizes: ["—"],
    variants: [
      { id: "h1", sku: "TX-HLS-MDR", size: "—", colour: "madder", inventoryState: "low_stock", stockCount: 6 },
      { id: "h2", sku: "TX-HLS-SGE", size: "—", colour: "sage", inventoryState: "in_stock" },
      { id: "h3", sku: "TX-HLS-INK", size: "—", colour: "ink", inventoryState: "in_stock" },
    ],
    moq: 60,
    cartonSize: 12,
    leadTimeDays: 21,
    tiers: [
      { minQty: 1, maxQty: 23, pricePerUnitMajor: 2599 },
      { minQty: 24, maxQty: 119, pricePerUnitMajor: 1900 },
      { minQty: 120, maxQty: 359, pricePerUnitMajor: 1700 },
      { minQty: 360, maxQty: null, pricePerUnitMajor: 1550 },
    ],
  },
  {
    slug: "poplin-fabric",
    name: "Cotton poplin (60s)",
    eyebrow: "Fabric · Per metre",
    category: "fabric",
    priceMajor: 240,
    unit: "/ metre",
    image: "/demo/products/photo-07.jpg",
    images: [
      "/demo/products/photo-07.jpg",
      "/demo/products/photo-08.jpg",
      "/demo/products/photo-09.jpg",
    ],
    description:
      "Same cotton poplin we use in our shirting, sold per metre. 110 GSM, 56-inch width. Available in six colours.",
    specs: [
      { label: "Composition", value: "100% cotton" },
      { label: "GSM", value: "110" },
      { label: "Width", value: "56 inch (142 cm)" },
      { label: "Finish", value: "Pre-shrunk, mercerised" },
    ],
    swatches: [
      { value: "white", name: "White", hex: "#FFFFFF" },
      { value: "khadi", name: "Khadi", hex: "#F1ECDF" },
      { value: "indigo", name: "Indigo", hex: "#2A3F7A" },
      { value: "charcoal", name: "Charcoal", hex: "#3F3F38" },
      { value: "ochre", name: "Ochre", hex: "#B58A2F" },
      { value: "madder", name: "Madder", hex: "#A14826" },
    ],
    sizes: ["per-metre"],
    variants: [
      { id: "f1", sku: "TX-OPL-WHT", size: "per-metre", colour: "white", inventoryState: "in_stock" },
      { id: "f2", sku: "TX-OPL-KHD", size: "per-metre", colour: "khadi", inventoryState: "in_stock" },
      { id: "f3", sku: "TX-OPL-IND", size: "per-metre", colour: "indigo", inventoryState: "in_stock" },
      { id: "f4", sku: "TX-OPL-CHA", size: "per-metre", colour: "charcoal", inventoryState: "low_stock", stockCount: 18 },
      { id: "f5", sku: "TX-OPL-OCH", size: "per-metre", colour: "ochre", inventoryState: "in_stock" },
      { id: "f6", sku: "TX-OPL-MDR", size: "per-metre", colour: "madder", inventoryState: "pre_order" },
    ],
    moq: 100,
    cartonSize: 50,
    leadTimeDays: 10,
    tiers: [
      { minQty: 1, maxQty: 49, pricePerUnitMajor: 240 },
      { minQty: 50, maxQty: 199, pricePerUnitMajor: 190 },
      { minQty: 200, maxQty: 999, pricePerUnitMajor: 165 },
      { minQty: 1000, maxQty: null, pricePerUnitMajor: 150 },
    ],
  },
  {
    slug: "cropped-jacket",
    name: "Cropped quilted jacket",
    eyebrow: "Women · Outerwear",
    category: "women",
    priceMajor: 4299,
    image: "/demo/products/photo-10.jpg",
    images: [
      "/demo/products/photo-10.jpg",
      "/demo/products/photo-11.jpg",
      "/demo/products/photo-12.jpg",
    ],
    description:
      "Mid-weight quilted jacket with a cropped silhouette. Cotton shell, recycled-fibre fill, ribbed cuffs.",
    specs: [
      { label: "Shell", value: "100% cotton twill" },
      { label: "Fill", value: "Recycled polyester · 120 GSM" },
      { label: "Length", value: "55 cm centre-back" },
      { label: "Care", value: "Cold gentle wash" },
    ],
    swatches: [
      { value: "ink", name: "Ink", hex: "#0F0F0D" },
      { value: "sand", name: "Sand", hex: "#D2BC9A" },
    ],
    sizes: ["XS", "S", "M", "L"],
    variants: [
      { id: "j1", sku: "TX-CRJ-XS-INK", size: "XS", colour: "ink", inventoryState: "made_to_order" },
      { id: "j2", sku: "TX-CRJ-S-INK", size: "S", colour: "ink", inventoryState: "made_to_order" },
      { id: "j3", sku: "TX-CRJ-M-INK", size: "M", colour: "ink", inventoryState: "made_to_order" },
      { id: "j4", sku: "TX-CRJ-L-INK", size: "L", colour: "ink", inventoryState: "made_to_order" },
      { id: "j5", sku: "TX-CRJ-S-SND", size: "S", colour: "sand", inventoryState: "made_to_order" },
      { id: "j6", sku: "TX-CRJ-M-SND", size: "M", colour: "sand", inventoryState: "made_to_order" },
    ],
    moq: 50,
    cartonSize: 10,
    leadTimeDays: 35,
  },
  {
    slug: "linen-trouser",
    name: "Wide-leg linen trouser",
    eyebrow: "Men · Trousers",
    category: "men",
    priceMajor: 2799,
    image: "/demo/products/photo-13.jpg",
    images: [
      "/demo/products/photo-13.jpg",
      "/demo/products/photo-14.jpg",
      "/demo/products/photo-15.jpg",
    ],
    description: "European linen, drop-waist construction, single-pleat front.",
    specs: [
      { label: "Fabric", value: "100% European linen · 180 GSM" },
      { label: "Construction", value: "Single-pleat front, side pockets" },
      { label: "Care", value: "Cold wash, line dry" },
    ],
    swatches: [
      { value: "natural", name: "Natural", hex: "#E4D8C8" },
      { value: "ink", name: "Ink", hex: "#0F0F0D" },
    ],
    sizes: ["28", "30", "32", "34", "36"],
    variants: [
      { id: "l1", sku: "TX-LNT-28-NAT", size: "28", colour: "natural", inventoryState: "in_stock" },
      { id: "l2", sku: "TX-LNT-30-NAT", size: "30", colour: "natural", inventoryState: "in_stock" },
      { id: "l3", sku: "TX-LNT-32-NAT", size: "32", colour: "natural", inventoryState: "in_stock" },
      { id: "l4", sku: "TX-LNT-34-NAT", size: "34", colour: "natural", inventoryState: "low_stock", stockCount: 3 },
      { id: "l5", sku: "TX-LNT-36-NAT", size: "36", colour: "natural", inventoryState: "out_of_stock" },
      { id: "l6", sku: "TX-LNT-30-INK", size: "30", colour: "ink", inventoryState: "in_stock" },
      { id: "l7", sku: "TX-LNT-32-INK", size: "32", colour: "ink", inventoryState: "in_stock" },
    ],
    moq: 120,
    cartonSize: 20,
    leadTimeDays: 18,
  },
  {
    slug: "kurta-shirt",
    name: "Mandarin-collar kurta shirt",
    eyebrow: "Men · Shirts",
    category: "men",
    priceMajor: 2199,
    image: "/demo/products/photo-16.jpg",
    images: [
      "/demo/products/photo-16.jpg",
      "/demo/products/photo-17.jpg",
      "/demo/products/photo-18.jpg",
    ],
    description:
      "Long-line kurta shirt cut from handwoven khadi cotton. Mandarin collar, half placket.",
    specs: [
      { label: "Fabric", value: "Handwoven khadi cotton · 140 GSM" },
      { label: "Length", value: "78 cm centre-back" },
      { label: "Care", value: "Hand wash cold" },
    ],
    swatches: [
      { value: "khadi", name: "Khadi", hex: "#F1ECDF" },
      { value: "indigo", name: "Indigo", hex: "#2A3F7A" },
      { value: "madder", name: "Madder", hex: "#A14826" },
    ],
    sizes: ["S", "M", "L", "XL", "XXL"],
    variants: [
      { id: "k1", sku: "TX-KRT-S-KHD", size: "S", colour: "khadi", inventoryState: "in_stock" },
      { id: "k2", sku: "TX-KRT-M-KHD", size: "M", colour: "khadi", inventoryState: "in_stock" },
      { id: "k3", sku: "TX-KRT-L-KHD", size: "L", colour: "khadi", inventoryState: "in_stock" },
      { id: "k4", sku: "TX-KRT-XL-KHD", size: "XL", colour: "khadi", inventoryState: "in_stock" },
      { id: "k5", sku: "TX-KRT-XXL-KHD", size: "XXL", colour: "khadi", inventoryState: "low_stock", stockCount: 5 },
      { id: "k6", sku: "TX-KRT-M-IND", size: "M", colour: "indigo", inventoryState: "in_stock" },
      { id: "k7", sku: "TX-KRT-M-MDR", size: "M", colour: "madder", inventoryState: "pre_order" },
    ],
    moq: 100,
    cartonSize: 20,
    leadTimeDays: 21,
  },
];

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
  women: "Women",
  fabric: "Fabric",
  accessories: "Accessories",
};
