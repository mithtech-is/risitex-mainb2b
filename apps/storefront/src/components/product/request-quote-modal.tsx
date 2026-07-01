"use client";

import * as React from "react";
import { Button, Input, Textarea } from "@risitex/ui/components";
import { MEDUSA_BASE_URL } from "@/lib/medusa";
import { getCurrentCustomer } from "@/lib/auth";

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

export function RequestQuoteModal({
  productSlug,
  productName,
}: {
  productSlug: string;
  productName: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [message, setMessage] = React.useState("");
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
      const res = await fetch(`${MEDUSA_BASE_URL}/store/contact`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": PUB_KEY,
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          subject: `Quote request: ${productName} (${productSlug})`,
          message: [
            `Product: ${productName} (${productSlug})`,
            company ? `Company: ${company}` : null,
            quantity ? `Quantity: ${quantity}` : null,
            "",
            message.trim(),
          ]
            .filter(Boolean)
            .join("\n"),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body?.message ?? "Failed to send. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setErrorMsg("Network error — please retry.");
      setStatus("error");
    }
  };

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        Request quote
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-surface-background p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-heading-sm text-text-primary">
                Request quote — {productName}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-text-muted hover:text-text-primary"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {status === "sent" ? (
              <div className="rounded-md border border-feedback-success-border bg-feedback-success-bg p-4">
                <p className="text-body-md text-feedback-success-text">
                  Quote request sent. Our team will reach out within 24 hours.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-3"
                  onClick={() => {
                    setOpen(false);
                    setStatus("idle");
                  }}
                >
                  Close
                </Button>
              </div>
            ) : (
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
                  <span className="text-body-sm text-text-muted">Phone</span>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.currentTarget.value)}
                    className="mt-1"
                  />
                </label>
                <label className="block">
                  <span className="text-body-sm text-text-muted">Company</span>
                  <Input
                    value={company}
                    onChange={(e) => setCompany(e.currentTarget.value)}
                    className="mt-1"
                  />
                </label>
                <label className="block">
                  <span className="text-body-sm text-text-muted">Estimated quantity (pcs)</span>
                  <Input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.currentTarget.value)}
                    className="mt-1"
                  />
                </label>
                <label className="block">
                  <span className="text-body-sm text-text-muted">Message / requirements</span>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.currentTarget.value)}
                    rows={3}
                    className="mt-1"
                  />
                </label>
                {errorMsg && (
                  <p role="alert" className="text-caption text-feedback-danger-text">
                    {errorMsg}
                  </p>
                )}
                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    isLoading={status === "sending"}
                  >
                    Send request
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
