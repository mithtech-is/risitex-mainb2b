"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@risitex/ui/components";
import { Container } from "@/components/site/container";
import { sendResetOtp } from "@/lib/password-reset";

/**
 * /auth/forgot-password — collects an email and triggers the OTP send.
 *
 * The backend is intentionally anti-enumeration: success response is
 * identical whether the email exists or not. We honour that by
 * routing the user to /auth/reset-password with the email + masked
 * destination in the URL — the page works the same either way.
 */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await sendResetOtp({ email });
      // Stash on sessionStorage so the next page knows which email
      // we're resetting + can show the masked destination.
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          "risitex.reset.email",
          email.trim().toLowerCase(),
        );
        window.sessionStorage.setItem(
          "risitex.reset.masked",
          r.masked_destination,
        );
      }
      router.push("/auth/reset-password");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container width="narrow">
      <div className="py-16">
        <p className="text-micro text-text-muted">Account recovery</p>
        <h1 className="mt-2 text-display-lg text-text-primary">
          Reset your password.
        </h1>
        <p className="mt-3 text-body-md text-text-muted">
          Enter the email on your account. We&rsquo;ll send a 6-digit code so
          you can set a new password.
        </p>

        <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" required>
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              required
              autoFocus
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

          <Button type="submit" size="lg" isLoading={submitting}>
            Send reset code
          </Button>
        </form>

        <p className="mt-8 text-caption text-text-muted">
          Remembered it?{" "}
          <Link
            href="/auth/sign-in"
            className="text-text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </Container>
  );
}
