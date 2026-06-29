"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Badge,
  Button,
  EmptyState,
  formatINR,
} from "@risitex/ui/components";
import { ShoppingBasket } from "lucide-react";
import { Container } from "@/components/site/container";
import { Breadcrumb } from "@/components/site/breadcrumb";

type SharedCartLine = {
  variantId: string;
  quantity: number;
  productName: string;
  variantLabel: string;
  swatchHex: string;
  pricePerUnitMajor: number;
};

type SharedCart = {
  id: string;
  name: string;
  owner_name: string | null;
  item_count: number;
  total_major: number;
  note: string | null;
  lines: SharedCartLine[];
};

function navigateToPo(lines: SharedCartLine[]) {
  const params = new URLSearchParams();
  for (const line of lines) {
    params.append("variant", `${line.variantId}:${line.quantity}`);
  }
  window.location.href = `/b2b/purchase-orders/new?${params.toString()}`;
}

export default function SharedCartPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [cart, setCart] = React.useState<SharedCart | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const BACKEND_URL =
      process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000";
    fetch(`${BACKEND_URL}/store/b2b-sales/shared-carts/${token}`, {
      headers: {
        "Content-Type": "application/json",
        ...(process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
          ? { "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY }
          : {}),
      },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "not found" : "fetch failed");
        const data = (await res.json()) as SharedCart;
        if (cancelled) return;
        setCart(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = (err as Error).message ?? "";
        setError(
          /not found/i.test(msg)
            ? "This shared cart isn't available — the link may have been revoked."
            : msg || "Couldn't load shared cart.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <Container>
      <div className="pt-6">
        <Breadcrumb
          items={[
            { href: "/", label: "Home" },
            { href: "/b2b/carts", label: "Saved carts" },
            {
              href: `/b2b/carts/shared/${token}`,
              label: cart?.name ?? "Shared cart",
            },
          ]}
        />
      </div>

      {error ? (
        <div className="py-16">
          <EmptyState
            icon={<ShoppingBasket className="h-5 w-5" />}
            title="Shared cart not available"
            description={error}
            action={
              <Button asChild>
                <Link href="/b2b/carts">My saved carts</Link>
              </Button>
            }
          />
        </div>
      ) : !cart ? (
        <p className="py-12 text-body-md text-text-muted">Loading…</p>
      ) : (
        <>
          <header className="border-b border-border-subtle py-10">
            <p className="text-micro text-text-muted">Shared cart</p>
            <h1 className="mt-2 font-display text-display-lg text-text-primary">
              {cart.name}
            </h1>
            <p className="mt-3 text-body-md text-text-muted">
              {cart.owner_name
                ? `Shared by ${cart.owner_name} · `
                : "Shared with you · "}
              {cart.item_count} pcs · {formatINR(Math.round(cart.total_major))}
            </p>
            {cart.note && (
              <p className="mt-2 max-w-prose text-body-md text-text-secondary">
                &ldquo;{cart.note}&rdquo;
              </p>
            )}
          </header>

          <section className="mt-8 rounded-lg border border-border-subtle bg-surface-raised p-5">
            <p className="text-body-md text-text-primary">
              Create a purchase order from these {cart.item_count} pcs to continue.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => navigateToPo(cart.lines)}>
                Create purchase order
              </Button>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="font-display text-heading-md text-text-primary">
              Items ({cart.lines.length} line{cart.lines.length === 1 ? "" : "s"})
            </h2>
            <ul className="mt-4 divide-y divide-border-subtle">
              {cart.lines.map((line) => (
                <li
                  key={line.variantId}
                  className="flex items-start gap-4 py-4"
                >
                  <div
                    className="h-16 w-16 shrink-0 rounded-md bg-image-plate ring-1 ring-border-subtle"
                    style={{
                      background: `linear-gradient(0deg, ${line.swatchHex}55, ${line.swatchHex}22)`,
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-body-md font-medium text-text-primary">
                      {line.productName}
                    </p>
                    <p className="text-caption text-text-muted">
                      {line.variantLabel} · Qty {line.quantity}
                    </p>
                  </div>
                  <p className="text-mono-md numerics-tabular text-text-primary">
                    {formatINR(
                      Math.round(line.pricePerUnitMajor * line.quantity),
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-6 rounded-md bg-surface-sunken px-4 py-3 text-caption text-text-muted">
            <Badge tone="info" size="xs">
              Public link
            </Badge>{" "}
            Anyone with this URL can see this cart. Don&rsquo;t share it
            beyond people you trust — there&rsquo;s no expiry yet.
          </section>
        </>
      )}
    </Container>
  );
}
