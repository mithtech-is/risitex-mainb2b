"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@risitex/ui/components";
import { Container } from "@/components/site/container";
import { toIndianE164 } from "@/lib/verification";

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";
const BACKEND_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000";

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "x-publishable-api-key": PUB_KEY,
  };
  if (typeof window !== "undefined") {
    const t = window.localStorage.getItem("medusa_auth_token");
    if (t) h.Authorization = `Bearer ${t}`;
  }
  return h;
}

/**
 * /auth/verify-pan
 *
 * PAN-linked phone OTP. One step covers both PAN ownership (channel
 * proof via OTP) AND phone verification — the verify route stamps both
 * `pan_verified` and `phone_verified` in a single round-trip, so after
 * this completes the buyer only needs email verification before
 * auto-approval kicks in.
 *
 * Pre-fills PAN + phone from signup metadata when present.
 */
export default function VerifyPanPage() {
  const router = useRouter();
  const [stage, setStage] = React.useState<"enter" | "otp" | "done">("enter");
  const [pan, setPan] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [otpRequestId, setOtpRequestId] = React.useState<string | null>(null);
  const [maskedPhone, setMaskedPhone] = React.useState<string | null>(null);
  const [expiresAt, setExpiresAt] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Pre-fill from /store/customers/me so a freshly-signed-up buyer doesn't
  // retype what they already entered at signup.
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/store/customers/me`, {
          headers: authHeaders(),
          credentials: "include",
        });
        if (!res.ok) return;
        const body = (await res.json()) as {
          customer?: {
            phone?: string | null;
            metadata?: { pan?: string; pan_verified?: boolean };
          };
        };
        const meta = body.customer?.metadata ?? {};
        if (meta.pan_verified === true) {
          setStage("done");
          return;
        }
        if (typeof meta.pan === "string") setPan(meta.pan.toUpperCase());
        if (body.customer?.phone) setPhone(body.customer.phone);
      } catch {
        /* best-effort prefill */
      }
    })();
  }, []);

  const send = async () => {
    setError(null);
    const normalisedPan = pan.trim().toUpperCase();
    if (!PAN_REGEX.test(normalisedPan)) {
      setError("Enter a 10-character Indian PAN (e.g. AAAPL1234C).");
      return;
    }
    const phoneE164 = toIndianE164(phone.trim());
    if (!phoneE164.startsWith("+91") || phoneE164.length < 13) {
      setError("Enter a 10-digit Indian mobile number.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`${BACKEND_URL}/store/auth/pan-otp/send`, {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
        body: JSON.stringify({ pan: normalisedPan, phone_e164: phoneE164 }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        otp_request_id?: string;
        masked_phone?: string;
        expires_at?: string;
      };
      if (!res.ok || !body.ok || !body.otp_request_id) {
        setError(body.message ?? `Send failed (${res.status})`);
        return;
      }
      setOtpRequestId(body.otp_request_id);
      setMaskedPhone(body.masked_phone ?? null);
      setExpiresAt(body.expires_at ?? null);
      setPan(normalisedPan);
      setPhone(phoneE164);
      setStage("otp");
    } catch {
      setError("Network error — please retry.");
    } finally {
      setSending(false);
    }
  };

  const verify = async () => {
    setError(null);
    if (!/^\d{4,8}$/.test(otp)) {
      setError("Enter the 4–8 digit code we sent.");
      return;
    }
    if (!otpRequestId) {
      setError("Request expired — send a new OTP.");
      setStage("enter");
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch(`${BACKEND_URL}/store/auth/pan-otp/verify`, {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
        body: JSON.stringify({
          otp_request_id: otpRequestId,
          pan,
          phone_e164: phone,
          otp,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        data?: unknown;
      };
      if (!res.ok || !body.ok) {
        setError(body.message ?? `Verification failed (${res.status})`);
        return;
      }
      setStage("done");
      // Hop forward to the verification hub so the customer finishes
      // the email step next (or lands at /b2b/dashboard if email was
      // already verified before they got here).
      setTimeout(() => router.replace("/auth/verification-center"), 1200);
    } catch {
      setError("Network error — please retry.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Container width="narrow">
      <div className="py-16">
        <p className="text-micro text-text-muted">Account verification</p>
        <h1 className="mt-2 text-display-lg text-text-primary">
          Verify your PAN.
        </h1>
        <p className="mt-3 text-body-md text-text-muted">
           Enter the mobile number registered against your PAN. We&apos;ll send a
          one-time code via WhatsApp (SMS fallback). This step verifies both
          your PAN ownership and your mobile.
        </p>

        {stage === "enter" && (
          <div className="mt-10 grid grid-cols-1 gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pan" required>PAN</Label>
              <Input
                id="pan"
                autoComplete="off"
                spellCheck={false}
                value={pan}
                onChange={(e) => setPan(e.currentTarget.value.toUpperCase())}
                placeholder="AAAPL1234C"
                maxLength={10}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone" required>Mobile linked to PAN</Label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel-national"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.currentTarget.value)}
                placeholder="10-digit number"
                required
              />
            </div>
            {error && (
              <p
                role="alert"
                className="rounded-md bg-feedback-danger-bg px-3 py-2 text-body-sm text-feedback-danger-text ring-1 ring-feedback-danger-border"
              >
                {error}
              </p>
            )}
            <div>
              <Button type="button" onClick={send} isLoading={sending} size="lg">
                Send OTP
              </Button>
            </div>
          </div>
        )}

        {stage === "otp" && (
          <div className="mt-10 grid grid-cols-1 gap-5">
            <div className="rounded-md border border-border-subtle bg-surface-raised p-4 text-body-sm text-text-secondary">
              Code sent to <span className="font-mono">{maskedPhone}</span>.{" "}
              {expiresAt && (
                <>Valid until {new Date(expiresAt).toLocaleTimeString("en-IN")}.</>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="otp" required>One-time code</Label>
              <Input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={otp}
                onChange={(e) =>
                  setOtp(e.currentTarget.value.replace(/\D/g, ""))
                }
                placeholder="123456"
                className="font-mono tracking-widest"
                aria-describedby="otp-instructions"
                required
              />
              <p id="otp-instructions" className="text-caption text-text-muted">
                4–8 digit code sent to your registered mobile.
              </p>
            </div>
            {error && (
              <p
                role="alert"
                className="rounded-md bg-feedback-danger-bg px-3 py-2 text-body-sm text-feedback-danger-text ring-1 ring-feedback-danger-border"
              >
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={verify} isLoading={verifying} size="lg">
                Verify PAN
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setStage("enter");
                  setOtp("");
                  setOtpRequestId(null);
                }}
              >
                Change number
              </Button>
            </div>
          </div>
        )}

        {stage === "done" && (
          <div className="mt-10 rounded-md border border-feedback-success-border bg-feedback-success-bg p-5">
            <p className="text-body-md font-medium text-feedback-success-text">
              PAN &amp; mobile verified.
            </p>
            <p className="mt-2 text-body-sm text-feedback-success-text/80">
              Continuing to verification hub…
            </p>
            <Button asChild variant="secondary" className="mt-4">
              <Link href="/auth/verification-center">Continue</Link>
            </Button>
          </div>
        )}

        <p className="mt-8 text-caption text-text-muted">
          Lost access to that number?{" "}
          <Link
            href="/contact"
            className="text-text-primary underline-offset-4 hover:underline"
          >
            Contact support
          </Link>
          .
        </p>
      </div>
    </Container>
  );
}
