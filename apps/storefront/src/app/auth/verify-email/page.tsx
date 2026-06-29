"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@risitex/ui/components";
import { Container } from "@/components/site/container";
import {
  getVerificationStatus,
  sendEmailOtp,
  resendEmailOtp,
  verifyEmailOtp,
} from "@/lib/verification";

const RESEND_COOLDOWN_SEC = 60;

/**
 * /auth/verify-email — collects the 6-digit code that landed in the
 * customer's inbox. The OTP is auto-sent on first mount; a 60-second
 * cooldown gates the resend button.
 *
 * After successful verification we route to /auth/verify-phone if the
 * phone is still unverified, otherwise to the B2B dashboard.
 */
export default function VerifyEmailPage() {
  const router = useRouter();
  const [otpRequestId, setOtpRequestId] = React.useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = React.useState<string>("");
  const [otp, setOtp] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [cooldown, setCooldown] = React.useState(RESEND_COOLDOWN_SEC);

  // Send first OTP on mount. If the customer is already verified or
  // not signed in, redirect appropriately.
  React.useEffect(() => {
    void (async () => {
      const s = await getVerificationStatus().catch(() => null);
      if (!s) {
        router.replace("/auth/sign-in");
        return;
      }
      if (s.email_verified) {
        router.replace(
          s.phone_verified ? "/b2b/dashboard" : "/auth/verify-phone",
        );
        return;
      }
      await fireSend();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cooldown ticker
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  const fireSend = async () => {
    setSending(true);
    setError(null);
    setInfo(null);
    try {
      const r = await sendEmailOtp();
      setOtpRequestId(r.otp_request_id);
      setMaskedEmail(r.masked_email);
      setCooldown(RESEND_COOLDOWN_SEC);
      setInfo(`Code sent to ${r.masked_email}. Valid 10 minutes.`);
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
      await resendEmailOtp(otpRequestId);
      setCooldown(RESEND_COOLDOWN_SEC);
      setInfo(`New code sent to ${maskedEmail}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const fireVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpRequestId) return;
    if (!/^\d{4,8}$/.test(otp)) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    setVerifying(true);
    setError(null);
    setInfo(null);
    try {
      await verifyEmailOtp({ otp_request_id: otpRequestId, otp });
      const s = await getVerificationStatus().catch(() => null);
      if (s?.phone_verified) {
        router.replace("/b2b/dashboard");
      } else {
        router.replace("/auth/verify-phone");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Container width="narrow">
      <div className="py-16">
        <p className="text-micro text-text-muted">Step 1 of 2</p>
        <h1 className="mt-2 text-display-lg text-text-primary">
          Verify your email.
        </h1>
        <p className="mt-3 text-body-md text-text-muted">
          We&rsquo;ve sent a 6-digit code to{" "}
          <span className="font-medium text-text-primary">
            {maskedEmail || "your inbox"}
          </span>
          . Enter it below to continue.
        </p>

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
              onChange={(e) => setOtp(e.currentTarget.value.replace(/\D/g, "").slice(0, 6))}
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
            disabled={!otpRequestId || sending}
          >
            Verify email
          </Button>

          <div className="flex items-center justify-between text-caption text-text-muted">
            <span>Didn&rsquo;t get the code?</span>
            <button
              type="button"
              onClick={() => void fireResend()}
              disabled={cooldown > 0 || sending || !otpRequestId}
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
        </form>

        <p className="mt-10 text-caption text-text-muted">
          Wrong email?{" "}
          <Link
            href="/auth/verification-center"
            className="text-text-primary underline-offset-4 hover:underline"
          >
            Go back
          </Link>
        </p>
      </div>
    </Container>
  );
}
