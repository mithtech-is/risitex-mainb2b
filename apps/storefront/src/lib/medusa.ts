import Medusa from "@medusajs/js-sdk";

/**
 * Medusa SDK client.
 *
 * Reads from env:
 *   NEXT_PUBLIC_MEDUSA_BACKEND_URL  — defaults to http://localhost:9000
 *   NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY — required for /store calls in prod;
 *     ignored in dev (storefront falls back to fixtures when the call fails).
 *
 * The client is constructed lazily so SSR builds without env still typecheck.
 */
let _client: Medusa | null = null;

export function medusa(): Medusa {
  if (_client) return _client;
  _client = new Medusa({
    baseUrl:
      process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000",
    publishableKey: process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
    debug: process.env.NODE_ENV !== "production",
    // Persist the JWT in localStorage so sessions survive navigation and
    // page reloads. Default is in-memory which loses the session as soon
    // as the user routes into the B2B dashboard after sign-up.
    auth: { type: "jwt", jwtTokenStorageMethod: "local" },
  });
  return _client;
}

export const MEDUSA_BASE_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000";
