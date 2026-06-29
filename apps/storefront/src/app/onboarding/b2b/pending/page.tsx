import Link from "next/link";
import {
  ApprovalStatusCard,
  Button,
} from "@risitex/ui/components";
import { Container } from "@/components/site/container";

export default function B2bPendingPage() {
  return (
    <Container width="narrow">
      <div className="py-16">
        <p className="text-micro text-text-muted">Application received</p>
        <h1 className="mt-2 font-display text-display-lg text-text-primary">
          We&rsquo;re reviewing your details.
        </h1>
        <p className="mt-3 text-body-md text-text-muted">
          Verification is manual and usually completes within one business
          day. You&rsquo;ll receive an email with your tier assignment.
        </p>

        <div className="mt-10">
          <ApprovalStatusCard
            status="pending"
            details={
              <ul className="space-y-1 text-body-sm text-text-secondary">
                <li>· GSTIN verified against the government registry</li>
                <li>· Bank details validated via penny drop</li>
                <li>· Credit limit assigned based on volume + payment mode</li>
              </ul>
            }
            action={
              <Button asChild variant="secondary">
                <Link href="/wholesale/catalogue">Preview catalogue</Link>
              </Button>
            }
          />
        </div>

        <ol className="mt-12 space-y-6 border-l-2 border-border-strong pl-6">
          {[
            { title: "Application received", body: "Submitted moments ago.", state: "done" },
            { title: "Verification", body: "We check GSTIN, PAN, and bank details.", state: "current" },
            { title: "Tier assignment", body: "Bronze / Silver / Gold / Platinum based on volume.", state: "pending" },
            { title: "Welcome email", body: "Sign in and start ordering at your tier price.", state: "pending" },
          ].map((s, i) => (
            <li key={s.title}>
              <p className="text-micro text-text-muted">Step {i + 1}</p>
              <p
                className={
                  "mt-1 text-body-md " +
                  (s.state === "done"
                    ? "text-text-primary line-through"
                    : s.state === "current"
                      ? "text-text-primary font-medium"
                      : "text-text-muted")
                }
              >
                {s.title}
              </p>
              <p className="mt-0.5 text-caption text-text-muted">{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-12 flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <Link href="/contact">Need help?</Link>
          </Button>
          <Button asChild variant="tertiary">
            <Link href="/">Back home</Link>
          </Button>
        </div>
      </div>
    </Container>
  );
}
