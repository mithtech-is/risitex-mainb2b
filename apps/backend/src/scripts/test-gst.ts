import { ExecArgs } from "@medusajs/framework/types"
import GstTaxProvider from "../modules/gst_tax/service"

/**
 * Pure-logic test for the GST tax provider (FR-4.02).
 * Run: npx medusa exec ./src/scripts/test-gst.ts
 * (Seller state defaults to "ka"; ₹1000 threshold = 100000 paise.)
 */
export default async function testGst(_: ExecArgs) {
  const p = new GstTaxProvider()
  const log = (...a: any[]) => console.log("[gst]", ...a)
  const mk = (id: string, unit: number): any => ({
    line_item: { id, unit_price: unit },
    rates: [],
  })
  // ₹500 = 50000 paise (≤ ₹1000 → 5%); ₹1500 = 150000 paise (> ₹1000 → 12%)
  const items = [mk("li_cheap", 50000), mk("li_pricey", 150000)]

  const intra = await p.getTaxLines(items, [], {
    address: { province_code: "ka", country_code: "in" },
  } as any)
  const inter = await p.getTaxLines(items, [], {
    address: { province_code: "mh", country_code: "in" },
  } as any)

  const fmt = (ls: any[]) =>
    ls.map((l) => `${l.code}@${l.rate}%→${l.line_item_id}`).join("  ")
  log("INTRA (KA buyer):", fmt(intra))
  log("INTER (MH buyer):", fmt(inter))

  let pass = 0,
    fail = 0
  const expect = (cond: boolean, msg: string) => {
    if (cond) {
      pass++
      log("✓", msg)
    } else {
      fail++
      log("✗ FAIL:", msg)
    }
  }
  // intra cheap → CGST2.5 + SGST2.5
  expect(
    intra.filter((l: any) => l.line_item_id === "li_cheap").every((l: any) => l.rate === 2.5) &&
      intra.filter((l: any) => l.line_item_id === "li_cheap").length === 2,
    "intra ₹500 → CGST 2.5% + SGST 2.5%",
  )
  // intra pricey → CGST6 + SGST6
  expect(
    intra.filter((l: any) => l.line_item_id === "li_pricey").every((l: any) => l.rate === 6) &&
      intra.filter((l: any) => l.line_item_id === "li_pricey").length === 2,
    "intra ₹1500 → CGST 6% + SGST 6%",
  )
  // inter cheap → IGST5
  expect(
    inter.filter((l: any) => l.line_item_id === "li_cheap").length === 1 &&
      (inter.find((l: any) => l.line_item_id === "li_cheap") as any)?.rate === 5 &&
      (inter.find((l: any) => l.line_item_id === "li_cheap") as any)?.code === "IGST",
    "inter ₹500 → IGST 5%",
  )
  // inter pricey → IGST12
  expect(
    (inter.find((l: any) => l.line_item_id === "li_pricey") as any)?.rate === 12,
    "inter ₹1500 → IGST 12%",
  )
  log(fail === 0 ? `ALL ${pass} GST ASSERTIONS PASSED ✅` : `${fail} FAILED ❌`)
}
