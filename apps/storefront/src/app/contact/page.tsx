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
import { MapPin, Phone, Mail, FileText, ExternalLink } from "lucide-react";
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
                    <div className="mt-5 rounded-lg border border-border-subtle bg-surface-raised p-4">
                      <div className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-accent" />
                        <div>
                          <p className="text-body-md font-medium text-text-primary">
                            Visit us offline
                          </p>
                          <p className="mt-0.5 text-caption text-text-muted">
                            Drop by our {o.city} office — we&rsquo;d love to meet you.
                          </p>
                        </div>
                      </div>
                      <Button asChild size="sm" className="mt-3 w-full sm:w-auto">
                        <a href={o.maps} target="_blank" rel="noopener noreferrer">
                          <MapPin className="mr-1.5 h-4 w-4" aria-hidden />
                          Get directions
                          <ExternalLink className="ml-1.5 h-3.5 w-3.5" aria-hidden />
                        </a>
                      </Button>
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
