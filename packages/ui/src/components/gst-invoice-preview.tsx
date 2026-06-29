"use client";

import * as React from "react";
import { formatINR } from "./price-block";
import { cn } from "./utils";

export type GstInvoiceLine = {
  sku: string;
  description: string;
  hsn: string;
  qty: number;
  unitPriceMajor: number;
  gstRatePct: number;
};

export type GstInvoicePreviewProps = {
  invoiceNo: string;
  /** ISO date */
  invoiceDate: string;
  sellerGstin: string;
  buyerGstin?: string;
  buyerName: string;
  buyerAddressLines: string[];
  /** Place of supply — IGST applies when seller and buyer states differ */
  placeOfSupply: string;
  sellerState: string;
  lines: GstInvoiceLine[];
  className?: string;
};

/**
 * GstInvoicePreview — renders an Indian GST-compliant tax invoice for B2B
 * orders. Used in the checkout review step and on the order page.
 *
 * Calculates CGST+SGST if the buyer state matches the seller state, else
 * IGST. Totals are tabular-aligned and printable.
 */
export function GstInvoicePreview({
  invoiceNo,
  invoiceDate,
  sellerGstin,
  buyerGstin,
  buyerName,
  buyerAddressLines,
  placeOfSupply,
  sellerState,
  lines,
  className,
}: GstInvoicePreviewProps) {
  const interState = placeOfSupply.toLowerCase() !== sellerState.toLowerCase();

  const rows = lines.map((l) => {
    const taxable = l.unitPriceMajor * l.qty;
    const gst = taxable * (l.gstRatePct / 100);
    const cgst = interState ? 0 : gst / 2;
    const sgst = interState ? 0 : gst / 2;
    const igst = interState ? gst : 0;
    const total = taxable + gst;
    return { ...l, taxable, cgst, sgst, igst, total };
  });
  const subtotal = rows.reduce((s, r) => s + r.taxable, 0);
  const cgst = rows.reduce((s, r) => s + r.cgst, 0);
  const sgst = rows.reduce((s, r) => s + r.sgst, 0);
  const igst = rows.reduce((s, r) => s + r.igst, 0);
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  return (
    <section
      className={cn(
        "rounded-lg border border-border-subtle bg-surface-raised numerics-tabular",
        className,
      )}
    >
      <header className="border-b border-border-subtle px-6 py-4">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="text-micro text-text-muted">Tax invoice</p>
            <h2 className="mt-1 font-display text-heading-lg text-text-primary">
              RISITEX · Mithtech Innovative Solutions
            </h2>
            <p className="mt-1 text-caption text-text-muted">
              GSTIN <span className="font-mono">{sellerGstin}</span> ·{" "}
              {sellerState}
            </p>
          </div>
          <div className="text-right">
            <p className="text-micro text-text-muted">Invoice</p>
            <p className="mt-1 font-mono text-body-md text-text-primary">
              {invoiceNo}
            </p>
            <p className="text-caption text-text-muted">
              {new Date(invoiceDate).toLocaleDateString("en-IN")}
            </p>
          </div>
        </div>
      </header>

      {/* Buyer */}
      <div className="grid grid-cols-1 gap-6 border-b border-border-subtle px-6 py-4 md:grid-cols-2">
        <div>
          <p className="text-micro text-text-muted">Bill to</p>
          <p className="mt-1 text-body-md font-medium text-text-primary">
            {buyerName}
          </p>
          <ul className="mt-1 text-body-sm text-text-secondary">
            {buyerAddressLines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
          {buyerGstin && (
            <p className="mt-2 text-caption text-text-muted">
              GSTIN <span className="font-mono">{buyerGstin}</span>
            </p>
          )}
        </div>
        <div>
          <p className="text-micro text-text-muted">Place of supply</p>
          <p className="mt-1 text-body-md text-text-primary">{placeOfSupply}</p>
          <p className="text-caption text-text-muted">
            {interState ? "Inter-state · IGST applicable" : "Intra-state · CGST + SGST"}
          </p>
        </div>
      </div>

      {/* Lines */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border-subtle text-caption text-text-muted">
              <th className="px-6 py-3 text-left">SKU / HSN</th>
              <th className="px-6 py-3 text-left">Description</th>
              <th className="px-3 py-3 text-right">Qty</th>
              <th className="px-3 py-3 text-right">Rate</th>
              <th className="px-3 py-3 text-right">Taxable</th>
              <th className="px-3 py-3 text-right">GST%</th>
              <th className="px-3 py-3 text-right">Tax</th>
              <th className="px-6 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="text-body-sm">
            {rows.map((r) => (
              <tr key={r.sku} className="border-b border-border-subtle">
                <td className="px-6 py-3">
                  <span className="font-mono text-caption">{r.sku}</span>
                  <span className="block text-caption text-text-muted">
                    HSN {r.hsn}
                  </span>
                </td>
                <td className="px-6 py-3 text-text-primary">{r.description}</td>
                <td className="px-3 py-3 text-right">{r.qty}</td>
                <td className="px-3 py-3 text-right">
                  {formatINR(r.unitPriceMajor)}
                </td>
                <td className="px-3 py-3 text-right">{formatINR(r.taxable)}</td>
                <td className="px-3 py-3 text-right">{r.gstRatePct}%</td>
                <td className="px-3 py-3 text-right">
                  {formatINR(r.cgst + r.sgst + r.igst)}
                </td>
                <td className="px-6 py-3 text-right font-medium">
                  {formatINR(r.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="border-t border-border-subtle px-6 py-4">
        <dl className="ml-auto w-full max-w-sm space-y-1 text-body-md">
          <Row label="Subtotal (taxable)" value={formatINR(subtotal)} />
          {interState ? (
            <Row label="IGST" value={formatINR(igst)} />
          ) : (
            <>
              <Row label="CGST" value={formatINR(cgst)} />
              <Row label="SGST" value={formatINR(sgst)} />
            </>
          )}
          <Row label="Total" value={formatINR(grandTotal)} bold />
        </dl>
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className={cn("text-body-md", bold ? "font-medium text-text-primary" : "text-text-secondary")}>
        {label}
      </dt>
      <dd className={cn("text-body-md text-text-primary", bold && "text-heading-md")}>
        {value}
      </dd>
    </div>
  );
}
