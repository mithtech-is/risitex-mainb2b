// apps/backend/src/api/admin/payment-settings/route.ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
  PAYMENT_SETTINGS_MODULE,
  SETTINGS_ID,
  PaymentSettingsModuleService,
} from "../../../modules/payment_settings"
import { logger } from "../../../utils/logger"

type Svc = PaymentSettingsModuleService & {
  retrievePaymentSetting: (id: string) => Promise<any>
  updatePaymentSettings: (data: any) => Promise<any>
  createPaymentSettings: (data: any) => Promise<any>
}

async function loadOrSeed(svc: Svc) {
  try {
    return await svc.retrievePaymentSetting(SETTINGS_ID)
  } catch {
    return await svc.createPaymentSettings({ id: SETTINGS_ID })
  }
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const svc = req.scope.resolve(PAYMENT_SETTINGS_MODULE) as Svc
  const row = await loadOrSeed(svc)
  return res.json({ payment_settings: row })
}

const PatchBody = z.object({
  manual_upi_enabled: z.boolean().optional(),
  razorpay_enabled: z.boolean().optional(),
  upi_id: z.string().min(3).max(120).optional(),
  upi_qr_image_url: z.string().url().or(z.string().startsWith("/")).nullable().optional(),
  gateway_charge_percent: z.number().min(0).max(100).optional(),
  razorpay_mode: z.enum(["sandbox", "production"]).optional(),
  auto_capture: z.boolean().optional(),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = PatchBody.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(422)
      .json({ message: "Invalid input", errors: parsed.error.flatten() })
  }
  try {
    const svc = req.scope.resolve(PAYMENT_SETTINGS_MODULE) as Svc
    await loadOrSeed(svc)
    const updated = await svc.updatePaymentSettings({
      id: SETTINGS_ID,
      ...parsed.data,
    })
    const row = Array.isArray(updated) ? updated[0] : updated
    return res.json({ payment_settings: row })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[admin/payment-settings] update failed", { error: message })
    return res.status(500).json({ message: "Couldn't save payment settings." })
  }
}
