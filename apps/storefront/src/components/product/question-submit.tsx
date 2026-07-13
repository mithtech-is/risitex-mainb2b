"use client";

import * as React from "react";
import { Button, Input, Textarea } from "@risitex/ui/components";
import { MEDUSA_BASE_URL } from "@/lib/medusa";
import { getCurrentCustomer } from "@/lib/auth";

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

export function QuestionSubmit({
  productId,
  onSubmitted,
}: {
  productId: string;
  onSubmitted?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [question, setQuestion] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    getCurrentCustomer().then((customer) => {
      if (customer) {
        setName(customer.first_name ?? customer.email ?? "");
        setEmail(customer.email ?? "");
      }
    }).catch(() => {});
  }, []);

  const submit = async () => {
    setStatus("sending");
    setErrorMsg(null);
    try {
      const res = await fetch(`${MEDUSA_BASE_URL}/store/product-questions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": PUB_KEY,
        },
        body: JSON.stringify({
          product_id: productId,
          customer_name: name.trim(),
          customer_email: email.trim(),
          question: question.trim(),
        }),
      });
      if (!res.ok) {
        setErrorMsg("Failed to submit question. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("sent");
      onSubmitted?.();
    } catch {
      setErrorMsg("Network error — please retry.");
      setStatus("error");
    }
  };

  return (
    <div>
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={() => setOpen(true)}
        className="bg-text-primary text-surface-background hover:bg-text-primary hover:opacity-90 active:bg-text-primary"
      >
        Ask a question
      </Button>

      {open && status !== "sent" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border-subtle bg-surface-background p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-heading-sm text-text-primary">Ask a question</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-text-muted hover:text-text-primary"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="space-y-3"
            >
              <label className="block">
                <span className="text-body-sm text-text-muted">Your name *</span>
                <Input
                  value={name}
                  onChange={(e) => setName(e.currentTarget.value)}
                  required
                  className="mt-1"
                />
              </label>
              <label className="block">
                <span className="text-body-sm text-text-muted">Email *</span>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                  required
                  className="mt-1"
                />
              </label>
              <label className="block">
                <span className="text-body-sm text-text-muted">Your question *</span>
                <Textarea
                  value={question}
                  onChange={(e) => setQuestion(e.currentTarget.value)}
                  rows={3}
                  required
                  className="mt-1"
                />
              </label>
              {errorMsg && (
                <p role="alert" className="text-caption text-feedback-danger-text">
                  {errorMsg}
                </p>
              )}
              <div className="flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={status === "sending"}>
                  Submit
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {open && status === "sent" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-feedback-success-border bg-feedback-success-bg p-6 shadow-lg">
            <p className="text-body-sm text-feedback-success-text">
              Thanks — your question is now posted for everyone to see. We&apos;ll
              add an answer soon.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => {
                setOpen(false);
                setStatus("idle");
              }}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
