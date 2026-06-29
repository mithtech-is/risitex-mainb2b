"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Label, PasswordInput } from "@risitex/ui/components";
import { Container } from "@/components/site/container";
import {
  commitNewPassword,
  sendResetOtp,
  verifyResetOtp,
} from "@/lib/password-reset";

const RESEND_COOLDOWN_SEC = 60;

/**
 * /auth/reset-password — two-stage page driven by sessionStorage state
 * set on /auth/forgot-password.
 *
 *   Stage 1: enter the 6-digit OTP → exchange for a reset token.
 *   Stage 2: enter the new password (with the same strength rules as
 *            sign-up) → POST /auth/customer/emailpass/update.
 *   Done   : redirect to /auth/sign-in with a success flag.
 *
 * If the user lands here directly (no sessionStorage state), redirect
 * back to /auth/forgot-password.
 */

function isStrongPassword(p: string): boolean {
  return (
    p.length >= 8 &&
    /[A-Z]/.test(p) &&
    /[a-z]/.test(p) &&
    /[0-9]/.test(p) &&
    /[^A-Za-z0-9]/.test(p)
  );
}

function PasswordRules({ password }: { password: string }) {
  const rules: { label: string; pass: boolean }[] = [
    { label: "At least 8 characters", pass: password.length >= 8 },
    { label: "An uppercase letter (A–Z)", pass: /[A-Z]/.test(password) },
    { label: "A lowercase letter (a–z)", pass: /[a-z]/.test(password) },
    { label: "A number (0–9)", pass: /[0-9]/.test(password) },
    { label: "A symbol (e.g. ! @ # $ %)", pass: /[^A-Za-z0-9]/.test(password) },
  ];
  return (
    <ul
      aria-live="polite"
      className="mt-1 grid grid-cols-1 gap-0.5 text-caption md:grid-cols-2"
    >
      {rules.map((r) => (
        <li
          key={r.label}
          className={r.pass ? "text-feedback-success-text" : "text-text-muted"}
        >
          <span aria-hidden className="mr-1">
            {r.pass ? "✓" : "•"}
          </span>
          {r.label}
        </li>
      ))}
    </ul>
  );
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [stage, setStage] = React.useState<"otp" | "password" | "done">("otp");
  const [email, setEmail] = React.useState<string>("");
  const [masked, setMasked] = React.useState<string>("");
  const [token, setToken] = React.useState<string | null>(null);

  const [otp, setOtp] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [cooldown, setCooldown] = React.useState(0);

  // Rehydrate from sessionStorage on mount.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const e = window.sessionStorage.getItem("risitex.reset.email");
    const m = window.sessionStorage.getItem("risitex.reset.masked");
    if (!e) {
      router.replace("/auth/forgot-password");
      return;
    }
    setEmail(e);
    setMasked(m ?? "");
    setCooldown(RESEND_COOLDOWN_SEC);
  }, [router]);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit code from your inbox.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await verifyResetOtp({ email, otp });
      setToken(r.reset_token);
      setStage("password");
      setInfo(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const resendOtp = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const r = await sendResetOtp({ email });
      setMasked(r.masked_destination);
      setCooldown(RESEND_COOLDOWN_SEC);
      setInfo(`New code sent to ${r.masked_destination}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError("Verify the code first.");
      setStage("otp");
      return;
    }
    if (!isStrongPassword(password)) {
      setError("Password doesn't meet the rules below.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await commitNewPassword({ email, token, password });
      // Clear stashed state — the token is single-use; reload of this
      // page should restart the flow.
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("risitex.reset.email");
        window.sessionStorage.removeItem("risitex.reset.masked");
      }
      setStage("done");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // ── Render ──
  if (stage === "done") {
    return (
      <Container width="narrow">
        <div className="py-16">
          <p className="text-micro text-feedback-success-text">All set</p>
          <h1 className="mt-2 text-display-lg text-text-primary">
            Password updated.
          </h1>
          <p className="mt-3 text-body-md text-text-muted">
            Your password is now active. Sign in with the new one to
            continue.
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link href="/auth/sign-in">Sign in</Link>
          </Button>
        </div>
      </Container>
    );
  }

  return (
    <Container width="narrow">
      <div className="py-16">
        <p className="text-micro text-text-muted">
          {stage === "otp" ? "Step 1 of 2" : "Step 2 of 2"}
        </p>
        <h1 className="mt-2 text-display-lg text-text-primary">
          {stage === "otp" ? "Enter the code." : "Choose a new password."}
        </h1>
        <p className="mt-3 text-body-md text-text-muted">
          {stage === "otp" ? (
            <>
              We sent a 6-digit code to{" "}
              <span className="font-medium text-text-primary">
                {masked || "your inbox"}
              </span>
              .
            </>
          ) : (
            "Pick a fresh password you haven't used in the last 10 changes."
          )}
        </p>

        {stage === "otp" && (
          <form onSubmit={verifyOtp} className="mt-10 flex flex-col gap-5">
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
                  setOtp(e.currentTarget.value.replace(/\D/g, "").slice(0, 6))
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

            <Button type="submit" size="lg" isLoading={busy}>
              Continue
            </Button>

            <div className="flex items-center justify-between text-caption text-text-muted">
              <span>Didn&rsquo;t get the code?</span>
              <button
                type="button"
                onClick={() => void resendOtp()}
                disabled={cooldown > 0 || busy}
                className={
                  "underline-offset-4 hover:underline " +
                  (cooldown > 0 || busy
                    ? "cursor-not-allowed text-text-muted"
                    : "text-text-primary")
                }
              >
                {cooldown > 0
                  ? `Resend in ${cooldown}s`
                  : busy
                    ? "Sending…"
                    : "Resend code"}
              </button>
            </div>
          </form>
        )}

        {stage === "password" && (
          <form
            onSubmit={setNewPassword}
            className="mt-10 flex flex-col gap-5"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" required>
                New password
              </Label>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                minLength={8}
                required
                autoFocus
              />
              <PasswordRules password={password} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm" required>
                Confirm new password
              </Label>
              <PasswordInput
                id="confirm"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.currentTarget.value)}
                minLength={8}
                required
              />
              {confirm.length > 0 && password !== confirm && (
                <p className="text-caption text-feedback-danger-text">
                  Passwords don&rsquo;t match.
                </p>
              )}
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-md bg-feedback-danger-bg px-3 py-2 text-body-sm text-feedback-danger-text ring-1 ring-feedback-danger-border"
              >
                {error}
              </p>
            )}

            <Button type="submit" size="lg" isLoading={busy}>
              Set new password
            </Button>
          </form>
        )}

        <p className="mt-8 text-caption text-text-muted">
          Back to{" "}
          <Link
            href="/auth/sign-in"
            className="text-text-primary underline-offset-4 hover:underline"
          >
            sign in
          </Link>
        </p>
      </div>
    </Container>
  );
}
