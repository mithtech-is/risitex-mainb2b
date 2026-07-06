"use client";

import * as React from "react";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@risitex/ui/components";
import { gstStateCode, gstBreakdown, GST_SELLER_STATE } from "@/lib/india-gst";

/**
 * Inline B2B shipping + GST estimator.
 *
 * The backend tax provider is the source of truth at checkout time. This
 * widget exists so buyers can preview landed cost (shipping + CGST/SGST or
 * IGST) on the PO draft / PDP before they commit.
 *
 * GST rate defaults to 5% (textile B2B standard) but accepts a per-line rate
 * via prop in case a future SKU bracket carries 12%.
 */
const STATE_DROPDOWN: { name: string; code: string }[] = [
  { name: "Andhra Pradesh", code: "ap" },
  { name: "Assam", code: "as" },
  { name: "Bihar", code: "br" },
  { name: "Chhattisgarh", code: "ct" },
  { name: "Delhi", code: "dl" },
  { name: "Goa", code: "ga" },
  { name: "Gujarat", code: "gj" },
  { name: "Haryana", code: "hr" },
  { name: "Himachal Pradesh", code: "hp" },
  { name: "Jharkhand", code: "jh" },
  { name: "Karnataka", code: "ka" },
  { name: "Kerala", code: "kl" },
  { name: "Madhya Pradesh", code: "mp" },
  { name: "Maharashtra", code: "mh" },
  { name: "Odisha", code: "or" },
  { name: "Punjab", code: "pb" },
  { name: "Rajasthan", code: "rj" },
  { name: "Tamil Nadu", code: "tn" },
  { name: "Telangana", code: "tg" },
  { name: "Uttar Pradesh", code: "up" },
  { name: "Uttarakhand", code: "ut" },
  { name: "West Bengal", code: "wb" },
];

// Zones are deliberately coarse — actual courier rates come from the backend
// shipping provider at checkout. These approximations help the buyer reason
// about a price band, nothing more.
const SAME_ZONE_STATES: Record<string, string[]> = {
  ka: ["ka", "tn", "kl", "ap", "tg"],
  tn: ["tn", "ka", "kl", "ap", "tg"],
  mh: ["mh", "gj", "ga", "mp", "ct"],
  dl: ["dl", "hr", "up", "pb", "rj", "ut"],
  // Fallback: only same-state is "near"
};

function shippingZoneRupees(buyerCode: string, sellerCode: string): number {
  if (!buyerCode) return 0;
  if (buyerCode === sellerCode) return 150;
  const adjacents = SAME_ZONE_STATES[sellerCode] ?? [sellerCode];
  return adjacents.includes(buyerCode) ? 250 : 400;
}

function shippingEtaDays(buyerCode: string, sellerCode: string): string {
  if (!buyerCode) return "—";
  if (buyerCode === sellerCode) return "2–3 days";
  const adjacents = SAME_ZONE_STATES[sellerCode] ?? [sellerCode];
  return adjacents.includes(buyerCode) ? "3–5 days" : "5–7 days";
}

function formatRupees(paise: number): string {
  const rupees = Math.round(paise / 100);
  return `₹${rupees.toLocaleString("en-IN")}`;
}

export function ShippingGstEstimate({
  subtotalPaise,
  gstRatePercent = 5,
  defaultState,
}: {
  subtotalPaise: number;
  gstRatePercent?: number;
  defaultState?: string;
}) {
  const [stateName, setStateName] = React.useState(defaultState ?? "Karnataka");
  const [pincode, setPincode] = React.useState("");
  const sellerCode = GST_SELLER_STATE;
  const buyerCode = gstStateCode(stateName) ?? "";

  const shippingRupees = shippingZoneRupees(buyerCode, sellerCode);
  const shippingPaise = shippingRupees * 100;
  const taxableBasePaise = subtotalPaise + shippingPaise;
  const gstTotalPaise = Math.round((taxableBasePaise * gstRatePercent) / 100);
  const lines = gstBreakdown(buyerCode, sellerCode, gstTotalPaise);
  const totalPaise = subtotalPaise + shippingPaise + gstTotalPaise;
  const eta = shippingEtaDays(buyerCode, sellerCode);

  return (
    <section
      aria-labelledby="shipping-gst-heading"
      className="rounded-md border border-border-subtle bg-surface-raised p-5"
    >
      <h3
        id="shipping-gst-heading"
        className="text-heading-sm text-text-primary"
      >
        Shipping &amp; GST estimate
      </h3>
      <p className="mt-1 text-caption text-text-muted">
        Indicative; final invoice computes at checkout against the backend
        tax + courier providers.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dest-state">Destination state</Label>
          <Select value={stateName} onValueChange={setStateName}>
            <SelectTrigger id="dest-state">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATE_DROPDOWN.map((s) => (
                <SelectItem key={s.code} value={s.name}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dest-pincode">Pincode (optional)</Label>
          <Input
            id="dest-pincode"
            inputMode="numeric"
            maxLength={6}
            value={pincode}
            onChange={(e) => setPincode(e.currentTarget.value.replace(/\D/g, ""))}
            placeholder="6-digit"
          />
        </div>
      </div>

      <dl className="mt-5 space-y-2 text-body-sm">
        <Row label="Subtotal" value={formatRupees(subtotalPaise)} />
        <Row
          label={`Shipping · ${eta}`}
          value={shippingRupees ? formatRupees(shippingPaise) : "—"}
        />
        {lines.map((l) => (
          <Row
            key={l.label}
            label={`${l.label} @ ${gstRatePercent / (lines.length === 2 ? 2 : 1)}%`}
            value={formatRupees(l.amountPaise)}
          />
        ))}
      </dl>

      <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-4">
        <span className="text-body-md text-text-primary">Estimated total</span>
        <span className="font-mono text-heading-sm text-text-primary">
          {formatRupees(totalPaise)}
        </span>
      </div>

      <p className="mt-3 text-caption text-text-muted">
        Wallet, Net-30 credit terms, and uploaded PO documents are accepted on
        the final checkout step.
      </p>
    </section>
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
