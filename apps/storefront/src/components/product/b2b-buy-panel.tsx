"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import {
  Button,
  MatrixOrderGrid,
  formatINR,
  type MatrixCell,
  type MatrixDimensionValue,
} from "@risitex/ui/components";
import type { Product } from "@/data/products";
import {
  fetchAvailability,
  type AvailabilityRow,
} from "@/lib/availability";
import { addToCart, type CartLine } from "@/lib/cart";
import { MEDUSA_BASE_URL } from "@/lib/medusa";
import { packSizeOf, cellPieces, maxPacksForStock, meetsMoq as meetsMoqFn } from "@/lib/moq-pack";

export function B2bBuyPanel({
  product,
  selectedColour,
}: {
  product: Product;
  /** When set, the grid shows only this colour's sizes (single-colour view
   *  driven by the PDP colour selector). Sizes not offered in this colour are
   *  hidden so no colours are mixed. */
  selectedColour?: string;
}) {
  const [b2bStatus, setB2bStatus] = React.useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = React.useState(true);

  // FR-9.02: load sellable ("Available" = physical − reserved) stock per SKU
  // so the grid caps each cell to what can actually be ordered. Falls back to
  // fixture stock when the endpoint or SKU isn't available.
  const [availability, setAvailability] = React.useState<
    Map<string, AvailabilityRow>
  >(new Map());
  const skus = React.useMemo(
    () => product.variants.map((v) => v.sku).filter((s): s is string => !!s),
    [product.variants],
  );

  React.useEffect(() => {
    let cancelled = false;
    const token = typeof window !== "undefined" ? window.localStorage.getItem("medusa_auth_token") : null;
    if (!token) {
      setCheckingStatus(false);
      return;
    }
    fetch(`${MEDUSA_BASE_URL}/store/companies/me`, {
      headers: {
        "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
        "Authorization": `Bearer ${token}`,
      },
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setB2bStatus(data?.b2b?.company?.status ?? null);
          setCheckingStatus(false);
        }
      })
      .catch(() => {
        if (!cancelled) setCheckingStatus(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    fetchAvailability(skus)
      .then((m) => {
        if (!cancelled) setAvailability(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [skus]);

  // Build matrix rows (sizes) and cols (colours). When a colour is selected on
  // the PDP, restrict the grid to that colour: cols → the one colour, and rows
  // → only the sizes that colour actually offers (no mixing across colours).
  const rows: MatrixDimensionValue[] = React.useMemo(() => {
    const sizesForColour = selectedColour
      ? product.sizes.filter((s) =>
          product.variants.some(
            (v) => v.size === s && v.colour === selectedColour,
          ),
        )
      : product.sizes;
    return sizesForColour
      .filter((s) => s && s !== "—" && s !== "per-metre")
      .map((s) => ({ id: s, label: s }));
  }, [product.sizes, product.variants, selectedColour]);

  const cols: MatrixDimensionValue[] = React.useMemo(() => {
    const swatches = selectedColour
      ? product.swatches.filter((sw) => sw.value === selectedColour)
      : product.swatches;
    return swatches.map((sw) => ({
      id: sw.value,
      label: sw.name,
      hex: sw.hex,
    }));
  }, [product.swatches, selectedColour]);

  // If no real size axis (single-size SKUs like stoles/fabric), collapse to a
  // single "Unit" row so the matrix still works.
  const effectiveRows = React.useMemo<MatrixDimensionValue[]>(
    () => (rows.length > 0 ? rows : [{ id: "_unit", label: "Unit" }]),
    [rows],
  );

  const cells: MatrixCell[] = React.useMemo(() => {
    const out: MatrixCell[] = [];
    for (const r of effectiveRows) {
      for (const c of cols) {
        const variant =
          rows.length > 0
            ? product.variants.find((v) => v.size === r.id && v.colour === c.id)
            : product.variants.find((v) => v.colour === c.id);
        if (variant) {
          // Prefer live Available stock; fall back to fixture stock when the
          // SKU isn't in the availability map (older backend / unmanaged).
          const fixtureStock =
            variant.inventoryState === "out_of_stock"
              ? 0
              : variant.stockCount ?? 999;
          const avail = availability.get(variant.sku);
          const ps = packSizeOf(variant.packSize);
          const stock = avail ? avail.available ?? fixtureStock : fixtureStock;
          out.push({
            rowId: r.id,
            colId: c.id,
            variantId: variant.id,
            sku: variant.sku,
            stock,
            packSize: ps,
            maxPacks: maxPacksForStock(stock, ps),
          });
        } else {
          out.push({ rowId: r.id, colId: c.id, stock: 0 });
        }
      }
    }
    return out;
  }, [effectiveRows, cols, product.variants, rows.length, availability]);

  const [quantities, setQuantities] = React.useState<Record<string, number>>({});

  // `quantities` holds PACK counts keyed by `${rowId}_${colId}`.
  // Total PIECES = Σ(packCount × packSize).
  const packSizeByKey = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const cell of cells) m[`${cell.rowId}_${cell.colId}`] = cell.packSize ?? 1;
    return m;
  }, [cells]);

  const totalPieces = React.useMemo(
    () =>
      Object.entries(quantities).reduce(
        (sum, [key, packs]) => sum + cellPieces(packs, packSizeByKey[key] ?? 1),
        0,
      ),
    [quantities, packSizeByKey],
  );

  // PER-PIECE pricing. `product.priceMajor` is the price of ONE piece, the same
  // across every variant; a pack simply bundles `packSize` pieces. So money,
  // MOQ, and the cart line quantity are all counted in PIECES — selecting a
  // pack-of-3 adds 3 pieces and costs 3 × the per-piece price.
  const moq = product.moq ?? 0;
  const meetsMoq = meetsMoqFn(totalPieces, moq);
  const lineTotalMajor = product.priceMajor * totalPieces;

  const maxPacksByKey = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const cell of cells) m[`${cell.rowId}_${cell.colId}`] = cell.maxPacks ?? Infinity;
    return m;
  }, [cells]);

  const handleQty = (rowId: string, colId: string, packs: number) => {
    const key = `${rowId}_${colId}`;
    const capped = Math.min(Math.max(0, packs), maxPacksByKey[key] ?? Infinity);
    setQuantities((prev) => ({ ...prev, [key]: capped }));
  };

  // Inline confirmation banner — replaces the old "redirect straight to
  // checkout" behaviour. Stays visible for 6 seconds so the buyer sees
  // the success state without losing their place on the catalogue/PDP.
  const [addedSummary, setAddedSummary] = React.useState<{
    units: number;
    lines: number;
  } | null>(null);
  const dismissTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const handleAdd = () => {
    if (!meetsMoq) return;
    const unitPriceMajor = product.priceMajor;
    const newLines: CartLine[] = [];
    let addedUnits = 0;
    for (const cell of cells) {
      if (!cell.variantId) continue;
      const packs = quantities[`${cell.rowId}_${cell.colId}`] ?? 0;
      if (packs <= 0) continue;
      const ps = packSizeByKey[`${cell.rowId}_${cell.colId}`] ?? 1;
      const pieces = cellPieces(packs, ps);
      // Reconstruct the variant axis labels so the cart can show
      // "Black / M" without re-loading product data.
      const sizeLabel =
        rows.length > 0
          ? effectiveRows.find((r) => r.id === cell.rowId)?.label ?? ""
          : "";
      const colLabel =
        cols.find((c) => c.id === cell.colId)?.label ?? "";
      const variantTitle = [colLabel, sizeLabel]
        .filter((s) => s && s !== "Unit")
        .join(" / ") || product.unit || "Unit";
      newLines.push({
        variantId: cell.variantId,
        productSlug: product.slug,
        productName: product.name,
        variantTitle,
        unitPriceMajor,
        // Line quantity is in PIECES (packs × packSize) and the unit price is
        // per piece, so the cart/PO subtotal = pieces × per-piece price. A
        // pack-of-3 adds 3 pieces here. `packSize` is kept for display.
        quantity: pieces,
        packSize: ps,
        thumbnail: product.images?.[0],
        moq: product.moq,
        maxQty: product.maxQty,
      });
      addedUnits += pieces;
    }
    if (newLines.length === 0) return;
    addToCart(newLines);
    setAddedSummary({ units: addedUnits, lines: newLines.length });
    // Reset the matrix so the next add doesn't double-add the same qtys.
    setQuantities({});
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => setAddedSummary(null), 6_000);
  };

  if (checkingStatus) {
    return <p className="text-body-sm text-text-muted">Loading wholesale details...</p>;
  }

  if (b2bStatus !== "approved") {
    return (
      <div className="flex flex-col gap-6 rounded-lg border border-feedback-warning-border bg-feedback-warning-bg p-6 shadow-sm">
        <div className="space-y-2">
          <h3 className="text-heading-sm text-feedback-warning-text font-display font-bold">
            Wholesale Account Pending Approval
          </h3>
          <p className="text-body-sm text-feedback-warning-text/90 leading-relaxed">
            Your registered wholesale company account is currently under review by our sales team. Pricing, ordering, and cart features will be automatically unlocked once your registration is approved. Review typically takes 5–10 minutes during business hours.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 pt-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/b2b/dashboard">Go to Dashboard</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/contact">Contact Support</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Wholesale price — only rendered inside <SignedIn>, so it's visible to
          approved buyers after login (the MRP shows to everyone in the hero). */}
      <section className="rounded-lg border border-border-subtle bg-surface-raised p-4">
        <p className="text-micro uppercase tracking-wider text-text-muted">
          Your wholesale price
        </p>
        <p className="mt-1 text-heading-lg text-text-primary">
          {formatINR(product.priceMajor)}{" "}
          <span className="text-body-sm font-normal text-text-muted">
            / pc · excl. GST
          </span>
        </p>
        {(() => {
          const mrp =
            (selectedColour ? product.mrpByColour?.[selectedColour] : undefined) ??
            product.mrpMajor;
          return mrp && mrp > product.priceMajor ? (
            <p className="mt-0.5 text-caption text-text-muted">
              MRP {formatINR(mrp)} · you save{" "}
              {Math.round(((mrp - product.priceMajor) / mrp) * 100)}%
            </p>
          ) : null;
        })()}
      </section>

      <section>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-heading-md text-text-primary">Bulk Order Grid</h2>
            <p className="mt-1 text-caption text-text-muted">
              Set pack quantities per size × colour. Totals show individual pieces.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <MatrixOrderGrid
            rows={effectiveRows}
            cols={cols}
            cells={cells}
            quantities={quantities}
            onQuantityChange={handleQty}
          />
        </div>
      </section>

      <section className="rounded-lg border border-border-subtle bg-surface-raised p-5">
        <dl className="grid grid-cols-2 gap-4 numerics-tabular md:grid-cols-2">
          <Stat label="Total pieces" value={totalPieces.toLocaleString()} />
          <Stat label="Subtotal" value={formatINR(lineTotalMajor)} hint="excl. GST" />
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            disabled={!meetsMoq || totalPieces === 0}
            onClick={handleAdd}
          >
            {totalPieces === 0
              ? "Add quantities first"
              : meetsMoq
                ? `Add to cart · ${totalPieces.toLocaleString()} pcs`
                : `${(moq - totalPieces).toLocaleString()} pcs to MOQ`}
          </Button>
          <span className="text-caption text-text-muted">
            MOQ {moq.toLocaleString()} pcs · Lead {product.leadTimeDays ?? "—"} days
          </span>
        </div>

        {addedSummary && (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-feedback-success-border bg-feedback-success-bg px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2
                className="h-5 w-5 text-feedback-success-text"
                aria-hidden
              />
              <p className="text-body-sm text-feedback-success-text">
                Added {addedSummary.units.toLocaleString()} pcs across{" "}
                {addedSummary.lines} variant
                {addedSummary.lines === 1 ? "" : "s"} to your cart.
              </p>
            </div>
            <div className="inline-flex gap-2">
              <Button asChild size="sm" variant="secondary">
                <Link href="/wholesale/catalogue">Continue shopping</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/b2b/cart">View cart</Link>
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-micro text-text-muted">{label}</dt>
      <dd className="mt-0.5 text-heading-md text-text-primary">{value}</dd>
      {hint && <span className="text-caption text-text-muted">{hint}</span>}
    </div>
  );
}
