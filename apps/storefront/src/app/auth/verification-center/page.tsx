"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@risitex/ui/components";
import { Container } from "@/components/site/container";
import {
  getVerificationStatus,
  type VerificationStatus,
} from "@/lib/verification";

/**
 * Verification Center — single hub showing the customer which of the
 * two mandatory verification steps (email OTP + WhatsApp OTP) are
 * still pending, with action buttons that route to the respective
 * verify pages.
 *
 * Reached:
 *   - immediately after sign-up
 *   - after sign-in when either flag is false
 *   - manually from the B2B dashboard if the user wants to finish later
 *
 * When both flags are true the page short-circuits to the B2B dashboard so a
 * fully-verified customer never lands here accidentally.
 */
export default function VerificationCenterPage() {
  const router = useRouter();
  const [status, setStatus] = React.useState<VerificationStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void (async () => {
      try {
        const s = await getVerificationStatus();
        if (!s) {
          router.replace("/auth/sign-in");
          return;
        }
        if (s.email_verified && s.phone_verified) {
          router.replace("/b2b/dashboard");
          return;
        }
        setStatus(s);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading) {
    return (
      <Container width="narrow">
        <div className="py-16">
          <p className="text-body-md text-text-muted">Loading…</p>
        </div>
      </Container>
    );
  }
  if (error) {
    return (
      <Container width="narrow">
        <div className="py-16">
          <h1 className="text-display-lg text-text-primary">
            Couldn&rsquo;t load your account
          </h1>
          <p className="mt-3 text-body-md text-text-muted">{error}</p>
          <Link
            href="/auth/sign-in"
            className="mt-6 inline-block text-text-primary underline-offset-4 hover:underline"
          >
            Try signing in again
          </Link>
        </div>
      </Container>
    );
  }
  if (!status) return null;

  return (
    <Container width="narrow">
      <div className="py-16">
        <p className="text-micro text-text-muted">Verify your account</p>
        <h1 className="mt-2 text-display-lg text-text-primary">
          One more step.
        </h1>
        <p className="mt-3 text-body-md text-text-muted">
          To protect your account we need to confirm both your email and
          your WhatsApp number. Order receipts, dispatch updates, and
          account-recovery links land in those two inboxes.
        </p>

        <div className="mt-10 flex flex-col gap-4">
          {/* PAN is captured at signup. When present and not verified, show
              the combined PAN+phone OTP step which satisfies the phone
              verification at the same time. When PAN is missing
              (legacy signup before PAN became mandatory), fall back to
              the standalone phone-OTP card. */}
          {status.pan && !status.pan_verified ? (
            <StepCard
              label="PAN & mobile"
              target={
                status.pan
                  ? `${status.pan.slice(0, 3)}****${status.pan.slice(-2)}${
                      status.phone ? " · " + status.phone : ""
                    }`
                  : status.phone
              }
              done={false}
              cta="Verify PAN"
              href="/auth/verify-pan"
            />
          ) : (
            <StepCard
              label="WhatsApp"
              target={status.phone}
              done={status.phone_verified}
              cta="Verify WhatsApp"
              href="/auth/verify-phone"
            />
          )}
          <StepCard
            label="Email"
            target={status.email}
            done={status.email_verified}
            cta="Verify email"
            href="/auth/verify-email"
          />
          {status.pan && status.pan_verified && (
            <StepCard
              label="PAN"
              target={`${status.pan.slice(0, 3)}****${status.pan.slice(-2)}`}
              done={true}
              cta=""
              href="#"
            />
          )}
        </div>

        <p className="mt-8 text-caption text-text-muted">
          Need help? <Link href="/help" className="underline-offset-4 hover:underline">Contact support</Link>.
        </p>
      </div>
    </Container>
  );
}

function StepCard({
  label,
  target,
  done,
  cta,
  href,
}: {
  label: string;
  target: string | null;
  done: boolean;
  cta: string;
  href: string;
}) {
  return (
    <div
      className={
        "flex items-center gap-4 rounded-md border p-5 " +
        (done
          ? "border-feedback-success-border bg-feedback-success-bg"
          : "border-border-subtle bg-surface-raised")
      }
    >
      <div
        aria-hidden
        className={
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-body-md font-medium " +
          (done
            ? "bg-feedback-success-bg text-feedback-success-text ring-1 ring-feedback-success-border"
            : "bg-surface-sunken text-text-muted")
        }
      >
        {done ? "✓" : "•"}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={
            "text-body-md font-medium " +
            (done ? "text-feedback-success-text" : "text-text-primary")
          }
        >
          {label}
        </p>
        <p className="truncate text-caption text-text-muted">
          {target ?? "—"} {done ? "· verified" : "· not yet verified"}
        </p>
      </div>
      {!done && (
        <Button asChild size="sm">
          <Link href={href}>{cta}</Link>
        </Button>
      )}
    </div>
  );
}
