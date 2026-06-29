import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  CREDIT_TERMS_MODULE,
  CreditTermsModuleService,
} from "../../../../modules/credit_terms"
import { COMPANY_MODULE } from "../../../../modules/company"
import type { CompanyModuleService } from "../../../../modules/company"
import { logger } from "../../../../utils/logger"

/**
 * GET /store/credit-terms/me
 *
 * Resolve the authenticated customer's credit policy and current
 * utilisation:
 *
 *   - terms          : the CreditTerms row that governs this customer
 *                      (resolved via customer.payment_terms → company
 *                      .credit_terms_id → customer_tier.default_payment_terms)
 *   - limit_major    : max_outstanding_minor / 100 (null if no cap)
 *   - used_major     : sum of (order.total) where payment_status is
 *                      not captured / refunded — i.e. money the
 *                      customer currently owes RISITEX
 *   - utilisation_trend : 24 weekly buckets of order spend (major)
 *   - invoices       : recent orders projected into invoice shape with
 *                      due_at, status, days_to_due
 *
 * Returns `terms: null` (with `mode: "prepaid"`) when the customer
 * has no Net-terms policy attached — the storefront uses that to
 * show "you're on prepaid terms" instead of an empty credit panel.
 */

type CreditTermsRow = {
  id: string
  code: string
  name: string
  days: number
  advance_pct: number
  max_outstanding_minor?: number | null
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata
    ?.customer_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Not authenticated" })
  }

  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

    // ── Resolve customer + company + tier ────────────────────────
    const { data: customers } = await query.graph({
      entity: "customer",
      fields: [
        "id",
        "company_id",
        "customer_tier_id",
        "payment_terms",
      ],
      filters: { id: customerId },
    })
    const customer = customers?.[0] as
      | {
          id: string
          company_id: string | null
          customer_tier_id: string | null
          payment_terms: string | null
        }
      | undefined
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" })
    }

    let companyCreditTermsId: string | null = null
    let companyTierId: string | null = null
    let companyTradeName: string | null = null
    if (customer.company_id) {
      const companies = req.scope.resolve<CompanyModuleService>(COMPANY_MODULE)
      const company = await companies
        .retrieveCompany(customer.company_id)
        .catch(() => null)
      if (company) {
        companyCreditTermsId = (company as any).credit_terms_id ?? null
        companyTierId = company.customer_tier_id ?? null
        companyTradeName = (company as any).trade_name ?? null
      }
    }

    const tierId = customer.customer_tier_id ?? companyTierId
    let tierName: string | null = null
    let tierDefaultTermsCode: string | null = null
    if (tierId) {
      const { data: tiers } = await query.graph({
        entity: "customer_tier",
        fields: ["id", "code", "name", "default_payment_terms"],
        filters: { id: tierId },
      })
      const t = tiers?.[0] as
        | { name: string; default_payment_terms: string }
        | undefined
      if (t) {
        tierName = t.name
        tierDefaultTermsCode = t.default_payment_terms
      }
    }

    // ── Resolve CreditTerms row ──────────────────────────────────
    const creditTermsModule = req.scope.resolve(
      CREDIT_TERMS_MODULE,
    ) as CreditTermsModuleService
    const listTerms = (
      creditTermsModule as unknown as {
        listCreditTerms: (
          filters: Record<string, unknown>,
          config?: { take?: number },
        ) => Promise<CreditTermsRow[]>
      }
    ).listCreditTerms

    let terms: CreditTermsRow | null = null
    if (companyCreditTermsId) {
      const rows = await listTerms({ id: companyCreditTermsId })
      terms = rows?.[0] ?? null
    }
    if (!terms && customer.payment_terms) {
      const rows = await listTerms({ code: customer.payment_terms })
      terms = rows?.[0] ?? null
    }
    if (!terms && tierDefaultTermsCode) {
      const rows = await listTerms({ code: tierDefaultTermsCode })
      terms = rows?.[0] ?? null
    }

    // ── Pull recent orders (24w window covers tile + trend + invoices) ──
    const sinceMs = Date.now() - 24 * 7 * 86_400_000
    const sinceIso = new Date(sinceMs).toISOString()
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "created_at",
        "status",
        "payment_status",
        "total",
        "currency_code",
      ],
      filters: { customer_id: customerId },
      pagination: { take: 200 },
    })

    type Ord = {
      id: string
      display_id: number | string
      created_at: string
      status: string | null
      payment_status: string | null
      total: number
      currency_code?: string | null
    }
    const orderRows = (orders ?? []) as Ord[]

    // Used credit = unpaid order totals. Treat captured / refunded as settled.
    const isPaid = (p: string | null) => p === "captured" || p === "refunded"
    const usedMajor = orderRows
      .filter((o) => !isPaid(o.payment_status))
      .reduce((s, o) => s + Number(o.total ?? 0), 0)

    // 24-week trend over total spend (paid + unpaid).
    const weeks = 24
    const trend = new Array(weeks).fill(0) as number[]
    const weekMs = 7 * 86_400_000
    const start = Date.now() - weeks * weekMs
    for (const o of orderRows) {
      const t = new Date(o.created_at).getTime()
      if (Number.isNaN(t) || t < start) continue
      const idx = Math.min(weeks - 1, Math.floor((t - start) / weekMs))
      trend[idx] = (trend[idx] ?? 0) + Number(o.total ?? 0)
    }

    // Project orders → invoices.
    const days = terms?.days ?? 0
    const nowMs = Date.now()
    const invoices = orderRows
      .filter((o) => new Date(o.created_at).getTime() >= sinceMs)
      .map((o) => {
        const createdMs = new Date(o.created_at).getTime()
        const dueMs =
          days > 0 ? createdMs + days * 86_400_000 : createdMs
        const paid = isPaid(o.payment_status)
        const daysToDue = Math.floor((dueMs - nowMs) / 86_400_000)
        const status = paid
          ? "paid"
          : daysToDue < 0
            ? "overdue"
            : daysToDue <= 3
              ? "due_soon"
              : "due"
        return {
          id: o.id,
          order_id: o.id,
          display_id: o.display_id,
          amount_major: Number(o.total ?? 0),
          created_at: o.created_at,
          due_at: new Date(dueMs).toISOString(),
          days_to_due: daysToDue,
          status,
          payment_status: o.payment_status,
        }
      })
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )

    const limitMajor = terms?.max_outstanding_minor
      ? Math.round(Number(terms.max_outstanding_minor) / 100)
      : null

    // ── Compose response ─────────────────────────────────────────
    if (!terms) {
      return res.json({
        mode: "prepaid" as const,
        company_trade_name: companyTradeName,
        tier_name: tierName,
        terms: null,
        limit_major: null,
        used_major: 0,
        utilisation_trend: trend,
        invoices,
      })
    }

    return res.json({
      mode: "credit" as const,
      company_trade_name: companyTradeName,
      tier_name: tierName,
      terms: {
        id: terms.id,
        code: terms.code,
        name: terms.name,
        days: terms.days,
        advance_pct: terms.advance_pct,
      },
      limit_major: limitMajor,
      used_major: Math.round(usedMajor),
      utilisation_trend: trend,
      invoices,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[store/credit-terms/me] failed", {
      customer_id: customerId,
      error: message,
    })
    return res.status(500).json({
      message: "Couldn't load credit terms.",
      detail: process.env.NODE_ENV !== "production" ? message : undefined,
    })
  }
}
