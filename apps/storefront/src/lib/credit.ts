import { MEDUSA_BASE_URL } from "./medusa";

export type CreditInvoice = {
  id: string;
  order_id: string;
  display_id: number | string;
  amount_major: number;
  created_at: string;
  due_at: string;
  days_to_due: number;
  status: "paid" | "due" | "due_soon" | "overdue";
  payment_status: string | null;
};

export type CreditResponse = {
  mode: "credit" | "prepaid";
  company_trade_name: string | null;
  tier_name: string | null;
  terms: {
    id: string;
    code: string;
    name: string;
    days: number;
    advance_pct: number;
  } | null;
  limit_major: number | null;
  used_major: number;
  utilisation_trend: number[];
  invoices: CreditInvoice[];
};

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

export async function fetchCredit(): Promise<CreditResponse> {
  let token: string | null = null;
  if (typeof window !== "undefined") {
    token = window.localStorage.getItem("medusa_auth_token");
  }
  const headers: Record<string, string> = {
    "x-publishable-api-key": PUB_KEY,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${MEDUSA_BASE_URL}/store/credit-terms/me`, {
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    let detail = "";
    try {
      const b = (await res.json()) as { message?: string };
      detail = b?.message ?? "";
    } catch {
      // ignore
    }
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as CreditResponse;
}

export function invoiceLabel(s: CreditInvoice["status"]): string {
  if (s === "paid") return "paid";
  if (s === "overdue") return "overdue";
  if (s === "due_soon") return "due soon";
  return "due";
}

export function dueLine(inv: CreditInvoice): string {
  if (inv.status === "paid") return "Paid";
  if (inv.days_to_due < 0) return `Overdue ${Math.abs(inv.days_to_due)}d`;
  if (inv.days_to_due === 0) return "Due today";
  return `Due in ${inv.days_to_due}d - ${new Date(
    inv.due_at,
  ).toLocaleDateString()}`;
}
