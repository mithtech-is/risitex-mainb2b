"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  GSTINInput,
  Input,
  Label,
  PasswordInput,
  Textarea,
} from "@risitex/ui/components";
import { Container } from "@/components/site/container";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { medusa } from "@/lib/medusa";
import { getWholesaleApplicationStatus } from "@/lib/verification";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000";
const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

/**
 * Ensure the applicant has an account secured with this password (FR-1.02):
 *  - New email      → register + create the customer profile + sign in.
 *  - Existing email → the password must MATCH the existing one (verified by a
 *                     login attempt), so they keep ONE password across their
 *                     existing buyer account and wholesale.
 * Returns an error string to show, or null on success.
 */
async function ensureAuth(
  email: string,
  password: string,
  companyName: string,
): Promise<string | null> {
  let created = false;
  try {
    const regResult = await medusa().auth.register("customer", "emailpass", { email, password });
    if (!regResult || typeof regResult !== "string") {
      return "Registration failed. Unexpected response from server.";
    }
    created = true;
    try {
      await medusa().store.customer.create({ email, first_name: companyName });
    } catch {
      // profile may already exist for this identity — harmless
    }
    const loginResult = await medusa().auth.login("customer", "emailpass", { email, password });
    if (!loginResult || (typeof loginResult === "object" && "location" in loginResult)) {
      return "Login failed after registration. Please try signing in.";
    }
    return null;
  } catch (regErr) {
    if (created) {
      const msg = (regErr as Error)?.message ?? "";
      return /policy|does not meet|at least|uppercase|number|character/i.test(msg)
        ? msg
        : "Account created but couldn't complete setup. Try signing in.";
    }
    try {
      await medusa().auth.login("customer", "emailpass", { email, password });
      return null;
    } catch {
      const regMsg = (regErr as Error)?.message ?? "";
      if (/policy|does not meet|at least|uppercase|number|character/i.test(regMsg)) {
        return regMsg;
      }
      return "This email is already registered. Enter the SAME password you used when you first created this account.";
    }
  }
}

export default function WholesaleApplyPage() {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [gstinValid, setGstinValid] = React.useState<boolean>(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Pre-fill from customer metadata (set during sign-up)
  React.useEffect(() => {
    void (async () => {
      try {
        const wholesale = await getWholesaleApplicationStatus().catch(() => null);
        if (wholesale === "approved") {
          router.replace("/b2b/dashboard");
          return;
        }
        const { customer } = await medusa().store.customer.retrieve();
        const m = (customer.metadata ?? {}) as Record<string, string | undefined>;
        if (!formRef.current) return;
        const fd = formRef.current;
        const set = (name: string, val: string | undefined | null) => {
          const el = fd.elements.namedItem(name) as HTMLInputElement | null;
          if (el && val) el.value = val;
        };
        set("trade_name", m.company_name || customer.company_name);
        set("contact_name", customer.first_name || "");
        set("applicant_email", customer.email || "");
        set("gstin", m.gstin);
        set("line1", m.address);
        set("city", m.city);
        set("state", m.state);
        set("postal_code", m.pincode);
      } catch {
        // Not logged in — leave form blank, ensureAuth will handle it
      }
    })();
  }, [router]);

  // Submits the B2B application to the backend (FR-1.02). Stored in the
  // `company_application` table (status 'pending'); an admin approves it
  // from the Companies section, which mints the company + Medusa customer
  // and assigns the tier.
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!gstinValid) return;
    setError(null);
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => (fd.get(k) ?? "").toString().trim();
    const email = get("applicant_email");
    const password = (fd.get("password") ?? "").toString();
    const confirm = (fd.get("confirm_password") ?? "").toString();

    if (password.length < 8) {
      setError("Create a password of at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      // 1) Set up the account password (register new, or verify existing so
      //    the password matches). This is what lets them log in after approval.
      const authErr = await ensureAuth(email, password, get("trade_name"));
      if (authErr) {
        setError(authErr);
        setSubmitting(false);
        return;
      }

      // 2) Submit the application (status pending; admin assigns the tier).
      const payload = {
        gstin: get("gstin"),
        trade_name: get("trade_name"),
        applicant_email: get("applicant_email"),
        ...(get("contact_name") ? { contact_name: get("contact_name") } : {}),
        billing_address: {
          line1: get("line1"),
          city: get("city"),
          state: get("state"),
          postal_code: get("postal_code"),
          country_code: "in",
        },
      };
      const res = await fetch(`${BACKEND_URL}/store/companies/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": PUB_KEY,
        },
        body: JSON.stringify(payload),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        errors?: { fieldErrors?: Record<string, string[] | undefined> };
      };
      if (!res.ok || !j.ok) {
        // Surface the specific field error(s) so the buyer knows what to fix
        // (e.g. an invalid GSTIN) instead of a generic message.
        const fe = j.errors?.fieldErrors ?? {};
        const parts = Object.entries(fe)
          .map(([k, v]) => `${k}: ${(v ?? [])[0] ?? "invalid"}`)
          .filter(Boolean);
        setError(
          parts.length
            ? parts.join(" · ")
            : j.message ??
                "Couldn't submit your application. Please check the fields and try again.",
        );
        setSubmitting(false);
        return;
      }
      router.push("/wholesale/apply/thanks");
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  };

  return (
    <Container width="narrow">
      <div className="pt-6">
        <Breadcrumb
          items={[
            { href: "/", label: "Home" },
            { href: "/wholesale", label: "Wholesale" },
            { href: "/wholesale/apply", label: "Apply" },
          ]}
        />
      </div>
      <header className="py-10">
        <p className="text-micro text-text-muted">Wholesale</p>
        <h1 className="mt-2 text-display-lg text-text-primary">
          Apply for a wholesale account.
        </h1>
        <p className="mt-3 text-body-md text-text-muted">
          Set a password below — once we approve your account (usually within a
          business day) you&rsquo;ll get an email with a sign-in link and can log
          in with it to see your tier pricing.
        </p>
      </header>

      <form ref={formRef} onSubmit={submit} className="grid grid-cols-1 gap-5 pb-16 md:grid-cols-2">
        <Field label="Legal company name" required className="md:col-span-2">
          <Input name="trade_name" required autoComplete="organization" />
        </Field>
        <Field label="Display name">
          <Input name="contact_name" autoComplete="organization" />
        </Field>
        <Field label="Primary contact email" required>
          <Input name="applicant_email" type="email" required autoComplete="email" />
        </Field>
        <Field label="Create a password" required>
          <PasswordInput
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Min 8 characters"
          />
        </Field>
        <Field label="Confirm password" required>
          <PasswordInput
            name="confirm_password"
            required
            autoComplete="new-password"
          />
        </Field>
        <p className="md:col-span-2 -mt-2 text-caption text-text-muted">
          Already have a RISITEX account with this email? Enter that{" "}
          <strong>same password</strong> — you&rsquo;ll use one login for both.
        </p>
        <Field label="GSTIN" required className="md:col-span-2">
          <GSTINInput name="gstin" required onValidChange={setGstinValid} />
          {!gstinValid && (
            <p className="text-caption text-feedback-danger-text">
              Doesn&rsquo;t look like a valid 15-character GSTIN.
            </p>
          )}
        </Field>
        <Field label="PAN">
          <Input
            name="pan"
            placeholder="ABCDE1234F"
            maxLength={10}
            className="font-mono uppercase tracking-wider"
          />
        </Field>
        <Field label="Annual order volume (₹)">
          <Input name="annual_volume" type="number" inputMode="numeric" min={0} step={1000} />
        </Field>
        <Field label="Address line" required className="md:col-span-2">
          <Input
            name="line1"
            required
            autoComplete="address-line1"
            placeholder="Building, street, area"
          />
        </Field>
        <Field label="City" required>
          <Input name="city" required autoComplete="address-level2" />
        </Field>
        <Field label="State" required>
          <Input name="state" required autoComplete="address-level1" />
        </Field>
        <Field label="PIN code" required>
          <Input
            name="postal_code"
            required
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="560001"
          />
        </Field>
        <Field label="Anything we should know?" className="md:col-span-2">
          <Textarea name="notes" rows={4} placeholder="Tell us about your business and what you'd like to source." />
        </Field>

        {error && (
          <p className="md:col-span-2 rounded-md bg-feedback-danger-bg px-3 py-2 text-body-sm text-feedback-danger-text ring-1 ring-feedback-danger-border">
            {error}
          </p>
        )}

        <div className="md:col-span-2 mt-2">
          <Button type="submit" isLoading={submitting} disabled={!gstinValid}>
            Submit application
          </Button>
        </div>
      </form>
    </Container>
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
