"use client";

import * as React from "react";
import { Upload, X } from "lucide-react";
import { cn } from "./utils";

export type FileUploadProps = {
  accept?: string;
  multiple?: boolean;
  /** Max size per file in bytes */
  maxSizeBytes?: number;
  /** Called whenever the selected file set changes */
  onFilesChange?: (files: File[]) => void;
  className?: string;
  disabled?: boolean;
  helperText?: string;
};

/**
 * FileUpload — drag-drop or click-to-browse. Returns the file list via
 * onFilesChange. Reading file contents (upload, progress) is the consumer's
 * job; this is a pure picker.
 */
export function FileUpload({
  accept,
  multiple,
  maxSizeBytes = 10 * 1024 * 1024,
  onFilesChange,
  className,
  disabled,
  helperText,
}: FileUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [files, setFiles] = React.useState<File[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const commit = React.useCallback(
    (next: File[]) => {
      setError(null);
      const oversized = next.find((f) => f.size > maxSizeBytes);
      if (oversized) {
        setError(
          `${oversized.name} is too large (max ${(maxSizeBytes / 1024 / 1024).toFixed(0)} MB).`,
        );
        return;
      }
      setFiles(next);
      onFilesChange?.(next);
    },
    [maxSizeBytes, onFilesChange],
  );

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const list = e.target.files;
    if (!list) return;
    commit(Array.from(list));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    commit(Array.from(e.dataTransfer.files));
  };

  const remove = (i: number) => {
    const next = files.filter((_, idx) => idx !== i);
    setFiles(next);
    onFilesChange?.(next);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center",
          "transition-colors duration-fast ease-standard",
          dragging
            ? "border-brand-accent bg-brand-accent-surface"
            : "border-border-strong bg-surface-raised hover:bg-surface-sunken",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <Upload className="h-6 w-6 text-text-muted" />
        <p className="text-body-md text-text-primary">
          <span className="font-medium">Click to upload</span> or drag and drop
        </p>
        {helperText && (
          <p className="text-caption text-text-muted">{helperText}</p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={handleChange}
          className="sr-only"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="text-body-sm text-feedback-danger-text"
        >
          {error}
        </p>
      )}

      {files.length > 0 && (
        <ul className="flex flex-col gap-1">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="flex items-center justify-between rounded-md bg-surface-sunken px-3 py-2 text-body-sm text-text-primary"
            >
              <span className="truncate">
                {file.name}{" "}
                <span className="text-text-muted">
                  ({(file.size / 1024).toFixed(0)} KB)
                </span>
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove ${file.name}`}
                className="text-text-muted hover:text-feedback-danger-text transition-colors duration-fast"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
