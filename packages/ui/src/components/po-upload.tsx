"use client";

import * as React from "react";
import { FileText, CheckCircle2 } from "lucide-react";
import { FileUpload } from "./file-upload";
import { Input } from "./input";
import { Label } from "./label";
import { DatePicker } from "./date-picker";
import { cn } from "./utils";

export type PurchaseOrderDraft = {
  poNumber: string;
  poDate: string;
  files: File[];
};

export type PoUploadProps = {
  value: PurchaseOrderDraft;
  onChange: (next: PurchaseOrderDraft) => void;
  className?: string;
};

/**
 * PO Upload — B2B checkout step where the buyer attaches a Purchase Order
 * document. Captures PO number, PO date, and the PDF/image attachment.
 */
export function PoUpload({ value, onChange, className }: PoUploadProps) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border-subtle bg-surface-raised p-6",
        className,
      )}
    >
      <header className="mb-5 flex items-center gap-2">
        <FileText className="h-4 w-4 text-text-muted" />
        <p className="text-micro text-text-muted">Purchase order</p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="po-no" required>
            PO number
          </Label>
          <Input
            id="po-no"
            value={value.poNumber}
            onChange={(e) =>
              onChange({ ...value, poNumber: e.currentTarget.value })
            }
            placeholder="e.g. PO-25-Q3-00184"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="po-date" required>
            PO date
          </Label>
          <DatePicker
            id="po-date"
            value={value.poDate}
            onValueChange={(v) => onChange({ ...value, poDate: v })}
          />
        </div>
      </div>

      <div className="mt-4">
        <Label className="mb-1.5">Attach PO document</Label>
        <FileUpload
          accept="application/pdf,image/png,image/jpeg"
          multiple={false}
          maxSizeBytes={5 * 1024 * 1024}
          onFilesChange={(files) => onChange({ ...value, files })}
          helperText="PDF, PNG, or JPG · max 5 MB"
        />
      </div>

      {value.files.length > 0 && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-caption text-feedback-success-text">
          <CheckCircle2 className="h-3.5 w-3.5" />
          PO attached — order will release on PO approval.
        </p>
      )}
    </section>
  );
}
