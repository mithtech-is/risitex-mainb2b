"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Label, PasswordInput, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@risitex/ui/components";
import { Container } from "@/components/site/container";
import { RegistrationSteps } from "@/components/auth/registration-steps";
import { signUp, updateCustomerMetadata } from "@/lib/auth";
import { toIndianE164 } from "@/lib/verification";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000";
const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/;

// ── Password policy (mirrors apps/backend/src/utils/password-policy.ts) ──
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const SPECIAL_RE = /[!@#$%^&*()_+\-=[\]{}|;:,.<>?/~`]/;
const UPPER_RE = /[A-Z]/;
const LOWER_RE = /[a-z]/;
const DIGIT_RE = /[0-9]/;
const WHITESPACE_RE = /\s/;

const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "password1234", "p@ssword",
  "passw0rd", "p@ssw0rd", "p@ssw0rd!", "passw0rd!", "passw0rd123",
  "welcome", "welcome1", "welcome123", "welcome@1", "welcome@123",
  "admin", "admin123", "admin@123", "admin1234", "administrator",
  "qwerty", "qwerty123", "qwertyuiop", "qazwsx", "asdfgh", "zxcvbn",
  "letmein", "letmein123", "trustno1", "iloveyou", "monkey", "dragon",
  "football", "baseball", "sunshine", "shadow", "master",
  "12345", "123456", "1234567", "12345678", "123456789", "1234567890",
  "111111", "000000", "654321", "987654321",
  "abc123", "abcd1234", "abcdef", "abcdefgh",
  "india@123", "india123", "bharat123", "mumbai123", "delhi123",
  "changeme", "change123", "changeme123", "default", "default123",
  "test", "test123", "test1234", "testing", "testing123",
]);

function validatePassword(password: string, fields: { email: string; first_name: string; last_name: string; mobile: string; pan: string }): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password is too long (max ${PASSWORD_MAX_LENGTH} characters).`;
  }
  if (!UPPER_RE.test(password)) {
    return "Include at least one uppercase letter (A–Z).";
  }
  if (!LOWER_RE.test(password)) {
    return "Include at least one lowercase letter (a–z).";
  }
  if (!DIGIT_RE.test(password)) {
    return "Include at least one number (0–9).";
  }
  if (!SPECIAL_RE.test(password)) {
    return "Include at least one special character (e.g. !@#$%^&*).";
  }
  if (WHITESPACE_RE.test(password)) {
    return "Password must not contain spaces.";
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "That password is on a public breach list. Pick something unique.";
  }
  if (/^(.)\1+$/.test(password)) {
    return "Password can't be a single repeated character.";
  }
  if (/0123456789|1234567890|abcdefghij|qwertyuiop/i.test(password)) {
    return "Password can't be a common keyboard sequence.";
  }
  // Contextual check — password can't contain any personal info substring
  const lowered = password.toLowerCase();
  const ctxTokens: string[] = [];
  const addToken = (v: string, minLen: number) => {
    if (!v || v.length < minLen) return;
    const clean = v.toLowerCase().trim();
    if (clean.length >= minLen) ctxTokens.push(clean);
    const digits = clean.replace(/\D/g, "");
    if (digits.length >= minLen) ctxTokens.push(digits);
    clean.split(/[^a-z0-9]+/).forEach((part) => {
      if (part.length >= minLen) ctxTokens.push(part);
    });
  };
  const emailLocal = fields.email.split("@")[0] ?? "";
  addToken(emailLocal, 3);
  addToken(fields.first_name, 3);
  addToken(fields.last_name, 3);
  addToken(fields.mobile.replace(/\D/g, ""), 6);
  addToken(fields.pan, 5);
  for (const t of ctxTokens) {
    if (lowered.includes(t)) {
      return "Password can't contain your name, email, phone, PAN, or date of birth.";
    }
  }
  return null;
}

/**
 * Submit the wholesale application alongside customer creation so the
 * dashboard can render a complete B2B profile on first login. Endpoint
 * is open-intake (no auth) and idempotent against duplicate GSTIN (409
 * = already applied, which we silently swallow — the previous
 * submission stands).
 *
 * Only fires when the form carries enough data to satisfy the Zod
 * schema server-side (GSTIN + billing address). Partial sign-ups leave
 * the customer with metadata only; the account dashboard's company-
 * details form picks up the rest after the buyer signs in.
 */
async function autoSubmitWholesaleApplication(form: {
  company_name: string;
  trade_name: string;
  gstin: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
}): Promise<void> {
  const gstin = form.gstin.trim().toUpperCase();
  if (gstin && !GSTIN_REGEX.test(gstin)) return;
  if (form.company_name.trim().length < 2) return;
  const fullName = `${form.first_name.trim()} ${form.last_name.trim()}`.trim();
  const tradeName =
    form.trade_name.trim().length > 0
      ? form.trade_name.trim()
      : form.company_name.trim();
  try {
    const res = await fetch(`${BACKEND_URL}/store/companies/apply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-publishable-api-key": PUB_KEY,
      },
      body: JSON.stringify({
        gstin: gstin || undefined,
        trade_name: tradeName,
        applicant_email: form.email.trim().toLowerCase(),
        applicant_phone: toIndianE164(form.mobile),
        contact_name: fullName || undefined,
        billing_address: {
          line1: form.address.trim() || form.company_name.trim(),
          city: form.city.trim() || "NA",
          state: form.state.trim() || "NA",
          postal_code: form.pincode.trim() || "000000",
          country_code: "in",
        },
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.warn(
        "[autoSubmitWholesaleApplication] application submission failed",
        res.status,
        body,
      );
    }
  } catch (err) {
    console.warn(
      "[autoSubmitWholesaleApplication] network error submitting application",
      err,
    );
  }
}

const BUSINESS_TYPES = [
  { value: "retailer", label: "Retailer" },
  { value: "distributor", label: "Distributor" },
  { value: "wholesaler", label: "Wholesaler" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "ecommerce", label: "E-commerce Seller" },
  { value: "corporate", label: "Corporate / Institution" },
  { value: "other", label: "Other" },
];

const SIGNUP_PHONE_KEY = "risitex.signup.phone";
// PAN format: 5 letters · 4 digits · 1 letter (e.g. AAAPL1234C).
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export default function BusinessRegistrationPage() {
  const router = useRouter();
  const [form, setForm] = React.useState({
    first_name: "",
    last_name: "",
    company_name: "",
    trade_name: "",
    pan: "",
    gstin: "",
    business_type: "",
    email: "",
    mobile: "",
    password: "",
    confirm_password: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    trade_license: "",
    accept_terms: false,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const pwErr = validatePassword(form.password, form);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (form.password !== form.confirm_password) {
      setError("Passwords don't match.");
      return;
    }
    if (!PAN_REGEX.test(form.pan.trim().toUpperCase())) {
      setError(
        "PAN must be a 10-character Indian PAN (e.g. AAAPL1234C). PAN is required for B2B onboarding.",
      );
      return;
    }
    if (!form.accept_terms) {
      setError("Please accept the terms and privacy policy to continue.");
      return;
    }

    setSubmitting(true);
    // Pre-flight duplicate checks — fail fast with a friendly message
    // instead of a 500 from a Postgres unique-constraint violation.
    try {
      const dupRes = await fetch(`${BACKEND_URL}/store/auth/account-exists`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": PUB_KEY,
        },
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          pan: form.pan.trim().toUpperCase(),
          mobile: form.mobile,
        }),
      });
      if (dupRes.ok) {
        const dup = (await dupRes.json()) as {
          exists?: boolean;
          by?: "email" | "pan" | "mobile";
        };
        if (dup.exists) {
          const labels: Record<string, string> = {
            email: "email",
            pan: "PAN",
            mobile: "mobile number",
          };
          const which = labels[dup.by ?? "email"] ?? "details";
          setError(
            `This ${which} is already registered. ${
              dup.by === "email"
                ? "Sign in instead, or use the password reset link."
                : "Please use a different one or sign in."
            }`,
          );
          setSubmitting(false);
          return;
        }
      }
    } catch {
      // Pre-flight is best-effort. Real uniqueness backstop is the DB.
    }
    try {
      await signUp(
        form.email,
        form.password,
        form.first_name.trim(),
        form.last_name.trim(),
      );
      const phoneE164 = toIndianE164(form.mobile);
      await updateCustomerMetadata({
        phone: phoneE164,
        metadata: {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          // Back-compat alias — older code paths read owner_name.
          owner_name: `${form.first_name.trim()} ${form.last_name.trim()}`.trim(),
          company_name: form.company_name.trim(),
          trade_name: form.trade_name.trim() || undefined,
          pan: form.pan.trim().toUpperCase(),
          gstin: form.gstin.trim().toUpperCase() || undefined,
          business_type: form.business_type,
          address: form.address.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          pincode: form.pincode.trim(),
          trade_license: form.trade_license.trim() || undefined,
          // PAN is required at signup; the OTP-backed PAN verification
          // flow flips this true on success.
          pan_verified: false,
        },
      });
      // File the wholesale application synchronously so the user never lands
      // on /wholesale/apply post-OTP. Idempotent at the backend (409 on
      // duplicate GSTIN is silently swallowed).
      await autoSubmitWholesaleApplication({
        company_name: form.company_name,
        trade_name: form.trade_name,
        gstin: form.gstin,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        mobile: form.mobile,
        address: form.address,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
      });
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(SIGNUP_PHONE_KEY, form.mobile);
      }
      router.push("/auth/verify-email");
      router.refresh();
    } catch (err) {
      const msg = (err as Error)?.message ?? "";
      setError(
        /fetch failed|network error|Failed to fetch/i.test(msg)
          ? "Network error - please check your connection and try again."
          : /policy|at least|uppercase|number|character/i.test(msg)
            ? msg
            : msg.includes("409")
              ? "This email is already registered. Please sign in instead."
              : "Couldn't create your account. Try again or contact support.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container width="narrow">
      <div className="py-16">
        <RegistrationSteps currentStep={1} className="mb-8" />
        <p className="text-micro text-text-muted">Business Registration</p>
        <h1 className="mt-2 text-display-lg text-text-primary">
          Register Your Business.
        </h1>
        <p className="mt-3 text-body-md text-text-muted">
          Already registered?{" "}
          <Link
            href="/auth/sign-in"
            className="text-text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
          .
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <h2 className="text-heading-sm text-text-primary">
              Personal Information
            </h2>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="first_name" required>
              First Name
            </Label>
            <Input
              id="first_name"
              autoComplete="given-name"
              value={form.first_name}
              onChange={(e) => set("first_name", e.currentTarget.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="last_name" required>
              Last Name
            </Label>
            <Input
              id="last_name"
              autoComplete="family-name"
              value={form.last_name}
              onChange={(e) => set("last_name", e.currentTarget.value)}
              required
            />
          </div>

          <div className="md:col-span-2 mt-4">
            <h2 className="text-heading-sm text-text-primary">
              Business Information
            </h2>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company_name" required>
              Company Name
            </Label>
            <Input
              id="company_name"
              autoComplete="organization"
              value={form.company_name}
              onChange={(e) => set("company_name", e.currentTarget.value)}
              required
              placeholder="Your registered business name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trade_name">Trade Name (optional)</Label>
            <Input
              id="trade_name"
              value={form.trade_name}
              onChange={(e) => set("trade_name", e.currentTarget.value)}
              placeholder="Brand / DBA name (if different)"
            />
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label htmlFor="business_type" required>
              Business Type
            </Label>
            <Select
              value={form.business_type}
              onValueChange={(v) => set("business_type", v)}
              required
            >
              <SelectTrigger id="business_type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map((bt) => (
                  <SelectItem key={bt.value} value={bt.value}>
                    {bt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2 mt-4">
            <h2 className="text-heading-sm text-text-primary">
              Business Verification
            </h2>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pan" required>
              PAN Number
            </Label>
            <Input
              id="pan"
              value={form.pan}
              onChange={(e) => set("pan", e.currentTarget.value.toUpperCase())}
              placeholder="AAAPL1234C"
              maxLength={10}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gstin">GSTIN (optional)</Label>
            <Input
              id="gstin"
              value={form.gstin}
              onChange={(e) => set("gstin", e.currentTarget.value.toUpperCase())}
              placeholder="29ABCDE1234F1Z5"
              maxLength={15}
            />
          </div>

          <div className="md:col-span-2 mt-4">
            <h2 className="text-heading-sm text-text-primary">
              Contact Information
            </h2>
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mobile" required>
              Mobile Number
            </Label>
            <Input
              id="mobile"
              type="tel"
              autoComplete="tel"
              inputMode="numeric"
              value={form.mobile}
              onChange={(e) => set("mobile", e.currentTarget.value)}
              placeholder="10-digit number"
              required
            />
          </div>

          <div className="md:col-span-2 mt-4">
            <h2 className="text-heading-sm text-text-primary">
              Business Address (optional — speeds up approval)
            </h2>
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label htmlFor="address">
              Business Address
            </Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => set("address", e.currentTarget.value)}
              placeholder="Street address"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              value={form.city}
              onChange={(e) => set("city", e.currentTarget.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="state">State</Label>
            <Input
              id="state"
              value={form.state}
              onChange={(e) => set("state", e.currentTarget.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pincode">Pincode</Label>
            <Input
              id="pincode"
              value={form.pincode}
              onChange={(e) => set("pincode", e.currentTarget.value)}
              maxLength={6}
              inputMode="numeric"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trade_license">
              Trade License (optional)
            </Label>
            <Input
              id="trade_license"
              value={form.trade_license}
              onChange={(e) => set("trade_license", e.currentTarget.value)}
              placeholder="License number"
            />
          </div>

          <div className="md:col-span-2 mt-4">
            <h2 className="text-heading-sm text-text-primary">
              Account Information
            </h2>
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label htmlFor="password" required>
              Password
            </Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => set("password", e.currentTarget.value)}
              required
              minLength={8}
            />
          </div>

          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label htmlFor="confirm_password" required>
              Confirm Password
            </Label>
            <PasswordInput
              id="confirm_password"
              autoComplete="new-password"
              value={form.confirm_password}
              onChange={(e) => set("confirm_password", e.currentTarget.value)}
              required
              minLength={8}
            />
            {form.confirm_password.length > 0 &&
              form.password !== form.confirm_password && (
                <p className="text-caption text-feedback-danger-text">
                  Passwords don&rsquo;t match.
                </p>
              )}
          </div>

          <div className="flex items-start gap-2 md:col-span-2">
            <input
              id="terms"
              type="checkbox"
              checked={form.accept_terms}
              onChange={(e) => set("accept_terms", e.currentTarget.checked)}
              required
              className="mt-1 h-4 w-4"
            />
            <Label htmlFor="terms" className="text-body-sm text-text-muted">
              I agree to the{" "}
              <Link
                href="/terms"
                className="text-text-primary underline-offset-4 hover:underline"
              >
                Terms of Use
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="text-text-primary underline-offset-4 hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </Label>
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
            <Button
              type="submit"
              isLoading={submitting}
              size="lg"
              className="w-full md:w-auto"
            >
              Submit Application
            </Button>
            <p className="mt-3 text-caption text-text-muted">
              After submission, verify your email and phone. PAN is required;
              GSTIN can be added later from your B2B Company Details.
            </p>
          </div>
        </form>
      </div>
    </Container>
  );
}
