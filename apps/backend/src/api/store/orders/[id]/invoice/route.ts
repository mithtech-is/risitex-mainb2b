import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import PDFDocument from "pdfkit"
import { COMPANY_MODULE } from "../../../../../modules/company"
import type { CompanyModuleService } from "../../../../../modules/company"
import {
  PURCHASE_ORDER_MODULE,
  PurchaseOrderModuleService,
} from "../../../../../modules/purchase_order"
import { COMPANY } from "../../../../../lib/company"
import { logger } from "../../../../../utils/logger"

/**
 * GET /store/orders/:id/invoice
 *
 * Streams an `application/pdf` invoice for the authenticated customer.
 * The `:id` may be EITHER a Medusa order id OR a purchase-order id — an
 * approved PO that hasn't been promoted to a Medusa order yet still gets a
 * real invoice (synthesised from the PO), so the storefront never has to
 * fall back to a client-side "demo" PDF.
 *
 * Layout:
 *   1. Header band  : RISITEX wordmark + "TAX INVOICE" eyebrow
 *   2. Company info : trade name / GSTIN / billing address
 *   3. Invoice meta : invoice no, date, customer email, statuses
 *   4. Bill / Ship  : two side-by-side address blocks
 *   5. Items table  : SKU / product / qty / unit / amount
 *   6. Summary      : subtotal / shipping / tax / wallet / total
 *   7. Footer       : terms reminder + contact line
 *
 * Money is shown in INR major units (Medusa V2 order totals are already
 * major; PO value is minor, converted on synthesis).
 *
 * Ownership: the order/PO must belong to the caller.
 */

const ORDER_FIELDS = [
  "id",
  "display_id",
  "created_at",
  "currency_code",
  "status",
  "payment_status",
  "fulfillment_status",
  "subtotal",
  "shipping_total",
  "tax_total",
  "discount_total",
  "total",
  "email",
  "metadata",
  "customer_id",
  "items.id",
  "items.title",
  "items.variant_title",
  "items.variant_sku",
  "items.quantity",
  "items.unit_price",
  "items.subtotal",
  "items.total",
  "shipping_address.first_name",
  "shipping_address.last_name",
  "shipping_address.address_1",
  "shipping_address.address_2",
  "shipping_address.city",
  "shipping_address.province",
  "shipping_address.postal_code",
  "shipping_address.country_code",
  "shipping_address.phone",
  "billing_address.first_name",
  "billing_address.last_name",
  "billing_address.company",
  "billing_address.address_1",
  "billing_address.address_2",
  "billing_address.city",
  "billing_address.province",
  "billing_address.postal_code",
  "billing_address.country_code",
  "billing_address.phone",
]

type QueryLike = {
  graph: (args: {
    entity: string
    fields: string[]
    filters: Record<string, unknown>
  }) => Promise<{ data: any[] }>
}

async function loadOrder(
  query: QueryLike,
  id: string,
): Promise<(Record<string, any> & { customer_id?: string | null }) | undefined> {
  try {
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ORDER_FIELDS,
      filters: { id },
    })
    return orders?.[0]
  } catch {
    return undefined
  }
}

type CustomerLite = {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  company_id: string | null
} | null

/**
 * Build an order-shaped object from a purchase order so the SAME real
 * renderer runs even when the PO was never promoted to a Medusa order.
 */
function synthesizeOrderFromPo(
  po: Record<string, any>,
  customer: CustomerLite,
  companyTradeName: string | null,
): Record<string, any> {
  const major = Math.round(Number(po.value_minor ?? 0) / 100)
  const meta = (po.metadata ?? {}) as Record<string, any>
  const billing =
    customer || companyTradeName
      ? {
          first_name: customer?.first_name ?? null,
          last_name: customer?.last_name ?? null,
          company: companyTradeName,
        }
      : null
  return {
    id: po.id,
    display_id: po.po_number,
    created_at: po.created_at,
    currency_code: po.currency_code ?? "inr",
    status: meta.dispatched_at ? "completed" : "pending",
    payment_status: meta.payment_confirmed_at ? "captured" : "not_paid",
    fulfillment_status: meta.dispatched_at ? "shipped" : "not_fulfilled",
    subtotal: major,
    shipping_total: 0,
    tax_total: 0,
    discount_total: 0,
    total: major,
    email: customer?.email ?? null,
    metadata: meta,
    customer_id: po.customer_id,
    items: [
      {
        variant_sku: po.po_number,
        title: `Wholesale order — Purchase Order ${po.po_number}`,
        variant_title: null,
        quantity: 1,
        unit_price: major,
        subtotal: major,
        total: major,
      },
    ],
    billing_address: billing,
    shipping_address: null,
  }
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata
    ?.customer_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Not authenticated" })
  }
  const { id } = req.params as { id: string }
  if (!id) {
    return res.status(400).json({ message: "order or PO id required" })
  }

  try {
    const query = req.scope.resolve(
      ContainerRegistrationKeys.QUERY,
    ) as unknown as QueryLike

    // Resolve the caller once — used for the bill-to block, the bill-from
    // company, and ownership checks on PO-derived invoices.
    let customer: CustomerLite = null
    try {
      const { data: customers } = await query.graph({
        entity: "customer",
        fields: ["id", "email", "first_name", "last_name", "company_id"],
        filters: { id: customerId },
      })
      customer = (customers?.[0] as CustomerLite) ?? null
    } catch {
      // non-fatal
    }

    // Company (bill-from GSTIN) — from the customer's linked company.
    let companyTradeName: string | null = null
    let companyGstin: string | null = null
    let companyBillingAddress: string | null = null
    try {
      const companyId = customer?.company_id ?? null
      if (companyId) {
        const companies =
          req.scope.resolve<CompanyModuleService>(COMPANY_MODULE)
        const company = await companies
          .retrieveCompany(companyId)
          .catch(() => null)
        if (company) {
          companyTradeName = (company as any).trade_name ?? null
          companyGstin = (company as any).gstin ?? null
          const ba = (company as any).billing_address as
            | Record<string, unknown>
            | null
          if (ba) {
            companyBillingAddress = [
              ba.address_1,
              ba.address_2,
              [ba.city, ba.province, ba.postal_code].filter(Boolean).join(", "),
            ]
              .filter(Boolean)
              .join(" · ") as string
          }
        }
      }
    } catch {
      // non-fatal — invoice still renders without company block.
    }

    // The id may be a Medusa order id OR a purchase-order id. Try order first.
    let order = await loadOrder(query, id)

    if (order) {
      if (order.customer_id && order.customer_id !== customerId) {
        return res.status(403).json({ message: "Not your order" })
      }
    } else {
      // Not an order → resolve as a purchase order.
      const poModule = req.scope.resolve(
        PURCHASE_ORDER_MODULE,
      ) as PurchaseOrderModuleService
      const po = await (
        poModule as unknown as {
          retrievePurchaseOrder: (id: string) => Promise<any>
        }
      )
        .retrievePurchaseOrder(id)
        .catch(() => null)
      if (!po) {
        return res.status(404).json({ message: "Order not found" })
      }
      if (po.customer_id && po.customer_id !== customerId) {
        return res.status(403).json({ message: "Not your order" })
      }
      // If the PO has since been promoted to an order, invoice the order.
      if (po.order_id) {
        order = await loadOrder(query, po.order_id)
      }
      // Otherwise synthesise an order-shaped object from the PO.
      if (!order) {
        order = synthesizeOrderFromPo(po, customer, companyTradeName)
      }
    }

    // Invoice number: numeric order display_id → RST-NNNNNN; PO number as-is.
    const rawDisplay = order.display_id ?? order.id
    const invoiceNo = /^\d+$/.test(String(rawDisplay))
      ? `RST-${String(rawDisplay).padStart(6, "0")}`
      : String(rawDisplay)
    const filename = `${invoiceNo.replace(/[^\w.-]+/g, "-")}.pdf`

    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    res.setHeader("Cache-Control", "private, no-store")

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 56, bottom: 56, left: 56, right: 56 },
      info: {
        Title: `RISITEX Invoice ${invoiceNo}`,
        Author: "RISITEX",
        Creator: "RISITEX Storefront",
      },
    })
    doc.pipe(res)

    renderInvoice(doc, {
      order,
      invoiceNo,
      companyTradeName,
      companyGstin,
      companyBillingAddress,
    })

    doc.end()
    return
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[store/orders/:id/invoice] failed", {
      customer_id: customerId,
      id,
      error: message,
    })
    // If headers were already flushed, we can't send JSON. Best effort.
    if (!res.headersSent) {
      return res.status(500).json({
        message: "Couldn't generate invoice.",
        detail: process.env.NODE_ENV !== "production" ? message : undefined,
      })
    }
    return
  }
}

// ──────────────────────────────────────────────────────────────────
// Layout
// ──────────────────────────────────────────────────────────────────

type InvoiceCtx = {
  order: Record<string, any>
  invoiceNo: string
  companyTradeName: string | null
  companyGstin: string | null
  companyBillingAddress: string | null
}

const COLOUR = {
  ink: "#0F0F0D",
  text: "#1F1F1B",
  muted: "#7A7368",
  rule: "#D9D1C0",
  brand: "#2A3F7A",
  bg: "#F7F4EE",
}

// pdfkit's built-in Helvetica is WinAnsi-encoded and has no rupee glyph
// (U+20B9), so use an ASCII-safe prefix to keep amounts legible.
function fmtINR(n: unknown): string {
  const v = Number(n ?? 0)
  if (!Number.isFinite(v)) return "Rs. 0"
  return `Rs. ${Math.round(v).toLocaleString("en-IN")}`
}
function addr(a?: Record<string, unknown> | null): string[] {
  if (!a) return ["—"]
  const lines: string[] = []
  const name = [a.first_name, a.last_name].filter(Boolean).join(" ")
  if (name) lines.push(name as string)
  if (a.company) lines.push(a.company as string)
  if (a.address_1) lines.push(a.address_1 as string)
  if (a.address_2) lines.push(a.address_2 as string)
  const cityLine = [a.city, a.province, a.postal_code]
    .filter(Boolean)
    .join(", ")
  if (cityLine) lines.push(cityLine)
  if (a.country_code) lines.push(String(a.country_code).toUpperCase())
  if (a.phone) lines.push(a.phone as string)
  return lines.length ? lines : ["—"]
}

function renderInvoice(doc: PDFKit.PDFDocument, ctx: InvoiceCtx): void {
  const { order, invoiceNo } = ctx
  const left = doc.page.margins.left
  const right = doc.page.width - doc.page.margins.right
  const pageW = right - left

  // ── 1. Header band ──────────────────────────────────────────────
  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .fillColor(COLOUR.brand)
    .text("RISITEX", left, 48)
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLOUR.muted)
    .text("Tax invoice", right - 80, 52, { width: 80, align: "right" })

  doc
    .moveTo(left, 86)
    .lineTo(right, 86)
    .strokeColor(COLOUR.rule)
    .lineWidth(0.8)
    .stroke()

  // ── 2. Bill-from (seller = RISITEX) / invoice meta two-column ───
  const metaTop = 100
  doc.fontSize(9).fillColor(COLOUR.muted).text("From", left, metaTop)
  doc.fontSize(11).fillColor(COLOUR.text).font("Helvetica-Bold")
    .text(COMPANY.name, left, metaTop + 12)
  doc.font("Helvetica").fontSize(9).fillColor(COLOUR.muted)
    .text(
      [
        COMPANY.address,
        `GSTIN: ${COMPANY.gstin}`,
        COMPANY.email,
        COMPANY.phone,
      ].join("\n"),
      left,
      metaTop + 28,
      { width: pageW / 2 - 12 },
    )

  // Right column — invoice number, date, status
  const rightColX = left + pageW / 2 + 12
  const rightColW = pageW / 2 - 12
  doc.fontSize(9).fillColor(COLOUR.muted)
    .text("Invoice no.", rightColX, metaTop, { width: rightColW })
  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOUR.ink)
    .text(invoiceNo, rightColX, metaTop + 12, { width: rightColW })

  const issued = order.created_at
    ? new Date(order.created_at).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—"
  doc.font("Helvetica").fontSize(9).fillColor(COLOUR.muted)
    .text(`Issued: ${issued}`, rightColX, metaTop + 32, {
      width: rightColW,
    })

  const payStatus = order.payment_status ?? "—"
  const fulStatus = order.fulfillment_status ?? "—"
  doc.text(
    `Payment: ${payStatus}   ·   Fulfillment: ${fulStatus}`,
    rightColX,
    metaTop + 46,
    { width: rightColW },
  )

  // ── 3. Bill to / Ship to ────────────────────────────────────────
  const addrTop = 190
  doc.fontSize(9).fillColor(COLOUR.muted)
    .text("Bill to", left, addrTop)
  doc.font("Helvetica").fontSize(10).fillColor(COLOUR.text)
    .text(
      addr(order.billing_address ?? order.shipping_address).join("\n"),
      left,
      addrTop + 14,
      { width: pageW / 2 - 12 },
    )
  if (order.email) {
    doc.fontSize(9).fillColor(COLOUR.muted)
      .text(order.email as string, left, doc.y + 4)
  }
  if (ctx.companyGstin) {
    doc.fontSize(9).fillColor(COLOUR.muted)
      .text(`GSTIN: ${ctx.companyGstin}`, left, doc.y + 4)
  }

  doc.fontSize(9).fillColor(COLOUR.muted)
    .text("Ship to", rightColX, addrTop)
  doc.font("Helvetica").fontSize(10).fillColor(COLOUR.text)
    .text(
      addr(order.shipping_address ?? order.billing_address).join("\n"),
      rightColX,
      addrTop + 14,
      { width: rightColW },
    )

  // ── 4. Items table ──────────────────────────────────────────────
  let cursor = Math.max(doc.y + 20, addrTop + 120)
  const colSku = left
  const colName = left + 90
  const colQty = left + pageW * 0.55
  const colUnit = left + pageW * 0.7
  const colAmt = left + pageW * 0.85
  const tableTop = cursor

  doc
    .moveTo(left, tableTop - 6)
    .lineTo(right, tableTop - 6)
    .strokeColor(COLOUR.rule)
    .lineWidth(0.6)
    .stroke()

  doc.fontSize(8).fillColor(COLOUR.muted).font("Helvetica-Bold")
  doc.text("SKU", colSku, tableTop)
  doc.text("ITEM", colName, tableTop)
  doc.text("QTY", colQty, tableTop, { width: 40, align: "right" })
  doc.text("UNIT", colUnit, tableTop, { width: 60, align: "right" })
  doc.text("AMOUNT", colAmt, tableTop, {
    width: right - colAmt,
    align: "right",
  })

  doc
    .moveTo(left, tableTop + 12)
    .lineTo(right, tableTop + 12)
    .strokeColor(COLOUR.rule)
    .lineWidth(0.6)
    .stroke()

  cursor = tableTop + 18
  doc.font("Helvetica").fontSize(9).fillColor(COLOUR.text)
  const items = (order.items ?? []) as Array<Record<string, any>>
  if (items.length === 0) {
    doc.text("No line items captured.", colSku, cursor + 4)
    cursor += 24
  } else {
    for (const it of items) {
      const sku = (it.variant_sku as string | null) ?? "—"
      const name =
        ((it.title as string | null) ?? "—") +
        (it.variant_title ? ` · ${it.variant_title}` : "")
      const qty = Number(it.quantity ?? 0)
      const unit = Number(it.unit_price ?? 0)
      const amt = Number(it.subtotal ?? it.total ?? unit * qty)

      doc.fillColor(COLOUR.muted).fontSize(8)
        .text(sku, colSku, cursor, { width: 80 })
      doc.fillColor(COLOUR.text).fontSize(9)
        .text(name, colName, cursor, {
          width: colQty - colName - 6,
        })
      doc.fillColor(COLOUR.text)
        .text(String(qty), colQty, cursor, {
          width: 40,
          align: "right",
        })
      doc.text(fmtINR(unit), colUnit, cursor, {
        width: 60,
        align: "right",
      })
      doc.text(fmtINR(amt), colAmt, cursor, {
        width: right - colAmt,
        align: "right",
      })

      const rowH = Math.max(
        doc.heightOfString(name, { width: colQty - colName - 6 }),
        14,
      )
      cursor += rowH + 6

      if (cursor > doc.page.height - doc.page.margins.bottom - 160) {
        doc.addPage()
        cursor = doc.page.margins.top
      }
    }
  }

  doc
    .moveTo(left, cursor)
    .lineTo(right, cursor)
    .strokeColor(COLOUR.rule)
    .lineWidth(0.6)
    .stroke()
  cursor += 12

  // ── 5. Summary block (right-aligned) ────────────────────────────
  const sumX = left + pageW * 0.55
  const sumLabelW = pageW * 0.2
  const sumValW = right - sumX - sumLabelW

  const walletApply = (order.metadata?.wallet_apply ?? null) as
    | { amount_paise?: number }
    | null
  const walletApplied = Number(walletApply?.amount_paise ?? 0) / 100

  const rows: Array<[string, string, boolean]> = [
    ["Subtotal", fmtINR(order.subtotal), false],
    ["Shipping", fmtINR(order.shipping_total), false],
    ["Tax", fmtINR(order.tax_total), false],
  ]
  if (Number(order.discount_total ?? 0) > 0) {
    rows.push(["Discount", `− ${fmtINR(order.discount_total)}`, false])
  }
  if (walletApplied > 0) {
    rows.push(["Wallet applied", `− ${fmtINR(walletApplied)}`, false])
  }
  rows.push(["Total", fmtINR(order.total), true])

  doc.font("Helvetica").fontSize(10)
  for (const [label, value, bold] of rows) {
    doc.fillColor(bold ? COLOUR.ink : COLOUR.muted)
    doc.font(bold ? "Helvetica-Bold" : "Helvetica")
    doc.text(label, sumX, cursor, { width: sumLabelW })
    doc.fillColor(bold ? COLOUR.ink : COLOUR.text)
    doc.text(value, sumX + sumLabelW, cursor, {
      width: sumValW,
      align: "right",
    })
    cursor += bold ? 20 : 14
  }

  // ── 6. Footer ───────────────────────────────────────────────────
  const footerY = Math.max(
    cursor + 24,
    doc.page.height - doc.page.margins.bottom - 70,
  )
  doc
    .moveTo(left, footerY)
    .lineTo(right, footerY)
    .strokeColor(COLOUR.rule)
    .lineWidth(0.6)
    .stroke()
  doc.font("Helvetica").fontSize(8).fillColor(COLOUR.muted)
    .text(
      "Thank you for ordering from RISITEX. Returns within 7 days for unworn items in original packaging. " +
        `Disputes: ${COMPANY.email}`,
      left,
      footerY + 10,
      { width: pageW, align: "left" },
    )
}
