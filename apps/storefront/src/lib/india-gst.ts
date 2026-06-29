/**
 * FR-4.02 — India GST display helpers for the wholesale checkout.
 *
 * The backend `risitex-gst` tax provider computes the actual tax per line
 * (CGST/SGST intra-state vs IGST inter-state, bracketed by price point) once
 * the cart has a shipping address with a province *code*. These helpers do two
 * things on the storefront:
 *
 *   1. map the state dropdown's display name → the ISO subdivision code the
 *      provider expects (e.g. "Karnataka" → "ka"), so we can set it on the cart;
 *   2. split the cart's backend-computed tax_total into display lines.
 *
 * Amounts ALWAYS come from the cart's tax_total — we never compute tax here.
 * Only the CGST/SGST-vs-IGST label is derived from buyer-vs-seller state.
 */

/** Seller home state. Must match the backend GST_SELLER_STATE (default "ka"). */
export const GST_SELLER_STATE = (
  process.env.NEXT_PUBLIC_GST_SELLER_STATE ?? "ka"
)
  .toLowerCase()
  .replace(/^in-/, "");

/** Indian state / UT display name → ISO 3166-2:IN subdivision code (lowercased). */
const STATE_CODES: Record<string, string> = {
  "andhra pradesh": "ap",
  "arunachal pradesh": "ar",
  assam: "as",
  bihar: "br",
  chhattisgarh: "ct",
  goa: "ga",
  gujarat: "gj",
  haryana: "hr",
  "himachal pradesh": "hp",
  jharkhand: "jh",
  karnataka: "ka",
  kerala: "kl",
  "madhya pradesh": "mp",
  maharashtra: "mh",
  manipur: "mn",
  meghalaya: "ml",
  mizoram: "mz",
  nagaland: "nl",
  odisha: "or",
  punjab: "pb",
  rajasthan: "rj",
  sikkim: "sk",
  "tamil nadu": "tn",
  telangana: "tg",
  tripura: "tr",
  "uttar pradesh": "up",
  uttarakhand: "ut",
  "west bengal": "wb",
  // Union territories
  "andaman and nicobar islands": "an",
  chandigarh: "ch",
  "dadra and nagar haveli and daman and diu": "dh",
  delhi: "dl",
  "jammu and kashmir": "jk",
  ladakh: "la",
  lakshadweep: "ld",
  puducherry: "py",
};

/** Map a state display name to its GST state code, or null if unrecognised. */
export function gstStateCode(name: string | null | undefined): string | null {
  if (!name) return null;
  return STATE_CODES[name.trim().toLowerCase()] ?? null;
}

export type GstLine = { label: "CGST" | "SGST" | "IGST"; amountPaise: number };

/**
 * Split a backend-computed GST total into display lines.
 *   intra-state (buyer state === seller state) → CGST + SGST, half each
 *     (the odd paisa goes to CGST so the two still sum to the total);
 *   otherwise → a single IGST line.
 * Returns [] when there is no tax to show.
 */
export function gstBreakdown(
  buyerStateCode: string | null | undefined,
  sellerStateCode: string,
  taxTotalPaise: number,
): GstLine[] {
  if (!Number.isFinite(taxTotalPaise) || taxTotalPaise <= 0) return [];
  const intra = !!buyerStateCode && buyerStateCode === sellerStateCode;
  if (!intra) {
    return [{ label: "IGST", amountPaise: taxTotalPaise }];
  }
  const sgst = Math.floor(taxTotalPaise / 2);
  const cgst = taxTotalPaise - sgst;
  return [
    { label: "CGST", amountPaise: cgst },
    { label: "SGST", amountPaise: sgst },
  ];
}
