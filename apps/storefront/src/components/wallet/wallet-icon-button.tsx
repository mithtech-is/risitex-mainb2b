"use client";

import * as React from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { useWallet } from "@/features/wallet/hooks";

/**
 * Topnav wallet button.
 *
 * - Signed-in customer with a wallet → links to /b2b/wallet, shows the
 *   current INR balance as a tiny badge to the right of the icon.
 * - Signed-in customer without a wallet → links to /b2b/wallet, which
 *   on first load auto-creates the wallet via the plugin's ensureWallet().
 * - Anonymous / 401 → hidden so guests don't see broken state.
 *
 * Hot-path: the underlying useWallet() hook caches the result across the
 * SPA, so this button doesn't re-fetch on every render.
 */
export function WalletIconButton() {
  const wallet = useWallet();
  const isAuthErr = !!wallet.error && /401/.test(wallet.error);
  if (isAuthErr) return null;

  const balancePaise = wallet.data
    ? Number(wallet.data.balance_inr) + Number(wallet.data.promo_balance_inr)
    : 0;
  const showBadge = !wallet.loading && balancePaise > 0;
  const balanceLabel = formatBalance(balancePaise);

  return (
    // Same 40px square + 20px icon as the other navbar action buttons, so the
    // row stays evenly aligned. The balance used to render as inline text that
    // made this button wider than its neighbours; it's now a small corner dot
    // (funds present / not) matching the count badges on wishlist and cart.
    <Link
      href="/b2b/wallet"
      aria-label={wallet.loading ? "Wallet" : `Wallet, balance ${balanceLabel}`}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-text-secondary transition-colors duration-fast hover:bg-surface-sunken hover:text-text-primary focus-visible:ring-focus"
    >
      <Wallet className="h-5 w-5" />
      {showBadge && (
        <span
          aria-hidden
          className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand-accent"
        />
      )}
    </Link>
  );
}

function formatBalance(paise: number): string {
  const rupees = Math.floor(paise / 100);
  if (rupees >= 100_000) return `₹${(rupees / 100_000).toFixed(1)}L`;
  if (rupees >= 1_000) return `₹${(rupees / 1_000).toFixed(1)}k`;
  return `₹${rupees}`;
}
