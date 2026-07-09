"use client";

import * as React from "react";

/**
 * Client-side B2B cart store.
 *
 * Persists to localStorage so cart state survives page reloads + login.
 * (Same-browser persistence only — multi-device sync would need a real
 * Medusa cart row; the spec calls that out as a future step. For now
 * the cart drives the /b2b/checkout wizard, which posts the final PO
 * to /store/purchase-orders.)
 *
 * Cross-component subscribers listen on the "risitex:cart-changed"
 * window event — the navbar badge + the cart page re-render instantly
 * when any handler mutates the cart.
 */

const STORAGE_KEY = "risitex.b2b.cart.v1";
const CHANGE_EVENT = "risitex:cart-changed";

export type CartLine = {
  variantId: string;
  productSlug: string;
  productName: string;
  /** Pretty label for the variant — e.g. "Black / M" or "Per metre". */
  variantTitle: string;
  /** Unit price in RUPEES (major), already tier-aware when the caller
   *  knows the tier. The cart page may re-tier when totals change. */
  unitPriceMajor: number;
  quantity: number;
  thumbnail?: string;
  /** Carried so the cart page can warn on MOQ / case-pack violations
   *  without a second product lookup. Re-hydrated from live backend rules
   *  on cart load (see refreshCartLines) so an admin changing the MOQ /
   *  price rule flows into carts that already hold the product. */
  moq?: number;
  /** Max order qty from the B2B quantity rule (undefined = no cap). */
  maxQty?: number;
  cartonSize?: number;
};

/** Live values pulled from the backend for one product slug. */
export type LineRefresh = {
  unitPriceMajor?: number;
  moq?: number;
  maxQty?: number;
  cartonSize?: number;
};

/**
 * Re-sync stored lines against current backend rules, keyed by productSlug.
 * Cart lines snapshot price/MOQ at add-time; without this a rule the admin
 * changed later (or a product added before a fix) would keep showing stale
 * values. Only provided fields overwrite; quantity is never touched. Writes
 * back to localStorage so the corrected values persist.
 */
export function refreshCartLines(
  bySlug: Record<string, LineRefresh>,
): CartLine[] {
  const cur = safeRead();
  let changed = false;
  const next = cur.map((l) => {
    const r = bySlug[l.productSlug];
    if (!r) return l;
    const merged: CartLine = { ...l };
    if (typeof r.unitPriceMajor === "number" && r.unitPriceMajor !== l.unitPriceMajor) {
      merged.unitPriceMajor = r.unitPriceMajor;
      changed = true;
    }
    if (r.moq !== l.moq) {
      merged.moq = r.moq;
      changed = true;
    }
    if (r.maxQty !== l.maxQty) {
      merged.maxQty = r.maxQty;
      changed = true;
    }
    if (r.cartonSize !== l.cartonSize) {
      merged.cartonSize = r.cartonSize;
      changed = true;
    }
    return merged;
  });
  if (changed) safeWrite(next);
  return next;
}

function safeRead(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l): l is CartLine =>
        l &&
        typeof l.variantId === "string" &&
        typeof l.quantity === "number" &&
        l.quantity > 0,
    );
  } catch {
    return [];
  }
}

function safeWrite(lines: CartLine[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* quota / private-mode — silently degrade */
  }
}

/** Read the current cart (snapshot). */
export function getCart(): CartLine[] {
  return safeRead();
}

/**
 * Merge a batch of lines into the cart. Lines that match an existing
 * variantId have their quantities summed; unmatched lines append.
 * Lines with quantity ≤ 0 are skipped.
 */
export function addToCart(incoming: CartLine[]): CartLine[] {
  if (!incoming.length) return safeRead();
  const cur = safeRead();
  const byVariant = new Map(cur.map((l) => [l.variantId, l]));
  for (const line of incoming) {
    if (!line.variantId || line.quantity <= 0) continue;
    const existing = byVariant.get(line.variantId);
    if (existing) {
      byVariant.set(line.variantId, {
        ...existing,
        // Latest metadata wins (price/title may have been re-tiered),
        // but quantity is the SUM so click+click+click accumulates.
        ...line,
        quantity: existing.quantity + line.quantity,
      });
    } else {
      byVariant.set(line.variantId, line);
    }
  }
  const next = Array.from(byVariant.values());
  safeWrite(next);
  return next;
}

/** Replace one line's quantity. Quantity ≤ 0 removes it. */
export function updateQuantity(variantId: string, quantity: number): CartLine[] {
  const cur = safeRead();
  let next: CartLine[];
  if (quantity <= 0) {
    next = cur.filter((l) => l.variantId !== variantId);
  } else {
    next = cur.map((l) =>
      l.variantId === variantId ? { ...l, quantity } : l,
    );
  }
  safeWrite(next);
  return next;
}

/** Remove a single line. */
export function removeFromCart(variantId: string): CartLine[] {
  return updateQuantity(variantId, 0);
}

/** Empty the cart — typically called after a successful order. */
export function clearCart(): void {
  safeWrite([]);
}

export function totalUnits(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + l.quantity, 0);
}

export function subtotalMajor(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + l.quantity * l.unitPriceMajor, 0);
}

/**
 * React hook: subscribes to the cart store and re-renders whenever
 * addToCart / updateQuantity / removeFromCart / clearCart fires.
 * Also re-syncs on cross-tab `storage` events so the cart stays
 * consistent when the user has multiple tabs open.
 */
export function useCart(): CartLine[] {
  const [lines, setLines] = React.useState<CartLine[]>(() => safeRead());

  React.useEffect(() => {
    const onChange = () => setLines(safeRead());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) onChange();
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return lines;
}
