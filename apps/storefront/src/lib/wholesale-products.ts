import type { Product, Swatch, Variant } from "@/data/products";
import { PRODUCTS } from "@/data/products";

// These loaders run server-side only (RSC/SSR). Prefer an internal base URL so
// server→backend calls skip Caddy/TLS and go straight to Medusa on localhost.
// MEDUSA_INTERNAL_URL and INTERNAL_API_KEY are non-public env vars, so they are
// never inlined into client bundles — client code falls back to the public URL.
const BACKEND_URL =
  process.env.MEDUSA_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ??
  "http://localhost:9000";
const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? "";

// Headers for server-side calls. x-internal-key exempts this trusted SSR
// traffic from the public store rate limiter (backend storeLimiter.skip) — the
// catalogue fans out one b2b-sales call per product, which would otherwise
// saturate the 60/min public bucket and break pricing + the visibility gate.
const SERVER_HEADERS: Record<string, string> = {
  "x-publishable-api-key": PUB_KEY,
  ...(INTERNAL_KEY ? { "x-internal-key": INTERNAL_KEY } : {}),
};

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
  "*variants.metadata",
  "categories.id",
  "categories.name",
  "categories.handle",
  "categories.parent_category_id",
].join(",");

async function fetchB2bPricing(productId: string): Promise<B2bPricing | null> {
  try {
    const res = await fetch(
      `${BACKEND_URL}/store/b2b-sales/products/${productId}/pricing`,
      {
        headers: SERVER_HEADERS,
        // Always fresh: this carries the B2B visibility flag, so hiding a
        // product in the admin must drop it from the catalogue immediately
        // (matches the no-store category tree).
        cache: "no-store",
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
  /** B2B visibility gate — false when an admin visibility rule hides this
   *  product from the buyer's audience. Hidden products are dropped from the
   *  catalogue and their PDP 404s. */
  visible?: boolean;
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
  const maxQty = pricing.quantity_rule?.max_qty ?? undefined;
  const cartonSize = pricing.quantity_rule?.step_qty ?? undefined;
  return {
    ...product,
    ...(tiers.length ? { tiers } : {}),
    ...(moq ? { moq } : {}),
    ...(maxQty ? { maxQty } : {}),
    ...(cartonSize ? { cartonSize } : {}),
  };
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
};

// Option titles are matched against anchored regexes, but admins routinely
// type a stray trailing/leading space (e.g. "colour "). Trim before testing so
// "colour "/" Size" still resolve — otherwise a whole option (and its colour
// swatches) silently vanishes from the storefront matrix.
function findOption(options: LiveOption[] | null | undefined, name: RegExp) {
  return options?.find((o) => o.title && name.test(o.title.trim()));
}

function getOptionValueByTitle(
  variant: LiveVariant,
  optionTitleRe: RegExp,
): string | undefined {
  const match = (variant.options ?? []).find(
    (o) => o.option?.title && optionTitleRe.test(o.option.title.trim()),
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
  // Per-colour image galleries. Admins upload images against a colour variant
  // (stored on variant `metadata.images`); we union them per colour so the PDP
  // gallery + colour cards can switch without any hardcoded image lists.
  const imagesByColour: Record<string, string[]> = {};
  // Per-colour MRP (admins set `metadata.mrp` per variant). First non-null per
  // colour wins; the PDP shows the selected colour's MRP.
  const mrpByColour: Record<string, number> = {};
  if (variants.length > 0) {
    for (const v of variants) {
      const size = getOptionValueByTitle(v, /^size$/i) ?? "Unit";
      const colourVal =
        getOptionValueByTitle(v, /^(colou?r|color)$/i)?.toLowerCase().replace(/\s+/g, "-") ??
        swatches[0]?.value ??
        "natural";
      const vMeta = (v.metadata ?? {}) as Record<string, unknown>;
      const packSize = num(vMeta?.pack_size);
      const vMrp = num(vMeta?.mrp);
      if (vMrp != null && mrpByColour[colourVal] == null) {
        mrpByColour[colourVal] = vMrp;
      }
      const vImgs = Array.isArray(vMeta.images)
        ? (vMeta.images as unknown[]).filter(
            (u): u is string => typeof u === "string" && !!u,
          )
        : [];
      if (vImgs.length) {
        imagesByColour[colourVal] = Array.from(
          new Set([...(imagesByColour[colourVal] ?? []), ...vImgs]),
        );
      }
      matrix.push({
        id: v.id,
        sku: v.sku ?? `${p.handle}-${size}-${colourVal}`,
        size,
        colour: colourVal,
        inventoryState: "in_stock",
        ...(packSize && packSize > 1 ? { packSize } : {}),
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

  // Lowest variant calculated_price → priceMajor. Medusa v2 stores/returns
  // money in MAJOR units (decimal rupees), e.g. ₹3,000 → 3000 — NOT minor
  // paise — so use the amount directly (no /100). Fallback to 0 so the page
  // renders rather than 500's; the storefront UI handles "0".
  const calculatedAmounts = variants
    .map((v) => v.calculated_price?.calculated_amount)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const priceMajor = calculatedAmounts.length
    ? Math.round(Math.min(...calculatedAmounts))
    : 0;
  const originalAmounts = variants
    .map((v) => v.calculated_price?.original_amount)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  // MRP (retail price shown to everyone, incl. logged-out buyers). Admins set
  // it per product via `metadata.mrp` (major rupees) in Medusa Admin; fall back
  // to the variant's list/original price when no explicit MRP is entered.
  const mrpMajor =
    num(meta.mrp) ??
    Object.values(mrpByColour)[0] ??
    (originalAmounts.length ? Math.round(Math.max(...originalAmounts)) : undefined);

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
    ...(Object.keys(imagesByColour).length ? { imagesByColour } : {}),
    ...(Object.keys(mrpByColour).length ? { mrpByColour } : {}),
    description,
    specs,
    swatches,
    sizes,
    variants: matrix,
    moq: num(meta.moq),
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
      headers: SERVER_HEADERS,
      // Always fresh: category membership must match the admin exactly and
      // update the moment a product is (un)assigned — no ISR staleness.
      cache: "no-store",
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
      headers: SERVER_HEADERS,
      // Always fresh: category membership must match the admin exactly and
      // update the moment a product is (un)assigned — no ISR staleness.
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { products?: LiveProduct[] };
    return data.products ?? [];
  } catch {
    return [];
  }
}

export async function getWholesaleProducts(): Promise<Product[]> {
  // Live products take precedence over fixtures sharing the same slug so the
  // catalogue reflects what's actually orderable in Medusa. Fixtures fill in
  // the long-tail demo content (poplin, kurta, etc.) until those land in the
  // backend.
  //
  // Category membership is driven SOLELY by the product's real Medusa
  // category links (product.categories). So the storefront shows exactly
  // what the admin assigned — assign a product and it appears; un-assign it
  // and it disappears — with no Type-based guessing that could diverge.
  const liveRaw = await fetchAllLive();
  const live = liveRaw.filter((p) => !HIDDEN_HANDLES.has(p.handle));
  const liveMappedRaw = await Promise.all(
    live.map(async (p) => {
      const pricing = await fetchB2bPricing(p.id);
      return {
        product: overlayB2b(mapMedusaToProduct(p), pricing),
        // B2B visibility gate. A product hidden from this audience by an
        // admin Visibility rule is dropped from the catalogue. A null pricing
        // response (transient error) fails OPEN so it never blanks the store.
        hidden: pricing?.visible === false,
      };
    }),
  );
  // Slug set spans ALL live products (even hidden ones) so a hidden live
  // product still suppresses a same-slug demo fixture rather than resurrecting
  // it.
  const liveSlugs = new Set(liveMappedRaw.map((x) => x.product.slug));
  const liveMapped = liveMappedRaw
    .filter((x) => !x.hidden)
    .map((x) => x.product);
  const fixturesWithOverlay = (
    await Promise.all(
      PRODUCTS.filter((p) => !liveSlugs.has(p.slug)).map(async (p) => {
        if (!p.medusaId) return p;
        const pricing = await fetchB2bPricing(p.medusaId);
        return pricing?.visible === false ? null : overlayB2b(p, pricing);
      }),
    )
  ).filter((p): p is Product => p !== null);
  return [...liveMapped, ...fixturesWithOverlay];
}

export async function getWholesaleProduct(handle: string): Promise<Product | null> {
  // Hidden system products (e.g. the checkout line item) have no PDP.
  if (HIDDEN_HANDLES.has(handle)) return null;
  // 1) Live Medusa product takes precedence — that's the source of truth.
  const live = await fetchLiveByHandle(handle);
  if (live) {
    const pricing = await fetchB2bPricing(live.id);
    // Hidden from this audience → no PDP (page 404s), matching the catalogue.
    if (pricing?.visible === false) return null;
    return overlayB2b(mapMedusaToProduct(live), pricing);
  }
  // 2) Fall back to fixture for demo / pre-seed handles.
  const product = PRODUCTS.find((p) => p.slug === handle) ?? null;
  if (!product) return null;
  if (!product.medusaId) return product;
  const pricing = await fetchB2bPricing(product.medusaId);
  if (pricing?.visible === false) return null;
  return overlayB2b(product, pricing);
}
