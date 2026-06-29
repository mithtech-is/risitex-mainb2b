import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { COMPANY_MODULE } from "../modules/company"
import type { CompanyModuleService } from "../modules/company"

/**
 * Resolved B2B buying context for a caller — the bridge between RISITEX's
 * customer/company/tier records and the `b2b_pricing` rules engine.
 *
 * `audience` is the token list the engine's dynamic-rule + visibility methods
 * expect:
 *   guest                    → ["user_0"]
 *   registered B2B (company) → ["all_registered","user_<id>","everyone_registered_b2b","tier_<tierId>"]
 */
export type ResolvedB2BContext = {
  customerId: string | null
  companyId: string | null
  tierId: string | null
  tier: { id: string; code: string; name: string } | null
  /** Convenience: the tier id list to pass as `tier_ids` to price/qty methods. */
  tierIds: string[]
  audience: string[]
}

/**
 * Resolve the caller's tier (per-customer override → company default) plus the
 * audience tokens for the rules engine. Mirrors the resolution in
 * `/store/companies/me` so both stay consistent.
 */
export async function resolveB2BContext(
  scope: { resolve: (k: string) => any },
  customerId: string | null,
): Promise<ResolvedB2BContext> {
  if (!customerId) {
    return {
      customerId: null,
      companyId: null,
      tierId: null,
      tier: null,
      tierIds: [],
      audience: ["user_0"],
    }
  }

  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "company_id", "customer_tier_id"],
    filters: { id: customerId },
  })
  const customer = customers?.[0] as
    | { id: string; company_id: string | null; customer_tier_id: string | null }
    | undefined

  const companyId = customer?.company_id ?? null
  let tierId = customer?.customer_tier_id ?? null

  // Per-customer tier override wins; else fall back to the company default.
  if (!tierId && companyId) {
    const companies = scope.resolve(COMPANY_MODULE) as CompanyModuleService
    const company = await companies.retrieveCompany(companyId).catch(() => null)
    tierId = (company as any)?.customer_tier_id ?? null
  }

  const audience: string[] = ["all_registered", `user_${customerId}`]
  if (companyId) audience.push("everyone_registered_b2b")

  let tier: { id: string; code: string; name: string } | null = null
  if (tierId) {
    audience.push(`tier_${tierId}`)
    const { data: tiers } = await query.graph({
      entity: "customer_tier",
      fields: ["id", "code", "name"],
      filters: { id: tierId },
    })
    const t = tiers?.[0] as
      | { id: string; code: string; name: string }
      | undefined
    if (t) tier = { id: t.id, code: t.code, name: t.name }
  }

  return {
    customerId,
    companyId,
    tierId,
    tier,
    tierIds: tierId ? [tierId] : [],
    audience,
  }
}
