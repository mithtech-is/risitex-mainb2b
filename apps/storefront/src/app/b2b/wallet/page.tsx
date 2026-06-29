"use client";

import * as React from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  EmptyState,
  StatCard,
  formatINR,
} from "@risitex/ui/components";
import { ArrowDownLeft, ArrowUpRight, Copy, RefreshCw, Wallet } from "lucide-react";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { useWallet, useWalletTransactions, useWalletSync } from "@/features/wallet/hooks";
import type { WalletTransaction } from "@/lib/wallet";
import { BankAccountsSection } from "@/components/wallet/bank-accounts-section";
import { AddFundsSection } from "@/components/wallet/add-funds-section";
import { InstantTopupSection } from "@/components/wallet/instant-topup-section";

const KIND_LABEL: Record<WalletTransaction["kind"], string> = {
  vba_credit: "Bank transfer",
  order_debit: "Order payment",
  order_reversal: "Order reversed",
  refund: "Refund",
  manual_adjust: "Manual adjustment",
};

function fromPaise(paise: number): string {
  return formatINR(Math.round(paise) / 100);
}

export default function B2bWalletPage() {
  const wallet = useWallet();
  const transactions = useWalletTransactions({ limit: 25 });
  const sync = useWalletSync();
  const [copied, setCopied] = React.useState<string | null>(null);

  const onSync = async () => {
    await sync.run();
    await wallet.refresh();
    await transactions.refresh();
  };
  const copyText = (key: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1500);
  };

  // Unauthenticated → CTA to sign in. The plugin's /store/wallet returns 401
  // for unauthenticated requests; we surface it as a sign-in prompt rather
  // than a noisy error.
  const isAuthErr = !!wallet.error && /401/.test(wallet.error);

  if (isAuthErr) {
    return (
      <>
        <header className="mb-6">
          <B2bTopbar title="Wallet" subtitle="Sign in to see your wallet balance" />
        </header>
        <EmptyState
          icon={<Wallet className="h-5 w-5" />}
          title="Sign in to view your wallet"
          description="Your INR wallet shows credits from refunds and admin top-ups, plus the bank-transfer account you can fund it from."
          action={
            <Button asChild>
              <Link href="/auth/sign-in">Sign in</Link>
            </Button>
          }
        />
      </>
    );
  }

  const w = wallet.data;
  const balancePaise = w ? Number(w.balance_inr) : 0;
  const promoPaise = w ? Number(w.promo_balance_inr) : 0;
  const totalPaise = balancePaise + promoPaise;
  const vba = w?.virtual_accounts?.[0] ?? null;

  const txs = transactions.data?.transactions ?? [];
  const lifetimeCredits = txs.filter((t) => t.direction === "credit").reduce((s, t) => s + Number(t.amount_inr), 0);
  const lifetimeDebits = txs.filter((t) => t.direction === "debit").reduce((s, t) => s + Number(t.amount_inr), 0);

  return (
    <>
      <header className="mb-6">
        <B2bTopbar
          title="Wallet"
          subtitle="Apply credits to your next order or top up via bank transfer"
          rightActions={
            <Button size="sm" variant="secondary" onClick={onSync} isLoading={sync.loading}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Sync
            </Button>
          }
        />
      </header>

      {wallet.error && !isAuthErr && (
        <div
          role="alert"
          className="mb-4 rounded-md bg-feedback-danger-bg px-3 py-2 text-body-sm text-feedback-danger-text ring-1 ring-feedback-danger-border"
        >
          {wallet.error}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          label="Available balance"
          value={wallet.loading ? "…" : fromPaise(totalPaise)}
          tone="accent"
          unit={w?.status === "frozen" ? "wallet frozen" : "main + promo"}
        />
        <StatCard
          label="Main balance"
          value={wallet.loading ? "…" : fromPaise(balancePaise)}
          unit="withdrawable"
        />
        <StatCard
          label="Promo balance"
          value={wallet.loading ? "…" : fromPaise(promoPaise)}
          unit="non-withdrawable"
        />
      </section>

      {/* Top-up via bank transfer (VBA) */}
      <section className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7 rounded-lg border border-border-subtle bg-surface-raised p-5">
          <p className="text-micro text-text-muted">Top up via NEFT / IMPS / RTGS / UPI</p>
          <h3 className="mt-1 font-display text-heading-md text-text-primary">
            Your virtual bank account
          </h3>
          <p className="mt-1 text-caption text-text-muted">
            Transfers to this account auto-credit your wallet within minutes. From any bank.
          </p>
          {vba ? (
            <dl className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 numerics-tabular">
              <Row
                label="Account number"
                value={vba.virtual_account_number}
                onCopy={() => copyText("acct", vba.virtual_account_number)}
                copied={copied === "acct"}
                mono
              />
              <Row
                label="IFSC"
                value={vba.ifsc}
                onCopy={() => copyText("ifsc", vba.ifsc)}
                copied={copied === "ifsc"}
                mono
              />
              {vba.upi_id && (
                <Row
                  label="UPI"
                  value={vba.upi_id}
                  onCopy={() => copyText("upi", vba.upi_id!)}
                  copied={copied === "upi"}
                  mono
                />
              )}
              <Row label="Beneficiary" value={vba.beneficiary_name ?? "—"} />
            </dl>
          ) : wallet.loading ? (
            <p className="mt-4 text-body-sm text-text-muted">Loading…</p>
          ) : (
            <div className="mt-4 rounded-md bg-surface-sunken p-4 text-body-sm text-text-muted">
              No virtual account provisioned yet. Add a verified bank account in
              your profile to generate one — it&rsquo;s how we attribute incoming
              transfers to your wallet.
            </div>
          )}
        </div>

        <aside className="lg:col-span-5 space-y-4">
          <StatCard
            label="Credits (visible)"
            value={fromPaise(lifetimeCredits)}
            unit={`${txs.length} txns`}
          />
          <StatCard label="Debits (visible)" value={fromPaise(lifetimeDebits)} />
        </aside>
      </section>

      {/* Instant top-up via Razorpay (preferred path) */}
      <InstantTopupSection
        onCredited={() => {
          void wallet.refresh();
          void transactions.refresh();
        }}
      />

      {/* Manual deposit-proof submission (alt path: bank transfer + admin approval) */}
      <AddFundsSection onCredited={() => void wallet.refresh()} />

      {/* Bank accounts & VBA provisioning */}
      <BankAccountsSection onProvisioned={() => void wallet.refresh()} />

      {/* Ledger */}
      <section className="mt-8 rounded-lg border border-border-subtle bg-surface-raised">
        <header className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
          <p className="text-micro text-text-muted">Append-only ledger</p>
          {transactions.loading && (
            <span className="text-caption text-text-muted">Loading…</span>
          )}
        </header>
        {transactions.error && (
          <p className="px-5 py-4 text-caption text-feedback-danger-text">
            {transactions.error}
          </p>
        )}
        {!transactions.loading && txs.length === 0 && !transactions.error && (
          <EmptyState
            icon={<Wallet className="h-5 w-5" />}
            title="No transactions yet"
            description="Top up via NEFT/IMPS or wait for your first commission/refund."
          />
        )}
        <ul className="divide-y divide-border-subtle numerics-tabular">
          {txs.map((t) => (
            <li key={t.id} className="flex items-center gap-4 px-5 py-3">
              <span
                className={
                  t.direction === "credit"
                    ? "inline-flex h-8 w-8 items-center justify-center rounded-full bg-feedback-success-bg text-feedback-success-text"
                    : "inline-flex h-8 w-8 items-center justify-center rounded-full bg-feedback-warning-bg text-feedback-warning-text"
                }
              >
                {t.direction === "credit" ? (
                  <ArrowDownLeft className="h-4 w-4" />
                ) : (
                  <ArrowUpRight className="h-4 w-4" />
                )}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-body-sm text-text-primary">
                  {KIND_LABEL[t.kind] ?? t.kind}
                  {t.note ? <span className="text-text-muted"> · {t.note}</span> : null}
                </p>
                <p className="text-caption text-text-muted">
                  {new Date(t.created_at).toLocaleString()} · balance {fromPaise(t.balance_after)} ({t.bucket})
                </p>
              </div>
              <Badge tone={t.direction === "credit" ? "success" : "warning"} size="xs">
                {t.direction}
              </Badge>
              <span className="w-28 text-right font-mono text-body-sm text-text-primary">
                {t.direction === "credit" ? "+" : "-"}{fromPaise(t.amount_inr)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Row({
  label,
  value,
  onCopy,
  copied,
  mono,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  copied?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-md bg-surface-sunken px-3 py-2">
      <div className="min-w-0">
        <p className="text-micro text-text-muted">{label}</p>
        <p className={"mt-0.5 text-body-md text-text-primary " + (mono ? "font-mono" : "")}>
          {value}
        </p>
      </div>
      {onCopy && (
        <Button size="xs" variant="tertiary" onClick={onCopy}>
          <Copy className="mr-1 h-3 w-3" />
          {copied ? "Copied" : "Copy"}
        </Button>
      )}
    </div>
  );
}
