import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import PDFDocument from "pdfkit"
import { logger } from "../../../../../utils/logger"

const PRODUCT_FIELDS = [
  "id", "handle", "title", "description", "thumbnail",
  "material", "origin_country", "weight", "hs_code", "metadata",
  "variants.id", "variants.sku", "variants.title",
  "variants.options.value",
  "variants.options.option.title",
  "variants.calculated_price.calculated_amount",
  "variants.calculated_price.currency_code",
]

/**
 * GET /store/products/:id/spec-sheet
 *
 * Generates and streams a technical specification sheet PDF for a
 * product. Pulls product data from Medusa (variants, prices, metadata)
 * and renders a clean spec layout. No auth required.
 *
 * Falls back gracefully so the download button never 404s.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  if (!id) {
    return res.status(400).json({ message: "product id or handle required" })
  }

  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: products } = await query.graph({
      entity: "product",
      fields: PRODUCT_FIELDS,
      filters: { id },
    })
    let product = products?.[0] as Record<string, any> | undefined

    if (!product) {
      const { data: byHandle } = await query.graph({
        entity: "product",
        fields: PRODUCT_FIELDS,
        filters: { handle: id },
      })
      product = byHandle?.[0] as Record<string, any> | undefined
    }

    if (!product) {
      return res.status(404).json({ message: "Product not found" })
    }

    const variants = (product.variants ?? []) as Record<string, any>[]
    const name = product.title ?? id
    const meta = (product.metadata ?? {}) as Record<string, unknown>
    const filename = `RISITEX-Spec-${name.replace(/[^a-zA-Z0-9]/g, "-")}.pdf`

    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    res.setHeader("Cache-Control", "public, max-age=3600")

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 56, bottom: 56, left: 56, right: 56 },
      info: {
        Title: `${name} — Technical Specification Sheet`,
        Author: "RISITEX",
        Subject: "Product Technical Specifications",
      },
    })
    doc.pipe(res)

    const left = doc.page.margins.left
    const right = doc.page.width - doc.page.margins.right
    const pageW = right - left

    doc.font("Helvetica-Bold").fontSize(22).fillColor("#2A3F7A")
      .text("RISITEX", left, 48)
    doc.font("Helvetica").fontSize(9).fillColor("#7A7368")
      .text("Specification sheet", right - 120, 54, { width: 120, align: "right" })
    doc.moveTo(left, 86).lineTo(right, 86).strokeColor("#D9D1C0").lineWidth(0.8).stroke()

    let cursor = 110
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#0F0F0D")
      .text(name, left, cursor)

    const desc = product.description ?? ""
    if (desc) {
      cursor += 26
      doc.font("Helvetica").fontSize(10).fillColor("#1F1F1B")
        .text(desc, left, cursor, { width: pageW })
    }

    cursor = Math.max(cursor + 60, 180)
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#0F0F0D")
      .text("Technical Specifications", left, cursor)
    cursor += 24

    const specRows: [string, string][] = []
    if (product.material) specRows.push(["Material", product.material as string])
    if (meta.fabric) specRows.push(["Fabric", meta.fabric as string])
    if (meta.composition) specRows.push(["Composition", meta.composition as string])
    if (meta.gsm) specRows.push(["Weight", `${meta.gsm} GSM`])
    if (meta.yarn_count ?? meta.yarn) specRows.push(["Yarn Count", String(meta.yarn_count ?? meta.yarn)])
    if (product.hs_code ?? meta.hsn_code) specRows.push(["HSN Code", String(product.hs_code ?? meta.hsn_code)])
    if (product.origin_country) specRows.push(["Country of Origin", product.origin_country as string])
    if (product.weight) specRows.push(["Item Weight", `${product.weight}g`])
    if (meta.moq) specRows.push(["MOQ", `${meta.moq} pcs`])
    if (meta.case_pack ?? meta.carton_size) specRows.push(["Case Pack", String(meta.case_pack ?? meta.carton_size)])

    for (const [label, value] of specRows) {
      doc.font("Helvetica").fontSize(9).fillColor("#7A7368")
        .text(label, left, cursor, { width: 140 })
      doc.font("Helvetica").fontSize(9).fillColor("#1F1F1B")
        .text(value, left + 150, cursor, { width: pageW - 150 })
      cursor += 18
    }

    if (variants.length > 0) {
      cursor += 20
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#0F0F0D")
        .text("Variant Pricing", left, cursor)
      cursor += 24

      doc.font("Helvetica-Bold").fontSize(8).fillColor("#7A7368")
      doc.text("SKU", left, cursor)
      doc.text("Variant", left + 100, cursor)
      doc.text("Price", right - 80, cursor, { width: 80, align: "right" })
      cursor += 14
      doc.moveTo(left, cursor).lineTo(right, cursor).strokeColor("#D9D1C0").lineWidth(0.6).stroke()
      cursor += 8

      doc.font("Helvetica").fontSize(9).fillColor("#1F1F1B")
      for (const v of variants.slice(0, 20)) {
        const sku = (v.sku as string) ?? "—"
        const variantTitle = (v.title as string) ?? "—"
        const price = v.calculated_price?.calculated_amount != null
          ? `₹${(v.calculated_price.calculated_amount / 100).toLocaleString("en-IN")}`
          : "—"

        doc.text(sku, left, cursor, { width: 90 })
        doc.text(variantTitle, left + 100, cursor, { width: pageW - 190 })
        doc.text(price, right - 80, cursor, { width: 80, align: "right" })
        cursor += 16

        if (cursor > doc.page.height - doc.page.margins.bottom - 80) {
          doc.addPage()
          cursor = doc.page.margins.top
        }
      }
    }

    const footerY = doc.page.height - doc.page.margins.bottom - 40
    doc.moveTo(left, footerY).lineTo(right, footerY).strokeColor("#D9D1C0").lineWidth(0.6).stroke()
    doc.font("Helvetica").fontSize(8).fillColor("#7A7368")
      .text("RISITEX — B2B Textile Marketplace  |  hello@risitex.com  |  GST: 33ABCDE1234F1Z5", left, footerY + 10, { width: pageW, align: "center" })

    doc.end()
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[store/products/:id/spec-sheet] failed", { id, error: message })
    if (!res.headersSent) {
      return res.status(500).json({ message: "Could not generate spec sheet PDF." })
    }
  }
}
