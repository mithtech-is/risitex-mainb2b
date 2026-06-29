import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import { SalesRep } from "./models/sales-rep"
import { SalesRepAssignment } from "./models/sales-rep-assignment"
import { CommissionRule } from "./models/commission-rule"
import { CommissionRecord } from "./models/commission-record"

type EarnerType = "sales_rep"
type RuleScope = "first_order" | "restock" | "custom"

class SalesPerformanceModuleService extends MedusaService({
  SalesRep,
  SalesRepAssignment,
  CommissionRule,
  CommissionRecord,
}) {
  /**
   * Resolve the sales rep attributed to a given order (FR-8.02
   * perpetual attribution). Priority: explicit placed_by_rep_id on
   * order.metadata > customer-scoped assignment > company-scoped
   * assignment. Null = no rep attributed.
   */
  async resolveAssignedRep(ctx: {
    customer_id: string | null
    company_id: string | null
    placed_by_rep_id?: string | null
    at?: Date
  }) {
    const at = ctx.at ?? new Date()
    if (ctx.placed_by_rep_id) {
      try {
        const rep = await this.retrieveSalesRep(ctx.placed_by_rep_id)
        if (rep && rep.active) return rep
      } catch {
        // fall through to the assignment table
      }
    }

    // Active assignment = NOT closed yet (valid_until null or future).
    // Customer-scoped wins over company-scoped.
    if (ctx.customer_id) {
      const custAssigns = await this.listSalesRepAssignments({
        customer_id: ctx.customer_id,
      })
      const active = custAssigns
        .filter((a) => !a.valid_until || new Date(a.valid_until) > at)
        .sort(
          (a, b) =>
            new Date(b.assigned_at).getTime() -
            new Date(a.assigned_at).getTime(),
        )
      if (active.length > 0) {
        try {
          const rep = await this.retrieveSalesRep(active[0]!.sales_rep_id)
          if (rep && rep.active) return rep
        } catch {
          /* fall through */
        }
      }
    }

    if (ctx.company_id) {
      const coAssigns = await this.listSalesRepAssignments({
        company_id: ctx.company_id,
      })
      const active = coAssigns
        .filter((a) => !a.valid_until || new Date(a.valid_until) > at)
        .sort(
          (a, b) =>
            new Date(b.assigned_at).getTime() -
            new Date(a.assigned_at).getTime(),
        )
      if (active.length > 0) {
        try {
          const rep = await this.retrieveSalesRep(active[0]!.sales_rep_id)
          if (rep && rep.active) return rep
        } catch {
          /* fall through */
        }
      }
    }
    return null
  }

  /**
   * Pick the highest-priority active rule for a given context.
   * `customer_tier_id` / `company_id` filters narrow the rule set;
   * `scope` is required (caller decides first_order vs restock).
   */
  async resolveRuleForOrder(ctx: {
    earner_type: EarnerType
    earner_id: string
    scope: RuleScope
    customer_tier_id?: string | null
    company_id?: string | null
    at?: Date
  }) {
    const at = ctx.at ?? new Date()
    const candidates = await this.listCommissionRules({
      earner_type: ctx.earner_type,
      earner_id: ctx.earner_id,
      scope: ctx.scope,
      active: true,
    })

    const matches = candidates.filter((r) => {
      if (new Date(r.effective_from) > at) return false
      if (r.effective_to && new Date(r.effective_to) < at) return false
      if (
        r.applies_to_company_id &&
        r.applies_to_company_id !== ctx.company_id
      )
        return false
      if (
        r.applies_to_customer_tier_id &&
        r.applies_to_customer_tier_id !== ctx.customer_tier_id
      )
        return false
      return true
    })

    return matches.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority
      return specificity(b) - specificity(a)
    })[0] ?? null
  }

  /**
   * Compute amount. flat_amount_minor wins if set; else percent of
   * subtotal. Truncated toward zero — we never overpay due to FP.
   */
  computeAmount(
    rule: {
      percent: number
      flat_amount_minor: number | string | null
      margin_basis: boolean
    },
    subtotalMinor: number | bigint,
    discountMinor: number | bigint = 0n,
  ): bigint {
    if (
      rule.flat_amount_minor !== null &&
      rule.flat_amount_minor !== undefined
    ) {
      return BigInt(rule.flat_amount_minor as number | string)
    }
    const subtotal = BigInt(subtotalMinor)
    const discount = BigInt(discountMinor)
    const basis = rule.margin_basis ? subtotal - discount : subtotal
    if (basis <= 0n) return 0n
    // percent stored 0-100 with up to 2 decimals; multiply by 100
    // then divide by 10000 to apply.
    const percentBasis = BigInt(Math.round(rule.percent * 100))
    return (basis * percentBasis) / 10000n
  }

  /**
   * Write a CommissionRecord. Idempotent on (earner_type, earner_id,
   * idempotency_key) — replays return the existing row.
   */
  async earnCommission(input: {
    rule_id: string
    earner_type: EarnerType
    earner_id: string
    reference_type: "order" | "refund" | "manual"
    reference_id: string
    amount_minor: number | string | bigint
    currency_code?: string
    idempotency_key: string
    metadata?: Record<string, unknown>
  }) {
    const existing = await this.listCommissionRecords({
      earner_type: input.earner_type,
      earner_id: input.earner_id,
      idempotency_key: input.idempotency_key,
    })
    if (existing.length > 0) {
      return { record: existing[0]!, replayed: true }
    }

    const amount = BigInt(input.amount_minor as number | string | bigint)
    if (amount < 0n) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `amount_minor must be non-negative, got ${amount}`,
      )
    }

    const [record] = await this.createCommissionRecords([
      {
        rule_id: input.rule_id,
        earner_type: input.earner_type,
        earner_id: input.earner_id,
        reference_type: input.reference_type,
        reference_id: input.reference_id,
        amount_minor: Number(amount),
        currency_code: (input.currency_code ?? "inr").toLowerCase(),
        status: "pending",
        idempotency_key: input.idempotency_key,
        earned_at: new Date(),
        metadata: input.metadata ?? null,
      },
    ])
    return { record, replayed: false }
  }

  async markCommissionPaid(input: {
    record_id: string
    wallet_transaction_id?: string | null
    payout_id?: string | null
  }) {
    const record = await this.retrieveCommissionRecord(input.record_id)
    if (record.status === "paid") return record
    if (record.status === "void") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Commission ${record.id} is void; cannot mark paid`,
      )
    }
    const [updated] = await this.updateCommissionRecords([
      {
        id: input.record_id,
        status: "paid",
        paid_wallet_transaction_id: input.wallet_transaction_id ?? null,
        paid_payout_id: input.payout_id ?? null,
        paid_at: new Date(),
      },
    ])
    return updated
  }

  async voidCommission(input: { record_id: string; reason?: string }) {
    const record = await this.retrieveCommissionRecord(input.record_id)
    if (record.status === "void") return record
    const [updated] = await this.updateCommissionRecords([
      {
        id: input.record_id,
        status: "void",
        voided_at: new Date(),
        voided_reason: input.reason ?? null,
      },
    ])
    return updated
  }
}

function specificity(rule: {
  applies_to_company_id: string | null
  applies_to_customer_tier_id: string | null
}): number {
  return (
    (rule.applies_to_company_id ? 1 : 0) +
    (rule.applies_to_customer_tier_id ? 1 : 0)
  )
}

export default SalesPerformanceModuleService
