import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  SALES_PERFORMANCE_MODULE,
  SalesPerformanceModuleService,
} from "../modules/sales_performance"

/**
 * Writes a CommissionRecord for the rep attributed to the order
 * (FR-8.02 perpetual attribution + FR-8.03 variable rate by scope
 * + FR-8.04 margin-basis when configured).
 *
 * Resolution chain
 *
 *   1. Read order via query.graph (`summary.*`, plus customer for
 *      company_id / customer_tier_id and the rep-impersonation
 *      hint on order.metadata.placed_by_rep_id).
 *   2. resolveAssignedRep — explicit rep > customer-scoped >
 *      company-scoped. Null → exit silently.
 *   3. Decide scope: first_order if the customer has zero other
 *      completed orders; else restock.
 *   4. resolveRuleForOrder — picks highest-priority active rule
 *      matching (earner_type, earner_id, scope, [tier, company]).
 *      Null → log and exit.
 *   5. computeAmount — flat_amount_minor wins if set; else percent
 *      of subtotal (or net margin when margin_basis=true).
 *   6. earnCommission — idempotent on idempotency_key=`order_<id>`.
 *
 * No commission credit happens to the rep's wallet here; payout is
 * batched into ERPNext payroll via the Phase 8 sync.
 */
export default async function commissionForOrder({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const salesPerf = container.resolve<SalesPerformanceModuleService>(
    SALES_PERFORMANCE_MODULE,
  )

  type OrderLike = {
    id: string
    customer_id: string | null
    currency_code: string
    item_subtotal: number | string | null
    subtotal: number | string | null
    total: number | string | null
    discount_total: number | string | null
    metadata: Record<string, unknown> | null
  }

  let order: OrderLike
  try {
    const { data: rows } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "customer_id",
        "currency_code",
        "item_subtotal",
        "subtotal",
        "total",
        "discount_total",
        "metadata",
        "summary.*",
      ],
      filters: { id: data.id },
    })
    if (!rows?.length) {
      logger.warn(`[commission] order ${data.id} not found via query`)
      return
    }
    order = rows[0] as unknown as OrderLike
  } catch (err) {
    logger.warn(
      `[commission] order ${data.id} not retrievable: ${err instanceof Error ? err.message : err}`,
    )
    return
  }

  if (!order.customer_id) return

  // Read the customer's B2B fields (company_id, customer_tier_id).
  // These columns live on Medusa's `customer` table (added by
  // migrations/2026-06-15_customer-b2b-fields.sql) but the core
  // CustomerService doesn't surface them. Use query.graph and
  // pull the B2B extension fields by literal field names.
  let companyId: string | null = null
  let tierId: string | null = null
  try {
    const { data: customers } = await query.graph({
      entity: "customer",
      fields: ["id", "company_id", "customer_tier_id"],
      filters: { id: order.customer_id },
    })
    const c = customers?.[0] as
      | { company_id: string | null; customer_tier_id: string | null }
      | undefined
    companyId = c?.company_id ?? null
    tierId = c?.customer_tier_id ?? null
  } catch {
    // Customer not resolvable — proceed without B2B context; rule
    // resolution will fall back to non-narrowed defaults.
  }

  const placedByRepId = (order.metadata?.placed_by_rep_id ?? null) as
    | string
    | null

  const rep = await salesPerf.resolveAssignedRep({
    customer_id: order.customer_id,
    company_id: companyId,
    placed_by_rep_id: placedByRepId,
    at: new Date(),
  })
  if (!rep) {
    logger.info(
      `[commission] order ${order.id} has no attributed rep — skipping`,
    )
    return
  }

  // Scope: first_order if this is the customer's first completed
  // order, else restock. Count via query.graph (cheap; customer
  // order history is short).
  let priorOrderCount = 0
  try {
    const { data: priors } = await query.graph({
      entity: "order",
      fields: ["id"],
      filters: { customer_id: order.customer_id },
    })
    priorOrderCount = Math.max(0, (priors?.length ?? 0) - 1) // minus this order
  } catch {
    priorOrderCount = 0
  }
  const scope: "first_order" | "restock" =
    priorOrderCount === 0 ? "first_order" : "restock"

  const rule = await salesPerf.resolveRuleForOrder({
    earner_type: "sales_rep",
    earner_id: rep.id,
    scope,
    customer_tier_id: tierId,
    company_id: companyId,
    at: new Date(),
  })
  if (!rule) {
    logger.info(
      `[commission] order ${order.id} → rep ${rep.id} has no active rule for scope=${scope} — skipping`,
    )
    return
  }

  const subtotal = Math.max(
    0,
    Math.round(
      Number(order.item_subtotal ?? order.subtotal ?? order.total ?? 0),
    ),
  )
  const discount = Math.max(0, Math.round(Number(order.discount_total ?? 0)))
  const amount = salesPerf.computeAmount(rule, subtotal, discount)
  if (amount <= 0n) {
    logger.info(
      `[commission] order ${order.id} computed amount is 0 — skipping`,
    )
    return
  }

  try {
    const result = await salesPerf.earnCommission({
      rule_id: rule.id,
      earner_type: "sales_rep",
      earner_id: rep.id,
      reference_type: "order",
      reference_id: order.id,
      amount_minor: amount.toString(),
      currency_code: order.currency_code ?? "inr",
      idempotency_key: `order_${order.id}`,
      metadata: {
        scope,
        rule_name: rule.name,
        rule_percent: rule.percent,
        rule_flat_amount_minor: rule.flat_amount_minor,
        rule_margin_basis: rule.margin_basis,
        order_subtotal_paise: subtotal,
        order_discount_paise: discount,
        placed_by_rep_id: placedByRepId,
      },
    })

    // FR-8.05: append the rep id + commission value to the order payload so
    // the ERPNext Order→Sales Order sync carries it into payroll / rep
    // performance reporting. employee_id is the ERPNext join key.
    try {
      const orderModule = container.resolve(Modules.ORDER)
      await orderModule.updateOrders([
        {
          id: order.id,
          metadata: {
            ...(order.metadata ?? {}),
            sales_rep_id: rep.id,
            sales_rep_employee_id: (rep as any).employee_id ?? null,
            commission_amount_minor: amount.toString(),
            commission_currency: (order.currency_code ?? "inr").toLowerCase(),
            commission_record_id: result.record.id,
          },
        },
      ])
    } catch (stampErr) {
      logger.warn(
        `[commission] order ${order.id} ERP-metadata stamp failed: ${stampErr instanceof Error ? stampErr.message : stampErr}`,
      )
    }

    if (result.replayed) {
      logger.info(
        `[commission] order ${order.id} replay — record ${result.record.id} already exists`,
      )
    } else {
      logger.info(
        `[commission] order ${order.id} · rep ${rep.id} · ${scope} · ${amount} paise → ${result.record.id}`,
      )
    }
  } catch (err) {
    logger.warn(
      `[commission] earnCommission failed for order ${order.id}: ${err instanceof Error ? err.message : err}`,
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
