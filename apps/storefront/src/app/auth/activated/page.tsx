"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@risitex/ui/components";
import { CheckCircle2 } from "lucide-react";
import { Container } from "@/components/site/container";
import { RegistrationSteps } from "@/components/auth/registration-steps";
import { getVerificationStatus, getWholesaleApplicationStatus } from "@/lib/verification";

/**
 * /auth/activated — terminal "you're in" screen after both OTPs verify.
 * Step 4 of the registration progress indicator. Auto-redirects to the
 * wholesale catalogue so the freshly-activated buyer can start browsing
 * straight away (the spec preference — picking products is the obvious
 * first thing to do after onboarding). The dashboard is one click away
 * via the secondary button.
 *
 * Guards against direct access: if the customer isn't actually
 * fully-verified yet, redirects them back to the verification center.
 */
const AUTO_REDIRECT_MS = 2200;
const POST_REGISTRATION_DESTINATION = "/b2b/dashboard";

export default function ActivatedPage() {
  const router = useRouter();
  const [status, setStatus] = React.useState<
    "approved" | "pending" | "no_application" | "loading"
  >("loading");
  const [companyId, setCompanyId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await getVerificationStatus().catch(() => null);
      if (cancelled) return;
      if (!s || !s.email_verified || !s.phone_verified) {
        router.replace("/auth/verification-center");
        return;
      }
      const ws = await getWholesaleApplicationStatus().catch(() => null);
      if (cancelled) return;
      if (ws === "approved") {
        setStatus("approved");
        setCompanyId((s as { company_id?: string | null }).company_id ?? null);
      } else if (ws === "pending") {
        setStatus("pending");
      } else {
        setStatus("no_application");
      }
      const t = window.setTimeout(() => {
        router.replace(POST_REGISTRATION_DESTINATION);
      }, AUTO_REDIRECT_MS);
      return () => window.clearTimeout(t);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <Container width="narrow">
      <div className="py-16">
        <RegistrationSteps currentStep={4} className="mb-8" />
        <div className="flex flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-feedback-success-bg ring-1 ring-feedback-success-border">
            <CheckCircle2
              className="h-10 w-10 text-feedback-success-text"
              aria-hidden
            />
          </div>
          {status === "approved" && (
            <>
              <h1 className="mt-6 text-display-lg text-text-primary">
                Account activated.
              </h1>
              <p className="mt-3 text-body-md text-text-muted">
                Your B2B wholesale account is approved. You can place orders,
                view tier pricing, and track shipments right away.
              </p>
              {companyId && (
                <p className="mt-2 font-mono text-caption text-text-muted">
                  Company {companyId}
                </p>
              )}
            </>
          )}
          {status === "pending" && (
            <>
              <h1 className="mt-6 text-display-lg text-text-primary">
                Account activated.
              </h1>
              <p className="mt-3 text-body-md text-text-muted">
                Your email and phone are verified. Your wholesale application
                is under review — you&rsquo;ll receive an email once approved.
              </p>
            </>
          )}
          {status === "no_application" && (
            <>
              <h1 className="mt-6 text-display-lg text-text-primary">
                Email &amp; phone verified.
              </h1>
              <p className="mt-3 text-body-md text-text-muted">
                To access the B2B dashboard and place orders, you need to
                complete your business profile (GSTIN, business address).
                You can do this from the catalogue or any page after signing in.
              </p>
            </>
          )}
          {status !== "loading" && (
            <p className="mt-6 text-caption text-text-muted">
              Taking you to the catalogue…
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/b2b/dashboard">Go to dashboard</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/wholesale/catalogue">Browse catalogue</Link>
            </Button>
          </div>
        </div>
      </div>
    </Container>
  );
}
