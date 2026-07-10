"use client";

/**
 * Per-user scoping for browser-local state (cart, wishlist).
 *
 * localStorage is shared across every account that signs in on the same
 * browser. Keying cart/wishlist by a FIXED name therefore leaks one user's
 * data into the next user's session (e.g. Divya seeing Mukesh's cart after he
 * logs out and she logs in on the same machine). We namespace those keys by
 * the logged-in customer id so each account gets an isolated bucket, and a
 * re-login by the same user still restores their own data.
 *
 * The id is read (unverified) from the Medusa customer JWT — this is only used
 * to partition local storage, never for authorization, so decoding without
 * signature verification is fine.
 */

const AUTH_TOKEN_KEY = "medusa_auth_token";

function b64urlDecode(seg: string): string {
  const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return atob(b64 + pad);
}

/** Small stable hash — fallback namespace when the token can't be decoded. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Identifier for the currently signed-in user, or "guest" when logged out.
 * Prefers the customer id from the JWT; if the token is present but
 * unparseable it falls back to a token hash so two different users still never
 * collide (they just won't persist across a re-login in that rare case).
 */
export function currentOwnerId(): string {
  if (typeof window === "undefined") return "guest";
  let token: string | null = null;
  try {
    token = window.localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    /* storage blocked */
  }
  if (!token) return "guest";
  try {
    const payload = token.split(".")[1];
    if (payload) {
      const json = JSON.parse(b64urlDecode(payload)) as {
        app_metadata?: { customer_id?: string };
        actor_id?: string;
        sub?: string;
      };
      const id = json.app_metadata?.customer_id || json.actor_id || json.sub;
      if (typeof id === "string" && id) return id;
    }
  } catch {
    /* fall through to token hash */
  }
  return `tok_${hash(token)}`;
}

/** Namespace a base localStorage key to the current user. */
export function scopedKey(base: string): string {
  return `${base}::${currentOwnerId()}`;
}
