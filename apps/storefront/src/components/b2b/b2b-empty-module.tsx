import Link from "next/link";
import { Button, EmptyState } from "@risitex/ui/components";
import { B2bTopbar } from "./b2b-topbar";

export function B2bEmptyModule({
  title,
  subtitle,
  description,
  actionHref = "/wholesale/catalogue",
  actionLabel = "Open catalogue",
}: {
  title: string;
  subtitle: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex min-h-full flex-col gap-6">
      <B2bTopbar title={title} subtitle={subtitle} />
      <section className="rounded-md border border-border-subtle bg-surface-raised">
        <EmptyState
          title={title}
          description={description}
          action={
            <Button asChild>
              <Link href={actionHref}>{actionLabel}</Link>
            </Button>
          }
        />
      </section>
    </div>
  );
}
