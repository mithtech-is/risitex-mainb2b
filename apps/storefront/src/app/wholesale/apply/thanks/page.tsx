import Link from "next/link";
import { Button } from "@risitex/ui/components";
import { Container } from "@/components/site/container";

export default function WholesaleThanksPage() {
  return (
    <Container width="narrow">
      <div className="py-20 text-center">
        <p className="text-micro text-text-muted">Submitted</p>
        <h1 className="mt-2 text-display-lg text-text-primary">
          Thank you.
        </h1>
        <p className="mt-4 text-body-lg text-text-secondary">
          We verify within one business day. Tier assignment lands by email.
        </p>
        <div className="mt-10">
          <Button asChild>
            <Link href="/wholesale/catalogue">Preview the catalogue</Link>
          </Button>
        </div>
      </div>
    </Container>
  );
}
