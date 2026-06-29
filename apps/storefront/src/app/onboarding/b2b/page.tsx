import { redirect } from "next/navigation";

/**
 * Legacy onboarding URL. Redirects to the canonical B2B registration
 * flow at /auth/sign-up — the OTP-driven Submit Application form that
 * replaces the older manual-approval /wholesale/apply page.
 */
export default function B2bOnboardingRedirect(): never {
  redirect("/auth/sign-up");
}
