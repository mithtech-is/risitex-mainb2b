"use client";

import * as React from "react";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Label,
} from "@risitex/ui/components";
import { Building2, Plus, Trash2, Star, ShieldCheck } from "lucide-react";
import {
  addBankAccount,
  fetchBankAccounts,
  removeBankAccount,
  setPrimaryBankAccount,
  type BankAccount,
} from "@/lib/wallet";

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export function BankAccountsSection({
  onProvisioned,
}: {
  /** Fires when a new bank addition triggers VBA provisioning so the parent
   *  wallet page can re-fetch its VBA details. */
  onProvisioned?: () => void;
}) {
  const [banks, setBanks] = React.useState<BankAccount[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isAdding, setIsAdding] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBankAccounts();
      setBanks(data.bank_accounts ?? []);
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

  const isAuthErr = !!error && /401/.test(error);
  if (isAuthErr) return null;

  return (
    <section className="mt-8 rounded-lg border border-border-subtle bg-surface-raised">
      <header className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
        <div>
          <p className="text-micro text-text-muted">Linked bank accounts</p>
          <p className="mt-0.5 text-caption text-text-muted">
            Adding your first bank auto-provisions your wallet&rsquo;s virtual
            account for NEFT/IMPS top-up.
          </p>
        </div>
        {!isAdding && (
          <Button size="sm" onClick={() => setIsAdding(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add bank
          </Button>
        )}
      </header>

      {isAdding && (
        <AddBankForm
          onCancel={() => setIsAdding(false)}
          onSaved={async () => {
            setIsAdding(false);
            await load();
            onProvisioned?.();
          }}
        />
      )}

      {error && !isAdding && (
        <div className="px-5 py-3 text-caption text-feedback-danger-text">
          {error}
        </div>
      )}

      {loading ? (
        <p className="px-5 py-4 text-body-sm text-text-muted">Loading…</p>
      ) : !banks || banks.length === 0 ? (
        !isAdding && (
          <EmptyState
            icon={<Building2 className="h-5 w-5" />}
            title="No bank accounts linked"
            description="Add one to enable NEFT/IMPS deposits and future withdrawals."
          />
        )
      ) : (
        <ul className="divide-y divide-border-subtle numerics-tabular">
          {banks.map((b) => (
            <BankRow key={b.id} bank={b} onChange={load} />
          ))}
        </ul>
      )}
    </section>
  );
}

function BankRow({
  bank,
  onChange,
}: {
  bank: BankAccount;
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  const makePrimary = async () => {
    setBusy(true);
    try {
      await setPrimaryBankAccount(bank.id);
      await onChange();
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(`Remove ${bank.bank_name ?? "this bank"}?`)) return;
    setBusy(true);
    try {
      await removeBankAccount(bank.id);
      await onChange();
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="flex items-center gap-4 px-5 py-3">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-sunken text-text-secondary">
        <Building2 className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-body-sm font-medium text-text-primary">
          {bank.account_holder_name}{" "}
          {bank.is_primary && (
            <Badge tone="accent" size="xs" className="ml-2 align-middle">
              <Star className="mr-0.5 h-3 w-3" />
              Primary
            </Badge>
          )}
        </p>
        <p className="text-caption text-text-muted font-mono">
          {bank.bank_name ? `${bank.bank_name} · ` : ""}••••{bank.account_number_last4} · {bank.ifsc}
        </p>
      </div>
      <Badge tone="success" size="xs" className="hidden sm:inline-flex">
        <ShieldCheck className="mr-0.5 h-3 w-3" />
        Active
      </Badge>
      {!bank.is_primary && (
        <Button size="xs" variant="tertiary" onClick={makePrimary} disabled={busy}>
          Set primary
        </Button>
      )}
      <Button size="xs" variant="tertiary" onClick={remove} disabled={busy}>
        <Trash2 className="h-3 w-3" />
      </Button>
    </li>
  );
}

function AddBankForm({
  onCancel,
  onSaved,
}: {
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [holder, setHolder] = React.useState("");
  const [accountNumber, setAccountNumber] = React.useState("");
  const [ifsc, setIfsc] = React.useState("");
  const [bankName, setBankName] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const ifscOk = IFSC_RE.test(ifsc.trim().toUpperCase());
  const accountOk = /^[0-9]{6,18}$/.test(accountNumber.trim());
  const formOk = holder.trim().length >= 2 && accountOk && ifscOk;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formOk) return;
    setSubmitting(true);
    setError(null);
    try {
      await addBankAccount({
        account_holder_name: holder.trim(),
        account_number: accountNumber.trim(),
        ifsc: ifsc.trim().toUpperCase(),
        bank_name: bankName.trim() || undefined,
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
          <Label size="caption">Account holder name</Label>
          <Input
            value={holder}
            onChange={(e) => setHolder(e.currentTarget.value)}
            placeholder="As on the bank passbook"
            required
            autoFocus
          />
        </div>
        <div>
          <Label size="caption">Bank name (optional)</Label>
          <Input
            value={bankName}
            onChange={(e) => setBankName(e.currentTarget.value)}
            placeholder="HDFC Bank"
          />
        </div>
        <div>
          <Label size="caption">Account number</Label>
          <Input
            inputMode="numeric"
            value={accountNumber}
            onChange={(e) =>
              setAccountNumber(e.currentTarget.value.replace(/\D/g, "").slice(0, 18))
            }
            placeholder="6 – 18 digits"
            maxLength={18}
            required
            className="font-mono"
          />
          {accountNumber && !accountOk && (
            <p className="mt-1 text-caption text-feedback-danger-text">
              Account number must be 6–18 digits.
            </p>
          )}
        </div>
        <div>
          <Label size="caption">IFSC code</Label>
          <Input
            value={ifsc}
            onChange={(e) => setIfsc(e.currentTarget.value.toUpperCase())}
            placeholder="HDFC0001234"
            maxLength={11}
            required
            className="font-mono uppercase tracking-wider"
          />
          {ifsc && !ifscOk && (
            <p className="mt-1 text-caption text-feedback-danger-text">
              Format: 4 letters · 0 · 6 chars (e.g. HDFC0001234)
            </p>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-md bg-feedback-danger-bg px-3 py-2 text-caption text-feedback-danger-text">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button type="submit" size="sm" isLoading={submitting} disabled={!formOk}>
          Add bank account
        </Button>
        <Button type="button" size="sm" variant="tertiary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
