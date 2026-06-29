import { redirect } from "next/navigation";

/**
 * FR-1.02 — the canonical B2B application flow is /wholesale/apply: it's what
 * every site CTA links to and it actually persists the application (creates the
 * account, then POSTs to /store/companies/apply). This route was an orphaned
 * duplicate whose submit only simulated success and dropped the data, so we
 * redirect it to the working form rather than let it be reached.
 */
export default function B2bOnboardingRedirect(): never {
  redirect("/wholesale/apply");
}
