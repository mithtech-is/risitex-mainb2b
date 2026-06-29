/**
 * Storefront helpers for the 3-stage password reset flow.
 *
 *   Stage 1  POST /store/auth/password-reset/send     — request OTP
 *   Stage 2  POST /store/auth/password-reset/verify   — exchange OTP
 *                                                       for reset token
 *   Stage 3  POST /auth/customer/emailpass/update?token=...
 *                                                     — set new password
 *
 * The backend is anti-enumeration-safe: stage 1 always returns 200
 * with a masked destination so a bot can't probe which emails have
 * accounts. That contract is preserved in the wrappers below.
 */
import { MEDUSA_BASE_URL } from "./medusa";

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-publishable-api-key": PUB_KEY,
  };
}

export type ResetSendResponse = {
  channel: "email" | "phone";
  masked_destination: string;
  ttl_seconds: number;
};

export async function sendResetOtp(args: {
  email: string;
  channel?: "email" | "phone";
}): Promise<ResetSendResponse> {
  const res = await fetch(
    `${MEDUSA_BASE_URL}/store/auth/password-reset/send`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        email: args.email.trim(),
        channel: args.channel ?? "email",
      }),
    },
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body.ok === false) {
    throw new Error(
      typeof body.message === "string"
        ? (body.message as string)
        : `Reset send failed (${res.status})`,
    );
  }
  return body.data as ResetSendResponse;
}

export type ResetVerifyResponse = {
  reset_token: string;
  email: string;
};

export async function verifyResetOtp(args: {
  email: string;
  otp: string;
}): Promise<ResetVerifyResponse> {
  const res = await fetch(
    `${MEDUSA_BASE_URL}/store/auth/password-reset/verify`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        email: args.email.trim(),
        otp: args.otp,
      }),
    },
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body.ok === false) {
    // The backend embeds `attempts_remaining` in the error data blob —
    // surface it so the page can render "2 attempts left".
    const data = (body.data ?? {}) as { attempts_remaining?: number };
    const detail =
      typeof data.attempts_remaining === "number"
        ? ` (${data.attempts_remaining} attempts left)`
        : "";
    throw new Error(
      `${
        typeof body.message === "string"
          ? (body.message as string)
          : `Verification failed (${res.status})`
      }${detail}`,
    );
  }
  return body.data as ResetVerifyResponse;
}

export async function commitNewPassword(args: {
  email: string;
  token: string;
  password: string;
}): Promise<void> {
  // Medusa's emailpass-update endpoint reads the JWT from `?token=` and
  // the new password from the body. The backend's middlewares.ts wires
  // passwordPolicyGuard + passwordHistoryGuard on this exact matcher
  // so weak / reused passwords are rejected server-side here.
  const res = await fetch(
    `${MEDUSA_BASE_URL}/auth/customer/emailpass/update?token=${encodeURIComponent(args.token)}`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        email: args.email.trim(),
        password: args.password,
      }),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      code?: string;
    };
    throw new Error(
      body.message ?? `Couldn't update password (${res.status})`,
    );
  }
}
