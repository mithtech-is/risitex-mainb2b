import { MedusaService } from "@medusajs/framework/utils"
import { DiscountCode } from "./models/discount-code"

class DiscountCodeModuleService extends MedusaService({ DiscountCode }) {
  /** Resolve an active code (case-insensitive). Null if none. */
  async resolveActiveByCode(code: string) {
    const upper = (code ?? "").trim().toUpperCase()
    if (!upper) return null
    const rows = await this.listDiscountCodes({ active: true })
    return rows.find((r) => r.code.trim().toUpperCase() === upper) ?? null
  }

  /** Resolve many codes at once (case-insensitive), for the cart exclusivity check. */
  async resolveActiveByCodes(codes: string[]) {
    const wanted = new Set(
      codes.map((c) => (c ?? "").trim().toUpperCase()).filter(Boolean),
    )
    if (wanted.size === 0) return []
    const rows = await this.listDiscountCodes({ active: true })
    return rows.filter((r) => wanted.has(r.code.trim().toUpperCase()))
  }
}

export default DiscountCodeModuleService
