"use client";

import * as React from "react";
import {
  applyWalletToCart,
  clearWalletFromCart,
  fetchWallet,
  fetchWalletTransactions,
  syncWallet,
  type WalletApplyResponse,
  type WalletSummary,
  type WalletTransaction,
} from "@/lib/wallet";

/**
 * Lightweight React hooks for the plugin's wallet API.
 *
 * Note: the storefront doesn't yet wire TanStack Query at the app root; rather
 * than adding the provider just for the wallet (and dealing with SSR
 * dehydration), these hooks use `useState` + `useEffect` with explicit
 * `refresh()` returns. When TanStack Query lands, swap these implementations
 * for `useQuery({ queryKey: ["wallet"], queryFn: fetchWallet })` etc.
 */

type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

const initial = <T,>(): AsyncState<T> => ({ data: null, loading: true, error: null });

export function useWallet(): AsyncState<WalletSummary> & { refresh: () => Promise<void> } {
  const [state, setState] = React.useState<AsyncState<WalletSummary>>(initial());
  const refresh = React.useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetchWallet();
      setState({ data, loading: false, error: null });
    } catch (err) {
      setState({ data: null, loading: false, error: (err as Error).message });
    }
  }, []);
  React.useEffect(() => {
    void refresh();
  }, [refresh]);
  return { ...state, refresh };
}

export function useWalletTransactions(
  params: { limit?: number; offset?: number } = {},
): AsyncState<{ transactions: WalletTransaction[]; count: number }> & {
  refresh: () => Promise<void>;
} {
  const { limit = 25, offset = 0 } = params;
  const [state, setState] = React.useState<AsyncState<{
    transactions: WalletTransaction[];
    count: number;
  }>>(initial());
  const refresh = React.useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetchWalletTransactions({ limit, offset });
      setState({ data: { transactions: data.transactions, count: data.count }, loading: false, error: null });
    } catch (err) {
      setState({ data: null, loading: false, error: (err as Error).message });
    }
  }, [limit, offset]);
  React.useEffect(() => {
    void refresh();
  }, [refresh]);
  return { ...state, refresh };
}

export function useApplyWallet() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const apply = React.useCallback(
    async (cartId: string, amountPaise: number): Promise<WalletApplyResponse | null> => {
      setLoading(true);
      setError(null);
      try {
        const res = await applyWalletToCart(cartId, amountPaise);
        setLoading(false);
        return res;
      } catch (err) {
        setError((err as Error).message);
        setLoading(false);
        return null;
      }
    },
    [],
  );
  const clear = React.useCallback(async (cartId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await clearWalletFromCart(cartId);
      setLoading(false);
      return res;
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
      return null;
    }
  }, []);
  return { apply, clear, loading, error };
}

export function useWalletSync() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const run = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await syncWallet();
      setLoading(false);
      return res;
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
      return null;
    }
  }, []);
  return { run, loading, error };
}
