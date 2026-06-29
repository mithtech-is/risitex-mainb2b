"use client";

import * as React from "react";
import { CreditCard, Smartphone, Wallet, ShieldCheck } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "./radio-group";
import { Label } from "./label";
import { cn } from "./utils";

export type RazorpayMethod = "upi" | "card" | "netbanking" | "wallet" | "cod";

export type RazorpayMethodSelectorProps = {
  value: RazorpayMethod;
  onValueChange: (v: RazorpayMethod) => void;
  /** Render the Cash-on-Delivery option for workflows that explicitly allow it */
  showCod?: boolean;
  /** Suppress UPI / cards when on a B2B account */
  b2bOnly?: boolean;
  className?: string;
};

/**
 * Razorpay payment method selector — emulates the Razorpay-branded checkout
 * step. Each method is a radio card with icon + label + helper. The actual
 * Razorpay handshake fires from the calling page (PaymentStep + handler).
 */
export function RazorpayMethodSelector({
  value,
  onValueChange,
  showCod,
  b2bOnly,
  className,
}: RazorpayMethodSelectorProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-2 rounded-md bg-surface-sunken px-3 py-2 text-caption text-text-muted">
        <ShieldCheck className="h-3.5 w-3.5" />
        Secured by Razorpay · PCI-DSS Level 1
      </div>

      <RadioGroup
        value={value}
        onValueChange={(v) => onValueChange(v as RazorpayMethod)}
        className="gap-2"
      >
        {!b2bOnly && (
          <MethodRow
            value="upi"
            label="UPI"
            description="GPay, PhonePe, Paytm — instant"
            icon={<Smartphone className="h-4 w-4" />}
          />
        )}
        <MethodRow
          value="card"
          label="Card"
          description="Credit · Debit · Prepaid"
          icon={<CreditCard className="h-4 w-4" />}
        />
        <MethodRow
          value="netbanking"
          label="Net banking"
          description="58+ banks supported"
          icon={<Wallet className="h-4 w-4" />}
        />
        {!b2bOnly && (
          <MethodRow
            value="wallet"
            label="Wallet"
            description="Razorpay wallet credit"
            icon={<Wallet className="h-4 w-4" />}
          />
        )}
        {showCod && !b2bOnly && (
          <MethodRow
            value="cod"
            label="Cash on delivery"
            description="₹50 handling fee · max ₹10,000"
            icon={<Wallet className="h-4 w-4" />}
          />
        )}
      </RadioGroup>
    </div>
  );
}

function MethodRow({
  value,
  label,
  description,
  icon,
}: {
  value: RazorpayMethod;
  label: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <label
      htmlFor={value}
      className="flex cursor-pointer items-center gap-3 rounded-md border border-border-subtle bg-surface-raised p-4 transition-colors duration-fast hover:bg-surface-sunken"
    >
      <RadioGroupItem id={value} value={value} />
      <span className="text-text-muted">{icon}</span>
      <span className="flex-1">
        <Label asChild>
          <span className="text-body-md text-text-primary font-medium">
            {label}
          </span>
        </Label>
        <p className="text-caption text-text-muted">{description}</p>
      </span>
    </label>
  );
}
