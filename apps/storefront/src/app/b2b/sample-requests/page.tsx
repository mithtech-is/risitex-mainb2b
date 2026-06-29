"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  Button,
  Input,
  Label,
  PageHeader,
  Textarea,
} from "@risitex/ui/components";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000";
const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

/**
 * /b2b/sample-requests
 *
 * Single-page sample request form. POSTs to /store/contact with a structured
 * subject (`[Sample Request] <product>`) and message body so ops can triage
 * via the existing contact-submission admin view. Pre-fills `product` from
 * the PDP CTA's query param.
 */
export default function SampleRequestPage() {
  const params = useSearchParams();
  const prefilledProduct = params?.get("product") ?? "";
  const [form, setForm] = React.useState({
    product: prefilledProduct,
    quantity: "12",
    sizes: "",
    colours: "",
    delivery_address: "",
    name: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [status, setStatus] = React.useState<
    "idle" | "submitting" | "sent" | "error"
  >("idle");
  const [error, setError] = React.useState<string | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.product || !form.name || !form.email || !form.delivery_address) {
      setError(
        "Please fill product, your name, email, and delivery address — those are required.",
      );
      return;
    }
    setStatus("submitting");
    const subject = `[Sample Request] ${form.product}`;
    const message = [
      `Product:           ${form.product}`,
      `Quantity:          ${form.quantity || "—"}`,
      `Sizes:             ${form.sizes || "—"}`,
      `Colours:           ${form.colours || "—"}`,
      `Delivery address:  ${form.delivery_address}`,
      `Phone:             ${form.phone || "—"}`,
      ``,
      `Notes:`,
      form.notes || "(none)",
    ].join("\n");
    try {
      const res = await fetch(`${BACKEND_URL}/store/contact`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": PUB_KEY,
        },
        credentials: "include",
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone || "",
          subject,
          message,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        setError(j.message ?? `Request failed (${res.status})`);
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setError("Network error — please retry.");
      setStatus("error");
    }
  };

  if (status === "sent") {
    return (
      <>
        <PageHeader
          title="Sample request received"
          description="Our wholesale team will email you within 1 business day with availability and dispatch ETA."
        />
        <section className="mt-6 rounded-md border border-feedback-success-border bg-feedback-success-bg p-5 text-feedback-success-text">
          <p className="text-body-md">
            Reference subject:{" "}
            <span className="font-mono">[Sample Request] {form.product}</span>
          </p>
          <p className="mt-2 text-body-sm">
            All sample requests are tracked under your company GSTIN. You can
            place another below or return to the catalogue.
          </p>
          <div className="mt-4 flex gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setStatus("idle");
                setForm((f) => ({ ...f, notes: "", sizes: "", colours: "" }));
              }}
            >
              Submit another
            </Button>
            <Button asChild variant="ghost">
              <a href="/wholesale/catalogue">Back to catalogue</a>
            </Button>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Sample requests"
        description="Request a free sample before bulk confirmation. Sizes, colours, and delivery details below — our team replies within 1 business day."
      />

      <form onSubmit={submit} className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor="product" required>
            Product
          </Label>
          <Input
            id="product"
            value={form.product}
            onChange={(e) => set("product", e.currentTarget.value)}
            placeholder="e.g. PIX Pyjama Set"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quantity">Quantity</Label>
          <Input
            id="quantity"
            type="number"
            min={1}
            value={form.quantity}
            onChange={(e) => set("quantity", e.currentTarget.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sizes">Sizes</Label>
          <Input
            id="sizes"
            value={form.sizes}
            onChange={(e) => set("sizes", e.currentTarget.value)}
            placeholder="S, M, L"
          />
        </div>

        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor="colours">Colours</Label>
          <Input
            id="colours"
            value={form.colours}
            onChange={(e) => set("colours", e.currentTarget.value)}
            placeholder="Natural, Indigo"
          />
        </div>

        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor="delivery_address" required>
            Delivery address
          </Label>
          <Textarea
            id="delivery_address"
            value={form.delivery_address}
            onChange={(e) => set("delivery_address", e.currentTarget.value)}
            rows={3}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name" required>
            Contact name
          </Label>
          <Input
            id="name"
            autoComplete="name"
            value={form.name}
            onChange={(e) => set("name", e.currentTarget.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email" required>
            Email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => set("email", e.currentTarget.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            inputMode="numeric"
            value={form.phone}
            onChange={(e) => set("phone", e.currentTarget.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={form.notes}
            onChange={(e) => set("notes", e.currentTarget.value)}
            rows={4}
            placeholder="GSM preference, washing care expectations, any product variants of interest."
          />
        </div>

        {error && (
          <p
            role="alert"
            className="md:col-span-2 rounded-md bg-feedback-danger-bg px-3 py-2 text-body-sm text-feedback-danger-text ring-1 ring-feedback-danger-border"
          >
            {error}
          </p>
        )}

        <div className="md:col-span-2">
          <Button type="submit" isLoading={status === "submitting"} size="lg">
            Submit sample request
          </Button>
          <p className="mt-3 text-caption text-text-muted">
            Samples are dispatched once your GSTIN is on file. Charges are
            credited back to your wallet on bulk confirmation.
          </p>
        </div>
      </form>
    </>
  );
}
