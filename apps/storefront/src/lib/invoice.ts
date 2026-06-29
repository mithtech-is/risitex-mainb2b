import { MEDUSA_BASE_URL } from "./medusa";

/**
 * Download the PDF invoice for an order.
 *
 * The Medusa SDK keeps its JWT in localStorage, not cookies, so a
 * plain `<a href>` link won't authenticate the request — we have to
 * fetch with the Authorization header, then trigger a download via
 * an object URL.
 *
 * Side-effect only: writes the file via the browser's download
 * mechanism. Throws if not authenticated or the server returns an
 * error.
 */
export async function downloadOrderInvoice(
  orderId: string,
  displayId?: number | string,
): Promise<void> {
  if (typeof window === "undefined") return;
  const token = window.localStorage.getItem("medusa_auth_token");
  if (!token) {
    throw new Error("Sign in to download invoices.");
  }
  const res = await fetch(
    `${MEDUSA_BASE_URL}/store/orders/${encodeURIComponent(orderId)}/invoice`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-publishable-api-key":
          process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
      },
      credentials: "include",
    },
  );
  if (!res.ok) {
    let detail = "";
    try {
      const b = (await res.json()) as { message?: string };
      detail = b?.message ?? "";
    } catch {
      // not json — fall through
    }
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    displayId != null
      ? `RST-${String(displayId).padStart(6, "0")}.pdf`
      : `invoice-${orderId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so Firefox finishes the download.
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
