"use client";

import * as React from "react";
import { cn } from "./utils";

export type MatrixDimensionValue = {
  /** Display label, e.g. "S" or "Indigo" */
  label: string;
  /** Internal id used for lookups */
  id: string;
  /** Optional swatch colour for colour dimensions */
  hex?: string;
};

export type MatrixCell = {
  rowId: string;
  colId: string;
  /** Variant id for cart line items */
  variantId?: string;
  /** Available stock at this cell; 0 disables the input */
  stock?: number;
  /** Internal SKU */
  sku?: string;
};

export type MatrixOrderGridProps = {
  rows: MatrixDimensionValue[];
  cols: MatrixDimensionValue[];
  cells: MatrixCell[];
  /** Quantities keyed by `${rowId}_${colId}` */
  quantities: Record<string, number>;
  onQuantityChange: (rowId: string, colId: string, qty: number) => void;
  className?: string;
};

/**
 * Matrix order grid — the wholesale buyer's spreadsheet.
 *
 * Rows × cols → quantity inputs. Each cell stays at qty 0 until the buyer
 * keys in. Row and column totals surface at the edges so the buyer can see
 * the carton spread at a glance.
 *
 * Cells with stock 0 are disabled and rendered struck-through.
 */
export function MatrixOrderGrid({
  rows,
  cols,
  cells,
  quantities,
  onQuantityChange,
  className,
}: MatrixOrderGridProps) {
  const cellByKey = React.useMemo(() => {
    const m = new Map<string, MatrixCell>();
    for (const c of cells) m.set(`${c.rowId}_${c.colId}`, c);
    return m;
  }, [cells]);

  const rowTotals = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const row of rows) {
      m[row.id] = cols.reduce(
        (sum, col) => sum + (quantities[`${row.id}_${col.id}`] ?? 0),
        0,
      );
    }
    return m;
  }, [rows, cols, quantities]);

  const colTotals = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const col of cols) {
      m[col.id] = rows.reduce(
        (sum, row) => sum + (quantities[`${row.id}_${col.id}`] ?? 0),
        0,
      );
    }
    return m;
  }, [rows, cols, quantities]);

  const grandTotal = Object.values(rowTotals).reduce((s, n) => s + n, 0);

  return (
    <div
      className={cn(
        "overflow-x-auto rounded-lg ring-1 ring-border-subtle numerics-tabular",
        className,
      )}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-b border-r border-border-subtle bg-surface-sunken px-3 py-2 text-left text-micro text-text-muted">
              Size →
            </th>
            {cols.map((col) => (
              <th
                key={col.id}
                className="border-b border-border-subtle bg-surface-sunken px-3 py-2 text-center text-caption font-medium text-text-primary"
              >
                {col.hex ? (
                  <span className="inline-flex items-center gap-1">
                    <span
                      aria-hidden
                      className="inline-block h-3 w-3 rounded-full ring-1 ring-border-strong"
                      style={{ background: col.hex }}
                    />
                    {col.label}
                  </span>
                ) : (
                  col.label
                )}
              </th>
            ))}
            <th className="border-b border-l border-border-subtle bg-surface-sunken px-3 py-2 text-right text-caption font-medium text-text-primary">
              Row total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th
                scope="row"
                className="sticky left-0 z-10 border-r border-border-subtle bg-surface-raised px-3 py-2 text-left text-body-md font-medium text-text-primary"
              >
                {row.hex ? (
                  <span className="inline-flex items-center gap-1">
                    <span
                      aria-hidden
                      className="inline-block h-3 w-3 rounded-full ring-1 ring-border-strong"
                      style={{ background: row.hex }}
                    />
                    {row.label}
                  </span>
                ) : (
                  row.label
                )}
              </th>
              {cols.map((col) => {
                const key = `${row.id}_${col.id}`;
                const cell = cellByKey.get(key);
                const disabled = !cell || cell.stock === 0;
                const value = quantities[key] ?? 0;
                return (
                  <td
                    key={col.id}
                    className={cn(
                      "border-l border-border-subtle px-1 py-1 text-center",
                      disabled && "bg-surface-sunken",
                    )}
                  >
                    {disabled ? (
                      <span className="text-text-disabled line-through">—</span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        max={cell?.stock ?? 99999}
                        value={value || ""}
                        onChange={(e) => {
                          const n = Number(e.currentTarget.value);
                          onQuantityChange(
                            row.id,
                            col.id,
                            Number.isNaN(n) ? 0 : Math.max(0, n),
                          );
                        }}
                        placeholder="0"
                        className={cn(
                          "h-9 w-14 rounded-sm bg-transparent text-center text-body-md text-text-primary outline-none",
                          "transition-shadow duration-fast",
                          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                          "focus-visible:bg-brand-accent-surface focus-visible:ring-1 focus-visible:ring-brand-accent",
                          value > 0 && "bg-brand-accent-surface text-brand-accent",
                        )}
                      />
                    )}
                  </td>
                );
              })}
              <td className="border-l border-border-subtle bg-surface-sunken px-3 py-2 text-right text-body-md font-medium text-text-primary">
                {rowTotals[row.id]}
              </td>
            </tr>
          ))}
          <tr>
            <th
              scope="row"
              className="sticky left-0 z-10 border-r border-t border-border-subtle bg-surface-sunken px-3 py-2 text-left text-caption font-medium text-text-primary"
            >
              Column total
            </th>
            {cols.map((col) => (
              <td
                key={col.id}
                className="border-l border-t border-border-subtle bg-surface-sunken px-3 py-2 text-center text-body-md font-medium text-text-primary"
              >
                {colTotals[col.id]}
              </td>
            ))}
            <td className="border-l border-t border-border-subtle bg-text-primary px-3 py-2 text-right text-body-md font-semibold text-text-on-inverse">
              {grandTotal}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
