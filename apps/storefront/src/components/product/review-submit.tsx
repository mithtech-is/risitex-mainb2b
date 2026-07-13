"use client";

import * as React from "react";
import { Button, Input, Textarea } from "@risitex/ui/components";
import { Star } from "lucide-react";
import { MEDUSA_BASE_URL } from "@/lib/medusa";
import { getCurrentCustomer } from "@/lib/auth";

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

export function ReviewSubmit({
  productId,
  onSubmitted,
}: {
  productId: string;
  onSubmitted?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [rating, setRating] = React.useState(0);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
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
    if (rating < 1) {
      setErrorMsg("Please select a rating.");
      return;
    }
    setStatus("sending");
    setErrorMsg(null);
    try {
      const res = await fetch(`${MEDUSA_BASE_URL}/store/product-reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": PUB_KEY,
        },
        body: JSON.stringify({
          product_id: productId,
          customer_name: name.trim(),
          customer_email: email.trim(),
          rating,
          title: title.trim() || undefined,
          body: body.trim(),
        }),
      });
      if (!res.ok) {
        setErrorMsg("Failed to submit review. Please try again.");
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
        Write a review
      </Button>

      {open && status !== "sent" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border-subtle bg-surface-background p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-heading-sm text-text-primary">Write a review</h3>
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
              <div>
                <p className="text-body-sm text-text-muted mb-1">Rating *</p>
                <div className="flex gap-1" role="radiogroup" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="rounded-sm p-0.5 transition-transform hover:scale-110"
                      aria-label={`${star} star${star === 1 ? "" : "s"}`}
                      aria-pressed={star <= rating}
                    >
                      <Star
                        className={`h-6 w-6 ${
                          star <= rating
                            ? "fill-current text-ochre-500"
                            : "text-border-strong"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="text-body-sm text-text-muted">Title (optional)</span>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.currentTarget.value)}
                  className="mt-1"
                />
              </label>
              <label className="block">
                <span className="text-body-sm text-text-muted">Review *</span>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.currentTarget.value)}
                  rows={4}
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
                  Submit review
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
              Thanks — your review is now live and visible to everyone.
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
