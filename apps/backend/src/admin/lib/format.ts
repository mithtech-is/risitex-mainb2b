/**
 * Money helpers. RISITEX stores money as BIGINT minor units (paise for INR).
 * UI receives them as strings (Medusa serializes bigNumber as string in JSON
 * to avoid JS number precision loss).
 */

export function formatMoney(
  minor: string | number | null | undefined,
  currencyCode = "inr",
): string {
  if (minor === null || minor === undefined) return "—";
  const n = typeof minor === "string" ? BigInt(minor) : BigInt(minor);
  const negative = n < 0n;
  const abs = negative ? -n : n;
  const major = abs / 100n;
  const remainder = abs % 100n;
  const majorStr = major.toString();
  const grouped = majorStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const symbol = currencyCode.toLowerCase() === "inr" ? "₹" : `${currencyCode.toUpperCase()} `;
  return `${negative ? "-" : ""}${symbol}${grouped}.${remainder.toString().padStart(2, "0")}`;
}

export function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

export function formatDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function shortId(id: string | null | undefined, head = 8): string {
  if (!id) return "—";
  return id.length > head + 4 ? `${id.slice(0, head)}…` : id;
}
