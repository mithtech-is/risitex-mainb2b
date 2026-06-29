/**
 * Storefront helpers for the RISITEX verification flow.
 *
 * Email OTP + Phone (WhatsApp) OTP are both gated by an authenticated
 * customer session (the JWT lands in localStorage after sign-up / sign-in).
 *
 * `getVerificationStatus()` is the source of truth — read it from the
 * customer's `metadata` blob and use the flags to decide whether to
 * route a user into the verification center or straight to the B2B dashboard.
 */
import { MEDUSA_BASE_URL } from "./medusa";

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

/** Read the stashed JWT (set by Medusa's SDK on login). */
function readToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("medusa_auth_token");
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "x-publishable-api-key": PUB_KEY,
  };
  const t = readToken();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

export type VerificationStatus = {
  email_verified: boolean;
  email_verified_at: string | null;
  phone_verified: boolean;
  phone_verified_at: string | null;
  email: string | null;
  phone: string | null;
  /** PAN captured at signup (10-char uppercase) or null if not yet provided. */
  pan: string | null;
  /** True once the buyer verified ownership of the PAN-linked phone via OTP. */
  pan_verified: boolean;
  pan_verified_at: string | null;
};

/**
 * Pull the customer's verification flags from `/store/customers/me`.
 * Returns null when the customer is unauthenticated (caller should
 * route to /auth/sign-in).
 */
export async function getVerificationStatus(): Promise<VerificationStatus | null> {
  const res = await fetch(`${MEDUSA_BASE_URL}/store/customers/me`, {
    headers: authHeaders(),
    credentials: "include",
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`/store/customers/me ${res.status}`);
  const { customer } = (await res.json()) as {
    customer: {
      email?: string | null;
      phone?: string | null;
      metadata?: Record<string, unknown> | null;
    };
  };
  const meta = (customer.metadata ?? {}) as Record<string, unknown>;
  return {
    email_verified: meta.email_verified === true,
    email_verified_at:
      typeof meta.email_verified_at === "string"
        ? (meta.email_verified_at as string)
        : null,
    phone_verified: meta.phone_verified === true,
    phone_verified_at:
      typeof meta.phone_verified_at === "string"
        ? (meta.phone_verified_at as string)
        : null,
    email: customer.email ?? null,
    phone: customer.phone ?? null,
    pan: typeof meta.pan === "string" ? (meta.pan as string) : null,
    pan_verified: meta.pan_verified === true,
    pan_verified_at:
      typeof meta.pan_verified_at === "string"
        ? (meta.pan_verified_at as string)
        : null,
  };
}

/**
 * Wholesale application gate. After sign-in, check whether the customer is a
 * wholesale applicant still awaiting (or rejected at) review — they have a
 * login but no approved company yet, so they must NOT be let in.
 *
 * Returns "approved" | "pending" | "rejected" | null (no application).
 */
export async function getWholesaleApplicationStatus(): Promise<
  "approved" | "pending" | "rejected" | null
> {
  try {
    const res = await fetch(`${MEDUSA_BASE_URL}/store/companies/me`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      b2b?: unknown;
      company?: unknown;
      customer?: { company_id?: string | null } | null;
      application?: { status?: string } | null;
    };
    // An approved customer has a live b2b company block — treat as approved
    // regardless of the historical application row.
    if (j.b2b || j.company || j.customer?.company_id) return "approved";
    const s = j.application?.status;
    if (s === "pending" || s === "rejected" || s === "approved") return s;
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// Email OTP
// ─────────────────────────────────────────────────────────────────

export type SendEmailOtpResponse = {
  ok: true;
  otp_request_id: string;
  expires_at: string;
  sent_via: "email";
  masked_email: string;
};

export async function sendEmailOtp(): Promise<SendEmailOtpResponse> {
  const res = await fetch(`${MEDUSA_BASE_URL}/store/auth/email-otp/send`, {
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
    body: JSON.stringify({}),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body.ok !== true) {
    throw new Error(
      typeof body.message === "string"
        ? (body.message as string)
        : `Send failed (${res.status})`,
    );
  }
  return body as SendEmailOtpResponse;
}

export async function verifyEmailOtp(args: {
  otp_request_id: string;
  otp: string;
}): Promise<void> {
  const res = await fetch(`${MEDUSA_BASE_URL}/store/auth/email-otp/verify`, {
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
    body: JSON.stringify(args),
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    code?: string;
    data?: { remaining_attempts?: number };
  };
  if (!res.ok || !body.ok) {
    const remaining = body.data?.remaining_attempts;
    const detail =
      typeof remaining === "number"
        ? ` (${remaining} attempts left)`
        : "";
    throw new Error(`${body.message ?? "Verification failed"}${detail}`);
  }
}

export async function resendEmailOtp(otp_request_id: string): Promise<void> {
  const res = await fetch(`${MEDUSA_BASE_URL}/store/auth/email-otp/resend`, {
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
    body: JSON.stringify({ otp_request_id }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
  };
  if (!res.ok || !body.ok) {
    throw new Error(body.message ?? `Resend failed (${res.status})`);
  }
}

// ─────────────────────────────────────────────────────────────────
// Phone (WhatsApp / SMS) OTP
// ─────────────────────────────────────────────────────────────────

export type SendPhoneOtpResponse = {
  ok: true;
  otp_request_id: string;
  expires_at: string;
  sent_via: "whatsapp" | "sms";
  masked_phone: string;
};

export async function sendPhoneOtp(phone_e164: string): Promise<SendPhoneOtpResponse> {
  const res = await fetch(`${MEDUSA_BASE_URL}/store/auth/phone-otp/send`, {
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
    body: JSON.stringify({ phone_e164, purpose: "verify" }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body.ok !== true) {
    throw new Error(
      typeof body.message === "string"
        ? (body.message as string)
        : `Send failed (${res.status})`,
    );
  }
  return body as SendPhoneOtpResponse;
}

export async function verifyPhoneOtp(args: {
  otp_request_id: string;
  phone_e164: string;
  otp: string;
}): Promise<void> {
  const res = await fetch(`${MEDUSA_BASE_URL}/store/auth/phone-otp/verify`, {
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
    body: JSON.stringify(args),
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    code?: string;
    data?: { remaining_attempts?: number };
  };
  if (!res.ok || !body.ok) {
    const remaining = body.data?.remaining_attempts;
    const detail =
      typeof remaining === "number"
        ? ` (${remaining} attempts left)`
        : "";
    throw new Error(`${body.message ?? "Verification failed"}${detail}`);
  }
}

export async function resendPhoneOtp(otp_request_id: string): Promise<void> {
  const res = await fetch(`${MEDUSA_BASE_URL}/store/auth/phone-otp/resend`, {
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
    body: JSON.stringify({ otp_request_id }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
  };
  if (!res.ok || !body.ok) {
    throw new Error(body.message ?? `Resend failed (${res.status})`);
  }
}

/**
 * Validate + normalise a 10-digit Indian phone number to E.164 (+91…).
 * Accepts:
 *   "9876543210"     → "+919876543210"
 *   "919876543210"   → "+919876543210"
 *   "+919876543210"  → "+919876543210"
 *   "+91 9876543210" → "+919876543210"
 * Throws when the number isn't a recognisable 10-digit Indian mobile.
 */
export function toIndianE164(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("91") && /^91[6-9]/.test(digits)) {
    return `+${digits}`;
  }
  throw new Error("Enter a valid 10-digit Indian mobile number");
}
