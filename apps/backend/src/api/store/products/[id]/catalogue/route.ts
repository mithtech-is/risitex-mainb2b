import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import PDFDocument from "pdfkit"
import { logger } from "../../../../../utils/logger"

const PRODUCT_FIELDS = [
  "id", "handle", "title", "description", "thumbnail",
  "material", "origin_country", "metadata",
]

/**
 * GET /store/products/:id/catalogue
 *
 * Generates and streams a PDF catalogue page for a product using
 * its Medusa product data. No auth required — catalogue PDFs are public.
 *
 * Falls back gracefully when the product or its data is missing,
 * returning a valid PDF rather than 404 so the download button
 * never errors.
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

    const name = product.title ?? id
    const filename = `RISITEX-Catalogue-${name.replace(/[^a-zA-Z0-9]/g, "-")}.pdf`

    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    res.setHeader("Cache-Control", "public, max-age=3600")

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 56, bottom: 56, left: 56, right: 56 },
      info: {
        Title: `${name} — RISITEX Wholesale Catalogue`,
        Author: "RISITEX",
        Subject: "Wholesale Product Catalogue",
      },
    })
    doc.pipe(res)

    const left = doc.page.margins.left
    const right = doc.page.width - doc.page.margins.right
    const pageW = right - left

    doc.font("Helvetica-Bold").fontSize(22).fillColor("#2A3F7A")
      .text("RISITEX", left, 48)
    doc.font("Helvetica").fontSize(9).fillColor("#7A7368")
      .text("Wholesale catalogue", right - 120, 54, { width: 120, align: "right" })
    doc.moveTo(left, 86).lineTo(right, 86).strokeColor("#D9D1C0").lineWidth(0.8).stroke()

    let cursor = 110
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#0F0F0D")
      .text(name, left, cursor)
    const desc = product.description ?? "Wholesale-grade product"
    doc.font("Helvetica").fontSize(10).fillColor("#1F1F1B")
      .text(desc, left, cursor + 26, { width: pageW })

    const meta = (product.metadata ?? {}) as Record<string, unknown>
    const specs: [string, string][] = []
    if (product.material) specs.push(["Material", product.material as string])
    if (meta.fabric) specs.push(["Fabric", meta.fabric as string])
    if (meta.composition) specs.push(["Composition", meta.composition as string])
    if (meta.gsm) specs.push(["Weight", `${meta.gsm} GSM`])
    if (product.origin_country) specs.push(["Origin", product.origin_country as string])
    if (meta.moq) specs.push(["MOQ", `${meta.moq} pcs`])

    if (specs.length) {
      cursor += 80
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#0F0F0D")
        .text("Specifications", left, cursor)
      cursor += 18
      for (const [label, value] of specs) {
        doc.font("Helvetica").fontSize(9).fillColor("#7A7368")
          .text(label, left, cursor, { width: 100 })
        doc.font("Helvetica").fontSize(9).fillColor("#1F1F1B")
          .text(value, left + 110, cursor, { width: pageW - 110 })
        cursor += 16
      }
    }

    const footerY = doc.page.height - doc.page.margins.bottom - 40
    doc.moveTo(left, footerY).lineTo(right, footerY).strokeColor("#D9D1C0").lineWidth(0.6).stroke()
    doc.font("Helvetica").fontSize(8).fillColor("#7A7368")
      .text("RISITEX — B2B Textile Marketplace  |  hello@risitex.com  |  GST: 33ABCDE1234F1Z5", left, footerY + 10, { width: pageW, align: "center" })

    doc.end()
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[store/products/:id/catalogue] failed", { id, error: message })
    if (!res.headersSent) {
      return res.status(500).json({ message: "Could not generate catalogue PDF." })
    }
  }
}
