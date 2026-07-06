"use client";

import * as React from "react";
import {
  Button,
  Input,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@risitex/ui/components";
import { MapPin, Phone, Mail, FileText, ArrowUpRight, Navigation } from "lucide-react";
import { Container } from "@/components/site/container";
import { MEDUSA_BASE_URL } from "@/lib/medusa";
import { COMPANY } from "@/lib/company";

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

const OFFICES = [
  {
    city: COMPANY.city,
    address: COMPANY.address,
    phone: COMPANY.phone,
    email: COMPANY.email,
    gstin: COMPANY.gstin,
    maps: COMPANY.mapsUrl,
  },
];

const TOPICS = [
  { value: "general", label: "General enquiry" },
  { value: "wholesale", label: "Wholesale account" },
  { value: "distributor", label: "Distributor partnership" },
  { value: "press", label: "Press / PR" },
  { value: "support", label: "Order support" },
];

export default function ContactPage() {
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    topic: "general",
    message: "",
  });
  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.message.trim().length < 10) {
      setError("Please add a little more detail (at least 10 characters).");
      return;
    }
    setSubmitting(true);
    try {
      const topicLabel =
        TOPICS.find((t) => t.value === form.topic)?.label ?? form.topic;
      const message = form.company.trim()
        ? `[Company: ${form.company.trim()}]\n${form.message.trim()}`
        : form.message.trim();
      const res = await fetch(`${MEDUSA_BASE_URL}/store/contact`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": PUB_KEY,
        },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          subject: topicLabel,
          message,
        }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(b.message ?? `Couldn't send (${res.status}).`);
      }
      setSubmitted(true);
    } catch (err) {
      setError((err as Error).message || "Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Container>
        <header className="border-b border-border-subtle py-16 md:py-20">
          <p className="text-micro text-text-muted">Contact</p>
          <h1 className="mt-3 font-display text-display-xl text-text-primary">
            We reply within a business day.
          </h1>
          <p className="mt-4 max-w-prose text-body-lg text-text-secondary">
            For order support, use the form below. For wholesale or
            distributor partnerships, the form routes directly to our trade
            team.
          </p>
        </header>
      </Container>

      <section className="py-16">
        <Container>
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
            {/* Form */}
            <div className="lg:col-span-7">
              {submitted ? (
                <div className="rounded-lg border border-border-subtle bg-surface-raised p-8 text-center">
                  <p className="text-micro text-text-muted">Sent</p>
                  <h2 className="mt-2 font-display text-heading-xl text-text-primary">
                    Thanks — we&rsquo;ll be in touch.
                  </h2>
                  <p className="mt-3 text-body-md text-text-secondary">
                    You should see a reply in your inbox within one business
                    day.
                  </p>
                </div>
              ) : (
                <form onSubmit={submit} className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <Field label="Your name" required>
                    <Input
                      required
                      autoComplete="name"
                      value={form.name}
                      onChange={(e) => set("name", e.currentTarget.value)}
                    />
                  </Field>
                  <Field label="Company">
                    <Input
                      autoComplete="organization"
                      value={form.company}
                      onChange={(e) => set("company", e.currentTarget.value)}
                    />
                  </Field>
                  <Field label="Email" required>
                    <Input
                      type="email"
                      required
                      autoComplete="email"
                      value={form.email}
                      onChange={(e) => set("email", e.currentTarget.value)}
                    />
                  </Field>
                  <Field label="Phone">
                    <Input
                      type="tel"
                      autoComplete="tel"
                      value={form.phone}
                      onChange={(e) => set("phone", e.currentTarget.value)}
                    />
                  </Field>
                  <Field label="Topic" required className="md:col-span-2">
                    <Select
                      value={form.topic}
                      onValueChange={(v) => set("topic", v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TOPICS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Message" required className="md:col-span-2">
                    <Textarea
                      required
                      rows={6}
                      value={form.message}
                      onChange={(e) => set("message", e.currentTarget.value)}
                      placeholder="Tell us about what you're looking for, your timeline, and rough volumes."
                    />
                  </Field>

                  {error && (
                    <p className="md:col-span-2 rounded-md bg-feedback-danger-bg px-3 py-2 text-body-sm text-feedback-danger-text ring-1 ring-feedback-danger-border">
                      {error}
                    </p>
                  )}

                  <div className="md:col-span-2">
                    <Button type="submit" isLoading={submitting} size="lg">
                      Send message
                    </Button>
                  </div>
                </form>
              )}
            </div>

            {/* Offices */}
            <aside className="lg:col-span-5">
              <h2 className="text-heading-md text-text-primary">Where we are</h2>
              <ul className="mt-6 space-y-8">
                {OFFICES.map((o) => (
                  <li key={o.city} className="border-l-2 border-border-strong pl-4">
                    <h3 className="text-body-lg font-medium text-text-primary">
                      {o.city}
                    </h3>
                    <ul className="mt-3 space-y-2 text-body-md text-text-secondary">
                      <li className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                        {o.address}
                      </li>
                      <li className="flex items-start gap-2">
                        <Phone className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                        <a href={`tel:${o.phone.replace(/\s+/g, "")}`} className="hover:text-text-primary transition-colors duration-fast">
                          {o.phone}
                        </a>
                      </li>
                      <li className="flex items-start gap-2">
                        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                        <a href={`mailto:${o.email}`} className="hover:text-text-primary transition-colors duration-fast">
                          {o.email}
                        </a>
                      </li>
                      <li className="flex items-start gap-2">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                        <span>GSTIN: {o.gstin}</span>
                      </li>
                    </ul>

                    {/* Visit us offline — map CTA */}
                    <div className="group mt-5 overflow-hidden rounded-xl border border-border-subtle bg-surface-raised shadow-sm transition-shadow duration-fast hover:shadow-md">
                      {/* Header with a subtle map-grid backdrop */}
                      <div className="relative flex items-center gap-3 border-b border-border-subtle bg-gradient-to-br from-brand-accent/10 via-surface-raised to-surface-raised px-4 py-4">
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-0 opacity-[0.06]"
                          style={{
                            backgroundImage:
                              "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
                            backgroundSize: "16px 16px",
                            color: "var(--brand-accent, #2A3F7A)",
                          }}
                        />
                        <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-accent/15 text-brand-accent ring-1 ring-brand-accent/25">
                          <MapPin className="h-5 w-5" aria-hidden />
                        </span>
                        <div className="relative min-w-0">
                          <p className="text-heading-sm font-semibold text-text-primary">
                            Visit us offline
                          </p>
                          <p className="text-caption text-text-muted">
                            Walk-ins welcome at our {o.city} office
                          </p>
                        </div>
                      </div>
                      {/* Body */}
                      <div className="px-4 py-4">
                        <p className="text-body-sm text-text-secondary">
                          Prefer to meet in person? Come see the range and talk
                          volumes face-to-face.
                        </p>
                        <Button asChild className="mt-4 w-full justify-center gap-2">
                          <a href={o.maps} target="_blank" rel="noopener noreferrer">
                            <Navigation className="h-4 w-4" aria-hidden />
                            Get directions
                            <ArrowUpRight
                              className="h-4 w-4 transition-transform duration-fast group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                              aria-hidden
                            />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </Container>
      </section>
    </>
  );
}

function Field({
  label,
  children,
  required,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <Label required={required}>{label}</Label>
      {children}
    </div>
  );
}
