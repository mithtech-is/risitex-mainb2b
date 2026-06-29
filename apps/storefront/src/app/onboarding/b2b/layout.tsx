import { Guard } from "@/components/auth/route-guard";

/**
 * The B2B onboarding status pages (pending / approved) are only meaningful to
 * someone who has actually applied. Guests → sign-in; signed-in customers with
 * no wholesale application → the wholesale landing page.
 */
export default function OnboardingB2bLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Guard requirement="application">{children}</Guard>;
}
