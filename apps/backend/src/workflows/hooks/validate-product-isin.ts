import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { Modules } from "@medusajs/framework/utils"

/**
 * Seeds ISIN-linked data when a product is created WITH an ISIN in
 * `additional_data`. Does NOT enforce ISIN at create time.
 *
 * Why ISIN is optional here:
 * Medusa v2's admin UI has no `product.create` injection zone — custom
 * fields cannot be added to the stock Create Product form, so the stock
 * form can never send `additional_data.isin`. Enforcing it here blocked
 * product creation entirely. Instead, ISIN is set post-create via the
 * `calcula-fields.tsx` widget on `product.details.after`, which PATCHes
 * `metadata.isin` on /admin/products/:id. Products without an ISIN are
 * tolerated everywhere else in the pipeline (the calcula-price-sync
 * subscribers explicitly skip them).
 *
 * If `additional_data.isin` IS provided (e.g. via CSV import or a custom
 * admin route), we still do the original seeding: persist to
 * product.metadata and upsert the calcula company_record row.
 */
createProductsWorkflow.hooks.productsCreated(
  async ({ products, additional_data }, { container }) => {
    const isin = ((additional_data?.isin as string | undefined) || "").trim()
    if (!isin) {
      console.log(
        "[validate-product-isin] no ISIN on create — skipping seed. Set via calcula-fields widget."
      )
      return
    }

    const companyName =
      ((additional_data?.company_name as string | undefined) || "").trim() ||
      products[0]?.title ||
      isin

    // 1) Persist ISIN onto product.metadata for each created product.
    //    Also stamp `search_aliases` if Calcula provided any — the
    //    storefront reads this comma-joined string for SEO (JSON-LD
    //    alternateName + keywords meta) and the share-browser filter.
    const searchAliases =
      (additional_data?.search_aliases as string | undefined) || ""
    try {
      const productModule: any = container.resolve(Modules.PRODUCT)
      await productModule.upsertProducts(
        products.map((p: any) => ({
          id: p.id,
          metadata: {
            ...(p.metadata || {}),
            isin,
            // Empty string is fine — the storefront treats it as "no
            // aliases" via the .split(',').filter(Boolean) chain.
            ...(searchAliases ? { search_aliases: searchAliases } : {}),
          },
        }))
      )
    } catch (err) {
      console.error("[validate-product-isin] metadata upsert failed:", err)
    }

    // 2) Seed the calcula company_record so the widget has a row to load
    try {
      const calcula: any = container.resolve("calcula")
      await calcula.upsertStaticFields(isin, { company_name: companyName })
    } catch (err) {
      console.error("[validate-product-isin] calcula seed failed:", err)
    }

    // 3) Create a matching company in Calcula's backend so financial data
    //    can be entered immediately. Fire-and-forget — Calcula's create
    //    endpoint is idempotent (returns existing if ISIN matches).
    const calculaApiUrl = process.env.CALCULA_API_URL || "http://localhost:4100"
    const webhookSecret = process.env.CALCULA_WEBHOOK_SECRET
    if (calculaApiUrl && webhookSecret) {
      try {
        const resp = await fetch(`${calculaApiUrl}/api/companies`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Secret": webhookSecret,
          },
          body: JSON.stringify({ name: companyName, isin }),
          signal: AbortSignal.timeout(5000),
        })
        if (resp.ok) {
          console.log(`[validate-product-isin] Calcula company created/found for ${isin}`)
        } else {
          console.warn(`[validate-product-isin] Calcula company create returned ${resp.status}`)
        }
      } catch (err: any) {
        console.warn(`[validate-product-isin] Calcula company create failed: ${err.message}`)
      }
    }
  }
)
