"use client";

import * as React from "react";
import Link from "next/link";
import { Button, Input, Label, PasswordInput } from "@risitex/ui/components";
import { Wordmark } from "@/components/site/wordmark";
import { signIn, accountExists } from "@/lib/auth";
import { getVerificationStatus } from "@/lib/verification";

export function SignInPanel({
  onSuccess,
  onSwitchToSignUp,
}: {
  onSuccess: () => void;
  onSwitchToSignUp: () => void;
}) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [rememberMe, setRememberMe] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err) {
      const msg = (err as Error)?.message ?? "";
      if (/fetch failed|Failed to fetch|network error/i.test(msg)) {
        setError("Unable to reach the server. Check your connection and try again.");
      } else {
        const exists = await accountExists(email).catch(() => true);
        setError(
          exists
            ? "Invalid email or password."
            : "No account exists for this email. Please register first.",
        );
      }
      setSubmitting(false);
      return;
    }
    try {
      const status = await getVerificationStatus().catch(() => null);
      if (status?.email_verified && status?.phone_verified) {
        onSuccess();
      } else {
        window.location.href = "/auth/verification-center";
      }
    } catch {
      setError("Signed in, but something went wrong loading your account.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <Wordmark showMonogram />

      <div className="mt-10 flex-1">
        <h2 className="text-display-md text-text-primary">Welcome back</h2>
        <p className="mt-2 text-body-md text-text-muted">
          Sign in to your RISITEX wholesale account to manage orders, track
          shipments, and access B2B pricing.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auth-email" required>
              Email
            </Label>
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              placeholder="you@company.com"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="auth-password" required>
                Password
              </Label>
              <Link
                href="/auth/forgot-password"
                className="text-caption text-text-muted underline-offset-4 hover:underline hover:text-text-primary"
              >
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              id="auth-password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
            />
          </div>

          <label className="inline-flex items-center gap-2 text-body-sm text-text-secondary">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.currentTarget.checked)}
              className="h-4 w-4 rounded border-border-subtle"
            />
            Remember me
          </label>

          {error && (
            <p
              role="alert"
              className="rounded-md bg-feedback-danger-bg px-3 py-2 text-body-sm text-feedback-danger-text ring-1 ring-feedback-danger-border"
            >
              {error}
            </p>
          )}

          <Button type="submit" isLoading={submitting} size="lg" className="w-full">
            Sign in
          </Button>
        </form>
      </div>

      <div className="mt-auto border-t border-border-subtle pt-6">
        <p className="text-body-sm text-text-muted">
          New wholesale customer?{" "}
          <button
            type="button"
            onClick={onSwitchToSignUp}
            className="font-medium text-brand-accent underline-offset-4 hover:underline"
          >
            Create Business Account
          </button>
        </p>
      </div>
    </div>
  );
}
