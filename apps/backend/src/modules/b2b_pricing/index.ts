import { Module } from "@medusajs/framework/utils"
import B2BPricingService from "./service"

/**
 * RISITEX B2B Pricing & Rules engine (B2B Sales domain). Ported + adapted
 * from Holisto `medusa-plugin-b2b`'s `b2b_rules` module. Houses tier/volume
 * pricing, MOQ/quantity rules, server-side product visibility, and the
 * dynamic-rules engine.
 */
export const B2B_PRICING_MODULE = "b2b_pricing"

export default Module(B2B_PRICING_MODULE, {
  service: B2BPricingService,
})

export { B2BPricingService }
export type { CartContext } from "./service"
