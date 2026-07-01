import { ExecArgs } from "@medusajs/framework/types"
import { COURIER_DELIVERY_MODULE, CourierDeliveryModuleService } from "../modules/courier_delivery"

const COURIERS: Array<{
  carrier_code: string
  carrier_name: string
  zones: Array<{
    zone: string
    base_rate_paise: number
    per_kg_rate_paise: number | null
    per_carton_rate_paise: number | null
    min_delivery_days: number
    max_delivery_days: number
  }>
}> = [
  {
    carrier_code: "dhl_express",
    carrier_name: "DHL Express",
    zones: [
      { zone: "local", base_rate_paise: 48000, per_kg_rate_paise: 6000, per_carton_rate_paise: null, min_delivery_days: 1, max_delivery_days: 2 },
      { zone: "nearby", base_rate_paise: 52000, per_kg_rate_paise: 6500, per_carton_rate_paise: null, min_delivery_days: 1, max_delivery_days: 3 },
      { zone: "rest", base_rate_paise: 58000, per_kg_rate_paise: 7500, per_carton_rate_paise: null, min_delivery_days: 2, max_delivery_days: 4 },
      { zone: "special", base_rate_paise: 65000, per_kg_rate_paise: 8500, per_carton_rate_paise: null, min_delivery_days: 3, max_delivery_days: 5 },
    ],
  },
  {
    carrier_code: "bluedart",
    carrier_name: "Blue Dart",
    zones: [
      { zone: "local", base_rate_paise: 42000, per_kg_rate_paise: 5500, per_carton_rate_paise: null, min_delivery_days: 2, max_delivery_days: 3 },
      { zone: "nearby", base_rate_paise: 45000, per_kg_rate_paise: 6000, per_carton_rate_paise: null, min_delivery_days: 2, max_delivery_days: 4 },
      { zone: "rest", base_rate_paise: 48000, per_kg_rate_paise: 7000, per_carton_rate_paise: null, min_delivery_days: 3, max_delivery_days: 5 },
      { zone: "special", base_rate_paise: 55000, per_kg_rate_paise: 8000, per_carton_rate_paise: null, min_delivery_days: 4, max_delivery_days: 6 },
    ],
  },
  {
    carrier_code: "delhivery_b2b",
    carrier_name: "Delhivery B2B",
    zones: [
      { zone: "local", base_rate_paise: 28000, per_kg_rate_paise: 3500, per_carton_rate_paise: 5000, min_delivery_days: 3, max_delivery_days: 4 },
      { zone: "nearby", base_rate_paise: 30000, per_kg_rate_paise: 4000, per_carton_rate_paise: 5500, min_delivery_days: 3, max_delivery_days: 5 },
      { zone: "rest", base_rate_paise: 35000, per_kg_rate_paise: 4500, per_carton_rate_paise: 6000, min_delivery_days: 4, max_delivery_days: 6 },
      { zone: "special", base_rate_paise: 40000, per_kg_rate_paise: 5000, per_carton_rate_paise: 7000, min_delivery_days: 5, max_delivery_days: 7 },
    ],
  },
  {
    carrier_code: "professional_couriers",
    carrier_name: "Professional Couriers",
    zones: [
      { zone: "local", base_rate_paise: 25000, per_kg_rate_paise: 3000, per_carton_rate_paise: null, min_delivery_days: 3, max_delivery_days: 5 },
      { zone: "nearby", base_rate_paise: 28000, per_kg_rate_paise: 3500, per_carton_rate_paise: null, min_delivery_days: 3, max_delivery_days: 6 },
      { zone: "rest", base_rate_paise: 32000, per_kg_rate_paise: 4000, per_carton_rate_paise: null, min_delivery_days: 4, max_delivery_days: 7 },
      { zone: "special", base_rate_paise: 38000, per_kg_rate_paise: 4800, per_carton_rate_paise: null, min_delivery_days: 5, max_delivery_days: 8 },
    ],
  },
  {
    carrier_code: "dtdc_premium",
    carrier_name: "DTDC Premium",
    zones: [
      { zone: "local", base_rate_paise: 30000, per_kg_rate_paise: 4000, per_carton_rate_paise: null, min_delivery_days: 3, max_delivery_days: 4 },
      { zone: "nearby", base_rate_paise: 33000, per_kg_rate_paise: 4500, per_carton_rate_paise: null, min_delivery_days: 3, max_delivery_days: 5 },
      { zone: "rest", base_rate_paise: 38000, per_kg_rate_paise: 5000, per_carton_rate_paise: null, min_delivery_days: 4, max_delivery_days: 6 },
      { zone: "special", base_rate_paise: 42000, per_kg_rate_paise: 5500, per_carton_rate_paise: null, min_delivery_days: 5, max_delivery_days: 7 },
    ],
  },
  {
    carrier_code: "xpressbees",
    carrier_name: "Xpressbees",
    zones: [
      { zone: "local", base_rate_paise: 27000, per_kg_rate_paise: 3200, per_carton_rate_paise: 4500, min_delivery_days: 3, max_delivery_days: 4 },
      { zone: "nearby", base_rate_paise: 29000, per_kg_rate_paise: 3800, per_carton_rate_paise: 5000, min_delivery_days: 3, max_delivery_days: 5 },
      { zone: "rest", base_rate_paise: 34000, per_kg_rate_paise: 4200, per_carton_rate_paise: 5500, min_delivery_days: 4, max_delivery_days: 6 },
      { zone: "special", base_rate_paise: 38000, per_kg_rate_paise: 4800, per_carton_rate_paise: 6000, min_delivery_days: 5, max_delivery_days: 7 },
    ],
  },
  {
    carrier_code: "ecom_express",
    carrier_name: "Ecom Express",
    zones: [
      { zone: "local", base_rate_paise: 26000, per_kg_rate_paise: 3000, per_carton_rate_paise: 4000, min_delivery_days: 4, max_delivery_days: 5 },
      { zone: "nearby", base_rate_paise: 28000, per_kg_rate_paise: 3500, per_carton_rate_paise: 4500, min_delivery_days: 4, max_delivery_days: 6 },
      { zone: "rest", base_rate_paise: 32000, per_kg_rate_paise: 4000, per_carton_rate_paise: 5000, min_delivery_days: 5, max_delivery_days: 7 },
      { zone: "special", base_rate_paise: 36000, per_kg_rate_paise: 4500, per_carton_rate_paise: 5500, min_delivery_days: 6, max_delivery_days: 8 },
    ],
  },
  {
    carrier_code: "india_post_speed",
    carrier_name: "India Post Speed Post",
    zones: [
      { zone: "local", base_rate_paise: 18000, per_kg_rate_paise: 2000, per_carton_rate_paise: null, min_delivery_days: 5, max_delivery_days: 6 },
      { zone: "nearby", base_rate_paise: 20000, per_kg_rate_paise: 2500, per_carton_rate_paise: null, min_delivery_days: 5, max_delivery_days: 7 },
      { zone: "rest", base_rate_paise: 25000, per_kg_rate_paise: 3000, per_carton_rate_paise: null, min_delivery_days: 6, max_delivery_days: 8 },
      { zone: "special", base_rate_paise: 30000, per_kg_rate_paise: 3500, per_carton_rate_paise: null, min_delivery_days: 7, max_delivery_days: 10 },
    ],
  },
  {
    carrier_code: "fedex",
    carrier_name: "FedEx",
    zones: [
      { zone: "local", base_rate_paise: 52000, per_kg_rate_paise: 7000, per_carton_rate_paise: null, min_delivery_days: 2, max_delivery_days: 3 },
      { zone: "nearby", base_rate_paise: 56000, per_kg_rate_paise: 7500, per_carton_rate_paise: null, min_delivery_days: 2, max_delivery_days: 4 },
      { zone: "rest", base_rate_paise: 62000, per_kg_rate_paise: 8500, per_carton_rate_paise: null, min_delivery_days: 3, max_delivery_days: 5 },
      { zone: "special", base_rate_paise: 70000, per_kg_rate_paise: 9500, per_carton_rate_paise: null, min_delivery_days: 4, max_delivery_days: 6 },
    ],
  },
  {
    carrier_code: "ups",
    carrier_name: "UPS",
    zones: [
      { zone: "local", base_rate_paise: 50000, per_kg_rate_paise: 6800, per_carton_rate_paise: null, min_delivery_days: 3, max_delivery_days: 4 },
      { zone: "nearby", base_rate_paise: 55000, per_kg_rate_paise: 7200, per_carton_rate_paise: null, min_delivery_days: 3, max_delivery_days: 5 },
      { zone: "rest", base_rate_paise: 60000, per_kg_rate_paise: 8000, per_carton_rate_paise: null, min_delivery_days: 4, max_delivery_days: 6 },
      { zone: "special", base_rate_paise: 68000, per_kg_rate_paise: 9000, per_carton_rate_paise: null, min_delivery_days: 5, max_delivery_days: 7 },
    ],
  },
]

export default async function seedCourierRates({ container }: ExecArgs) {
  const logger = container.resolve("logger")
  const service = container.resolve(
    COURIER_DELIVERY_MODULE,
  ) as CourierDeliveryModuleService

  for (const courier of COURIERS) {
    for (const zone of courier.zones) {
      const existing = await service.listCourierRates({
        carrier_code: courier.carrier_code,
        zone: zone.zone,
      })

      if (existing.length > 0) {
        logger.info(`Rate for ${courier.carrier_name} / ${zone.zone} already exists — skipping.`)
        continue
      }

      await service.createCourierRates([
        {
          carrier_code: courier.carrier_code,
          carrier_name: courier.carrier_name,
          zone: zone.zone,
          base_rate_paise: zone.base_rate_paise,
          per_kg_rate_paise: zone.per_kg_rate_paise,
          per_carton_rate_paise: zone.per_carton_rate_paise,
          min_delivery_days: zone.min_delivery_days,
          max_delivery_days: zone.max_delivery_days,
        },
      ])

      logger.info(`Seeded rate for ${courier.carrier_name} / ${zone.zone}`)
    }
  }

  logger.info("Courier rates seeded successfully.")
}
