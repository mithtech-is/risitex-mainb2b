import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import { RazorpayPaymentProviderService } from "./service"

/**
 * Razorpay payment provider for the Payment module.
 *
 * Registered as provider id `razorpay` — Medusa exposes it to the
 * storefront as `pp_razorpay_razorpay`. Created in Phase 11.N to
 * replace the cashfree-wallet provider as the bank-rail for INR.
 *
 * Env vars required to actually charge:
 *   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
 * Without them the provider runs in pass-through mode (records
 * a synthetic order so dev can flow to authorize/capture without
 * a real Razorpay account) — the service falls back gracefully.
 */
export default ModuleProvider(Modules.PAYMENT, {
  services: [RazorpayPaymentProviderService],
})
