import { MEDUSA_BASE_URL } from "./medusa";

/**
 * Storefront client for /store/purchase-orders.
 *
 * Two-step create: upload the PO file via /store/upload first
 * (multer + magic-byte validation), then POST the metadata + the
 * returned file URL here. Splitting the upload + metadata calls
 * keeps the upload pipeline (PDF compression, EXIF strip) decoupled
 * from PO domain logic.
 */

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

function authHeaders(): Record<string, string> {
  let token: string | null = null;
  if (typeof window !== "undefined") {
    token = window.localStorage.getItem("medusa_auth_token");
  }
  const h: Record<string, string> = {
    "x-publishable-api-key": PUB_KEY,
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = "";
    try {
      const b = (await res.json()) as { message?: string };
      detail = b?.message ?? "";
    } catch {
      // not JSON
    }
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function uploadFile(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file, file.name);
  const res = await fetch(`${MEDUSA_BASE_URL}/store/upload`, {
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
    body: form,
  });
  const body = await unwrap<{ url: string }>(res);
  return body.url;
}

export type CreatePurchaseOrderInput = {
  po_number: string;
  file_url: string;
  value_major: number;
  expected_payment_date?: string;
  notes?: string;
};

export type CreatedPurchaseOrder = {
  id: string;
  po_number: string;
  file_url: string | null;
  value_major: number;
  expected_payment_date: string | null;
  created_at: string;
  status: "draft";
};

export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
): Promise<CreatedPurchaseOrder> {
  const res = await fetch(`${MEDUSA_BASE_URL}/store/purchase-orders`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const body = await unwrap<{ purchase_order: CreatedPurchaseOrder }>(res);
  return body.purchase_order;
}

export type DraftPurchaseOrder = {
  id: string;
  po_number: string;
  file_url: string | null;
  value_major: number;
  expected_payment_date: string | null;
  created_at: string;
  status: "draft" | "in_progress" | "fulfilled" | "cancelled";
  /** Set once the PO has been promoted to a real Medusa order (post-payment
   *  reconciliation). Drives status badges across orders/shipments/invoices. */
  order?: {
    id: string;
    display_id: number | string;
    status?: string | null;
    payment_status?: string | null;
    fulfillment_status?: string | null;
  } | null;
  /** Buyer-side payment confirmation — set by POST /confirm-payment. */
  payment_confirmed_at?: string | null;
  payment_confirmed_method?: string | null;
  payment_confirmed_reference?: string | null;
  /** Admin-side approval of the buyer's payment proof. Drives whether
   *  shipment + invoice tabs flip from "queued" to live tracking. */
  admin_approved_at?: string | null;
  admin_approved_by_name?: string | null;
  /** Admin-side dispatch record. Storefront shipments page reads these
   *  to surface PO-based shipments alongside Medusa fulfillments. */
  dispatched_at?: string | null;
  dispatch_tracking_number?: string | null;
  dispatch_carrier?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type PaymentConfirmation = {
  method:
    | "wallet"
    | "razorpay"
    | "bank_transfer"
    | "cheque"
    | "upi"
    | "credit_terms"
    | "po_upload"
    | "proforma"
    | "other";
  reference: string;
  paid_at?: string;
  notes?: string;
};

/** Record buyer-side payment confirmation against a draft PO. */
export async function confirmPurchaseOrderPayment(
  id: string,
  payload: PaymentConfirmation,
): Promise<{
  payment_confirmed_at: string;
  payment_confirmed_method: string;
  payment_confirmed_reference: string;
}> {
  const res = await fetch(
    `${MEDUSA_BASE_URL}/store/purchase-orders/${encodeURIComponent(id)}/confirm-payment`,
    {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    },
  );
  const body = await unwrap<{
    ok: boolean;
    purchase_order: {
      payment_confirmed_at: string;
      payment_confirmed_method: string;
      payment_confirmed_reference: string;
    };
  }>(res);
  return body.purchase_order;
}

export async function listDraftPurchaseOrders(): Promise<DraftPurchaseOrder[]> {
  const res = await fetch(`${MEDUSA_BASE_URL}/store/purchase-orders`, {
    headers: authHeaders(),
    credentials: "include",
  });
  const body = await unwrap<{ purchase_orders: DraftPurchaseOrder[] }>(res);
  return (body.purchase_orders ?? []).filter((p) => p.status === "draft");
}

/**
 * Returns every PO the customer has — drafts, in-progress, fulfilled, and
 * cancelled. Used by /b2b/orders to merge into the order-history table so
 * a just-placed PO surfaces in the same view a buyer naturally looks at,
 * not just /b2b/purchase-orders.
 */
export async function listAllPurchaseOrders(): Promise<DraftPurchaseOrder[]> {
  const res = await fetch(`${MEDUSA_BASE_URL}/store/purchase-orders`, {
    headers: authHeaders(),
    credentials: "include",
  });
  const body = await unwrap<{ purchase_orders: DraftPurchaseOrder[] }>(res);
  return body.purchase_orders ?? [];
}

export async function attachPurchaseOrder(
  id: string,
  orderId: string,
): Promise<void> {
  const res = await fetch(
    `${MEDUSA_BASE_URL}/store/purchase-orders/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ order_id: orderId }),
    },
  );
  await unwrap<{ ok: boolean }>(res);
}
