import { model } from "@medusajs/framework/utils"

/**
 * A single historic password hash for an account, keyed by the lower-
 * cased email. We use email (not auth_identity_id) because:
 *
 *   - the emailpass provider in Medusa v2 re-creates identity rows
 *     on some flows, so a UUID key is fragile across upgrades;
 *   - the history check runs BEFORE the provider has processed the
 *     new password, i.e. before we've fetched the identity row.
 *
 * We store the bcrypt hash (not plaintext, obviously). `actor_type` lets
 * us keep customer + user histories in one table without cross-leak.
 *
 * `created_at` is written on insert; the middleware queries
 * `ORDER BY created_at DESC LIMIT 10` and bcrypt-compares the new
 * password against each hash. Match → 422 "can't reuse last N".
 */
export const PasswordHistoryEntry = model.define("password_history_entry", {
  id: model.id().primaryKey(),
  /** Lower-cased email. Indexed because we query by this on every update. */
  email: model.text().index(),
  /** "customer" | "user" — lets us segregate admin vs customer histories. */
  actor_type: model.enum(["customer", "user"]).index(),
  /** bcrypt hash of the historic password. */
  password_hash: model.text(),
})
