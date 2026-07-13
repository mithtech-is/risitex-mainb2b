"use client";

import * as React from "react";

export type ManualUpiValue = {
  upiTransactionId: string;
  paymentDate: string; // yyyy-mm-dd
  remarks: string;
  screenshotUrl: string | null;
};

/** Same rule as backend lib/payment.ts isValidUpiTransactionId. */
export function isValidUpiRef(v: string): boolean {
  const t = v.trim();
  return t.length >= 6 && t.length <= 40 && /^[A-Za-z0-9]+$/.test(t);
}

export function ManualUpiPanel({
  upiId,
  qrImageUrl,
  amountLabel,
  value,
  onChange,
  showErrors,
  onUploadScreenshot,
}: {
  upiId: string;
  qrImageUrl: string | null;
  amountLabel: string;
  value: ManualUpiValue;
  onChange: (v: ManualUpiValue) => void;
  showErrors: boolean;
  onUploadScreenshot?: (file: File) => Promise<string>;
}) {
  const [copied, setCopied] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);

  const refError =
    showErrors && !isValidUpiRef(value.upiTransactionId)
      ? "Enter the 6–40 character alphanumeric UPI reference."
      : "";

  const copyUpi = async () => {
    try {
      await navigator.clipboard.writeText(upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUploadScreenshot) return;
    setUploading(true);
    try {
      const url = await onUploadScreenshot(file);
      onChange({ ...value, screenshotUrl: url });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-raised p-5 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-5">
        <div className="shrink-0">
          {qrImageUrl ? (
            <img src={qrImageUrl} alt="RISITEX UPI QR" className="h-40 w-40 rounded-lg object-contain border border-border-subtle bg-white" />
          ) : (
            <div className="h-40 w-40 rounded-lg border border-dashed border-border-strong flex items-center justify-center text-center text-body-sm text-text-muted p-3">
              Official RISITEX QR will be uploaded soon.
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col gap-3">
          <div>
            <div className="text-body-sm text-text-muted">Pay to UPI ID</div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-body-md text-text-primary">{upiId}</span>
              <button type="button" onClick={() => void copyUpi()} className="text-body-sm underline text-text-secondary hover:text-text-primary">
                {copied ? "Copied" : "Copy UPI ID"}
              </button>
              {qrImageUrl ? (
                <a href={qrImageUrl} download className="text-body-sm underline text-text-secondary hover:text-text-primary">Download QR</a>
              ) : null}
            </div>
          </div>
          <div>
            <div className="text-body-sm text-text-muted">Amount to Pay</div>
            <div className="text-heading-sm font-semibold text-text-primary">{amountLabel}</div>
          </div>
          <p className="text-body-sm text-text-muted">
            Pay the exact amount above to this UPI ID from any UPI app, then enter your transaction reference below. Your order is placed immediately and confirmed once our team verifies the payment.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-body-sm text-text-secondary">UPI Transaction ID<span className="text-brand-accent">*</span></label>
          <input
            type="text"
            value={value.upiTransactionId}
            onChange={(e) => onChange({ ...value, upiTransactionId: e.target.value })}
            placeholder="e.g. 4471XXionXXXX"
            className="h-10 rounded-lg border border-border-subtle bg-surface-background px-3 text-body-md"
          />
          {refError ? <span className="text-caption text-red-500">{refError}</span> : null}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-body-sm text-text-secondary">Payment Date</label>
          <input
            type="date"
            value={value.paymentDate}
            onChange={(e) => onChange({ ...value, paymentDate: e.target.value })}
            className="h-10 rounded-lg border border-border-subtle bg-surface-background px-3 text-body-md"
          />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-body-sm text-text-secondary">Remarks (optional)</label>
          <textarea
            value={value.remarks}
            onChange={(e) => onChange({ ...value, remarks: e.target.value })}
            rows={2}
            className="rounded-lg border border-border-subtle bg-surface-background px-3 py-2 text-body-md"
          />
        </div>
        {onUploadScreenshot ? (
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-body-sm text-text-secondary">Upload Screenshot (optional)</label>
            <input type="file" accept="image/*" onChange={(e) => void handleFile(e)} className="text-body-sm" />
            {uploading ? <span className="text-caption text-text-muted">Uploading…</span> : null}
            {value.screenshotUrl ? <span className="text-caption text-green-600">Screenshot attached</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
