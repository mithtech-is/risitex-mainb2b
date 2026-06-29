"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@risitex/ui/components";
import { Container } from "@/components/site/container";
import {
  getVerificationStatus,
  sendPhoneOtp,
  resendPhoneOtp,
  verifyPhoneOtp,
  toIndianE164,
} from "@/lib/verification";

const RESEND_COOLDOWN_SEC = 60;
const SIGNUP_PHONE_KEY = "risitex.signup.phone";

/**
 * /auth/verify-phone — collects the WhatsApp OTP for the customer's
 * mobile number. The page renders in two states:
 *
 *   1. "Enter your number" — when there's no in-flight OTP request.
 *      Pre-fills from sessionStorage if the customer typed a phone on
 *      sign-up; otherwise asks for a fresh 10-digit Indian mobile.
 *   2. "Enter the code" — after a successful send. Shows the masked
 *      number, 6-digit input, and a 60-second resend timer.
 *
 * Successful verification routes to the B2B dashboard.
 */
export default function VerifyPhonePage() {
  const router = useRouter();
  const [phone, setPhone] = React.useState("");
  const [phoneE164, setPhoneE164] = React.useState<string | null>(null);
  const [maskedPhone, setMaskedPhone] = React.useState<string>("");
  const [otpRequestId, setOtpRequestId] = React.useState<string | null>(null);
  const [otp, setOtp] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [cooldown, setCooldown] = React.useState(0);

  // On mount: enforce verification order (email must be done first),
  // pre-fill phone from sessionStorage if it's there.
  React.useEffect(() => {
    void (async () => {
      const s = await getVerificationStatus().catch(() => null);
      if (!s) {
        router.replace("/auth/sign-in");
        return;
      }
      if (!s.email_verified) {
        router.replace("/auth/verify-email");
        return;
      }
      if (s.phone_verified) {
        router.replace("/b2b/dashboard");
        return;
      }
      if (typeof window !== "undefined") {
        const stashed = window.sessionStorage.getItem(SIGNUP_PHONE_KEY);
        if (stashed) setPhone(stashed);
      }
    })();
  }, [router]);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  const fireSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    let e164: string;
    try {
      e164 = toIndianE164(phone);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    setSending(true);
    try {
      const r = await sendPhoneOtp(e164);
      setPhoneE164(e164);
      setOtpRequestId(r.otp_request_id);
      setMaskedPhone(r.masked_phone);
      setCooldown(RESEND_COOLDOWN_SEC);
      setInfo(`Code sent via ${r.sent_via} to ${r.masked_phone}.`);
      // Stash so the back-button + reload don't lose the number.
      window.sessionStorage.setItem(SIGNUP_PHONE_KEY, phone);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const fireResend = async () => {
    if (!otpRequestId) return;
    setSending(true);
    setError(null);
    setInfo(null);
    try {
      await resendPhoneOtp(otpRequestId);
      setCooldown(RESEND_COOLDOWN_SEC);
      setInfo(`New code sent to ${maskedPhone}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const fireVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpRequestId || !phoneE164) return;
    if (!/^\d{4,8}$/.test(otp)) {
      setError("Enter the 6-digit code from WhatsApp.");
      return;
    }
    setVerifying(true);
    setError(null);
    setInfo(null);
    try {
      await verifyPhoneOtp({
        otp_request_id: otpRequestId,
        phone_e164: phoneE164,
        otp,
      });
      window.sessionStorage.removeItem(SIGNUP_PHONE_KEY);
      router.replace("/b2b/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setVerifying(false);
    }
  };

  // ── Render: either the phone-input form or the code-input form ──
  const stage: "enter" | "code" = otpRequestId ? "code" : "enter";

  return (
    <Container width="narrow">
      <div className="py-16">
        <p className="text-micro text-text-muted">Step 2 of 2</p>
        <h1 className="mt-2 text-display-lg text-text-primary">
          Verify your WhatsApp.
        </h1>
        <p className="mt-3 text-body-md text-text-muted">
          We use WhatsApp for order updates and dispatch tracking. Enter
          your number — we&rsquo;ll send a 6-digit code.
        </p>

        {stage === "enter" && (
          <form onSubmit={fireSend} className="mt-10 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone" required>
                Mobile number
              </Label>
              <Input
                id="phone"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.currentTarget.value)}
                placeholder="98xxx xxxxx"
                required
                autoFocus
              />
              <p className="text-caption text-text-muted">
                10-digit Indian number. We&rsquo;ll add the +91 prefix.
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
            <Button type="submit" size="lg" isLoading={sending}>
              Send code via WhatsApp
            </Button>
          </form>
        )}

        {stage === "code" && (
          <form onSubmit={fireVerify} className="mt-10 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="otp" required>
                6-digit code
              </Label>
              <Input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) =>
                  setOtp(
                    e.currentTarget.value.replace(/\D/g, "").slice(0, 6),
                  )
                }
                maxLength={6}
                required
                autoFocus
                className="font-mono tracking-widest text-center"
              />
            </div>

            {info && (
              <p className="rounded-md bg-feedback-success-bg px-3 py-2 text-body-sm text-feedback-success-text ring-1 ring-feedback-success-border">
                {info}
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-md bg-feedback-danger-bg px-3 py-2 text-body-sm text-feedback-danger-text ring-1 ring-feedback-danger-border"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              isLoading={verifying}
              disabled={sending}
            >
              Verify WhatsApp
            </Button>

            <div className="flex items-center justify-between text-caption text-text-muted">
              <span>Didn&rsquo;t get the code?</span>
              <button
                type="button"
                onClick={() => void fireResend()}
                disabled={cooldown > 0 || sending}
                className={
                  "underline-offset-4 hover:underline " +
                  (cooldown > 0 || sending
                    ? "cursor-not-allowed text-text-muted"
                    : "text-text-primary")
                }
              >
                {cooldown > 0
                  ? `Resend in ${cooldown}s`
                  : sending
                    ? "Sending…"
                    : "Resend code"}
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setOtpRequestId(null);
                setOtp("");
                setError(null);
                setInfo(null);
              }}
              className="self-start text-caption text-text-muted underline-offset-4 hover:underline hover:text-text-primary"
            >
              Use a different number
            </button>
          </form>
        )}

        <p className="mt-10 text-caption text-text-muted">
          Back to{" "}
          <Link
            href="/auth/verification-center"
            className="text-text-primary underline-offset-4 hover:underline"
          >
            verification overview
          </Link>
        </p>
      </div>
    </Container>
  );
}
