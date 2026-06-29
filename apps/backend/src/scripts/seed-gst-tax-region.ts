import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

/**
 * Make FR-4.02 GST live: create an India tax region whose provider is the
 * RISITEX GST provider, so checkout invokes GstTaxProvider for Indian
 * addresses. Idempotent. Run: npx medusa exec ./src/scripts/seed-gst-tax-region.ts
 */
export default async function seedGstTaxRegion({ container }: ExecArgs) {
  const tax: any = container.resolve(Modules.TAX)
  const log = (...a: any[]) => console.log("[gst-region]", ...a)

  // provider_id format is `tp_{identifier}_{config-id}` → both "risitex-gst".
  const providerId = "tp_risitex-gst_risitex-gst"

  const existing = await tax.listTaxRegions({ country_code: "in" })
  if (existing?.length) {
    const r = existing[0]
    if (r.provider_id !== providerId) {
      await tax.updateTaxRegions([{ id: r.id, provider_id: providerId }])
      log(`updated India tax region ${r.id} → provider ${providerId}`)
    } else {
      log(`India tax region already points at ${providerId} (${r.id})`)
    }
    return
  }

  const [region] = await tax.createTaxRegions([
    { country_code: "in", provider_id: providerId },
  ])
  log(`created India tax region ${region.id} → provider ${providerId}`)
  log("GST is now live for Indian addresses at checkout.")
}
