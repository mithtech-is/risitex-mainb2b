import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { createShippingOptionsWorkflow } from "@medusajs/medusa/core-flows"
import type { ExecArgs } from "@medusajs/framework/types"

/**
 * Seed the RISITEX transporter list as native Medusa shipping options so they
 * appear in the admin Order → Fulfillment "Shipping method" dropdown.
 *
 * Creates (idempotent-ish — skips if a fulfillment set named below exists):
 *   1. A "shipping" fulfillment set with an India service zone,
 *   2. linked to the Bangalore HQ stock location + the manual provider,
 *   3. one flat-rate shipping option per transporter.
 *
 * Run: pnpm --filter @risitex/backend exec medusa exec ./src/scripts/seed-transporter-shipping.ts
 */

const FULFILLMENT_SET_NAME = "RISITEX Transporters"

// Transporter name + flat charge in rupees (major units — Medusa v2 stores INR
// in major units). Mirrors the storefront COURIER_PROVIDERS list.
const TRANSPORTERS: Array<{ name: string; amount: number }> = [
  { name: "DHL Express", amount: 480 },
  { name: "Blue Dart", amount: 420 },
  { name: "Delhivery B2B", amount: 280 },
  { name: "Professional Couriers", amount: 250 },
  { name: "DTDC Premium", amount: 300 },
  { name: "Xpressbees", amount: 270 },
  { name: "Ecom Express", amount: 260 },
  { name: "India Post Speed Post", amount: 180 },
  { name: "FedEx", amount: 520 },
  { name: "UPS", amount: 500 },
  { name: "Self Pickup", amount: 0 },
]

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")

export default async function seedTransporterShipping({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const fulfillment = container.resolve(Modules.FULFILLMENT)

  // Resolve the stock location, default shipping profile, region.
  const { data: locations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
  })
  const stockLocation = locations?.[0]
  if (!stockLocation) {
    logger.error("[seed-transporter-shipping] no stock location found — aborting")
    return
  }

  const { data: profiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id", "name"],
  })
  const shippingProfile =
    profiles?.find((p: { name?: string }) => /default/i.test(p.name ?? "")) ??
    profiles?.[0]
  if (!shippingProfile) {
    logger.error("[seed-transporter-shipping] no shipping profile found — aborting")
    return
  }

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
  })
  const region = regions?.find(
    (r: { currency_code?: string }) => r.currency_code === "inr",
  )

  // Skip if we already created this fulfillment set.
  const { data: existingSets } = await query.graph({
    entity: "fulfillment_set",
    fields: ["id", "name", "service_zones.id"],
  })
  let fulfillmentSet = existingSets?.find(
    (s: { name?: string }) => s.name === FULFILLMENT_SET_NAME,
  )

  if (!fulfillmentSet) {
    // 1. Fulfillment set + India service zone.
    const created = await fulfillment.createFulfillmentSets({
      name: FULFILLMENT_SET_NAME,
      type: "shipping",
      service_zones: [
        {
          name: "India",
          geo_zones: [{ country_code: "in", type: "country" }],
        },
      ],
    })
    fulfillmentSet = created as unknown as {
      id: string
      name: string
      service_zones: { id: string }[]
    }

    // 2a. Link the fulfillment set to the stock location.
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
    })

    // 2b. Enable the manual fulfillment provider at the location.
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
    })

    logger.info(
      `[seed-transporter-shipping] created fulfillment set + India service zone, linked to ${stockLocation.name}`,
    )
  } else {
    logger.info(
      "[seed-transporter-shipping] fulfillment set already exists — adding any missing options",
    )
  }

  const serviceZoneId = (
    fulfillmentSet as { service_zones: { id: string }[] }
  ).service_zones?.[0]?.id
  if (!serviceZoneId) {
    logger.error("[seed-transporter-shipping] no service zone id — aborting")
    return
  }

  // Which options already exist (by name) so re-runs don't duplicate.
  const { data: existingOptions } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name"],
  })
  const existingNames = new Set(
    (existingOptions ?? []).map((o: { name?: string }) => o.name),
  )

  const toCreate = TRANSPORTERS.filter((t) => !existingNames.has(t.name))
  if (toCreate.length === 0) {
    logger.info("[seed-transporter-shipping] all transporter options already exist")
    return
  }

  // 3. One flat-rate shipping option per transporter.
  await createShippingOptionsWorkflow(container).run({
    input: toCreate.map((t) => ({
      name: t.name,
      price_type: "flat" as const,
      provider_id: "manual_manual",
      service_zone_id: serviceZoneId,
      shipping_profile_id: shippingProfile.id,
      type: {
        label: t.name,
        description: `${t.name} — B2B dispatch`,
        code: slug(t.name),
      },
      prices: [
        { currency_code: "inr", amount: t.amount },
        ...(region ? [{ region_id: region.id, amount: t.amount }] : []),
      ],
      rules: [
        { attribute: "enabled_in_store", value: "true", operator: "eq" as const },
        { attribute: "is_return", value: "false", operator: "eq" as const },
      ],
    })),
  })

  logger.info(
    `[seed-transporter-shipping] created ${toCreate.length} transporter shipping option(s): ${toCreate
      .map((t) => t.name)
      .join(", ")}`,
  )
}
