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
