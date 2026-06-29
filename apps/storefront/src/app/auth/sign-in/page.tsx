"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Label, PasswordInput } from "@risitex/ui/components";
import { Container } from "@/components/site/container";
import { signIn, signOut, accountExists } from "@/lib/auth";
import {
  getVerificationStatus,
  getWholesaleApplicationStatus,
} from "@/lib/verification";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
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
      const wholesale = await getWholesaleApplicationStatus().catch(() => null);
      if (wholesale === "pending" || wholesale === "rejected") {
        await signOut().catch(() => {});
        setError(
          wholesale === "pending"
            ? "Your account is awaiting approval. We'll email you once it's approved."
            : "Your application wasn't approved. Please contact us.",
        );
        setSubmitting(false);
        return;
      }
      const status = await getVerificationStatus().catch(() => null);
      const fullyVerified =
        !!status && status.email_verified && status.phone_verified;
      if (fullyVerified) {
        if (wholesale === "approved") {
          router.push("/b2b/dashboard");
        } else {
          router.push("/wholesale/apply");
        }
      } else {
        router.push("/auth/verification-center");
      }
      router.refresh();
    } catch {
      setError("Signed in, but something went wrong loading your account.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container width="narrow">
      <div className="py-16">
        <p className="text-micro text-text-muted">Welcome back</p>
        <h1 className="mt-2 text-display-lg text-text-primary">Sign in.</h1>
        <p className="mt-3 text-body-md text-text-muted">
          New here?{" "}
          <Link
            href="/auth/sign-up"
            className="text-text-primary underline-offset-4 hover:underline"
          >
            Register your business
          </Link>
          .
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
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="password" required>
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
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
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

          <Button type="submit" isLoading={submitting} size="lg">
            Sign in
          </Button>

          <p className="text-caption text-text-muted text-center">
            <Link
              href="/wholesale/apply"
              className="text-brand-accent underline-offset-4 hover:underline"
            >
              Don&apos;t have an account? Apply for wholesale
            </Link>
          </p>
        </form>
      </div>
    </Container>
  );
}
