import { MedusaService } from "@medusajs/framework/utils"
import { CourierRate } from "./models/courier-rate"

class CourierDeliveryModuleService extends MedusaService({
  CourierRate,
}) {
  async calculateRates(input: {
    zone: string
    totalWeightKg?: number
    totalCartons?: number
    cod?: boolean
  }) {
    const rates = await this.listCourierRates({
      zone: input.zone,
      is_active: true,
    })

    return rates.map((rate) => {
      let chargePaise = Number(rate.base_rate_paise)

      if (input.totalWeightKg && rate.per_kg_rate_paise) {
        chargePaise += Math.ceil(input.totalWeightKg) * Number(rate.per_kg_rate_paise)
      }

      if (input.totalCartons && rate.per_carton_rate_paise) {
        chargePaise += input.totalCartons * Number(rate.per_carton_rate_paise)
      }

      if (input.cod && rate.cod_surcharge_paise) {
        chargePaise += Number(rate.cod_surcharge_paise)
      }

      if (rate.fuel_surcharge_pct > 0) {
        chargePaise += Math.round(chargePaise * rate.fuel_surcharge_pct / 100)
      }

      return {
        carrier_code: rate.carrier_code,
        carrier_name: rate.carrier_name,
        estimated_delivery: `${rate.min_delivery_days}\u2013${rate.max_delivery_days} days`,
        min_delivery_days: rate.min_delivery_days,
        max_delivery_days: rate.max_delivery_days,
        charge_paise: chargePaise,
        charge_rupees: Math.round(chargePaise / 100),
        zone: rate.zone,
      }
    })
  }
}

export default CourierDeliveryModuleService
