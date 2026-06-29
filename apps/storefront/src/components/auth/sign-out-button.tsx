"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@risitex/ui/components";
import { signOut } from "@/lib/auth";

/**
 * Reusable Sign Out button. Calls medusa().auth.logout(), dispatches the
 * `risitex:auth-changed` event (handled inside lib/auth.signOut) so the
 * <SignedIn> / <SignedOut> gates flip immediately, then routes the buyer
 * to the sign-in page. Caller may override the destination via `redirectTo`.
 */
export function SignOutButton({
  variant = "secondary",
  size = "md",
  className,
  redirectTo = "/auth/sign-in",
  children,
}: {
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  redirectTo?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const handle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signOut();
    } catch {
      // ignore — even if the backend reject, we clear local state below
    }
    try {
      window.localStorage.removeItem("medusa_auth_token");
      window.dispatchEvent(new Event("risitex:auth-changed"));
    } catch {
      /* no-op */
    }
    router.replace(redirectTo);
    router.refresh();
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handle}
      isLoading={busy}
      leftIcon={<LogOut className="h-4 w-4" aria-hidden />}
      className={className}
    >
      {children ?? "Sign out"}
    </Button>
  );
}
