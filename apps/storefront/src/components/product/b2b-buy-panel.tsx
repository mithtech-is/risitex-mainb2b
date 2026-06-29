"use client";

import * as React from "react";
import {
  Button,
  MarginCalculator,
  MatrixOrderGrid,
  TierLadder,
  formatINR,
  type MatrixCell,
  type MatrixDimensionValue,
} from "@risitex/ui/components";
import type { Product } from "@/data/products";
import {
  fetchAvailability,
  clampToAvailable,
  type AvailabilityRow,
} from "@/lib/availability";

export function B2bBuyPanel({ product }: { product: Product }) {
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
    fetchAvailability(skus)
      .then((m) => {
        if (!cancelled) setAvailability(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [skus]);

  // Build matrix rows (sizes) and cols (colours).
  const rows: MatrixDimensionValue[] = React.useMemo(
    () =>
      product.sizes
        .filter((s) => s && s !== "—" && s !== "per-metre")
        .map((s) => ({ id: s, label: s })),
    [product.sizes],
  );

  const cols: MatrixDimensionValue[] = React.useMemo(
    () =>
      product.swatches.map((sw) => ({
        id: sw.value,
        label: sw.name,
        hex: sw.hex,
      })),
    [product.swatches],
  );

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
          out.push({
            rowId: r.id,
            colId: c.id,
            variantId: variant.id,
            sku: variant.sku,
            stock: avail ? avail.available ?? fixtureStock : fixtureStock,
          });
        } else {
          out.push({ rowId: r.id, colId: c.id, stock: 0 });
        }
      }
    }
    return out;
  }, [effectiveRows, cols, product.variants, rows.length, availability]);

  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const totalQty = Object.values(quantities).reduce((s, n) => s + n, 0);

  const moq = product.moq ?? 0;
  const meetsMoq = totalQty >= moq;
  const cartonSize = product.cartonSize ?? 0;
  const fullCartons = cartonSize ? Math.floor(totalQty / cartonSize) : 0;
  const looseUnits = cartonSize ? totalQty - fullCartons * cartonSize : 0;

  const currentTier = React.useMemo(() => {
    if (!product.tiers) return null;
    return (
      product.tiers.find(
        (t) =>
          totalQty >= t.minQty &&
          (t.maxQty === null || totalQty <= t.maxQty),
      ) ?? product.tiers[0]
    );
  }, [product.tiers, totalQty]);

  const lineTotalMajor = currentTier
    ? currentTier.pricePerUnitMajor * totalQty
    : product.priceMajor * totalQty;

  // Per-cell sellable stock, keyed like the quantity map.
  const stockByKey = React.useMemo(() => {
    const m: Record<string, number | undefined> = {};
    for (const cell of cells) {
      m[`${cell.rowId}_${cell.colId}`] = cell.stock;
    }
    return m;
  }, [cells]);

  // FR-9.02: the grid's number input doesn't hard-cap typed values, so clamp
  // each keyed quantity to what's available before it lands in the cart.
  const handleQty = (rowId: string, colId: string, qty: number) => {
    const key = `${rowId}_${colId}`;
    const capped = clampToAvailable(qty, stockByKey[key] ?? null);
    setQuantities((prev) => ({ ...prev, [key]: capped }));
  };

  // FR-3.02 master carton single-click: distribute one carton's units across
  // the size curve (first colour column), middle sizes taking any remainder.
  // Additive — click N times to add N cartons.
  const canAddCarton = cartonSize > 0 && effectiveRows.length > 0 && cols.length > 0;
  const handleAddCarton = () => {
    if (!canAddCarton) return;
    const firstCol = cols[0];
    if (!firstCol) return;
    const colId = firstCol.id;
    const n = effectiveRows.length;
    const base = Math.floor(cartonSize / n);
    const rem = cartonSize - base * n;
    const mid = (n - 1) / 2;
    const remSet = new Set(
      effectiveRows
        .map((_, i) => i)
        .sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))
        .slice(0, rem),
    );
    // FR-9.02: clamp each cell to its available stock so a carton add can
    // never oversell. Adds as much of the carton as is sellable rather than
    // blocking outright; cells short on stock simply take less.
    setQuantities((prev) => {
      const next = { ...prev };
      effectiveRows.forEach((r, i) => {
        const key = `${r.id}_${colId}`;
        const wanted = (next[key] ?? 0) + base + (remSet.has(i) ? 1 : 0);
        next[key] = clampToAvailable(wanted, stockByKey[key] ?? null);
      });
      return next;
    });
  };

  const handleAdd = () => {
    if (!meetsMoq) return;
    const params = new URLSearchParams();
    for (const cell of cells) {
      if (!cell.variantId) continue;
      const qty = quantities[`${cell.rowId}_${cell.colId}`] ?? 0;
      if (qty <= 0) continue;
      params.append("variant", `${cell.variantId}:${qty}`);
    }
    window.location.href = `/b2b/checkout?${params.toString()}`;
  };

  return (
    <div className="flex flex-col gap-8">
      {product.tiers && product.tiers.length > 0 && (
        <section>
          <h2 className="text-heading-md text-text-primary">Tier pricing</h2>
          <p className="mt-1 text-caption text-text-muted">
            Excl. GST. Tier resolves on submitted total.
          </p>
          <div className="mt-4">
            <TierLadder
              tiers={product.tiers}
              currentQuantity={totalQty || undefined}
              unitLabel={product.unit?.includes("metre") ? "metres" : "pcs"}
            />
          </div>
        </section>
      )}

      {currentTier && (
        <MarginCalculator
          costPerUnitMajor={currentTier.pricePerUnitMajor}
          suggestedRetailMajor={product.priceMajor}
        />
      )}

      <section>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-heading-md text-text-primary">Build your order</h2>
            <p className="mt-1 text-caption text-text-muted">
              Key quantities into the cells you need. Row + column subtotals at
              the edges.
            </p>
          </div>
          {canAddCarton && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAddCarton}
              title="Add one master carton, spread across the size curve"
            >
              + 1 master carton · {cartonSize} pcs
            </Button>
          )}
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
        <dl className="grid grid-cols-2 gap-4 numerics-tabular md:grid-cols-4">
          <Stat label="Total units" value={totalQty.toLocaleString()} />
          <Stat
            label="Cartons"
            value={
              cartonSize
                ? `${fullCartons}${looseUnits > 0 ? ` + ${looseUnits}` : ""}`
                : "—"
            }
            hint={cartonSize ? `${cartonSize} pcs / carton` : undefined}
          />
          <Stat
            label="Tier"
            value={currentTier?.label ?? "—"}
            hint={
              currentTier ? `${formatINR(currentTier.pricePerUnitMajor)} / pc` : undefined
            }
          />
          <Stat
            label="Subtotal"
            value={formatINR(lineTotalMajor)}
            hint="excl. GST"
          />
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            disabled={!meetsMoq || totalQty === 0}
            onClick={handleAdd}
          >
            {totalQty === 0
              ? "Add quantities first"
              : meetsMoq
                ? `Add to quote · ${totalQty.toLocaleString()} pcs`
                : `${(moq - totalQty).toLocaleString()} pcs to MOQ`}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            asChild
          >
            <a href={`/contact?product=${product.slug}`}>
              Bulk Enquiry
            </a>
          </Button>
          <span className="text-caption text-text-muted">
            MOQ {moq.toLocaleString()} pcs · Lead {product.leadTimeDays ?? "—"} days
          </span>
        </div>
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
