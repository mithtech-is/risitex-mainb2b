import { MEDUSA_BASE_URL } from "./medusa";

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

/**
 * Download the real PDF invoice for an order or purchase order.
 *
 * The backend route `/store/orders/:id/invoice` accepts EITHER a Medusa
 * order id or a purchase-order id and always returns a real, server-rendered
 * PDF for the caller's own record — there is no client-side "demo" fallback.
 *
 * The Medusa SDK keeps its JWT in localStorage (not cookies), so we fetch
 * with the Authorization header and trigger the download via an object URL.
 * On failure we throw a descriptive error for the caller to surface rather
 * than silently substituting a placeholder document.
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
        "x-publishable-api-key": PUB_KEY,
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    },
  );

  if (!res.ok) {
    let message = `Invoice download failed (${res.status}).`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      // non-JSON error body — keep the status-based message
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const downloadName =
    filenameFromHeader(res.headers.get("content-disposition")) ??
    defaultName(orderId, displayId);
  triggerDownload(blob, downloadName);
}

function defaultName(orderId: string, displayId?: number | string): string {
  if (displayId != null && /^\d+$/.test(String(displayId))) {
    return `RST-${String(displayId).padStart(6, "0")}.pdf`;
  }
  return `invoice-${String(displayId ?? orderId).replace(/[^\w.-]+/g, "-")}.pdf`;
}

function filenameFromHeader(cd: string | null): string | null {
  if (!cd) return null;
  const match = /filename="?([^"]+)"?/i.exec(cd);
  return match?.[1] ?? null;
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
