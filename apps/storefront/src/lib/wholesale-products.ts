import type { Product, Swatch, Variant } from "@/data/products";
import { PRODUCTS } from "@/data/products";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000";
const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

const LIVE_PRODUCT_FIELDS = [
  "id",
  "handle",
  "title",
  "subtitle",
  "description",
  "thumbnail",
  "material",
  "hs_code",
  "origin_country",
  "weight",
  "metadata",
  "*images",
  "*options",
  "*options.values",
  "*variants",
  "*variants.options",
  "*variants.calculated_price",
  "categories.id",
  "categories.name",
  "categories.handle",
  "categories.parent_category_id",
  "type.value",
].join(",");

async function fetchB2bPricing(productId: string): Promise<B2bPricing | null> {
  try {
    const res = await fetch(
      `${BACKEND_URL}/store/b2b-sales/products/${productId}/pricing`,
      {
        headers: { "x-publishable-api-key": PUB_KEY },
        next: { revalidate: 120, tags: ["products"] },
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as B2bPricing;
  } catch {
    return null;
  }
}

type B2bPricing = {
  price_tiers?: {
    min_quantity: number;
    max_quantity: number | null;
    value: number;
    is_percentage: boolean;
  }[];
  quantity_rule?: {
    min_qty: number | null;
    max_qty: number | null;
    step_qty: number | null;
  } | null;
};

function overlayB2b(product: Product, pricing: B2bPricing | null): Product {
  if (!pricing) return product;
  const tiers = (pricing.price_tiers ?? [])
    .map((t) => {
      const pricePerUnitMajor = t.is_percentage
        ? Math.round(product.priceMajor * (1 - t.value / 100))
        : Math.round(t.value / 100);
      const label = t.max_quantity
        ? `${t.min_quantity}–${t.max_quantity}`
        : `${t.min_quantity}+`;
      return { minQty: t.min_quantity, maxQty: t.max_quantity, pricePerUnitMajor, label };
    })
    .sort((a, b) => a.minQty - b.minQty);
  const moq = pricing.quantity_rule?.min_qty ?? undefined;
  const cartonSize = pricing.quantity_rule?.step_qty ?? undefined;
  return { ...product, ...(tiers.length ? { tiers } : {}), ...(moq ? { moq } : {}), ...(cartonSize ? { cartonSize } : {}) };
}

// ────────────────────────────────────────────────────────────────────────────
// Live Medusa → fixture Product mapper. Used when a PDP slug doesn't match
// any local fixture (i.e. the product was seeded directly in Medusa). The
// fixture shape stays the contract for downstream components so the PDP /
// matrix grid / buy panel keep working identically.
// ────────────────────────────────────────────────────────────────────────────

type LiveOptionValue = { value: string; option?: { title?: string | null } | null };
type LiveVariant = {
  id: string;
  sku: string | null;
  title?: string | null;
  metadata?: Record<string, unknown> | null;
  options?: LiveOptionValue[] | null;
  calculated_price?: {
    calculated_amount?: number | null;
    original_amount?: number | null;
    currency_code?: string | null;
  } | null;
};
type LiveOption = { title?: string | null; values?: { value: string }[] | null };
type LiveImage = { url?: string | null };
type LiveProduct = {
  id: string;
  handle: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  thumbnail?: string | null;
  material?: string | null;
  hs_code?: string | null;
  origin_country?: string | null;
  weight?: number | null;
  metadata?: Record<string, unknown> | null;
  images?: LiveImage[] | null;
  options?: LiveOption[] | null;
  variants?: LiveVariant[] | null;
  categories?:
    | { id: string; name: string; handle: string; parent_category_id?: string | null }[]
    | null;
  type?: { value?: string | null } | null;
};

function findOption(options: LiveOption[] | null | undefined, name: RegExp) {
  return options?.find((o) => o.title && name.test(o.title));
}

function getOptionValueByTitle(
  variant: LiveVariant,
  optionTitleRe: RegExp,
): string | undefined {
  const match = (variant.options ?? []).find(
    (o) => o.option?.title && optionTitleRe.test(o.option.title),
  );
  return match?.value;
}

const DEFAULT_SWATCHES: Swatch[] = [
  { value: "natural", name: "Natural", hex: "#E9DCC4" },
];

function colourHexFromName(name: string): string {
  const key = name.toLowerCase();
  // A small, conservative palette so the swatch dot reads something other than
  // grey when we don't know the brand colour token yet.
  if (/black|charcoal|graphite/.test(key)) return "#1F1B16";
  if (/white|ivory|chalk/.test(key)) return "#F4EFE6";
  if (/natural|ecru|sand|oat|beige/.test(key)) return "#E9DCC4";
  if (/indigo|navy|denim/.test(key)) return "#2A3F66";
  if (/khadi|stone/.test(key)) return "#BCB29C";
  if (/madder|brick|terracotta|rust/.test(key)) return "#9B4B3A";
  if (/olive|moss|sage/.test(key)) return "#7A8268";
  if (/grey|gray/.test(key)) return "#A6A19C";
  return "#C7BFAE";
}

function inferCategory(_p: LiveProduct): Product["category"] {
  // Men-only catalogue — the product hierarchy is expressed via Medusa
  // Product Categories (see categoryHandles), not this coarse flag.
  return "men";
}

function inferEyebrow(p: LiveProduct, category: Product["category"]): string {
  const meta = (p.metadata ?? {}) as Record<string, unknown>;
  const rawCat = (meta.category as string | undefined) ?? category;
  const sub = (meta.subcategory as string | undefined) ?? (meta.sub_category as string | undefined);
  const title = rawCat.charAt(0).toUpperCase() + rawCat.slice(1);
  return sub ? `${title} · ${sub}` : title;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

function mapMedusaToProduct(p: LiveProduct): Product {
  const meta = (p.metadata ?? {}) as Record<string, unknown>;
  const variants = p.variants ?? [];
  const sizeOption = findOption(p.options, /^size$/i);
  const colourOption = findOption(p.options, /^(colou?r|color)$/i);

  const sizes: string[] = sizeOption?.values?.map((v) => v.value).filter(Boolean) ?? [];
  if (sizes.length === 0) sizes.push("Unit");

  const colourValues: string[] =
    colourOption?.values?.map((v) => v.value).filter(Boolean) ??
    ((meta.colours as string[] | undefined) ?? []);
  const swatches: Swatch[] =
    colourValues.length > 0
      ? colourValues.map((c) => ({
          value: c.toLowerCase().replace(/\s+/g, "-"),
          name: c,
          hex: colourHexFromName(c),
        }))
      : DEFAULT_SWATCHES;

  // Build variants matrix from real Medusa variants when both Size and Colour
  // exist; otherwise synthesize one row per real variant (size or unit-only).
  const matrix: Variant[] = [];
  if (variants.length > 0) {
    for (const v of variants) {
      const size = getOptionValueByTitle(v, /^size$/i) ?? "Unit";
      const colourVal =
        getOptionValueByTitle(v, /^(colou?r|color)$/i)?.toLowerCase().replace(/\s+/g, "-") ??
        swatches[0]?.value ??
        "natural";
      matrix.push({
        id: v.id,
        sku: v.sku ?? `${p.handle}-${size}-${colourVal}`,
        size,
        colour: colourVal,
        inventoryState: "in_stock",
      });
    }
  } else {
    // No variants — synthesize a single (size × colour) cell.
    for (const size of sizes) {
      for (const sw of swatches) {
        matrix.push({
          id: `${p.id}-${size}-${sw.value}`,
          sku: `${p.handle}-${size}-${sw.value}`,
          size,
          colour: sw.value,
          inventoryState: "in_stock",
        });
      }
    }
  }

  // Lowest variant calculated_price → priceMajor (minor units / 100). Fallback
  // to 0 so the page renders rather than 500's. Storefront UI handles "0".
  const calculatedMinor = variants
    .map((v) => v.calculated_price?.calculated_amount)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const priceMajor = calculatedMinor.length
    ? Math.round(Math.min(...calculatedMinor) / 100)
    : 0;
  const originalMinor = variants
    .map((v) => v.calculated_price?.original_amount)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const mrpMajor = originalMinor.length
    ? Math.round(Math.max(...originalMinor) / 100)
    : undefined;

  const category = inferCategory(p);

  // Build a specs panel from anything we know about the product. We avoid
  // empty values so the PDP doesn't show blank rows.
  const specs: { label: string; value: string }[] = [];
  const fabric = str(meta.fabric) ?? str(p.material);
  if (fabric) specs.push({ label: "Fabric", value: fabric });
  const composition = str(meta.composition);
  if (composition) specs.push({ label: "Composition", value: composition });
  const gsm = num(meta.gsm);
  if (gsm) specs.push({ label: "Weight", value: `${gsm} GSM` });
  const yarn = str(meta.yarn_count) ?? str(meta.yarn);
  if (yarn) specs.push({ label: "Yarn count", value: yarn });
  if (p.hs_code || meta.hsn_code) {
    specs.push({ label: "HSN", value: String(p.hs_code ?? meta.hsn_code) });
  }
  if (p.origin_country) specs.push({ label: "Country of Origin", value: p.origin_country });
  if (specs.length === 0) {
    specs.push({ label: "Trade grade", value: "B2B wholesale" });
  }

  // Pull native Medusa images first, then layer demo media seeded via
  // metadata.b2b_media (role-tagged, see seed-b2b-demo-media.ts). When the
  // product later gets real uploads to images[], those automatically take
  // precedence — the demo media falls back without code changes.
  const nativeImages = (p.images ?? [])
    .map((i) => i.url)
    .filter((u): u is string => !!u);
  const rawB2bMedia = Array.isArray(meta.b2b_media)
    ? (meta.b2b_media as { role?: string; url?: string; alt?: string }[])
    : [];
  const seededImages = rawB2bMedia
    .filter((m) => m.url && /^(product|lifestyle|fabric_closeup|warehouse|packaging|factory)$/.test(m.role ?? ""))
    .map((m) => m.url as string);
  const images = nativeImages.length ? nativeImages : seededImages;

  const slug = p.handle;
  const name = p.title;
  const description =
    str(p.description) ??
    (str(p.subtitle) ?? "Wholesale-grade textile product. Specifications and bulk pricing on request.");

  // Pass through role-tagged demo media + the structured demo bundles so the
  // PDP can render them without re-querying. When real assets exist on the
  // product, the seeder leaves these alone — so this code path always reads
  // whatever's there (demo or real) and renders identically.
  const b2bMedia = rawB2bMedia
    .filter((m): m is { role: string; url: string; alt?: string } => !!m.role && !!m.url)
    .map((m) => ({ role: m.role, url: m.url, alt: m.alt }));
  const documents = Array.isArray(meta.b2b_documents)
    ? (meta.b2b_documents as { type: string; title: string; url: string }[])
    : undefined;
  const reviews = Array.isArray(meta.b2b_reviews)
    ? (meta.b2b_reviews as { rating: number; buyer_type: string; body: string }[])
    : undefined;
  const questions = Array.isArray(meta.b2b_questions)
    ? (meta.b2b_questions as { question: string; answer: string }[])
    : undefined;
  const testimonials = Array.isArray(meta.b2b_testimonials)
    ? (meta.b2b_testimonials as { name: string; quote: string }[])
    : undefined;

  const categoryHandles = (p.categories ?? [])
    .map((c) => c.handle)
    .filter((h): h is string => !!h);

  return {
    slug,
    medusaId: p.id,
    name,
    eyebrow: inferEyebrow(p, category),
    category,
    subcategory: str(meta.subcategory),
    pattern: str(meta.pattern),
    categoryHandles,
    priceMajor,
    mrpMajor,
    unit: "/ pc",
    image: p.thumbnail ?? images[0],
    images: images.length ? images : undefined,
    description,
    specs,
    swatches,
    sizes,
    variants: matrix,
    moq: num(meta.moq) ?? 50,
    cartonSize: num(meta.case_pack) ?? num(meta.carton_size) ?? 12,
    leadTimeDays: num(meta.lead_time_days) ?? 14,
    b2bMedia: b2bMedia.length ? b2bMedia : undefined,
    documents,
    reviews,
    questions,
    testimonials,
  };
}

async function fetchLiveByHandle(handle: string): Promise<LiveProduct | null> {
  try {
    const url = `${BACKEND_URL}/store/products?handle=${encodeURIComponent(handle)}&limit=1&fields=${encodeURIComponent(LIVE_PRODUCT_FIELDS)}`;
    const res = await fetch(url, {
      headers: { "x-publishable-api-key": PUB_KEY },
      next: { revalidate: 60, tags: ["products"] },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { products?: LiveProduct[] };
    return data.products?.[0] ?? null;
  } catch {
    return null;
  }
}

// System / utility products that exist for internal plumbing (e.g. the
// generic checkout line item that /store/checkout/begin resolves) but must
// never surface in the storefront catalogue or on a PDP.
const HIDDEN_HANDLES = new Set(["risitex-storefront-line-item"]);

async function fetchAllLive(): Promise<LiveProduct[]> {
  try {
    const url = `${BACKEND_URL}/store/products?limit=100&fields=${encodeURIComponent(LIVE_PRODUCT_FIELDS)}`;
    const res = await fetch(url, {
      headers: { "x-publishable-api-key": PUB_KEY },
      next: { revalidate: 60, tags: ["products"] },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { products?: LiveProduct[] };
    return data.products ?? [];
  } catch {
    return [];
  }
}

/** Map of lowercased category name → handle, for the Type→category bridge. */
async function fetchCategoryHandleByName(): Promise<Map<string, string>> {
  try {
    const url = `${BACKEND_URL}/store/product-categories?limit=500&fields=name,handle`;
    const res = await fetch(url, {
      headers: { "x-publishable-api-key": PUB_KEY },
      next: { revalidate: 30, tags: ["products"] },
    });
    if (!res.ok) return new Map();
    const data = (await res.json()) as {
      product_categories?: { name: string; handle: string }[];
    };
    const map = new Map<string, string>();
    for (const c of data.product_categories ?? []) {
      if (c.name && c.handle) map.set(c.name.trim().toLowerCase(), c.handle);
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Product Type → category bridge. If the admin set the product's Type to a
 * value matching a category name (e.g. Type "Inner Boxers"), the product is
 * treated as belonging to that category even when only a parent category
 * (or none) was ticked. Makes placement forgiving: picking the Type — or the
 * category — is enough for the product to appear in the right place.
 */
function bridgeTypeToCategory(
  handles: string[],
  live: LiveProduct,
  nameToHandle: Map<string, string>,
): string[] {
  const typeVal = live.type?.value?.trim().toLowerCase();
  if (!typeVal) return handles;
  const h = nameToHandle.get(typeVal);
  if (h && !handles.includes(h)) return [...handles, h];
  return handles;
}

export async function getWholesaleProducts(): Promise<Product[]> {
  // Live products take precedence over fixtures sharing the same slug so the
  // catalogue reflects what's actually orderable in Medusa. Fixtures fill in
  // the long-tail demo content (poplin, kurta, etc.) until those land in the
  // backend.
  const [liveRaw, nameToHandle] = await Promise.all([
    fetchAllLive(),
    fetchCategoryHandleByName(),
  ]);
  const live = liveRaw.filter((p) => !HIDDEN_HANDLES.has(p.handle));
  const liveMapped = await Promise.all(
    live.map(async (p) => {
      const mapped = mapMedusaToProduct(p);
      mapped.categoryHandles = bridgeTypeToCategory(
        mapped.categoryHandles ?? [],
        p,
        nameToHandle,
      );
      return overlayB2b(mapped, await fetchB2bPricing(p.id));
    }),
  );
  const liveSlugs = new Set(liveMapped.map((p) => p.slug));
  const fixturesWithOverlay = await Promise.all(
    PRODUCTS.filter((p) => !liveSlugs.has(p.slug)).map(async (p) =>
      p.medusaId ? overlayB2b(p, await fetchB2bPricing(p.medusaId)) : p,
    ),
  );
  return [...liveMapped, ...fixturesWithOverlay];
}

export async function getWholesaleProduct(handle: string): Promise<Product | null> {
  // Hidden system products (e.g. the checkout line item) have no PDP.
  if (HIDDEN_HANDLES.has(handle)) return null;
  // 1) Live Medusa product takes precedence — that's the source of truth.
  const live = await fetchLiveByHandle(handle);
  if (live) {
    const nameToHandle = await fetchCategoryHandleByName();
    const mapped = mapMedusaToProduct(live);
    mapped.categoryHandles = bridgeTypeToCategory(
      mapped.categoryHandles ?? [],
      live,
      nameToHandle,
    );
    return overlayB2b(mapped, await fetchB2bPricing(live.id));
  }
  // 2) Fall back to fixture for demo / pre-seed handles.
  const product = PRODUCTS.find((p) => p.slug === handle) ?? null;
  if (!product) return null;
  if (!product.medusaId) return product;
  return overlayB2b(product, await fetchB2bPricing(product.medusaId));
}
