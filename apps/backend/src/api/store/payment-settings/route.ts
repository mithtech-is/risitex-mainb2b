// apps/backend/src/api/store/payment-settings/route.ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  PAYMENT_SETTINGS_MODULE,
  SETTINGS_ID,
  PaymentSettingsModuleService,
} from "../../../modules/payment_settings"

/**
 * Public subset — NEVER exposes razorpay_mode / auto_capture / secrets.
 * The storefront checkout reads this to render the two cards + the
 * dynamic gateway %. Falls back to safe defaults if the row is missing
 * so checkout never hard-fails on a settings hiccup.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const fallback = {
    manual_upi_enabled: true,
    razorpay_enabled: true,
    upi_id: "risitex@upi",
    upi_qr_image_url: null as string | null,
    gateway_charge_percent: 2,
  }
  try {
    const svc = req.scope.resolve(PAYMENT_SETTINGS_MODULE) as PaymentSettingsModuleService & {
      retrievePaymentSetting: (id: string) => Promise<any>
    }
    const row = await svc.retrievePaymentSetting(SETTINGS_ID)
    return res.json({
      payment_settings: {
        manual_upi_enabled: !!row.manual_upi_enabled,
        razorpay_enabled: !!row.razorpay_enabled,
        upi_id: row.upi_id ?? fallback.upi_id,
        upi_qr_image_url: row.upi_qr_image_url ?? null,
        gateway_charge_percent: Number(row.gateway_charge_percent ?? 2),
      },
    })
  } catch {
    return res.json({ payment_settings: fallback })
  }
}
