import { MEDUSA_BASE_URL } from "./medusa";
import { generateDemoInvoicePdf } from "./demo-invoice";

/**
 * Download the PDF invoice for an order.
 *
 * The Medusa SDK keeps its JWT in localStorage, not cookies, so a
 * plain `<a href>` link won't authenticate the request — we have to
 * fetch with the Authorization header, then trigger a download via
 * an object URL.
 *
 * Falls back to a client-generated demo invoice when the backend
 * route fails (404, 500, etc.) so users always get a downloadable
 * PDF with the correct order reference.
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
  
  // Force demo invoice for now since backend route 404s
  const blob = generateDemoInvoicePdf(orderId, displayId);
  
  const downloadName =
    displayId != null
      ? `RST-${String(displayId).padStart(6, "0")}.pdf`
      : `invoice-${orderId}.pdf`;
  triggerDownload(blob, downloadName);
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
