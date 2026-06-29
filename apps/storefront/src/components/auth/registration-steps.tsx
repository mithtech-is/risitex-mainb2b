"use client";

import * as React from "react";

/**
 * RegistrationSteps — top-of-page indicator showing where the buyer
 * sits in the B2B onboarding spec:
 *
 *   1. Business details (sign-up form)
 *   2. Email verification (OTP)
 *   3. Mobile verification (OTP)
 *   4. Account activated → Dashboard
 *
 * Steps before `currentStep` render as completed; the current step
 * renders highlighted; subsequent steps render dimmed.
 *
 * Designed as a banner, not a per-page chrome — kept stateless and
 * styled with existing tokens so it matches the rest of the auth flow.
 */
export type RegistrationStep = 1 | 2 | 3 | 4;

const STEPS: { id: RegistrationStep; label: string }[] = [
  { id: 1, label: "Business details" },
  { id: 2, label: "Email verification" },
  { id: 3, label: "Mobile verification" },
  { id: 4, label: "Account activated" },
];

export function RegistrationSteps({
  currentStep,
  className,
}: {
  currentStep: RegistrationStep;
  className?: string;
}) {
  return (
    <ol
      aria-label="Registration progress"
      className={
        "flex flex-wrap items-center gap-x-2 gap-y-3 rounded-md border border-border-subtle bg-surface-raised p-3 " +
        (className ?? "")
      }
    >
      {STEPS.map((s, i) => {
        const isDone = s.id < currentStep;
        const isActive = s.id === currentStep;
        return (
          <React.Fragment key={s.id}>
            <li
              aria-current={isActive ? "step" : undefined}
              className="flex items-center gap-2"
            >
              <span
                className={[
                  "inline-flex h-6 w-6 items-center justify-center rounded-full text-caption font-medium",
                  isDone
                    ? "bg-feedback-success-bg text-feedback-success-text ring-1 ring-feedback-success-border"
                    : isActive
                      ? "bg-action-primary-bg text-action-primary-text"
                      : "bg-surface-sunken text-text-muted",
                ].join(" ")}
              >
                {isDone ? "✓" : s.id}
              </span>
              <span
                className={[
                  "text-caption md:text-body-sm",
                  isActive
                    ? "font-medium text-text-primary"
                    : isDone
                      ? "text-text-secondary"
                      : "text-text-muted",
                ].join(" ")}
              >
                {s.label}
              </span>
            </li>
            {i < STEPS.length - 1 && (
              <span
                aria-hidden
                className="mx-1 hidden h-px w-6 bg-border-subtle md:inline-block"
              />
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}
