import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { parseCsvToObjects } from "../../../../utils/csv"

const CALCULA_FIELDS = [
  "company_name",
  "sector",
  "industry",
  "founded",
  "headquarters",
  "share_type",
  "listing_status",
  "market_cap",
  "valuation",
  "pe_ratio",
  "pb_ratio",
  "roe_value",
  "debt_to_equity",
  "book_value",
  "fifty_two_week_high",
  "fifty_two_week_low",
  "face_value",
  "lot_size",
  "total_shares",
  "cin",
  "pan_number",
  "rta",
  "depository",
  "description",
] as const

const FORBIDDEN_COLUMNS = [
  "weight",
  "length",
  "height",
  "width",
  "material",
  "origin_country",
  "hs_code",
  "mid_code",
  "shipping_profile_id",
]

const DEFAULT_CURRENCY = (process.env.IMPORT_SHARES_CURRENCY || "inr").toLowerCase()

/**
 * POST /admin/products/import-shares
 *
 * Shares-focused bulk importer. Accepts either:
 *   - multipart/form-data with a CSV "file"
 *   - application/json { rows: [...] }
 *
 * Required per row: `title`, `isin`. Rejects shipping/weight/dimension columns
 * at the header level to keep the contract shares-only.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    let rows: Array<Record<string, string>> = []
    let header: string[] = []

    const file = (req as any).file as { buffer?: Buffer } | undefined
    if (file?.buffer) {
      const parsed = parseCsvToObjects(file.buffer.toString("utf8"))
      header = parsed.header
      rows = parsed.rows
    } else {
      const body = (req.body || {}) as { rows?: any[] }
      rows = Array.isArray(body.rows) ? body.rows : []
      header = rows.length ? Object.keys(rows[0]).map((h) => h.toLowerCase()) : []
    }

    if (rows.length === 0) {
      return res.status(400).json({ message: "No rows provided (empty CSV or empty rows[])" })
    }

    // DoS guard: a malicious or accidental 1GB CSV would otherwise sit
    // in memory while the per-row upsert loop chugs through. Cap at
    // 10k rows — 99.9% of real imports are ≤ 500.
    const MAX_IMPORT_ROWS = 10_000
    if (rows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({
        message: `Too many rows (${rows.length}). Maximum per import is ${MAX_IMPORT_ROWS}. Split the file.`,
      })
    }

    // Header-level validation: reject e-commerce-only columns
    const forbidden = header.filter((h) => FORBIDDEN_COLUMNS.includes(h))
    if (forbidden.length > 0) {
      return res.status(400).json({
        message: `Column '${forbidden[0]}' is not allowed for shares import. Remove shipping/weight/dimension columns.`,
        forbidden,
      })
    }
    if (!header.includes("title") || !header.includes("isin")) {
      return res.status(400).json({ message: "CSV must include 'title' and 'isin' columns." })
    }

    const calcula = req.scope.resolve("calcula") as any
    const errors: Array<{ row: number; isin?: string; error: string }> = []
    const calculaBatch: Array<Record<string, any>> = []
    let created = 0

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const title = (r.title || "").trim()
      const isin = (r.isin || "").trim()
      if (!title) {
        errors.push({ row: i, isin, error: "missing title" })
        continue
      }
      if (!isin) {
        errors.push({ row: i, error: "missing isin" })
        continue
      }

      const productInput: any = {
        title,
        status: (r.status || "draft").toLowerCase(),
        handle: r.handle || undefined,
        description: r.description || undefined,
        thumbnail: r.thumbnail || undefined,
        options: [{ title: "Default", values: ["Default"] }],
      }

      const priceStr = (r.variant_price || "").trim()
      if (priceStr) {
        const priceMajor = Number(priceStr)
        if (!Number.isFinite(priceMajor)) {
          errors.push({ row: i, isin, error: `invalid variant_price: ${priceStr}` })
          continue
        }
        productInput.variants = [
          {
            title: "Default",
            prices: [{ currency_code: DEFAULT_CURRENCY, amount: Math.round(priceMajor * 100) }],
            options: { Default: "Default" },
            manage_inventory: false,
          },
        ]
      } else {
        productInput.variants = [
          {
            title: "Default",
            prices: [],
            options: { Default: "Default" },
            manage_inventory: false,
          },
        ]
      }

      try {
        await createProductsWorkflow(req.scope).run({
          input: {
            products: [productInput],
            additional_data: {
              isin,
              company_name: (r.company_name || title).trim(),
            },
          },
        })
        created += 1

        // Queue the rest of the calcula fields for a single batch upsert
        const calculaRow: Record<string, any> = { isin }
        for (const k of CALCULA_FIELDS) {
          const v = r[k]
          if (v !== undefined && v !== "") calculaRow[k] = v
        }
        if (Object.keys(calculaRow).length > 1) calculaBatch.push(calculaRow)
      } catch (err: any) {
        errors.push({ row: i, isin, error: err?.message || "create failed" })
      }
    }

    if (calculaBatch.length > 0) {
      try {
        await calcula.bulkUpsertStaticFields(calculaBatch)
      } catch (err: any) {
        console.error("import-shares: calcula batch upsert failed:", err)
      }
    }

    res.json({
      total: rows.length,
      created,
      failed: errors.length,
      errors,
    })
  } catch (error: any) {
    console.error("Admin import-shares error:", error)
    res.status(500).json({ message: error?.message || "Import failed" })
  }
}
