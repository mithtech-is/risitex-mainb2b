import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { PRODUCT_QUESTIONS_MODULE } from "../modules/product-questions"
import type ProductQuestionsModuleService from "../modules/product-questions/service"
import { PRODUCT_REVIEWS_MODULE } from "../modules/product_reviews"
import type ProductReviewsModuleService from "../modules/product_reviews/service"

/**
 * Seeds reusable B2B demo media and product-enrichment metadata.
 *
 * Real uploads can replace this without code changes by writing the same
 * metadata keys on the product:
 *   b2b_media, b2b_documents, b2b_reviews, b2b_questions, b2b_testimonials
 *
 * Also seeds Q&A and review records into the product_questions and
 * product_reviews tables so the frontend reads from the live API.
 *
 * Run:
 *   pnpm exec medusa exec ./src/scripts/seed-b2b-demo-media.ts
 */

type DemoMedia = {
  role:
    | "product"
    | "lifestyle"
    | "fabric_closeup"
    | "warehouse"
    | "packaging"
    | "factory"
    | "video"
    | "spin_360"
  url: string
  alt: string
}

const DEMO_MEDIA: DemoMedia[] = [
  {
    role: "product",
    url: "/demo/products/photo-01.jpg",
    alt: "Wholesale product front photography",
  },
  {
    role: "fabric_closeup",
    url: "/demo/products/photo-08.jpg",
    alt: "Fabric weave closeup",
  },
  {
    role: "packaging",
    url: "/demo/products/photo-12.jpg",
    alt: "Carton and packaging detail",
  },
  {
    role: "warehouse",
    url: "/demo/products/photo-14.jpg",
    alt: "Warehouse dispatch ready stock",
  },
  {
    role: "factory",
    url: "/demo/products/photo-09.jpg",
    alt: "RISITEX production floor",
  },
  {
    role: "lifestyle",
    url: "/demo/products/photo-05.jpg",
    alt: "Wholesale lifestyle catalogue image",
  },
  {
    role: "video",
    url: "/demo/video-placeholder.svg",
    alt: "Factory walkthrough video placeholder",
  },
  {
    role: "spin_360",
    url: "/demo/spin-360.svg",
    alt: "360 degree product placeholder",
  },
]

/**
 * Per-product hero image override. The live storefront mapper falls back
 * to `b2b_media[role=product]` for a card thumbnail when the Medusa
 * product has no native thumbnail. Without this map every PIX product
 * would show the same photo; the map below assigns a distinct one per
 * handle so the catalogue actually looks like 5 different products.
 */
const PER_PRODUCT_HERO: Record<string, string> = {
  "pix-woven-inner-boxer": "/demo/products/photo-02.jpg",
  "pix-boxer-shorts": "/demo/products/photo-06.jpg",
  "pix-lounge-shorts": "/demo/products/photo-11.jpg",
  "pix-pyjama": "/demo/products/photo-15.jpg",
  "pix-pyjama-set": "/demo/products/photo-17.jpg",
  "risitex-storefront-line-item": "/demo/products/photo-03.jpg",
}

const DEMO_DOCUMENTS = [
  {
    type: "catalogue",
    title: "Wholesale catalogue PDF",
    url: "/demo/risitex-wholesale-catalogue.pdf",
  },
  {
    type: "spec_sheet",
    title: "Technical specification sheet",
    url: "/demo/risitex-spec-sheet.pdf",
  },
  {
    type: "compliance",
    title: "GST and HSN reference",
    url: "/demo/risitex-gst-hsn-reference.pdf",
  },
]

const DEMO_REVIEWS = [
  {
    rating: 5,
    buyer_type: "Regional distributor",
    body: "Consistent carton packing and predictable replenishment lead times.",
  },
  {
    rating: 4,
    buyer_type: "Multi-brand outlet",
    body: "Good size curve availability and responsive support for urgent dispatches.",
  },
]

const DEMO_QUESTIONS = [
  {
    question: "Can this SKU be ordered by colour and size matrix?",
    answer: "Yes. Use the B2B matrix grid and keep quantities aligned to case pack multiples.",
  },
  {
    question: "Can real product media replace these demo assets?",
    answer: "Yes. Uploads that write b2b_media metadata automatically override seeded demo media.",
  },
]

const DEMO_TESTIMONIALS = [
  {
    name: "South India distributor",
    quote: "RISITEX carton discipline makes warehouse receiving faster.",
  },
  {
    name: "Metro apparel chain",
    quote: "Tier pricing and invoice downloads simplified repeat ordering.",
  },
]

export default async function seedB2BDemoMedia({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productService = container.resolve(Modules.PRODUCT) as any
  const products = await productService.listProducts({}, { take: 500 })
  let updated = 0

  for (const product of products) {
    const metadata = { ...(product.metadata ?? {}) }
    const hasRealMedia =
      Array.isArray(metadata.b2b_media) && metadata.b2b_media.length > 0
    // Build a per-product media stack: hero swapped to the per-handle
    // override if one exists, otherwise the shared pool.
    const handle = product.handle as string | undefined
    const heroOverride = handle ? PER_PRODUCT_HERO[handle] : undefined
    const perProductMedia: DemoMedia[] = heroOverride
      ? DEMO_MEDIA.map((m) =>
          m.role === "product" ? { ...m, url: heroOverride } : m,
        )
      : DEMO_MEDIA
    const nextMetadata = {
      ...metadata,
      b2b_media: hasRealMedia ? metadata.b2b_media : perProductMedia,
      b2b_documents: metadata.b2b_documents ?? DEMO_DOCUMENTS,
      b2b_reviews: metadata.b2b_reviews ?? DEMO_REVIEWS,
      b2b_questions: metadata.b2b_questions ?? DEMO_QUESTIONS,
      b2b_testimonials: metadata.b2b_testimonials ?? DEMO_TESTIMONIALS,
      b2b_seeded_demo_media_at:
        metadata.b2b_seeded_demo_media_at ?? new Date().toISOString(),
    }

    await productService.updateProducts(product.id, { metadata: nextMetadata })
    updated += 1
    logger.info(`[seed:b2b-media] enriched ${product.handle ?? product.id}`)
  }

  logger.info(`[seed:b2b-media] DONE - enriched ${updated} product(s)`)

  // ── Seed product_questions table ────────────────────────────────
  try {
    const qaSvc = container.resolve<ProductQuestionsModuleService>(
      PRODUCT_QUESTIONS_MODULE,
    )
    for (const product of products) {
      const handle = (product.handle ?? product.id) as string
      const existing = await qaSvc.listProductQuestions(
        { product_id: handle },
        { take: 1 },
      )
      if (existing.length > 0) {
        logger.info(`[seed:b2b-questions] already seeded for ${handle}, skipping`)
        continue
      }
      for (const q of DEMO_QUESTIONS) {
        await qaSvc.createProductQuestions({
          product_id: handle,
          customer_name: "Demo buyer",
          customer_email: "buyer@example.com",
          question: q.question,
          answer: q.answer,
          is_public: true,
          answered_at: new Date(),
        })
      }
      logger.info(`[seed:b2b-questions] seeded ${DEMO_QUESTIONS.length} Q&A for ${handle}`)
    }
    logger.info("[seed:b2b-questions] DONE")
  } catch (err) {
    logger.warn("[seed:b2b-questions] failed (non-fatal)", { error: (err as Error).message })
  }

  // ── Seed product_reviews table ──────────────────────────────────
  try {
    const reviewSvc = container.resolve<ProductReviewsModuleService>(
      PRODUCT_REVIEWS_MODULE,
    )
    for (const product of products) {
      const handle = (product.handle ?? product.id) as string
      const existing = await reviewSvc.listProductReviews(
        { product_id: handle },
        { take: 1 },
      )
      if (existing.length > 0) {
        logger.info(`[seed:b2b-reviews] already seeded for ${handle}, skipping`)
        continue
      }
      for (const r of DEMO_REVIEWS) {
        await reviewSvc.createProductReviews({
          product_id: handle,
          customer_name: r.buyer_type,
          customer_email: "reviewer@example.com",
          rating: r.rating,
          body: r.body,
          is_public: true,
          moderated_at: new Date(),
        })
      }
      logger.info(`[seed:b2b-reviews] seeded ${DEMO_REVIEWS.length} reviews for ${handle}`)
    }
    logger.info("[seed:b2b-reviews] DONE")
  } catch (err) {
    logger.warn(`[seed:b2b-reviews] failed (non-fatal): ${(err as Error).message}`)
    console.error("FULL ERROR:", err)
  }
}
