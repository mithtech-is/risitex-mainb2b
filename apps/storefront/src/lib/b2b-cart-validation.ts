import { MEDUSA_BASE_URL } from "./medusa";

export type CartViolation = {
  type:
    | "min_cart_units"
    | "product_moq"
    | "product_max"
    | "product_step"
    | "promo_tier_conflict";
  message: string;
  line_id?: string;
  product_id?: string;
};

export type CartValidation = {
  ok: boolean;
  is_b2b: boolean;
  cart_total_units: number;
  min_required: number;
  violations: CartViolation[];
};

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("medusa_auth_token");
}

export async function fetchB2BCartValidation(
  cartId: string,
): Promise<CartValidation> {
  const headers: Record<string, string> = {
    "x-publishable-api-key": PUB_KEY,
  };
  const token = readToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(
    `${MEDUSA_BASE_URL}/store/b2b-sales/cart/${cartId}/validate`,
    {
      headers,
      credentials: "include",
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(`Cart validation failed (${res.status})`);
  }
  return (await res.json()) as CartValidation;
}

export type ValidateLine = { variant_id: string; quantity: number };

/**
 * Validate a set of raw cart lines against the B2B MOQ / pack / step / floor
 * rules WITHOUT a persisted Medusa cart. `quantity` is the sellable-unit (pack)
 * count — the backend derives pieces as `quantity × pack_size`. The buyer's
 * auth token is forwarded so the server can resolve their company/tier context.
 *
 * Backend contract: POST /store/b2b-sales/validate-lines
 *   body: { lines: { variant_id, quantity }[] }  →  CartValidation
 *
 * Callers should FAIL OPEN (let checkout proceed) if this throws — the order is
 * still hard-guarded server-side on cart/PO completion. Blocking is a UX
 * convenience, not the enforcement boundary.
 */
export async function fetchB2BLineValidation(
  lines: ValidateLine[],
): Promise<CartValidation> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-publishable-api-key": PUB_KEY,
  };
  const token = readToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(
    `${MEDUSA_BASE_URL}/store/b2b-sales/validate-lines`,
    {
      method: "POST",
      headers,
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({ lines }),
    },
  );
  if (!res.ok) {
    throw new Error(`Line validation failed (${res.status})`);
  }
  return (await res.json()) as CartValidation;
}
