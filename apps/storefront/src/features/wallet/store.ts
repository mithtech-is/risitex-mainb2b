"use client";

import { create } from "zustand";

/**
 * Checkout-side wallet state. Tracks the *intended* split for the current
 * cart; the source of truth for the applied amount is the cart metadata
 * (set via `/store/carts/:id/wallet-apply`). This store mirrors it so the
 * checkout UI can render synchronously without re-fetching the cart on
 * every interaction.
 *
 * Cleared when the cart id changes or the order is placed.
 */
type WalletStore = {
  cartId: string | null;
  appliedAmountPaise: number;
  cartTotalPaise: number;
  remainingPaise: number;
  set(input: {
    cartId: string;
    appliedAmountPaise: number;
    cartTotalPaise: number;
    remainingPaise: number;
  }): void;
  clear(): void;
};

export const useWalletStore = create<WalletStore>((set) => ({
  cartId: null,
  appliedAmountPaise: 0,
  cartTotalPaise: 0,
  remainingPaise: 0,
  set: (input) =>
    set({
      cartId: input.cartId,
      appliedAmountPaise: input.appliedAmountPaise,
      cartTotalPaise: input.cartTotalPaise,
      remainingPaise: input.remainingPaise,
    }),
  clear: () =>
    set({ cartId: null, appliedAmountPaise: 0, cartTotalPaise: 0, remainingPaise: 0 }),
}));
