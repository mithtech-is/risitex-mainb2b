import { MEDUSA_BASE_URL, medusa } from "./medusa";

/**
 * Plugin wallet types — mirror @holisto/medusa-plugin-cashfree-wallet's
 * `/store/wallet` response. Re-declared client-side so we don't bundle the
 * plugin's server types into the storefront.
 */
export type WalletVirtualAccount = {
  id: string;
  virtual_account_number: string;
  virtual_account_id: string;
  ifsc: string;
  upi_id: string | null;
  beneficiary_name: string | null;
  status: string;
  live_status?: string;
};

export type WalletSummary = {
  customer_id: string;
  /** Withdrawable bucket — VBA/NEFT-funded. Paise. */
  balance_inr: number;
  /** Non-withdrawable bucket — promo / admin-issued credit. Paise. */
  promo_balance_inr: number;
  status: "active" | "frozen";
  version: number;
  virtual_accounts: WalletVirtualAccount[];
};

export type WalletTransaction = {
  id: string;
  wallet_id: string;
  customer_id: string;
  direction: "credit" | "debit";
  amount_inr: number;
  balance_after: number;
  kind: "vba_credit" | "order_debit" | "order_reversal" | "refund" | "manual_adjust";
  bucket: "main" | "promo";
  reference_type: string | null;
  reference_id: string | null;
  note: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type WalletApplyResponse = {
  cart_id: string;
  currency_code: string;
  cart_total_paise: number;
  wallet_amount_paise: number;
  remaining_paise: number;
  wallet: {
    balance_inr: number;
    promo_balance_inr: number;
    status: "active" | "frozen";
  };
};

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

/**
 * The Medusa JS SDK doesn't (yet) ship the plugin's wallet routes as typed
 * methods. We hit the plugin's REST endpoints directly using the SDK's
 * already-configured baseUrl, JWT, and publishable key.
 */
async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${MEDUSA_BASE_URL}${path}`;
  // The SDK stores its JWT under localStorage key "medusa_auth_token" when
  // configured with auth.type:"jwt", jwtTokenStorageMethod:"local".
  let token: string | null = null;
  if (typeof window !== "undefined") {
    token = window.localStorage.getItem("medusa_auth_token");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-publishable-api-key": PUB_KEY,
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...init, headers, credentials: "include" });
  if (!res.ok) {
    let detail = "";
    let devDetail = "";
    try {
      const body = (await res.json()) as { message?: string; detail?: string };
      detail = body?.message ?? "";
      devDetail = body?.detail ?? "";
    } catch {
      // empty
    }
    const tail = detail
      ? ` — ${detail}${devDetail ? ` [${devDetail}]` : ""}`
      : "";
    throw new Error(`${res.status} ${res.statusText}${tail}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function fetchWallet(): Promise<WalletSummary> {
  return authFetch<WalletSummary>("/store/wallet");
}

export async function fetchWalletTransactions(
  params: { limit?: number; offset?: number } = {},
): Promise<{ transactions: WalletTransaction[]; count: number; offset: number; limit: number }> {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : "";
  return authFetch(`/store/wallet/transactions${suffix}`);
}

export async function syncWallet(): Promise<{ wallet?: WalletSummary; synced: boolean }> {
  return authFetch("/store/wallet/sync", { method: "POST" });
}

export async function applyWalletToCart(
  cartId: string,
  amountPaise: number,
): Promise<WalletApplyResponse> {
  return authFetch(`/store/carts/${cartId}/wallet-apply`, {
    method: "POST",
    body: JSON.stringify({ amount_paise: amountPaise }),
  });
}

export async function clearWalletFromCart(cartId: string): Promise<{ cart_id: string; cleared: boolean }> {
  return authFetch(`/store/carts/${cartId}/wallet-clear`, { method: "POST" });
}

export type BankAccount = {
  id: string;
  customer_id: string;
  account_holder_name: string;
  account_number_last4: string;
  ifsc: string;
  bank_name: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

export type BankAccountsResponse = {
  bank_accounts: BankAccount[];
  virtual_account: WalletVirtualAccount | null;
};

export async function fetchBankAccounts(): Promise<BankAccountsResponse> {
  return authFetch<BankAccountsResponse>("/store/bank-accounts");
}

export async function addBankAccount(input: {
  account_holder_name: string;
  account_number: string;
  ifsc: string;
  bank_name?: string;
}): Promise<{ bank_account: BankAccount; virtual_account: WalletVirtualAccount | null }> {
  return authFetch("/store/bank-accounts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function removeBankAccount(id: string): Promise<{ ok: boolean }> {
  return authFetch(`/store/bank-accounts/${id}`, { method: "DELETE" });
}

export async function setPrimaryBankAccount(id: string): Promise<{ bank_account: BankAccount }> {
  return authFetch(`/store/bank-accounts/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ is_primary: true }),
  });
}

export type DepositProof = {
  id: string;
  claimed_amount_inr: number;
  credited_amount_inr: number | null;
  utr: string | null;
  customer_note: string | null;
  proof_file_url: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
};

export async function submitDepositProof(input: {
  claimed_amount_inr: number;
  utr?: string;
  customer_note?: string;
}): Promise<{ proof: DepositProof }> {
  // The plugin's deposit-proof schema requires `proof_file_url`. Until we
  // wire the /store/upload flow, send a sentinel URL — admin reviews each
  // submission manually, so the URL is informational. Customer is told
  // in-form that they need to share proof via email.
  return authFetch("/store/wallet/deposit-proof", {
    method: "POST",
    body: JSON.stringify({
      claimed_amount_inr: input.claimed_amount_inr,
      proof_file_url: "https://risitex.example/no-proof-attached-pending-manual",
      utr: input.utr ?? null,
      customer_note: input.customer_note ?? null,
    }),
  });
}

export async function fetchDepositProofs(): Promise<{ deposit_proofs: DepositProof[] }> {
  // Plugin returns `{ proofs: [...] }` — remap to our internal key.
  const raw = await authFetch<{ proofs: DepositProof[] }>("/store/wallet/deposit-proof");
  return { deposit_proofs: raw.proofs ?? [] };
}

export type TopupResponse = {
  mode: "live" | "dev-pass-through";
  razorpay: {
    key_id?: string;
    order_id: string;
    amount: number;
    currency: string;
  } | null;
  transaction: { id: string; balance_after: number; kind: string } | null;
  intent_id: string;
};

export async function startWalletTopup(amountPaise: number): Promise<TopupResponse> {
  return authFetch<TopupResponse>("/store/wallet/topup", {
    method: "POST",
    body: JSON.stringify({ amount_paise: amountPaise }),
  });
}

export type VerifyTopupResponse = {
  verified: boolean;
  mode: "live" | "passthrough";
  transaction: { id: string; balance_after: number; kind: string } | null;
};

export async function verifyWalletTopup(input: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  intent_id?: string;
}): Promise<VerifyTopupResponse> {
  return authFetch<VerifyTopupResponse>("/store/wallet/topup/verify", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Suppress lint: kept on the public surface for symmetry / future direct SDK swap. */
export { medusa as medusaSdk };
