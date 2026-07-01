import { MEDUSA_BASE_URL } from "./medusa";

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

export type SavedCartLine = {
  variantId: string;
  medusaVariantId?: string;
  productSlug: string;
  productName: string;
  variantLabel: string;
  swatchHex: string;
  pricePerUnitMajor: number;
  quantity: number;
};

export type SavedCart = {
  id: string;
  name: string;
  note?: string | null;
  lines: SavedCartLine[];
  item_count: number;
  total_major: number;
  currency_code: string;
  shared_with?: string[];
  created_at: string;
  updated_at: string;
};

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "x-publishable-api-key": PUB_KEY };
  if (typeof window !== "undefined") {
    const t = window.localStorage.getItem("medusa_auth_token");
    if (t) h.Authorization = `Bearer ${t}`;
  }
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

export async function listSavedCarts(): Promise<SavedCart[]> {
  const res = await fetch(`${MEDUSA_BASE_URL}/store/saved-carts`, {
    headers: authHeaders(),
    credentials: "include",
  });
  const body = await unwrap<{ saved_carts: SavedCart[] }>(res);
  return body.saved_carts ?? [];
}

export async function createSavedCart(input: {
  name: string;
  lines: SavedCartLine[];
  note?: string;
  shared_with?: string[];
}): Promise<SavedCart> {
  const res = await fetch(`${MEDUSA_BASE_URL}/store/saved-carts`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const body = await unwrap<{ saved_cart: SavedCart }>(res);
  return body.saved_cart;
}

export async function deleteSavedCart(id: string): Promise<void> {
  await fetch(`${MEDUSA_BASE_URL}/store/saved-carts/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
    credentials: "include",
  });
}

export async function renameSavedCart(id: string, name: string): Promise<void> {
  await fetch(`${MEDUSA_BASE_URL}/store/saved-carts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name }),
  });
}
