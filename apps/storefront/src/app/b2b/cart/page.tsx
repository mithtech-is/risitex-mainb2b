"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  formatINR,
} from "@risitex/ui/components";
import { Trash2, ShoppingBag, ArrowRight } from "lucide-react";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import {
  useCart,
  updateQuantity,
  removeFromCart,
  totalUnits,
  subtotalMajor,
  type CartLine,
} from "@/lib/cart";

/**
 * /b2b/cart
 *
 * The buyer's active basket. Add to Cart on the PDP/catalogue lands lines
 * here (no auto-redirect to checkout — fixed per the B2B purchase-flow
 * refactor). From this page the buyer reviews, edits quantities, removes
 * lines, and clicks Proceed to Checkout to enter the 5-step wizard.
 *
 * Storage backend: lib/cart.ts (localStorage). Multi-device sync is out
 * of scope until we wire a real Medusa cart row — for now the cart drives
 * /b2b/checkout, which posts the PO via the existing
 * /store/purchase-orders endpoint.
 */
const GST_RATE_PCT = 5;

export default function B2bCartPage() {
  const router = useRouter();
  const lines = useCart();
  const units = totalUnits(lines);
  const subtotal = subtotalMajor(lines);
  const estGst = Math.round((subtotal * GST_RATE_PCT) / 100);
  const estTotal = subtotal + estGst;

  // MOQ check: a line is in violation if the line's quantity is BELOW its
  // recorded moq. The PDP enforces this at add-time but a buyer can edit
  // it down here, so we re-check.
  const violations = lines
    .filter((l) => (l.moq ?? 0) > 0 && l.quantity < (l.moq ?? 0))
    .map((l) => ({
      variantId: l.variantId,
      name: l.productName,
      need: (l.moq ?? 0) - l.quantity,
    }));

  const checkoutHref = React.useMemo(() => {
    // Hand the lines to the existing /b2b/checkout wizard via the
    // ?variant=ID:QTY URL contract. The wizard also reads the cart store
    // as a fallback (so a hard-refresh on /b2b/checkout still works), but
    // passing them here keeps the link bookmarkable + back-button safe.
    const params = new URLSearchParams();
    for (const l of lines) {
      params.append("variant", `${l.variantId}:${l.quantity}`);
    }
    params.append("value", String(subtotal));
    return `/b2b/checkout?${params.toString()}`;
  }, [lines, subtotal]);

  const canCheckout = lines.length > 0 && violations.length === 0;

  if (lines.length === 0) {
    return (
      <div className="flex min-h-full flex-col gap-6">
        <B2bTopbar title="Cart" subtitle="Active basket" />
        <EmptyState
          icon={<ShoppingBag className="h-5 w-5" />}
          title="Your cart is empty"
          description="Add products from the catalogue — your cart stays right here until you're ready to checkout."
          action={
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/wholesale/catalogue">Browse catalogue</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/b2b/carts">Saved carts &amp; drafts</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-6">
      <B2bTopbar
        title="Cart"
        subtitle={`${lines.length} line${lines.length === 1 ? "" : "s"} · ${units.toLocaleString()} units`}
        rightActions={
          <Button asChild size="sm" variant="ghost">
            <Link href="/wholesale/catalogue">Continue shopping</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* Lines */}
        <section className="space-y-3">
          {lines.map((line) => (
            <CartLineRow key={line.variantId} line={line} />
          ))}

          {violations.length > 0 && (
            <div
              role="alert"
              className="rounded-md border border-feedback-warning-border bg-feedback-warning-bg p-4"
            >
              <p className="text-body-sm font-medium text-feedback-warning-text">
                {violations.length} line{violations.length === 1 ? "" : "s"} below MOQ
              </p>
              <ul className="mt-2 space-y-1 text-caption text-feedback-warning-text/90">
                {violations.slice(0, 5).map((v) => (
                  <li key={v.variantId}>
                    • {v.name} — add {v.need.toLocaleString()} more pc
                    {v.need === 1 ? "" : "s"} to meet MOQ
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Summary */}
        <aside aria-label="Order summary" className="space-y-4">
          <section className="rounded-md border border-border-subtle bg-surface-raised p-5">
            <h2 className="text-heading-sm text-text-primary">Estimated total</h2>
            <dl className="mt-4 space-y-2 text-body-sm">
              <Row label="Subtotal" value={formatINR(subtotal)} />
              <Row
                label={`GST (${GST_RATE_PCT}% est.)`}
                value={formatINR(estGst)}
              />
              <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3">
                <span className="text-body-md text-text-primary">Total</span>
                <span className="font-mono text-heading-sm text-text-primary">
                  {formatINR(estTotal)}
                </span>
              </div>
            </dl>
            <p className="mt-2 text-caption text-text-muted">
              Shipping + final GST split (intra-state vs IGST) calculate
              on the checkout page once you select address + shipping
              method.
            </p>

            <Button
              size="lg"
              className="mt-5 w-full"
              disabled={!canCheckout}
              onClick={() => router.push(checkoutHref)}
            >
              Proceed to Checkout
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Button>
            {violations.length > 0 && (
              <p className="mt-2 text-caption text-feedback-warning-text">
                Fix MOQ violations above to enable checkout.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function CartLineRow({ line }: { line: CartLine }) {
  const [qty, setQty] = React.useState<string>(String(line.quantity));

  React.useEffect(() => {
    setQty(String(line.quantity));
  }, [line.quantity]);

  const commit = (raw: string) => {
    const next = Math.max(0, Math.floor(Number(raw)) || 0);
    if (next !== line.quantity) updateQuantity(line.variantId, next);
  };

  const lineTotal = line.quantity * line.unitPriceMajor;
  const belowMoq = (line.moq ?? 0) > 0 && line.quantity < (line.moq ?? 0);

  return (
    <article className="flex flex-wrap items-start gap-4 rounded-md border border-border-subtle bg-surface-raised p-4">
      <div className="flex-shrink-0 overflow-hidden rounded-sm bg-surface-sunken">
        {line.thumbnail ? (
          // The product thumbnail is sourced from /public/demo or Medusa;
          // both are served on the same origin so a plain <img> avoids
          // pulling next/image's remote-loader config into this surface.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={line.thumbnail}
            alt=""
            width={72}
            height={72}
            className="h-[72px] w-[72px] object-cover"
          />
        ) : (
          <div className="h-[72px] w-[72px] bg-surface-sunken" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <Link
          href={`/wholesale/p/${line.productSlug}`}
          className="text-body-md font-medium text-text-primary underline-offset-4 hover:underline"
        >
          {line.productName}
        </Link>
        <p className="text-caption text-text-muted">{line.variantTitle}</p>
        <p className="font-mono text-caption text-text-secondary">
          {formatINR(line.unitPriceMajor)} / unit
        </p>
        {belowMoq && (
          <Badge tone="warning" size="xs">
            Below MOQ ({line.moq})
          </Badge>
        )}
      </div>
      <div className="flex w-full flex-wrap items-center justify-between gap-3 md:w-auto md:flex-col md:items-end">
        <div className="flex items-center gap-2">
          <label
            htmlFor={`qty-${line.variantId}`}
            className="text-caption text-text-muted"
          >
            Qty
          </label>
          <Input
            id={`qty-${line.variantId}`}
            type="number"
            inputMode="numeric"
            min={0}
            value={qty}
            onChange={(e) => setQty(e.currentTarget.value)}
            onBlur={(e) => commit(e.currentTarget.value)}
            className="w-24 font-mono"
          />
        </div>
        <p className="font-mono text-body-md text-text-primary">
          {formatINR(lineTotal)}
        </p>
        <button
          type="button"
          onClick={() => removeFromCart(line.variantId)}
          className="inline-flex items-center gap-1 text-caption text-text-muted hover:text-feedback-danger-text"
          aria-label={`Remove ${line.productName} from cart`}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Remove
        </button>
      </div>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-text-muted">{label}</dt>
      <dd className="font-mono text-text-primary">{value}</dd>
    </div>
  );
}
