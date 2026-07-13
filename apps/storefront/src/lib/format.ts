/**
 * Server-safe INR formatter — usable in React Server Components.
 *
 * `formatINR` from `@risitex/ui/components` lives in a "use client" module, so
 * calling it directly inside a Server Component throws ("Attempted to call
 * formatINR() from the server"). This mirrors its ₹ + Indian-grouping output
 * without the client boundary. Rounds to whole rupees (retail/MRP display).
 */
export function formatINR(amountMajor: number): string {
  return `₹${Math.round(amountMajor).toLocaleString("en-IN")}`;
}
