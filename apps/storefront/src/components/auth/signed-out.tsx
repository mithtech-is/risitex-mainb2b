"use client";

import * as React from "react";

const AUTH_TOKEN_KEY = "medusa_auth_token";
const AUTH_EVENT = "risitex:auth-changed";

/**
 * Client-side auth gates for marketing surfaces.
 *
 * `<SignedOut>` renders its children only when the buyer has no Medusa
 * auth token in localStorage. `<SignedIn>` is the inverse. Both wait for
 * the post-mount effect before exposing the gated content so SSR / first
 * paint always reflects the "logged out" assumption — that's the public
 * default for marketing pages and prevents the brief "Sign In" flash
 * from rendering for an already-authenticated buyer.
 *
 * To trigger a state refresh elsewhere (after sign-in / sign-out), dispatch
 * `window.dispatchEvent(new Event("risitex:auth-changed"))`. The hook below
 * also reacts to the browser-native `storage` event so other tabs stay in
 * sync without a page reload.
 */
function useIsAuthenticated() {
  // We default to `null` (= "unknown") so neither branch renders on the
  // first server pass nor between hydration and the first effect — this
  // is what kills the flicker.
  const [authed, setAuthed] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const read = () => {
      try {
        setAuthed(!!window.localStorage.getItem(AUTH_TOKEN_KEY));
      } catch {
        setAuthed(false);
      }
    };
    read();
    const onStorage = (e: StorageEvent) => {
      if (e.key === AUTH_TOKEN_KEY || e.key === null) read();
    };
    const onCustom = () => read();
    window.addEventListener("storage", onStorage);
    window.addEventListener(AUTH_EVENT, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(AUTH_EVENT, onCustom);
    };
  }, []);

  return authed;
}

export function SignedOut({ children }: { children: React.ReactNode }) {
  const authed = useIsAuthenticated();
  if (authed !== false) return null;
  return <>{children}</>;
}

export function SignedIn({ children }: { children: React.ReactNode }) {
  const authed = useIsAuthenticated();
  if (authed !== true) return null;
  return <>{children}</>;
}
