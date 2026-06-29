import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import GstTaxProvider from "./service"

/**
 * RISITEX GST as a Tax Module provider (FR-4.02). Registered under
 * `[Modules.TAX].options.providers` in medusa-config; a tax region for India
 * then points its `provider_id` at `tp_risitex-gst_<id>` so checkout GST is
 * computed by GstTaxProvider.
 */
export default ModuleProvider(Modules.TAX, {
  services: [GstTaxProvider],
})
