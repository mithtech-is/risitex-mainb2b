import { MedusaService } from "@medusajs/framework/utils"
import { CustomerTier } from "./models/customer-tier"

class CustomerTierModuleService extends MedusaService({
  CustomerTier,
}) {
  /**
   * Idempotent tier upsert keyed on `code`. Used by the seed script
   * to ensure the three canonical tiers exist after every fresh DB.
   */
  async upsertByCode(input: {
    code: string
    name: string
    priority?: number
    default_payment_terms?: string
    default_commission_percent?: number
    active?: boolean
    metadata?: Record<string, unknown> | null
  }) {
    const existing = await this.listCustomerTiers({ code: input.code })
    if (existing.length > 0) {
      const [updated] = await this.updateCustomerTiers([
        {
          id: existing[0]!.id,
          name: input.name,
          priority: input.priority ?? existing[0]!.priority,
          default_payment_terms:
            input.default_payment_terms ?? existing[0]!.default_payment_terms,
          default_commission_percent:
            input.default_commission_percent ??
            existing[0]!.default_commission_percent,
          active: input.active ?? existing[0]!.active,
          metadata: input.metadata ?? existing[0]!.metadata,
        },
      ])
      return updated
    }
    const [created] = await this.createCustomerTiers([
      {
        code: input.code,
        name: input.name,
        priority: input.priority ?? 0,
        default_payment_terms: input.default_payment_terms ?? "advance_100",
        default_commission_percent: input.default_commission_percent ?? 0,
        active: input.active ?? true,
        metadata: input.metadata ?? null,
      },
    ])
    return created
  }
}

export default CustomerTierModuleService
