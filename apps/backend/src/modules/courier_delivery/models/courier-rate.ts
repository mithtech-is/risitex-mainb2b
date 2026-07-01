import { model } from "@medusajs/framework/utils"

export const CourierRate = model
  .define("courier_rate", {
    id: model.id({ prefix: "cour" }).primaryKey(),

    carrier_code: model.text(),
    carrier_name: model.text(),

    zone: model.text(),

    base_rate_paise: model.bigNumber(),
    per_kg_rate_paise: model.bigNumber().nullable(),
    per_carton_rate_paise: model.bigNumber().nullable(),

    min_delivery_days: model.number(),
    max_delivery_days: model.number(),

    cod_surcharge_paise: model.bigNumber().default(0),
    fuel_surcharge_pct: model.number().default(0),

    is_active: model.boolean().default(true),

    metadata: model.json().nullable(),
  })
  .indexes([
    {
      on: ["carrier_code", "zone"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["zone"],
      unique: false,
      where: "deleted_at IS NULL",
    },
  ])
