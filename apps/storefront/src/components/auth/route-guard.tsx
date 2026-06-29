"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getCurrentCustomer } from "@/lib/auth";
import { getVerificationStatus, getWholesaleApplicationStatus } from "@/lib/verification";

async function requireAuth(): Promise<string | null> {
  const c = await getCurrentCustomer();
  return c ? null : "/auth/sign-in";
}

async function requireVerified(): Promise<string | null> {
  const c = await getCurrentCustomer();
  if (!c) return "/auth/sign-in";
  const s = await getVerificationStatus().catch(() => null);
  return s && s.email_verified && s.phone_verified
    ? null
    : "/auth/verification-center";
}

async function requireWholesale(): Promise<string | null> {
  const c = await getCurrentCustomer();
  if (!c) return "/auth/sign-in";
  const status = await getWholesaleApplicationStatus().catch(() => null);
  if (status === "approved") return null;
  if (status === "pending") return "/onboarding/b2b/pending";
  return "/auth/sign-up";
}

async function requireApplication(): Promise<string | null> {
  const c = await getCurrentCustomer();
  if (!c) return "/auth/sign-in";
  const status = await getWholesaleApplicationStatus().catch(() => null);
  return status ? null : "/auth/sign-up";
}

export type GuardRequirement =
  | "auth"
  | "verified"
  | "wholesale"
  | "application"
  | "rep";

const RESOLVERS: Record<GuardRequirement, () => Promise<string | null>> = {
  auth: requireAuth,
  verified: requireVerified,
  wholesale: requireWholesale,
  application: requireApplication,
  rep: requireAuth,
};

export function Guard({
  requirement,
  children,
}: {
  requirement: GuardRequirement;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [allowed, setAllowed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void RESOLVERS[requirement]()
      .then((redirect) => {
        if (cancelled) return;
        if (redirect) router.replace(redirect);
        else setAllowed(true);
      })
      .catch(() => {
        if (!cancelled) router.replace("/auth/sign-in");
      });
    return () => {
      cancelled = true;
    };
  }, [requirement, router]);

  if (!allowed) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-body-sm text-text-muted">Loading&hellip;</p>
      </div>
    );
  }
  return <>{children}</>;
}
