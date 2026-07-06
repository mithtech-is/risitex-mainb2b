import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * Seed the RISITEX product-category hierarchy using Medusa's NATIVE
 * Product Categories (parent → child). Idempotent — keyed on `handle`,
 * so re-running only fills gaps and re-asserts parent/active flags.
 *
 *   Men
 *   ├── Innerwear
 *   │   ├── Inner Boxers
 *   │   └── Boxer Shorts
 *   └── Bottom Wear
 *       ├── Pyjamas
 *       └── Jeans
 *           ├── Ankle / Cropped Fit
 *           ├── Slim
 *           ├── Tapered Slim
 *           ├── Straight
 *           └── Baggy
 *
 * This is the ONLY source of truth for the tree. The admin extends it
 * (Women, Kids, Accessories, …) from the stock admin UI — no code change.
 * Products are attached to a leaf category from the native product editor
 * and the storefront picks them up automatically.
 *
 * Run with:
 *   pnpm exec medusa exec ./src/scripts/seed-categories.ts
 */

type Node = { name: string; handle: string; children?: Node[] }

const TREE: Node[] = [
  {
    name: "Men",
    handle: "men",
    children: [
      {
        name: "Innerwear",
        handle: "men-innerwear",
        children: [
          { name: "Inner Boxers", handle: "men-inner-boxers" },
          { name: "Boxer Shorts", handle: "men-boxer-shorts" },
        ],
      },
      {
        name: "Bottom Wear",
        handle: "men-bottom-wear",
        children: [
          { name: "Pyjamas", handle: "men-pyjamas" },
          {
            name: "Jeans",
            handle: "men-jeans",
            children: [
              { name: "Ankle / Cropped Fit", handle: "men-jeans-ankle-cropped" },
              { name: "Slim", handle: "men-jeans-slim" },
              { name: "Tapered Slim", handle: "men-jeans-tapered-slim" },
              { name: "Straight", handle: "men-jeans-straight" },
              { name: "Baggy", handle: "men-jeans-baggy" },
            ],
          },
        ],
      },
    ],
  },
]

// Optional flat "Product Type" values for the admin's Type dropdown. The
// hierarchy already models these as categories; the Type field is a
// convenience so the admin workflow (Category → Subcategory → Type) has
// first-class options.
const PRODUCT_TYPES = ["Inner Boxers", "Boxer Shorts", "Pyjamas", "Jeans"]

export default async function seedCategories({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productModule = container.resolve(Modules.PRODUCT) as any

  const existing = await productModule.listProductCategories({}, { take: 1000 })
  const byHandle = new Map<string, string>()
  for (const c of existing) byHandle.set(c.handle, c.id)

  let created = 0
  let rank = 0

  async function upsert(node: Node, parentId: string | null): Promise<void> {
    let id = byHandle.get(node.handle)
    if (!id) {
      const res = await productModule.createProductCategories([
        {
          name: node.name,
          handle: node.handle,
          parent_category_id: parentId,
          is_active: true,
          is_internal: false,
          rank: rank++,
        },
      ])
      const row = Array.isArray(res) ? res[0] : res
      id = row.id as string
      byHandle.set(node.handle, id)
      created++
      logger.info(`  + ${node.handle}${parentId ? ` (child)` : ""}`)
    } else {
      // Re-assert structure so a partially-seeded tree self-heals.
      await productModule.updateProductCategories(id, {
        parent_category_id: parentId,
        is_active: true,
        is_internal: false,
      })
    }
    for (const child of node.children ?? []) {
      await upsert(child, id)
    }
  }

  for (const root of TREE) {
    await upsert(root, null)
  }

  // Product types (idempotent by value)
  let typesAdded = 0
  try {
    const existingTypes = await productModule.listProductTypes({}, { take: 1000 })
    const have = new Set((existingTypes ?? []).map((t: any) => t.value))
    const toCreate = PRODUCT_TYPES.filter((v) => !have.has(v))
    if (toCreate.length) {
      await productModule.createProductTypes(toCreate.map((value) => ({ value })))
      typesAdded = toCreate.length
    }
  } catch (e) {
    logger.warn(`[seed-categories] product types skipped: ${(e as Error).message}`)
  }

  logger.info(
    `[seed-categories] done — ${created} categories created (${byHandle.size} total), ${typesAdded} product types added.`,
  )
}
