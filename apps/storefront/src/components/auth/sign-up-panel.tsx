"use client";

import * as React from "react";
import { Button, Input, Label, PasswordInput } from "@risitex/ui/components";
import { Wordmark } from "@/components/site/wordmark";
import { signUp, accountExists, updateCustomerMetadata } from "@/lib/auth";

type FormData = {
  first_name: string;
  last_name: string;
  company_name: string;
  designation: string;
  pan: string;
  gstin: string;
  email: string;
  mobile: string;
  password: string;
};

type FormStep = "details" | "business" | "credentials";

const INITIAL_FORM: FormData = {
  first_name: "",
  last_name: "",
  company_name: "",
  designation: "",
  pan: "",
  gstin: "",
  email: "",
  mobile: "",
  password: "",
};

export function SignUpPanel({
  onSuccess,
  onSwitchToSignIn,
}: {
  onSuccess: () => void;
  onSwitchToSignIn: () => void;
}) {

  const [step, setStep] = React.useState<FormStep>("details");
  const [form, setForm] = React.useState<FormData>(INITIAL_FORM);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const update = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.currentTarget.value }));

  const detailsComplete =
    form.first_name.trim() && form.last_name.trim();
  const businessComplete =
    form.company_name.trim() && form.pan.trim().length >= 10;
  const credentialsComplete =
    form.email.trim() && form.mobile.trim().length >= 10 && form.password.length >= 8;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credentialsComplete) return;
    setError(null);
    setSubmitting(true);

    try {
      const exists = await accountExists(form.email).catch(() => false);
      if (exists) {
        setError("An account with this email already exists. Please sign in.");
        setSubmitting(false);
        return;
      }

      await signUp(form.email, form.password, form.first_name, form.last_name);

      await updateCustomerMetadata({
        company_name: form.company_name,
        designation: form.designation || undefined,
        pan: form.pan,
        gstin: form.gstin || undefined,
        phone: form.mobile,
      });

      onSuccess();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Registration failed. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    { key: "details", number: 1, label: "Personal" },
    { key: "business", number: 2, label: "Business" },
    { key: "credentials", number: 3, label: "Credentials" },
  ] as const;

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="flex h-full flex-col">
      <Wordmark showMonogram />

      <div className="mt-6">
        <div className="flex items-center gap-2">
          {steps.map((s, i) => (
            <React.Fragment key={s.key}>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-caption font-medium ${
                    i < currentStepIndex
                      ? "bg-feedback-success-bg text-feedback-success-text ring-1 ring-feedback-success-border"
                      : i === currentStepIndex
                        ? "bg-action-primary-bg text-action-primary-text"
                        : "bg-surface-sunken text-text-muted"
                  }`}
                >
                  {i < currentStepIndex ? "✓" : s.number}
                </span>
                <span
                  className={`hidden text-caption sm:inline ${
                    i === currentStepIndex
                      ? "font-medium text-text-primary"
                      : "text-text-muted"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className={`h-px flex-1 ${
                    i < currentStepIndex ? "bg-feedback-success-border" : "bg-border-subtle"
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex-1">
        <h2 className="text-display-sm text-text-primary">
          {step === "details" && "Personal details"}
          {step === "business" && "Business information"}
          {step === "credentials" && "Account credentials"}
        </h2>
        <p className="mt-1 text-body-sm text-text-muted">
          {step === "details" && "Tell us about yourself to get started."}
          {step === "business" && "Your business details help us verify your wholesale application."}
          {step === "credentials" && "Set up your login credentials."}
        </p>

        <div className="mt-6 space-y-4">
          {step === "details" && (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="su-first-name" required>First name</Label>
                  <Input id="su-first-name" value={form.first_name} onChange={update("first_name")} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="su-last-name" required>Last name</Label>
                  <Input id="su-last-name" value={form.last_name} onChange={update("last_name")} required />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="su-designation">Designation</Label>
                <Input id="su-designation" value={form.designation} onChange={update("designation")} placeholder="e.g. Procurement Manager" />
              </div>
            </>
          )}

          {step === "business" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="su-company" required>Company name</Label>
                <Input id="su-company" value={form.company_name} onChange={update("company_name")} required />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="su-pan" required>PAN</Label>
                  <Input id="su-pan" value={form.pan} onChange={update("pan")} placeholder="ABCDE1234F" className="uppercase" maxLength={10} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="su-gstin">GSTIN (optional)</Label>
                  <Input id="su-gstin" value={form.gstin} onChange={update("gstin")} placeholder="33ABCDE1234F1Z5" className="uppercase" maxLength={15} />
                </div>
              </div>
            </>
          )}

          {step === "credentials" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="su-email" required>Email</Label>
                <Input id="su-email" type="email" autoComplete="email" value={form.email} onChange={update("email")} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="su-mobile" required>Mobile</Label>
                <Input id="su-mobile" type="tel" inputMode="numeric" maxLength={10} value={form.mobile} onChange={(e) => setForm((f) => ({ ...f, mobile: e.currentTarget.value.replace(/\D/g, "") }))} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="su-password" required>Password</Label>
                <PasswordInput id="su-password" autoComplete="new-password" value={form.password} onChange={update("password")} required />
                <p className="text-micro text-text-muted">Minimum 8 characters</p>
              </div>
            </>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-md bg-feedback-danger-bg px-3 py-2 text-body-sm text-feedback-danger-text ring-1 ring-feedback-danger-border"
          >
            {error}
          </p>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          {step !== "details" ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const prevStep = steps[currentStepIndex - 1];
                if (prevStep) setStep(prevStep.key);
              }}
            >
              Back
            </Button>
          ) : (
            <div />
          )}
          {step !== "credentials" ? (
            <Button
              type="button"
              onClick={() => {
                const nextStep = steps[currentStepIndex + 1];
                if (nextStep) setStep(nextStep.key);
              }}
              disabled={
                (step === "details" && !detailsComplete) ||
                (step === "business" && !businessComplete)
              }
            >
              Continue
            </Button>
          ) : (
            <Button type="submit" isLoading={submitting} disabled={!credentialsComplete}>
              Create account
            </Button>
          )}
        </div>
      </form>

      <div className="mt-auto border-t border-border-subtle pt-6">
        <p className="text-body-sm text-text-muted">
          Already have an account?{" "}
          <button
            type="button"
            onClick={onSwitchToSignIn}
            className="font-medium text-brand-accent underline-offset-4 hover:underline"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
