import type {
  ITaxProvider,
  ItemTaxCalculationLine,
  ShippingTaxCalculationLine,
  TaxCalculationContext,
  ItemTaxLineDTO,
  ShippingTaxLineDTO,
} from "@medusajs/framework/types"

/**
 * RISITEX GST tax provider (FR-4.02).
 *
 * Automatically applies the correct Indian GST per line based on:
 *   - the garment's price point → textile GST bracket
 *       ≤ ₹1000/unit → 5%,  > ₹1000/unit → 12%
 *   - the buyer's state vs RISITEX's home state →
 *       intra-state → CGST + SGST (each half the bracket)
 *       inter-state → IGST (the full bracket)
 *
 * Unit note: RISITEX stores money in PAISE (₹1199 = 119900), and the cart line
 * `unit_price` reaching the tax module is in that same paise scale — so the
 * ₹1000 threshold is 100000 paise (override via GST_GARMENT_THRESHOLD_PAISE).
 *
 * Config (env, all optional):
 *   GST_SELLER_STATE              ISO 3166-2 state code w/o "in-" prefix (default "ka")
 *   GST_GARMENT_THRESHOLD_PAISE   default 100000 (₹1000)
 *   GST_RATE_LOW / GST_RATE_HIGH  default 5 / 12 (percent)
 */
class GstTaxProvider implements ITaxProvider {
  static identifier = "risitex-gst"

  getIdentifier(): string {
    return GstTaxProvider.identifier
  }

  private cfg() {
    return {
      sellerState: (process.env.GST_SELLER_STATE ?? "ka")
        .toLowerCase()
        .replace(/^in-/, ""),
      thresholdPaise: Number(process.env.GST_GARMENT_THRESHOLD_PAISE ?? 100000),
      low: Number(process.env.GST_RATE_LOW ?? 5),
      high: Number(process.env.GST_RATE_HIGH ?? 12),
    }
  }

  async getTaxLines(
    itemLines: ItemTaxCalculationLine[],
    shippingLines: ShippingTaxCalculationLine[],
    context: TaxCalculationContext,
  ): Promise<(ItemTaxLineDTO | ShippingTaxLineDTO)[]> {
    const { sellerState, thresholdPaise, low, high } = this.cfg()
    const buyerState = (context?.address?.province_code ?? "")
      .toLowerCase()
      .replace(/^in-/, "")
    // Intra-state only when we can confidently resolve a matching state.
    const intra = !!buyerState && buyerState === sellerState

    const lines: (ItemTaxLineDTO | ShippingTaxLineDTO)[] = []

    for (const l of itemLines) {
      const unit = Number((l.line_item as any).unit_price ?? 0)
      const bracket = unit > thresholdPaise ? high : low
      if (intra) {
        lines.push(this.item(l.line_item.id, bracket / 2, "CGST"))
        lines.push(this.item(l.line_item.id, bracket / 2, "SGST"))
      } else {
        lines.push(this.item(l.line_item.id, bracket, "IGST"))
      }
    }

    // Shipping GST is left to native rates / untaxed here — the FR is about
    // garment GST. (Add shipping lines later if logistics GST is required.)

    return lines
  }

  private item(
    lineItemId: string,
    rate: number,
    name: "CGST" | "SGST" | "IGST",
  ): ItemTaxLineDTO {
    return {
      rate,
      name,
      code: name,
      line_item_id: lineItemId,
      provider_id: this.getIdentifier(),
    } as ItemTaxLineDTO
  }
}

export default GstTaxProvider
