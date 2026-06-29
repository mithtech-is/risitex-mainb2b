import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { LOGISTICS_MODULE } from "../../../../../../modules/logistics"

/**
 * POST /admin/b2b-management/shipments/:id/transporter   (FR-10.02)
 *
 * The warehouse team assigns a transporter (Porter / VRL / SRMT …) + vehicle to
 * a shipment. Upserts one transporter row per shipment; it then surfaces on the
 * MBO's dashboard (the storefront already reads transporter rows on
 * /store/shipments). Part of the B2B Management admin domain.
 */
const Schema = z.object({
  transporter_code: z.string().trim().min(1),
  transporter_display_name: z.string().trim().min(1).nullish(),
  vehicle_number: z.string().trim().min(1).nullish(),
  awb: z.string().trim().min(1).nullish(),
  notes: z.string().trim().min(1).max(500).nullish(),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const shipmentId = req.params.id
  const parsed = Schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid transporter payload",
      errors: parsed.error.flatten(),
    })
  }

  const logistics = req.scope.resolve(LOGISTICS_MODULE) as any
  const transporter = await logistics.assignTransporter({
    shipment_id: shipmentId,
    ...parsed.data,
  })
  return res.json({ transporter })
}
