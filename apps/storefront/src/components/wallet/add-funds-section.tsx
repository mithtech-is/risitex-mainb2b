"use client";

import * as React from "react";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Label,
  Textarea,
  formatINR,
} from "@risitex/ui/components";
import { CircleDollarSign, Clock } from "lucide-react";
import {
  fetchBankAccounts,
  fetchDepositProofs,
  submitDepositProof,
  type DepositProof,
} from "@/lib/wallet";

/**
 * "Add funds" panel for the wallet page.
 *
 * Flow (matches the user's spec — manual admin verification):
 *   1. Customer enters the amount they transferred via NEFT/IMPS/UPI.
 *   2. (Optional) UTR + a short note.
 *   3. Submits → POST /store/wallet/deposit-proof
 *   4. Admin reviews in /app/deposit-proofs and credits the wallet.
 *
 * Pending submissions are listed below so the customer can see the
 * approval queue and status.
 */
export function AddFundsSection({
  onCredited,
}: {
  /** Called after admin approves a deposit so the wallet page re-fetches
   *  the balance (we poll the list when the panel re-opens). */
  onCredited?: () => void;
}) {
  const [proofs, setProofs] = React.useState<DepositProof[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isAdding, setIsAdding] = React.useState(false);
  const [needsBank, setNeedsBank] = React.useState(false);
  const [checkingBank, setCheckingBank] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDepositProofs();
      setProofs(data.deposit_proofs ?? []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Gate "add funds" on having a bank account on file. Checked live on click
  // so adding a bank in the section below takes effect without a reload.
  const startDeposit = React.useCallback(async () => {
    setCheckingBank(true);
    try {
      const data = await fetchBankAccounts();
      if ((data.bank_accounts ?? []).length === 0) {
        setNeedsBank(true);
        return;
      }
      setNeedsBank(false);
      setIsAdding(true);
    } catch {
      // Can't verify (e.g. transient error) — let them proceed rather than
      // wrongly block; the deposit still goes through admin review.
      setNeedsBank(false);
      setIsAdding(true);
    } finally {
      setCheckingBank(false);
    }
  }, []);

  const isAuthErr = !!error && /401/.test(error);
  if (isAuthErr) return null;

  const pendingCount = proofs?.filter((p) => p.status === "pending").length ?? 0;

  return (
    <section className="mt-8 rounded-lg border border-border-subtle bg-surface-raised">
      <header className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
        <div>
          <p className="text-micro text-text-muted">Add funds</p>
          <p className="mt-0.5 text-caption text-text-muted">
            Transfer to our account, then submit the details — finance team
            credits within 1 business day.
          </p>
        </div>
        {!isAdding && (
          <Button size="sm" onClick={startDeposit} isLoading={checkingBank}>
            <CircleDollarSign className="mr-1 h-3.5 w-3.5" />
            Submit deposit
          </Button>
        )}
      </header>

      {needsBank && !isAdding && (
        <div className="border-b border-border-subtle bg-feedback-warning-bg px-5 py-3 text-body-sm text-feedback-warning-text">
          Add your bank details to proceed — link a bank account in the{" "}
          <strong>Linked bank accounts</strong> section below before adding
          funds to your wallet.
        </div>
      )}

      {isAdding && (
        <AddFundsForm
          onCancel={() => setIsAdding(false)}
          onSaved={async () => {
            setIsAdding(false);
            await load();
            onCredited?.();
          }}
        />
      )}

      {loading ? (
        <p className="px-5 py-4 text-body-sm text-text-muted">Loading…</p>
      ) : !proofs || proofs.length === 0 ? (
        !isAdding && (
          <EmptyState
            icon={<CircleDollarSign className="h-5 w-5" />}
            title="No deposits yet"
            description="When you submit a deposit it appears here with the approval status."
          />
        )
      ) : (
        <ul className="divide-y divide-border-subtle numerics-tabular">
          {pendingCount > 0 && (
            <li className="bg-feedback-warning-bg px-5 py-2 text-caption text-feedback-warning-text">
              {pendingCount} deposit{pendingCount === 1 ? "" : "s"} pending
              admin approval.
            </li>
          )}
          {proofs.map((p) => (
            <DepositRow key={p.id} proof={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DepositRow({ proof }: { proof: DepositProof }) {
  return (
    <li className="flex items-center gap-4 px-5 py-3">
      <span
        className={
          proof.status === "approved"
            ? "inline-flex h-9 w-9 items-center justify-center rounded-full bg-feedback-success-bg text-feedback-success-text"
            : proof.status === "rejected"
              ? "inline-flex h-9 w-9 items-center justify-center rounded-full bg-feedback-danger-bg text-feedback-danger-text"
              : "inline-flex h-9 w-9 items-center justify-center rounded-full bg-feedback-warning-bg text-feedback-warning-text"
        }
      >
        <Clock className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-body-sm font-medium text-text-primary">
          {formatINR(proof.claimed_amount_inr / 100)}
          {proof.credited_amount_inr != null && (
            <span className="ml-2 text-caption text-feedback-success-text">
              · credited {formatINR(proof.credited_amount_inr / 100)}
            </span>
          )}
        </p>
        <p className="text-caption text-text-muted">
          {proof.utr ? <>UTR <span className="font-mono">{proof.utr}</span> · </> : null}
          submitted {new Date(proof.created_at).toLocaleString()}
        </p>
        {proof.customer_note && (
          <p className="mt-0.5 text-caption text-text-muted truncate">
            “{proof.customer_note}”
          </p>
        )}
      </div>
      <Badge
        tone={
          proof.status === "approved"
            ? "success"
            : proof.status === "rejected"
              ? "danger"
              : "warning"
        }
        size="xs"
      >
        {proof.status}
      </Badge>
    </li>
  );
}

function AddFundsForm({
  onCancel,
  onSaved,
}: {
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [amount, setAmount] = React.useState("");
  const [utr, setUtr] = React.useState("");
  const [note, setNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const amountPaise = Math.round(Number(amount) * 100);
  const amountOk =
    Number.isFinite(amountPaise) && amountPaise >= 100 && amountPaise <= 100_000_000;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amountOk) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitDepositProof({
        claimed_amount_inr: amountPaise,
        utr: utr.trim() || undefined,
        customer_note: note.trim() || undefined,
      });
      await onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-b border-border-subtle bg-surface-sunken px-5 py-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label size="caption">Amount (₹)</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.currentTarget.value)}
            placeholder="e.g. 500"
            min={1}
            required
            autoFocus
            className="font-mono numerics-tabular"
          />
          <p className="mt-1 text-caption text-text-muted">
            Minimum ₹1. Max per submission ₹10,00,000.
          </p>
        </div>
        <div>
          <Label size="caption">UTR / Reference (optional)</Label>
          <Input
            value={utr}
            onChange={(e) => setUtr(e.currentTarget.value)}
            placeholder="From your bank confirmation"
            maxLength={64}
            className="font-mono"
          />
        </div>
        <div className="md:col-span-2">
          <Label size="caption">Note (optional)</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
            rows={2}
            maxLength={1000}
            placeholder="Anything the finance team should know — sender bank, intended use, etc."
          />
        </div>
      </div>

      <p className="mt-3 rounded-md bg-surface-raised p-3 text-caption text-text-muted">
        After submitting, e-mail your transfer screenshot to{" "}
        <a
          className="text-text-primary underline-offset-4 hover:underline"
          href="mailto:risitexindia@gmail.com"
        >
          risitexindia@gmail.com
        </a>{" "}
        — the team verifies the inflow and credits your wallet manually.
      </p>

      {error && (
        <p className="mt-3 rounded-md bg-feedback-danger-bg px-3 py-2 text-caption text-feedback-danger-text">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button type="submit" size="sm" isLoading={submitting} disabled={!amountOk}>
          Submit for approval
        </Button>
        <Button type="button" size="sm" variant="tertiary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
