import { MedusaService } from "@medusajs/framework/utils"
import { DynamicRule } from "./models/dynamic-rule"
import { RuleCondition } from "./models/rule-condition"
import { PriceTier } from "./models/price-tier"
import { ProductQuantityRule } from "./models/product-quantity-rule"
import { ProductVisibilityRule } from "./models/product-visibility-rule"

/**
 * Shape the cart engine passes when evaluating rule conditions. All money
 * values are in MINOR units (paise); quantities are integers.
 */
export type CartContext = {
  cart_total_quantity?: number
  cart_total_value?: number
  /** Per-category aggregates keyed by category id. */
  category_quantities?: Record<string, number>
  category_values?: Record<string, number>
  /** Per-product aggregates keyed by product id. */
  product_quantities?: Record<string, number>
  product_values?: Record<string, number>
}

/**
 * RISITEX B2B Pricing & Rules engine — ported from Holisto `b2b_rules` and
 * adapted to the RISITEX `customer_tier` model. Houses tier/volume pricing,
 * MOQ/quantity rules, server-side visibility gating, and the dynamic-rules
 * engine. The custom engine is the source of truth; product-scoped tiers are
 * additionally mirrored to native Price Lists so they apply at checkout.
 *
 * Audience tokens (passed as `audience[]` to the dynamic-rule / visibility
 * methods) follow the form:
 *   - "all_registered"
 *   - "everyone_registered_b2b"
 *   - "user_0"               (guests)
 *   - "tier_<customer_tier_id>"
 *   - "user_<customer_id>"
 */
class B2BPricingService extends MedusaService({
  DynamicRule,
  RuleCondition,
  PriceTier,
  ProductQuantityRule,
  ProductVisibilityRule,
}) {
  // ─── Rule selection ───────────────────────────────────────────────

  /**
   * Return enabled rules whose audience matches any of the caller's audience
   * tokens, optionally filtered to a single effect type. Rules using
   * `multiple`/`replace_ids`/`group` are matched against `who_ids`. Highest
   * priority first.
   */
  async getApplicableRules(audience: string[], rule_what?: string) {
    const filters: Record<string, any> = { enabled: true }
    if (rule_what) filters.rule_what = rule_what

    const rules = await this.listDynamicRules(filters, {
      order: { priority: "DESC" },
    })

    const set = new Set(audience ?? [])
    const tierIds = (audience ?? [])
      .filter((a) => a.startsWith("tier_"))
      .map((a) => a.slice("tier_".length))
    const customerIds = (audience ?? [])
      .filter((a) => a.startsWith("user_") && a !== "user_0")
      .map((a) => a.slice("user_".length))

    return rules.filter((r: any) =>
      this.matchesAudience(r, set, tierIds, customerIds),
    )
  }

  private matchesAudience(
    rule: any,
    audience: Set<string>,
    tierIds: string[],
    customerIds: string[],
  ): boolean {
    const ids: string[] = Array.isArray(rule.who_ids)
      ? rule.who_ids.map(String)
      : []
    switch (rule.rule_who) {
      case "all_registered":
        return audience.has("all_registered")
      case "everyone_registered_b2b":
        return audience.has("everyone_registered_b2b")
      case "user_0":
        return audience.has("user_0")
      case "group":
      case "multiple":
        // who_ids holds tier ids (and possibly audience tokens).
        return (
          ids.some((id) => tierIds.includes(id)) ||
          ids.some((id) => audience.has(id))
        )
      case "replace_ids":
        // who_ids holds specific customer ids.
        return ids.some((id) => customerIds.includes(id))
      default:
        return false
    }
  }

  // ─── Condition evaluation (AND) ───────────────────────────────────

  /** True when EVERY condition on the rule passes against the cart. */
  async evaluateConditions(rule: any, cartCtx: CartContext): Promise<boolean> {
    const conditions = await this.listRuleConditions({ rule_id: rule.id })
    if (!conditions.length) return true
    return conditions.every((c: any) => this.evaluateOne(c, cartCtx))
  }

  private evaluateOne(c: any, ctx: CartContext): boolean {
    const actual = this.dimensionValue(c, ctx)
    if (actual == null) return false
    return this.compare(actual, c.operator, Number(c.threshold))
  }

  private dimensionValue(c: any, ctx: CartContext): number | null {
    switch (c.dimension) {
      case "cart_total_quantity":
        return ctx.cart_total_quantity ?? 0
      case "cart_total_value":
        return ctx.cart_total_value ?? 0
      case "category_product_quantity":
        return c.target_id ? ctx.category_quantities?.[c.target_id] ?? 0 : 0
      case "category_product_value":
        return c.target_id ? ctx.category_values?.[c.target_id] ?? 0 : 0
      case "product_quantity":
        return c.target_id ? ctx.product_quantities?.[c.target_id] ?? 0 : 0
      case "product_value":
        return c.target_id ? ctx.product_values?.[c.target_id] ?? 0 : 0
      default:
        return null
    }
  }

  private compare(a: number, op: string, b: number): boolean {
    switch (op) {
      case "gt":
        return a > b
      case "gte":
        return a >= b
      case "lt":
        return a < b
      case "lte":
        return a <= b
      case "eq":
        return a === b
      default:
        return false
    }
  }

  // ─── Conflict resolution ──────────────────────────────────────────

  /**
   * Order candidate rules (already audience-matched and condition-passing) by
   * priority DESC so the first is the winner. Per-product PriceTier rows
   * override at the pricing layer (see getPriceTiers).
   */
  resolvePriority(rules: any[]): any[] {
    return [...(rules ?? [])].sort(
      (a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0),
    )
  }

  // ─── Product quantity rules (MOQ / step) ──────────────────────────

  /**
   * Min/max/step rows for a product, narrowed to the caller's tiers.
   * Tier-specific rows take precedence over the null (default) row.
   */
  async getProductQuantityRules(product_id: string, tier_ids: string[] = []) {
    if (!product_id) return []
    const rows = await this.listProductQuantityRules({ product_id })
    const tierSet = new Set(tier_ids)
    return rows.filter(
      (r: any) => r.customer_tier_id == null || tierSet.has(r.customer_tier_id),
    )
  }

  /** The single effective quantity rule (tier-specific wins over default). */
  async resolveQuantityRule(product_id: string, tier_ids: string[] = []) {
    const rows = await this.getProductQuantityRules(product_id, tier_ids)
    const tierSet = new Set(tier_ids)
    const specific = rows.find(
      (r: any) => r.customer_tier_id && tierSet.has(r.customer_tier_id),
    )
    return specific ?? rows.find((r: any) => r.customer_tier_id == null) ?? null
  }

  // ─── Price tiers (volume / tier pricing) ──────────────────────────

  /**
   * The tier ladder for a product narrowed to the caller's tiers, ordered by
   * min_quantity ASC. Scope precedence PRODUCT > CATEGORY > GLOBAL; within a
   * scope, bucket precedence tier+region > tier > region > default.
   */
  async getPriceTiers(
    product_id: string,
    opts: {
      tier_ids?: string[]
      region_id?: string | null
      category_ids?: string[]
    } = {},
  ) {
    const tier_ids = opts.tier_ids ?? []
    const region_id = opts.region_id ?? null
    const category_ids = opts.category_ids ?? []
    const tierSet = new Set(tier_ids)

    // Postgres returns `numeric` columns as strings; normalize money +
    // quantity fields to numbers so downstream pricing math (PriceList
    // projection, storefront display) never string-concats by accident.
    const norm = (rows: any[]) =>
      rows.map((r: any) => ({
        ...r,
        value: Number(r.value),
        min_quantity: Number(r.min_quantity),
        max_quantity: r.max_quantity == null ? null : Number(r.max_quantity),
      }))

    const tier = (r: any) =>
      r.customer_tier_id && tierSet.has(r.customer_tier_id)
    const reg = (r: any) => region_id != null && r.region_id === region_id
    const regionOk = (r: any) => r.region_id == null || r.region_id === region_id

    // Within a candidate set, pick the most-specific tier/region ladder:
    //   tier+region > tier > region > default
    const resolveBucket = (rows: any[]) => {
      const cands = rows
        .filter(regionOk)
        .sort((a, b) => (a.min_quantity ?? 0) - (b.min_quantity ?? 0))
      const buckets = [
        cands.filter((r) => tier(r) && reg(r)),
        cands.filter((r) => tier(r) && r.region_id == null),
        cands.filter((r) => r.customer_tier_id == null && reg(r)),
        cands.filter((r) => r.customer_tier_id == null && r.region_id == null),
      ]
      return buckets.find((b) => b.length) ?? []
    }

    // Scope precedence: PRODUCT rule > CATEGORY rule > GLOBAL rule.
    if (product_id) {
      const b = resolveBucket(await this.listPriceTiers({ product_id }))
      if (b.length) return norm(b)
    }
    if (category_ids.length) {
      const b = resolveBucket(
        await this.listPriceTiers({ category_id: category_ids }),
      )
      if (b.length) return norm(b)
    }
    // Global = no product + no category scope.
    return norm(
      resolveBucket(
        await this.listPriceTiers({
          product_id: null,
          category_id: null,
        } as any),
      ),
    )
  }

  // ─── Visibility (wholesale-catalog gate) ──────────────────────────

  /**
   * Whether a product is visible to the caller. Default visible. An explicit
   * manual product rule wins; otherwise category rules apply (any hidden
   * category hides the product).
   */
  async isProductVisible(
    product_id: string,
    category_ids: string[] = [],
    audience: string[] = [],
  ): Promise<boolean> {
    const tierIds = (audience ?? [])
      .filter((a) => a.startsWith("tier_"))
      .map((a) => a.slice("tier_".length))
    const tierSet = new Set(tierIds)
    const matchesTier = (r: any) =>
      r.customer_tier_id == null || tierSet.has(r.customer_tier_id)

    // Explicit product-level rule (manual mode) takes priority.
    const productRules = (
      await this.listProductVisibilityRules({
        target_type: "product",
        product_id,
      })
    ).filter(matchesTier)
    const manual = productRules.find((r: any) => r.mode === "manual")
    if (manual) return !!manual.visible

    // Otherwise inherit from category rules.
    if (category_ids.length) {
      const catRules = (
        await this.listProductVisibilityRules({
          target_type: "category",
          category_id: category_ids,
        })
      ).filter(matchesTier)
      if (catRules.some((r: any) => r.visible === false)) return false
    }
    return true
  }

  // ─── Projection to native primitives (stub — wired in Phase 2) ────

  /**
   * Translate a dynamic rule into the native Medusa primitive that enforces
   * it at checkout:
   *   discount / bogo / free_shipping  -> Promotions
   *   fixed / tiered / raise / hidden price -> Price Lists
   * Phase 2 wires the actual createPromotion / createPriceList workflows;
   * for now this reports the intended mapping.
   */
  projectRule(rule: any): { rule_id: string; target: string; intent: string } {
    const target = this.projectionTarget(rule.rule_what)
    const intent = `[b2b_pricing] project rule ${rule.id} (${rule.rule_what}) -> ${target}`
    return { rule_id: rule.id, target, intent }
  }

  private projectionTarget(rule_what: string): string {
    switch (rule_what) {
      case "discount_amount":
      case "discount_percentage":
      case "bogo_discount":
      case "free_shipping":
        return "promotion"
      case "fixed_price":
      case "tiered_price":
      case "raise_price":
      case "hidden_price":
        return "price_list"
      default:
        return "runtime" // enforced live by the cart hooks, not projected
    }
  }
}

export default B2BPricingService
