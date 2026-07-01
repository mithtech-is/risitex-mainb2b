import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { COURIER_DELIVERY_MODULE, CourierDeliveryModuleService } from "../../../modules/courier_delivery"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const zone = (req.query.zone as string) || "default"
    const totalWeightKg = req.query.weight ? Number(req.query.weight) : undefined
    const totalCartons = req.query.cartons ? Number(req.query.cartons) : undefined
    const cod = req.query.cod === "true"

    const service = req.scope.resolve(
      COURIER_DELIVERY_MODULE,
    ) as CourierDeliveryModuleService

    const rates = await service.calculateRates({
      zone,
      totalWeightKg,
      totalCartons,
      cod,
    })

    rates.sort((a, b) => a.charge_paise - b.charge_paise)

    return res.json({ rates })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    return res.status(500).json({
      message: "Could not calculate courier rates.",
      detail: process.env.NODE_ENV !== "production" ? message : undefined,
    })
  }
}
