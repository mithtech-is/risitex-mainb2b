"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Input,
  Label,
  Textarea,
  Badge,
  EmptyState,
} from "@risitex/ui/components";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { ShippingGstEstimate } from "@/components/checkout/shipping-gst-estimate";
import { CouponInput, type AppliedCoupon } from "@/components/checkout/coupon-input";
import { MEDUSA_BASE_URL } from "@/lib/medusa";
import {
  createPurchaseOrder,
  confirmPurchaseOrderPayment,
  type PaymentConfirmation,
} from "@/lib/purchase-orders";
import { getCart, clearCart, subtotalMajor } from "@/lib/cart";
import { gstStateCode, gstBreakdown, GST_SELLER_STATE } from "@/lib/india-gst";
import {
  DeliveryCompanySelector,
  type CourierOption,
} from "@/components/checkout/delivery-company-selector";

/**
 * /b2b/checkout
 *
 * Multi-step B2B checkout wizard. Reuses every existing backend endpoint —
 * does not introduce a parallel order flow. The terminal action is the
 * existing /store/purchase-orders POST (a draft PO with full snapshot
 * metadata); inventory + payment provider integration is the next backend
 * phase once an ERPNext instance + Razorpay creds are live.
 *
 * URL contract (handoff from the matrix grid on PDP):
 *   /b2b/checkout?variant=variantId:qty&variant=...   ← per-line cart
 *   /b2b/checkout?product=PRODUCT_NAME&value=ESTIMATE ← simplified
 *
 * Internal state (kept in component, not in URL — URL drives only the cart
 * payload). Reading the URL on mount gives a deep-linkable "resume from
 * matrix grid" experience without forcing a draft round-trip first.
 */

const STEPS = [
  { id: 1, label: "Cart" },
  { id: 2, label: "Address" },
  { id: 3, label: "Shipping" },
  { id: 4, label: "Payment" },
  { id: 5, label: "Review" },
] as const;

type Step = (typeof STEPS)[number]["id"];

type CartLine = {
  variantId: string;
  quantity: number;
};

type CompanyContext = {
  authenticated?: boolean;
  customer?: {
    id?: string;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    metadata?: Record<string, unknown> | null;
  };
  b2b?: {
    company?: {
      id?: string;
      gstin?: string | null;
      trade_name?: string | null;
      status?: string | null;
      billing_address?: {
        line1?: string;
        city?: string;
        state?: string;
        postal_code?: string;
        country_code?: string;
      } | null;
    };
    customer_tier?: { code?: string; name?: string } | null;
    payment_terms?: string | null;
  } | null;
};

type Wallet = {
  balance_inr?: number;
  promo_balance_inr?: number;
};

type Credit = {
  limit_inr?: number;
  used_inr?: number;
  available_inr?: number;
};

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

const COURIER_PROVIDERS: CourierOption[] = [
  { id: "dhl_express", name: "DHL Express", estimatedDelivery: "2–3 days", chargeRupees: 480 },
  { id: "bluedart", name: "Blue Dart", estimatedDelivery: "2–4 days", chargeRupees: 420 },
  { id: "delhivery_b2b", name: "Delhivery B2B", estimatedDelivery: "3–5 days", chargeRupees: 280 },
  { id: "professional_couriers", name: "Professional Couriers", estimatedDelivery: "3–6 days", chargeRupees: 250 },
  { id: "dtdc_premium", name: "DTDC Premium", estimatedDelivery: "3–5 days", chargeRupees: 300 },
  { id: "xpressbees", name: "Xpressbees", estimatedDelivery: "3–5 days", chargeRupees: 270 },
  { id: "ecom_express", name: "Ecom Express", estimatedDelivery: "4–6 days", chargeRupees: 260 },
  { id: "india_post_speed", name: "India Post Speed Post", estimatedDelivery: "5–7 days", chargeRupees: 180 },
  { id: "fedex", name: "FedEx", estimatedDelivery: "2–4 days", chargeRupees: 520 },
  { id: "ups", name: "UPS", estimatedDelivery: "3–5 days", chargeRupees: 500 },
  { id: "other_courier", name: "Other Courier Partner", estimatedDelivery: "Carrier dependent", chargeRupees: 0 },
];

const PICKUP_OPTIONS = [
  { id: "customer_pickup", label: "Customer Pickup", eta: "Same-day", flatRupees: 0 },
  { id: "own_transport", label: "Own Transport / 3PL", eta: "Per your carrier", flatRupees: 0 },
] as const;

const PAYMENT_METHODS = [
  {
    id: "wallet",
    label: "Wallet",
    desc: "Pay from your RISITEX wallet balance.",
    needsBalance: true,
  },
  {
    id: "wallet_plus_razorpay",
    label: "Wallet + Razorpay",
    desc: "Partial wallet, balance via card/UPI/netbanking.",
    needsBalance: false,
  },
  {
    id: "razorpay",
    label: "Razorpay (Card / UPI / NetBanking)",
    desc: "Pay full amount online.",
    needsBalance: false,
  },
] as const;

type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];

/**
 * Map the checkout-wizard's payment method (broader UX taxonomy) to the
 * backend confirm-payment enum (narrower, finance-facing taxonomy).
 */
const PAYMENT_METHOD_TO_BACKEND: Record<PaymentMethodId, PaymentConfirmation["method"]> = {
  wallet: "wallet",
  wallet_plus_razorpay: "razorpay",
  razorpay: "razorpay",
};

/**
 * Inline proof requirements per payment method.
 */
const PAYMENT_PROOF_CONFIG: Record<
  PaymentMethodId,
  {
    needsReference: boolean;
    label: string;
    placeholder: string;
    hint: string;
  }
> = {
  wallet: {
    needsReference: false,
    label: "",
    placeholder: "",
    hint: "Wallet balance will be debited at order placement — no reference needed.",
  },
  wallet_plus_razorpay: {
    needsReference: true,
    label: "Razorpay Transaction / Order ID",
    placeholder: "pay_NkM2…",
    hint: "Complete Razorpay capture for the remaining balance, then paste the transaction id here.",
  },
  razorpay: {
    needsReference: true,
    label: "Razorpay Transaction / Order ID",
    placeholder: "pay_NkM2…",
    hint: "Complete Razorpay capture, then paste the transaction id here so finance can reconcile.",
  },
};

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "x-publishable-api-key": PUB_KEY };
  if (typeof window !== "undefined") {
    const t = window.localStorage.getItem("medusa_auth_token");
    if (t) h.Authorization = `Bearer ${t}`;
  }
  return h;
}

function paiseToRupees(paise: number): number {
  return Math.round(paise / 100);
}

function formatRupees(paise: number): string {
  return `₹${paiseToRupees(paise).toLocaleString("en-IN")}`;
}

export default function CheckoutPage() {
  const router = useRouter();
  const params = useSearchParams();

  // ── Step + UI state ────────────────────────────────────────────────
  const [step, setStep] = React.useState<Step>(1);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  // ── Cart from URL (variant=ID:QTY pairs, or simple product/value) ──
  // Falls back to the local cart store (lib/cart.ts) when the URL doesn't
  // carry any variant params — so a hard-refresh on /b2b/checkout still
  // shows what's in the cart instead of redirecting to "empty cart".
  const [storeCartLines, setStoreCartLines] = React.useState<CartLine[]>([]);
  const [storeCartValue, setStoreCartValue] = React.useState(0);
  React.useEffect(() => {
    const c = getCart();
    setStoreCartLines(
      c.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
    );
    setStoreCartValue(subtotalMajor(c));
  }, []);

  const cartLines: CartLine[] = React.useMemo(() => {
    if (!params) return storeCartLines;
    const urlLines = params
      .getAll("variant")
      .map((entry) => {
        const [variantId, qty] = entry.split(":");
        return {
          variantId: variantId ?? "",
          quantity: Math.max(0, Number(qty ?? 0)),
        };
      })
      .filter((line) => line.variantId && line.quantity > 0);
    return urlLines.length > 0 ? urlLines : storeCartLines;
  }, [params, storeCartLines]);

  const productName = params?.get("product") ?? "";
  const seededValue = Number(params?.get("value") ?? 0) || storeCartValue;
  const variantQtyTotal = cartLines.reduce((s, l) => s + l.quantity, 0);

  // ── Backend data ───────────────────────────────────────────────────
  const [context, setContext] = React.useState<CompanyContext | null>(null);
  const [wallet, setWallet] = React.useState<Wallet | null>(null);
  const [credit, setCredit] = React.useState<Credit | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meRes, walletRes, creditRes] = await Promise.all([
          fetch(`${MEDUSA_BASE_URL}/store/companies/me`, {
            headers: authHeaders(),
            credentials: "include",
          }),
          fetch(`${MEDUSA_BASE_URL}/store/wallet`, {
            headers: authHeaders(),
            credentials: "include",
          }).catch(() => null),
          fetch(`${MEDUSA_BASE_URL}/store/credit-terms/me`, {
            headers: authHeaders(),
            credentials: "include",
          }).catch(() => null),
        ]);
        const ctx = meRes.ok ? ((await meRes.json()) as CompanyContext) : null;
        const wal = walletRes && walletRes.ok ? ((await walletRes.json()) as Wallet) : null;
        const cre = creditRes && creditRes.ok ? ((await creditRes.json()) as Credit) : null;
        if (cancelled) return;
        setContext(ctx);
        setWallet(wal);
        setCredit(cre);
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : "Could not load checkout context",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Form state ─────────────────────────────────────────────────────
  const [shippingMode, setShippingMode] = React.useState<"same" | "custom">("same");
  const [customShip, setCustomShip] = React.useState({
    line1: "",
    city: "",
    state: "",
    postal_code: "",
    contact_name: "",
    contact_phone: "",
  });
  // Billing address the order actually uses. Seeded from the approved company
  // record; when that record is incomplete (missing city / PIN / GSTIN — which
  // otherwise dead-ends the buyer on "Continue"), we let them complete it here
  // and persist it back to the company so invoices + future orders are correct.
  const [billing, setBilling] = React.useState({
    line1: "",
    city: "",
    state: "",
    postal_code: "",
    gstin: "",
  });
  const [billingSeeded, setBillingSeeded] = React.useState(false);
  React.useEffect(() => {
    if (billingSeeded || !context) return;
    const ba = context.b2b?.company?.billing_address;
    setBilling({
      line1: ba?.line1 ?? "",
      city: ba?.city ?? "",
      state: ba?.state ?? "",
      postal_code: ba?.postal_code ?? "",
      gstin: context.b2b?.company?.gstin ?? "",
    });
    setBillingSeeded(true);
  }, [context, billingSeeded]);
  const [shippingMethodId, setShippingMethodId] = React.useState<string>("delhivery_b2b");
  const [paymentMethodId, setPaymentMethodId] = React.useState<PaymentMethodId>("wallet");
  const [coupon, setCoupon] = React.useState<AppliedCoupon | null>(null);
  const [poNumber] = React.useState<string>(
    `ORD-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
  );
  const [otherCourierName, setOtherCourierName] = React.useState<string>("");
  const [otherCourierNotes, setOtherCourierNotes] = React.useState<string>("");
  // Inline payment-proof capture (FR-4.x):
  //   For methods where the buyer already knows the reference at order time
  //   (UTR / Razorpay txn id / internal PO #), we capture it here instead of
  //   forcing a second trip to /b2b/purchase-orders/[id]. The reference is
  //   POSTed to /store/purchase-orders/:id/confirm-payment immediately after
  //   the PO is created, so the buyer lands on the success page with status
  //   "payment recorded — awaiting approval" instead of "awaiting payment".
  const [paymentReference, setPaymentReference] = React.useState<string>("");
  const [paymentPaidAt, setPaymentPaidAt] = React.useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [paymentProofNotes, setPaymentProofNotes] = React.useState<string>("");
  const [notes, setNotes] = React.useState<string>(
    productName ? `Order originated from ${productName}.` : "",
  );
  const [confirmed, setConfirmed] = React.useState(false);

  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // ── Money math ─────────────────────────────────────────────────────
  // Subtotal: use seededValue from URL (set by the matrix grid when it
  // computed line totals) plus a per-line synthetic floor when not provided.
  const subtotalPaise = React.useMemo(() => {
    if (seededValue > 0) return Math.round(seededValue * 100);
    // Fallback estimate from variant count × ₹100 — gives the buyer something
    // sensible to react to even if the URL handoff didn't carry the value.
    return Math.max(variantQtyTotal * 10000, 0);
  }, [seededValue, variantQtyTotal]);

  const discountPaise = coupon?.discount_paise ?? 0;
  const discountedSubtotalPaise = Math.max(0, subtotalPaise - discountPaise);

  const courierMethod = COURIER_PROVIDERS.find((m) => m.id === shippingMethodId);
  const pickupMethod = PICKUP_OPTIONS.find((m) => m.id === shippingMethodId);
  const shippingPaise = (courierMethod?.chargeRupees ?? pickupMethod?.flatRupees ?? 0) * 100;

  const shipState =
    shippingMode === "same" ? billing.state : customShip.state;
  const sellerCode = GST_SELLER_STATE;
  const buyerCode = gstStateCode(shipState ?? "") ?? "";
  const gstRatePercent = 5; // B2B textile default; backend tax provider is final source
  const taxableBasePaise = discountedSubtotalPaise + shippingPaise;
  const gstTotalPaise = Math.round((taxableBasePaise * gstRatePercent) / 100);
  const gstLines = gstBreakdown(buyerCode, sellerCode, gstTotalPaise);

  const grandTotalPaise =
    discountedSubtotalPaise + shippingPaise + gstTotalPaise;

  // ── Wallet / credit math ───────────────────────────────────────────
  const walletPaise = wallet
    ? Number(wallet.balance_inr ?? 0) + Number(wallet.promo_balance_inr ?? 0)
    : 0;
  const walletCoversAll = walletPaise >= grandTotalPaise;
  const walletPartialCovers = walletPaise > 0 && walletPaise < grandTotalPaise;
  const walletShortfallPaise = Math.max(0, grandTotalPaise - walletPaise);
  const creditAvailablePaise = credit
    ? Math.round(Number(credit.available_inr ?? 0) * 100)
    : 0;
  const _creditCovers = creditAvailablePaise >= grandTotalPaise;

  // ── Step gating ────────────────────────────────────────────────────
  const company = context?.b2b?.company;
  const hasCompany = !!company?.id;
  // Whether the company record already carries a complete billing address. When
  // it doesn't, the Address step exposes editable fields so the buyer can
  // complete it (rather than being stuck with a disabled Continue button).
  const companyBillingComplete = !!(
    company?.billing_address?.line1 &&
    company?.billing_address?.city &&
    company?.billing_address?.state &&
    company?.billing_address?.postal_code
  );
  const billingAddressOk = !!(
    billing.line1.trim() &&
    billing.city.trim() &&
    billing.state.trim() &&
    billing.postal_code.trim()
  );
  const shippingAddressOk =
    shippingMode === "same"
      ? billingAddressOk
      : !!(
          customShip.line1.trim() &&
          customShip.city.trim() &&
          customShip.state.trim() &&
          customShip.postal_code.trim()
        );

  const canStep2 = cartLines.length > 0 || subtotalPaise > 0;
  const canStep3 = canStep2 && billingAddressOk && shippingAddressOk;
  const canStep4 =
    canStep3 &&
    !!shippingMethodId &&
    (shippingMethodId !== "other_courier" || !!otherCourierName.trim());
  const canStep5 = canStep4 && !!paymentMethodId && paymentReady();
  const canPlace = canStep5 && confirmed;

  function paymentReady(): boolean {
    if (paymentMethodId === "wallet") return walletCoversAll;
    if (paymentMethodId === "wallet_plus_razorpay")
      return walletPaise > 0 && paymentReference.trim().length >= 4;
    if (paymentMethodId === "razorpay") {
      return paymentReference.trim().length >= 4;
    }
    return true;
  }

  // Persist a completed billing address back to the company so invoices and
  // future orders carry it. Best-effort — a failure here never blocks checkout
  // (the order snapshot below still uses the entered values).
  const [savingBilling, setSavingBilling] = React.useState(false);
  const persistBillingIfNeeded = async () => {
    if (companyBillingComplete) return; // nothing was edited
    setSavingBilling(true);
    try {
      await fetch(`${MEDUSA_BASE_URL}/store/companies/me`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          gstin: billing.gstin.trim() || undefined,
          billing_address: {
            address_1: billing.line1.trim(),
            city: billing.city.trim(),
            province: billing.state.trim(),
            postal_code: billing.postal_code.trim(),
            country_code:
              company?.billing_address?.country_code || "IN",
          },
        }),
      });
    } catch {
      /* best-effort — the order still carries the entered address */
    } finally {
      setSavingBilling(false);
    }
  };

  const goNext = async () => {
    if (step === 1 && canStep2) setStep(2);
    else if (step === 2 && canStep3) {
      await persistBillingIfNeeded();
      setStep(3);
    } else if (step === 3 && canStep4) setStep(4);
    else if (step === 4 && canStep5) setStep(5);
  };
  const goBack = () => {
    if (step > 1) setStep((s) => ((s - 1) as Step));
  };

  // ── Place order ────────────────────────────────────────────────────
  const placeOrder = async () => {
    if (!canPlace || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const courierDetail = shippingMethodId === "other_courier"
        ? `Other Courier Partner: ${otherCourierName.trim()}`
        : `Courier: ${courierMethod?.name ?? pickupMethod?.label ?? "—"}`;
      const courierNoteDetail = shippingMethodId === "other_courier" && otherCourierNotes.trim()
        ? `Courier Notes: ${otherCourierNotes.trim()}`
        : "";

      const created = await createPurchaseOrder({
        po_number: poNumber,
        value_major: paiseToRupees(grandTotalPaise),
        notes: [
          courierDetail,
          courierNoteDetail,
          notes ? `Notes: ${notes}` : "",
          `Lines: ${cartLines.length} (${variantQtyTotal} units)`,
          `Subtotal: ${formatRupees(subtotalPaise)}`,
          discountPaise > 0
            ? `Coupon: ${coupon?.code} → -${formatRupees(discountPaise)}`
            : "",
          `Shipping: ${formatRupees(shippingPaise)}`,
          `GST: ${formatRupees(gstTotalPaise)} (${gstLines.map((l) => l.label).join(" + ") || "—"})`,
          `Payment: ${PAYMENT_METHODS.find((p) => p.id === paymentMethodId)?.label}`,
          shippingMode === "same"
            ? "Ship-to = billing address"
            : `Ship-to: ${customShip.line1}, ${customShip.city}`,
        ]
          .filter(Boolean)
          .join("\n"),
        file_url: "/b2b/po-print-placeholder",
        items: cartLines.map((line) => ({
          variant_id: line.variantId,
          quantity: line.quantity,
        })),
        billing_address: {
          address_1: billing.line1 || "",
          city: billing.city || "",
          province: billing.state || "",
          postal_code: billing.postal_code || "",
          country_code: company?.billing_address?.country_code || "in",
        },
        shipping_address: shippingMode === "same" ? {
          address_1: billing.line1 || "",
          city: billing.city || "",
          province: billing.state || "",
          postal_code: billing.postal_code || "",
          country_code: company?.billing_address?.country_code || "in",
        } : {
          address_1: customShip.line1 || "",
          city: customShip.city || "",
          province: customShip.state || "",
          postal_code: customShip.postal_code || "",
          country_code: "in",
        },
      });

      // Step 2: if the buyer supplied a payment reference inline, record
      // it immediately so the PO lands as "payment recorded — awaiting
      // approval" rather than "awaiting payment".
      let paymentRecorded = false;
      try {
        const cfg = PAYMENT_PROOF_CONFIG[paymentMethodId];
        const backendMethod = PAYMENT_METHOD_TO_BACKEND[paymentMethodId];
        if (cfg.needsReference) {
          await confirmPurchaseOrderPayment(created.id, {
            method: backendMethod,
            reference: paymentReference.trim(),
            paid_at: paymentPaidAt
              ? new Date(paymentPaidAt).toISOString()
              : undefined,
            notes: paymentProofNotes.trim() || undefined,
          });
          paymentRecorded = true;
        } else if (paymentMethodId === "wallet") {
          await confirmPurchaseOrderPayment(created.id, {
            method: "wallet",
            reference: `wallet-debit-${Date.now().toString(36)}`,
            notes: "Wallet auto-debit at checkout",
          });
          paymentRecorded = true;
        }
      } catch (proofErr) {
        const detail =
          proofErr instanceof Error ? proofErr.message : "Could not record payment";
        setSubmitError(
          `Order placed (${created.po_number}) but recording the payment reference failed: ${detail}. Please contact support with your order number.`,
        );
      }

      try {
        clearCart();
      } catch {
        /* best-effort — never block success navigation */
      }

      router.replace(
        `/b2b/checkout/success?po=${encodeURIComponent(created.id)}&num=${encodeURIComponent(created.po_number)}&amt=${created.value_major}&pay=${paymentMethodId}${
          paymentRecorded ? "&pr=1" : ""
        }`,
      );
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : "Could not place the order. Try again.",
      );
      setSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-full flex-col gap-6">
        <B2bTopbar title="Checkout" subtitle="Loading your B2B context…" />
        <p role="status" aria-live="polite" aria-busy="true" className="text-body-sm text-text-muted">
          Loading…
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-full flex-col gap-6">
        <B2bTopbar title="Checkout" subtitle="" />
        <EmptyState
          title="Could not start checkout"
          description={loadError}
          action={
            <Button asChild>
              <Link href="/b2b/dashboard">Back to dashboard</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (!hasCompany || company?.status !== "approved") {
    return (
      <div className="flex min-h-full flex-col gap-6">
        <B2bTopbar title="Checkout" subtitle="Your B2B company isn't approved yet." />
        <EmptyState
          title="Checkout unavailable"
          description="Your wholesale company account is pending approval. Once our sales team approves your registration, checkout and online payments will be enabled."
          action={
            <Button asChild>
              <Link href="/b2b/dashboard">Go to Dashboard</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (cartLines.length === 0 && subtotalPaise === 0) {
    return (
      <div className="flex min-h-full flex-col gap-6">
        <B2bTopbar title="Checkout" subtitle="" />
        <EmptyState
          title="Nothing in your cart"
          description="Browse the catalogue and use the matrix grid to start an order."
          action={
            <Button asChild>
              <Link href="/wholesale/catalogue">Browse catalogue</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-6">
      <B2bTopbar
        title="Checkout"
        subtitle={`${cartLines.length || 1} line${cartLines.length === 1 ? "" : "s"} · ${variantQtyTotal || "—"} units · ${formatRupees(grandTotalPaise)} estimated`}
      />

      {/* Progress bar */}
      <ol
        aria-label="Checkout steps"
        className="flex flex-wrap items-center gap-2 rounded-md border border-border-subtle bg-surface-raised p-3"
      >
        {STEPS.map((s, i) => {
          const isActive = s.id === step;
          const isDone = s.id < step;
          return (
            <li
              key={s.id}
              aria-current={isActive ? "step" : undefined}
              className="flex items-center gap-2"
            >
              <span
                className={[
                  "inline-flex h-7 w-7 items-center justify-center rounded-full text-caption font-medium",
                  isDone
                    ? "bg-feedback-success-bg text-feedback-success-text ring-1 ring-feedback-success-border"
                    : isActive
                      ? "bg-action-primary-bg text-action-primary-text"
                      : "bg-surface-sunken text-text-muted",
                ].join(" ")}
              >
                {isDone ? "✓" : s.id}
              </span>
              <span
                className={[
                  "text-body-sm",
                  isActive ? "font-medium text-text-primary" : "text-text-muted",
                ].join(" ")}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <span aria-hidden className="mx-1 hidden h-px w-6 bg-border-subtle md:inline-block" />
              )}
            </li>
          );
        })}
      </ol>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* Main column */}
        <div className="space-y-6">
          {step === 1 && (
            <section className="rounded-md border border-border-subtle bg-surface-raised p-5">
              <h2 className="text-heading-sm text-text-primary">Cart review</h2>
              <p className="mt-1 text-caption text-text-muted">
                Lines came in from the product matrix grid. Adjust by going back
                to the PDP &#8212; saved draft preserves what&apos;s here.
              </p>
              <ul className="mt-4 divide-y divide-border-subtle">
                {cartLines.length === 0 && productName && (
                  <li className="py-3">
                    <p className="text-body-md text-text-primary">{productName}</p>
                    <p className="mt-1 text-caption text-text-muted">
                      Estimated order value: {formatRupees(subtotalPaise)}
                    </p>
                  </li>
                )}
                {cartLines.map((line) => (
                  <li key={line.variantId} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-mono text-caption text-text-secondary">
                        {line.variantId}
                      </p>
                    </div>
                    <Badge tone="info">{line.quantity} units</Badge>
                  </li>
                ))}
              </ul>
              <CouponInput subtotalPaise={subtotalPaise} onChange={setCoupon} />
            </section>
          )}

          {step === 2 && (
            <section className="rounded-md border border-border-subtle bg-surface-raised p-5">
              <h2 className="text-heading-sm text-text-primary">
                Billing &amp; shipping addresses
              </h2>
              <p className="mt-1 text-caption text-text-muted">
                Billing is locked to your approved company GSTIN; shipping can
                differ (e.g. to a warehouse or contract manufacturer).
              </p>

              {/* Billing — read-only when the company record is complete;
                  editable (and persisted) when it's missing fields so the
                  buyer can complete it instead of being stuck. */}
              {companyBillingComplete ? (
                <div className="mt-4 rounded-sm border border-border-subtle bg-surface-background p-4">
                  <p className="text-micro text-text-muted">Billing</p>
                  <p className="mt-1 text-body-md text-text-primary">
                    {company?.trade_name ?? "Your company"}
                  </p>
                  <p className="mt-1 text-caption text-text-muted">
                    {billing.line1}, {billing.city}, {billing.state}{" "}
                    {billing.postal_code}
                  </p>
                  <p className="mt-1 text-caption text-text-muted">
                    GSTIN: {billing.gstin || "—"}
                  </p>
                </div>
              ) : (
                <div className="mt-4 rounded-sm border border-border-subtle bg-surface-background p-4">
                  <p className="text-micro text-text-muted">Billing</p>
                  <p className="mt-1 text-body-md text-text-primary">
                    {company?.trade_name ?? "Your company"}
                  </p>
                  <p className="mt-2 rounded-md bg-feedback-warning-bg px-3 py-2 text-caption text-feedback-warning-text">
                    Your company billing address is incomplete. Complete it below
                    to continue — we&rsquo;ll save it to your company profile for
                    future orders and invoices.
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="flex flex-col gap-1.5 md:col-span-2">
                      <Label htmlFor="bill-line1" required>Billing address</Label>
                      <Input
                        id="bill-line1"
                        value={billing.line1}
                        onChange={(e) =>
                          setBilling((b) => ({ ...b, line1: e.currentTarget.value }))
                        }
                        placeholder="Building, street, area"
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="bill-city" required>City</Label>
                      <Input
                        id="bill-city"
                        value={billing.city}
                        onChange={(e) =>
                          setBilling((b) => ({ ...b, city: e.currentTarget.value }))
                        }
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="bill-state" required>State</Label>
                      <Input
                        id="bill-state"
                        value={billing.state}
                        onChange={(e) =>
                          setBilling((b) => ({ ...b, state: e.currentTarget.value }))
                        }
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="bill-pin" required>PIN code</Label>
                      <Input
                        id="bill-pin"
                        inputMode="numeric"
                        maxLength={6}
                        value={billing.postal_code}
                        onChange={(e) =>
                          setBilling((b) => ({
                            ...b,
                            postal_code: e.currentTarget.value.replace(/\D/g, "").slice(0, 6),
                          }))
                        }
                        placeholder="6 digits"
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="bill-gstin">GSTIN (optional)</Label>
                      <Input
                        id="bill-gstin"
                        value={billing.gstin}
                        onChange={(e) =>
                          setBilling((b) => ({ ...b, gstin: e.currentTarget.value.toUpperCase() }))
                        }
                        placeholder="29ABCDE1234F1Z5"
                        maxLength={15}
                        className="font-mono uppercase"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Shipping mode toggle */}
              <fieldset className="mt-5">
                <legend className="text-body-sm font-medium text-text-primary">
                  Ship to
                </legend>
                <div className="mt-2 flex flex-wrap gap-3">
                  <label className="inline-flex items-center gap-2 text-body-sm text-text-secondary">
                    <input
                      type="radio"
                      name="ship_mode"
                      value="same"
                      checked={shippingMode === "same"}
                      onChange={() => setShippingMode("same")}
                    />
                    Same as billing
                  </label>
                  <label className="inline-flex items-center gap-2 text-body-sm text-text-secondary">
                    <input
                      type="radio"
                      name="ship_mode"
                      value="custom"
                      checked={shippingMode === "custom"}
                      onChange={() => setShippingMode("custom")}
                    />
                    New shipping address
                  </label>
                </div>
              </fieldset>

              {shippingMode === "custom" && (
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <Label htmlFor="ship-line1" required>Address line</Label>
                    <Input
                      id="ship-line1"
                      value={customShip.line1}
                      onChange={(e) =>
                        setCustomShip((s) => ({ ...s, line1: e.currentTarget.value }))
                      }
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ship-city" required>City</Label>
                    <Input
                      id="ship-city"
                      value={customShip.city}
                      onChange={(e) =>
                        setCustomShip((s) => ({ ...s, city: e.currentTarget.value }))
                      }
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ship-state" required>State</Label>
                    <Input
                      id="ship-state"
                      value={customShip.state}
                      onChange={(e) =>
                        setCustomShip((s) => ({ ...s, state: e.currentTarget.value }))
                      }
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ship-pin" required>PIN code</Label>
                    <Input
                      id="ship-pin"
                      inputMode="numeric"
                      maxLength={6}
                      value={customShip.postal_code}
                      onChange={(e) =>
                        setCustomShip((s) => ({
                          ...s,
                          postal_code: e.currentTarget.value.replace(/\D/g, ""),
                        }))
                      }
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ship-contact">Site contact name</Label>
                    <Input
                      id="ship-contact"
                      autoComplete="name"
                      value={customShip.contact_name}
                      onChange={(e) =>
                        setCustomShip((s) => ({ ...s, contact_name: e.currentTarget.value }))
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ship-phone">Site contact phone</Label>
                    <Input
                      id="ship-phone"
                      type="tel"
                      autoComplete="tel"
                      value={customShip.contact_phone}
                      onChange={(e) =>
                        setCustomShip((s) => ({ ...s, contact_phone: e.currentTarget.value }))
                      }
                    />
                  </div>
                </div>
              )}
            </section>
          )}

          {step === 3 && (
            <section className="rounded-md border border-border-subtle bg-surface-raised p-5">
              <h2 className="text-heading-sm text-text-primary">Delivery company</h2>
              <p className="mt-1 text-caption text-text-muted">
                Select a courier partner for this shipment. Freight is charged at
                dispatch against the carrier&apos;s actual bill.
              </p>

              <div className="mt-4">
                <DeliveryCompanySelector
                  options={COURIER_PROVIDERS}
                  value={shippingMethodId}
                  onValueChange={setShippingMethodId}
                />
              </div>

              <fieldset className="mt-5">
                <legend className="text-body-sm font-medium text-text-primary">
                  Or choose an alternative
                </legend>
                <div className="mt-2 space-y-2">
                  {PICKUP_OPTIONS.map((m) => (
                    <label
                      key={m.id}
                      className={[
                        "flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors",
                        shippingMethodId === m.id
                          ? "border-action-primary-bg bg-surface-sunken"
                          : "border-border-subtle bg-surface-background hover:bg-surface-sunken",
                      ].join(" ")}
                    >
                      <input
                        type="radio"
                        name="shipping_method"
                        value={m.id}
                        checked={shippingMethodId === m.id}
                        onChange={() => setShippingMethodId(m.id)}
                      />
                      <div className="flex flex-1 items-baseline justify-between gap-2">
                        <span className="text-body-md font-medium text-text-primary">
                          {m.label}
                        </span>
                        <span className="font-mono text-body-sm text-text-secondary">
                          {m.eta}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </fieldset>

              {shippingMethodId === "other_courier" && (
                <div className="mt-5 border-t border-border-subtle pt-4 space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="other-courier-name" required>
                      Courier Company Name
                    </Label>
                    <Input
                      id="other-courier-name"
                      placeholder="e.g. DTDC Express, Professional Couriers..."
                      value={otherCourierName}
                      onChange={(e) => setOtherCourierName(e.currentTarget.value)}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="other-courier-notes">
                      Shipping Notes / Instructions (Optional)
                    </Label>
                    <Input
                      id="other-courier-notes"
                      placeholder="Optional notes for booking or dispatch..."
                      value={otherCourierNotes}
                      onChange={(e) => setOtherCourierNotes(e.currentTarget.value)}
                    />
                  </div>
                </div>
              )}
            </section>
          )}

          {step === 4 && (
            <section className="rounded-md border border-border-subtle bg-surface-raised p-5">
              <h2 className="text-heading-sm text-text-primary">Payment method</h2>
              <p className="mt-1 text-caption text-text-muted">
                Choose online payment or select wallet debit to proceed.
              </p>
              <fieldset className="mt-4">
                <legend className="sr-only">Choose a payment method</legend>
                <div className="space-y-2">
                  {PAYMENT_METHODS.map((m) => {
                    const disabled =
                      (m.id === "wallet" && !walletCoversAll) ||
                      (m.id === "wallet_plus_razorpay" && walletPaise <= 0);
                    return (
                      <label
                        key={m.id}
                        className={[
                          "flex items-start gap-3 rounded-md border p-4 transition-colors",
                          disabled
                            ? "cursor-not-allowed border-border-subtle bg-surface-sunken opacity-60"
                            : paymentMethodId === m.id
                              ? "cursor-pointer border-action-primary-bg bg-surface-sunken"
                              : "cursor-pointer border-border-subtle bg-surface-background hover:bg-surface-sunken",
                        ].join(" ")}
                      >
                        <input
                          type="radio"
                          name="payment_method"
                          value={m.id}
                          disabled={disabled}
                          checked={paymentMethodId === m.id}
                          onChange={() => setPaymentMethodId(m.id)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-body-md font-medium text-text-primary">
                              {m.label}
                            </span>
                            {m.id === "wallet" && (
                              <span className="font-mono text-caption text-text-muted">
                                Balance {formatRupees(walletPaise)}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-caption text-text-muted">{m.desc}</p>
                          {disabled && m.id === "wallet" && (
                            <p className="mt-2 text-caption text-feedback-danger-text">
                              Shortfall {formatRupees(walletShortfallPaise)}.{" "}
                              <Link href="/b2b/wallet" className="underline-offset-2 hover:underline">
                                Add funds
                              </Link>{" "}
                              or pick Wallet + Razorpay below.
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {paymentMethodId === "wallet_plus_razorpay" && walletPartialCovers && (
                <div className="mt-4 rounded-md border border-feedback-info-border bg-feedback-info-bg p-4 text-feedback-info-text">
                  <p className="text-body-sm">
                    Wallet covers {formatRupees(walletPaise)}; remaining{" "}
                    {formatRupees(walletShortfallPaise)} will be captured via
                    Razorpay on the next screen (handover happens after order
                    creation).
                  </p>
                </div>
              )}

              {/* Inline payment-proof capture. Asks for UTR / txn id /
                  internal PO # immediately after method selection so the
                  buyer doesn't have to come back to /b2b/purchase-orders
                  later just to enter a reference. */}
              {(() => {
                const cfg = PAYMENT_PROOF_CONFIG[paymentMethodId];
                if (!cfg.needsReference) {
                  return cfg.hint ? (
                    <p
                      role="status"
                      aria-live="polite"
                      className="mt-5 rounded-md border border-feedback-info-border bg-feedback-info-bg px-4 py-3 text-body-sm text-feedback-info-text"
                    >
                      {cfg.hint}
                    </p>
                  ) : null;
                }
                return (
                  <div className="mt-6 rounded-md border border-border-subtle bg-surface-background p-4">
                    <h3 className="text-body-md font-medium text-text-primary">
                      Payment proof
                    </h3>
                    <p className="mt-1 text-caption text-text-muted">{cfg.hint}</p>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="flex flex-col gap-1.5 md:col-span-2">
                        <Label htmlFor="pay-ref" required>
                          {cfg.label}
                        </Label>
                        <Input
                          id="pay-ref"
                          value={paymentReference}
                          onChange={(e) => setPaymentReference(e.currentTarget.value)}
                          placeholder={cfg.placeholder}
                          className="font-mono"
                          required
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="pay-paid-at">Payment date</Label>
                        <Input
                          id="pay-paid-at"
                          type="date"
                          value={paymentPaidAt}
                          onChange={(e) => setPaymentPaidAt(e.currentTarget.value)}
                          max={new Date().toISOString().slice(0, 10)}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="pay-proof-notes">Notes (optional)</Label>
                        <Input
                          id="pay-proof-notes"
                          value={paymentProofNotes}
                          onChange={(e) => setPaymentProofNotes(e.currentTarget.value)}
                          placeholder="Bank used, payer name on slip, etc."
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}
            </section>
          )}

          {step === 5 && (
            <section className="rounded-md border border-border-subtle bg-surface-raised p-5">
              <h2 className="text-heading-sm text-text-primary">Order review</h2>

              <dl className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <ReviewRow label="Company" value={company?.trade_name ?? "—"} />
                <ReviewRow label="GSTIN" value={billing.gstin || "—"} mono />
                <ReviewRow
                  label="Billing"
                  value={`${billing.line1 || "—"}, ${billing.city}, ${billing.state} ${billing.postal_code}`}
                />
                <ReviewRow
                  label="Shipping"
                  value={
                    shippingMode === "same"
                      ? "Same as billing"
                      : `${customShip.line1}, ${customShip.city}, ${customShip.state} ${customShip.postal_code}`
                  }
                />
                <ReviewRow
                  label="Delivery"
                  value={`${courierMethod?.name ?? pickupMethod?.label ?? "—"} (${courierMethod?.estimatedDelivery ?? pickupMethod?.eta ?? ""})`}
                />
                <ReviewRow
                  label="Payment"
                  value={PAYMENT_METHODS.find((p) => p.id === paymentMethodId)?.label ?? "—"}
                />
                <ReviewRow label="Lines" value={`${cartLines.length} (${variantQtyTotal} units)`} />
                {coupon && (
                  <ReviewRow
                    label="Coupon"
                    value={`${coupon.code} · -${formatRupees(coupon.discount_paise)}`}
                  />
                )}
              </dl>

              <div className="mt-6 flex items-start gap-2 rounded-md border border-border-subtle bg-surface-background p-4">
                <input
                  id="confirm"
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.currentTarget.checked)}
                  className="mt-1 h-4 w-4"
                />
                <Label htmlFor="confirm" className="text-body-sm text-text-secondary">
                  I confirm this order. By placing it, I authorise
                  RISITEX to process the listed payment method and dispatch
                  according to the selected shipping method.
                </Label>
              </div>

              {submitError && (
                <p
                  role="alert"
                  className="mt-4 rounded-md bg-feedback-danger-bg px-3 py-2 text-body-sm text-feedback-danger-text ring-1 ring-feedback-danger-border"
                >
                  {submitError}
                </p>
              )}
            </section>
          )}

          {/* Notes — always editable on step 5 to capture finance/finance-team commentary */}
          {step >= 4 && (
            <section className="rounded-md border border-border-subtle bg-surface-raised p-5">
              <Label htmlFor="notes">Internal notes (optional)</Label>
              <Textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.currentTarget.value)}
                placeholder="e.g. dispatch ref X, approval thread Y, urgency notes."
                className="mt-2"
              />
            </section>
          )}

          {/* Step nav */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={goBack}
              disabled={step === 1}
            >
              Back
            </Button>
            {step < 5 ? (
              <Button
                type="button"
                onClick={goNext}
                isLoading={step === 2 && savingBilling}
                disabled={
                  (step === 1 && !canStep2) ||
                  (step === 2 && !canStep3) ||
                  (step === 3 && !canStep4) ||
                  (step === 4 && !canStep5)
                }
              >
                Continue
              </Button>
            ) : (
              <Button
                type="button"
                onClick={placeOrder}
                isLoading={submitting}
                disabled={!canPlace}
              >
                Place order ({formatRupees(grandTotalPaise)})
              </Button>
            )}
          </div>
        </div>

        {/* Summary sidebar */}
        <aside aria-label="Order summary" className="space-y-4">
          <section className="rounded-md border border-border-subtle bg-surface-raised p-5">
            <h3 className="text-heading-sm text-text-primary">Order summary</h3>
            <dl className="mt-4 space-y-2 text-body-sm">
              <Row label="Subtotal" value={formatRupees(subtotalPaise)} />
              {coupon && (
                <Row
                  label={`Coupon ${coupon.code}`}
                  value={`-${formatRupees(coupon.discount_paise)}`}
                  emphasis="positive"
                />
              )}
              <Row
                label={`Shipping · ${courierMethod?.name ?? pickupMethod?.label ?? "—"}`}
                value={shippingPaise ? formatRupees(shippingPaise) : "—"}
              />
              {gstLines.map((l) => (
                <Row
                  key={l.label}
                  label={`${l.label} (5%)`}
                  value={formatRupees(l.amountPaise)}
                />
              ))}
            </dl>
            <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-3">
              <span className="text-body-md text-text-primary">Total</span>
              <span className="font-mono text-heading-sm text-text-primary">
                {formatRupees(grandTotalPaise)}
              </span>
            </div>
            <p className="mt-2 text-caption text-text-muted">
              Indicative. Final invoice posts after dispatch.
            </p>
          </section>

          <ShippingGstEstimate subtotalPaise={discountedSubtotalPaise} />

          {wallet && (
            <section className="rounded-md border border-border-subtle bg-surface-raised p-5">
              <h3 className="text-heading-sm text-text-primary">Wallet</h3>
              <p className="mt-1 font-mono text-display-sm text-text-primary">
                {formatRupees(walletPaise)}
              </p>
              <p className="mt-1 text-caption text-text-muted">
                {walletCoversAll
                  ? "Covers this order in full."
                  : walletPaise > 0
                    ? `Covers ${formatRupees(walletPaise)}; ${formatRupees(walletShortfallPaise)} needed via another channel.`
                    : "No wallet balance — pick another payment method."}
              </p>
            </section>
          )}

          {credit && (credit.limit_inr ?? 0) > 0 && (
            <section className="rounded-md border border-border-subtle bg-surface-raised p-5">
              <h3 className="text-heading-sm text-text-primary">Credit</h3>
              <p className="mt-1 text-caption text-text-muted">
                Limit: {formatRupees(Math.round(Number(credit.limit_inr ?? 0) * 100))} · Used:{" "}
                {formatRupees(Math.round(Number(credit.used_inr ?? 0) * 100))}
              </p>
              <p className="mt-2 font-mono text-body-md text-text-primary">
                Available {formatRupees(creditAvailablePaise)}
              </p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: "positive";
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-text-muted">{label}</dt>
      <dd
        className={
          emphasis === "positive"
            ? "font-mono text-feedback-success-text"
            : "font-mono text-text-primary"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function ReviewRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd
        className={
          (mono ? "font-mono " : "") + "mt-1 text-body-sm text-text-primary"
        }
      >
        {value}
      </dd>
    </div>
  );
}
