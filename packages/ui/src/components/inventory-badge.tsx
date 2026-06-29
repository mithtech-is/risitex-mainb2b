"use client";

import * as React from "react";
import { Badge } from "./badge";

export type InventoryState =
  | "in_stock"
  | "low_stock"
  | "out_of_stock"
  | "backorder"
  | "pre_order"
  | "made_to_order"
  | "reserved"
  | "discontinued";

const STATE_CONFIG: Record<
  InventoryState,
  {
    label: (count?: number) => string;
    tone: "neutral" | "success" | "warning" | "info" | "accent";
    dot: boolean;
  }
> = {
  in_stock: {
    label: () => "In stock",
    tone: "success",
    dot: true,
  },
  low_stock: {
    label: (c) => (typeof c === "number" ? `Only ${c} left` : "Low stock"),
    tone: "warning",
    dot: true,
  },
  out_of_stock: {
    label: () => "Out of stock",
    tone: "neutral",
    dot: false,
  },
  backorder: {
    label: (c) =>
      typeof c === "number" ? `Backorder · ${c} days` : "Backorder",
    tone: "info",
    dot: false,
  },
  pre_order: {
    label: () => "Pre-order",
    tone: "accent",
    dot: false,
  },
  made_to_order: {
    label: () => "Made to order",
    tone: "neutral",
    dot: false,
  },
  reserved: {
    label: () => "Reserved",
    tone: "info",
    dot: false,
  },
  discontinued: {
    label: () => "Discontinued",
    tone: "neutral",
    dot: false,
  },
};

export type InventoryBadgeProps = {
  state: InventoryState;
  /** Used by low_stock and backorder for the numeric label */
  count?: number;
  /** Override the default label */
  label?: string;
  size?: "xs" | "sm";
};

export function InventoryBadge({
  state,
  count,
  label,
  size = "sm",
}: InventoryBadgeProps) {
  const cfg = STATE_CONFIG[state];
  return (
    <Badge tone={cfg.tone} size={size} dot={cfg.dot}>
      {label ?? cfg.label(count)}
    </Badge>
  );
}
