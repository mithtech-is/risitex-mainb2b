import { MEDUSA_BASE_URL } from "./medusa";

export type StorePaymentSettings = {
  manual_upi_enabled: boolean;
  razorpay_enabled: boolean;
  upi_id: string;
  upi_qr_image_url: string | null;
  gateway_charge_percent: number;
};

const FALLBACK: StorePaymentSettings = {
  manual_upi_enabled: true,
  razorpay_enabled: true,
  upi_id: "risitex@upi",
  upi_qr_image_url: null,
  gateway_charge_percent: 2,
};

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

/** Never throws — checkout must render even if settings are unreachable. */
export async function getPaymentSettings(): Promise<StorePaymentSettings> {
  try {
    const res = await fetch(`${MEDUSA_BASE_URL}/store/payment-settings`, {
      headers: { "x-publishable-api-key": PUB_KEY },
      credentials: "include",
    });
    if (!res.ok) return FALLBACK;
    const b = (await res.json()) as { payment_settings?: Partial<StorePaymentSettings> };
    return { ...FALLBACK, ...(b.payment_settings ?? {}) };
  } catch {
    return FALLBACK;
  }
}

/** Mirror of the backend helper — keep in sync with lib/payment.ts. */
export function computeGatewayFeePaise(totalPaise: number, pct: number): number {
  const safePct = Number.isFinite(pct) && pct > 0 ? pct : 0;
  if (safePct === 0) return 0;
  return Math.round((totalPaise * safePct) / 100);
}
