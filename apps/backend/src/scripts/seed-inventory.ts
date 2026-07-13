/**
 * Enable native Medusa inventory tracking for every product variant and
 * seed stock so the inventory module has real data.
 *
 * Today `inventory_item` is empty — only a handful of variants have
 * `manage_inventory = true` and none are linked to an inventory item or
 * have a stock level, so the admin's Inventory section is blank. For
 * EVERY variant, this script:
 *   1. Flips `manage_inventory` to true (product module) if not already.
 *   2. Creates + links an inventory item (inventory + link modules) if the
 *      variant doesn't already have one.
 *   3. Ensures an inventory level exists at the (first) stock location,
 *      seeding a default stock quantity if no level exists yet. Existing
 *      levels — even zero-stock ones — are left untouched.
 *   4. Merges default operational metadata (reorder_level, safety_stock,
 *      damaged, incoming) onto the inventory item without wiping any
 *      existing metadata keys. These fields don't have dedicated columns
 *      — they live in `inventory_item.metadata`.
 *
 * Idempotent — safe to re-run; only touches what's missing.
 *
 * Run: npm run seed:inventory
 *      (== medusa exec ./src/scripts/seed-inventory.ts)
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createInventoryItemsWorkflow,
  createInventoryLevelsWorkflow,
} from "@medusajs/medusa/core-flows"

const DEFAULT_STOCK_QTY = 500

const DEFAULT_METADATA = {
  reorder_level: 100,
  safety_stock: 50,
  damaged: 0,
  incoming: 0,
} as const

export default async function seedInventory({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const productModule = container.resolve(Modules.PRODUCT) as any
  const inventoryModule = container.resolve(Modules.INVENTORY) as any

  // Resolve the stock location dynamically (first one) rather than
  // hardcoding — expected to be "Bangalore HQ".
  const { data: locations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
    pagination: { take: 10 },
  } as any)
  const location = locations?.[0] as { id: string; name: string } | undefined
  if (!location) {
    logger.error("[seed-inventory] no stock location found — aborting")
    return
  }
  logger.info(
    `[seed-inventory] using stock location "${location.name}" (${location.id})`,
  )

  // Query ALL variants — explicit high `take` since there are 52 and the
  // default query-graph page size could otherwise silently truncate.
  const { data: variants } = await query.graph({
    entity: "variant",
    fields: ["id", "sku", "manage_inventory", "inventory_items.inventory.id"],
    pagination: { take: 1000 },
  } as any)

  logger.info(`[seed-inventory] found ${variants.length} variant(s)`)

  let managedEnabled = 0
  let itemsCreated = 0
  let levelsCreated = 0
  let metadataSet = 0
  let failed = 0

  for (const variant of variants as any[]) {
    const label = variant.sku ?? variant.id
    try {
      // 1. Enable manage_inventory if not already set.
      if (!variant.manage_inventory) {
        await productModule.updateProductVariants(variant.id, {
          manage_inventory: true,
        })
        managedEnabled++
        logger.info(`[seed-inventory] ${label}: enabled manage_inventory`)
      }

      // 2. Ensure the variant has a linked inventory item.
      let invItemId: string | undefined = (variant.inventory_items ?? [])
        .map((ii: any) => ii?.inventory?.id)
        .find((id: string | undefined) => !!id)
      let freshMetadata: Record<string, unknown> | null | undefined

      if (!invItemId) {
        const { result } = await createInventoryItemsWorkflow(container).run({
          input: {
            items: [
              {
                sku: variant.sku ?? undefined,
                title: variant.sku ?? variant.id,
              },
            ],
          },
        })
        const invItem = result[0]
        invItemId = invItem.id
        freshMetadata = invItem.metadata

        await link.create({
          [Modules.PRODUCT]: { variant_id: variant.id },
          [Modules.INVENTORY]: { inventory_item_id: invItemId },
          data: { required_quantity: 1 },
        })

        itemsCreated++
        logger.info(
          `[seed-inventory] ${label}: created + linked inventory item ${invItemId}`,
        )
      }

      // 3. Ensure an inventory level exists at the location.
      const existingLevels = await inventoryModule.listInventoryLevels({
        inventory_item_id: invItemId,
        location_id: location.id,
      })

      if (existingLevels.length === 0) {
        await createInventoryLevelsWorkflow(container).run({
          input: {
            inventory_levels: [
              {
                inventory_item_id: invItemId as string,
                location_id: location.id,
                stocked_quantity: DEFAULT_STOCK_QTY,
              },
            ],
          },
        })
        levelsCreated++
        logger.info(
          `[seed-inventory] ${label}: created inventory level (${DEFAULT_STOCK_QTY} units)`,
        )
      }

      // 4. Merge default metadata onto the inventory item (don't wipe).
      if (freshMetadata === undefined) {
        const existingItem = await inventoryModule.retrieveInventoryItem(
          invItemId,
        )
        freshMetadata = existingItem?.metadata
      }
      const existingMeta = (freshMetadata ?? {}) as Record<string, unknown>

      await inventoryModule.updateInventoryItems([
        {
          id: invItemId,
          metadata: {
            ...existingMeta,
            reorder_level:
              existingMeta.reorder_level ?? DEFAULT_METADATA.reorder_level,
            safety_stock:
              existingMeta.safety_stock ?? DEFAULT_METADATA.safety_stock,
            damaged: existingMeta.damaged ?? DEFAULT_METADATA.damaged,
            incoming: existingMeta.incoming ?? DEFAULT_METADATA.incoming,
          },
        },
      ])
      metadataSet++
    } catch (e: any) {
      failed++
      logger.error(
        `[seed-inventory] variant ${label} FAILED: ${e?.message ?? e}`,
      )
    }
  }

  logger.info(
    `[seed-inventory] done: ${variants.length} variant(s) processed | ` +
      `${managedEnabled} manage_inventory enabled | ` +
      `${itemsCreated} inventory item(s) created | ` +
      `${levelsCreated} inventory level(s) created | ` +
      `${metadataSet} metadata update(s) applied | ` +
      `${failed} failed`,
  )
}
