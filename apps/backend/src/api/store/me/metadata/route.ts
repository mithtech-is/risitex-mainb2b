import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"
import { logger } from "../../../../utils/logger"
import { respondOk, respondErr } from "../../../../utils/envelope"

/**
 * POST /store/me/metadata
 *
 * Server-side metadata patcher. Replaces the dangerous "spread the
 * client's possibly-stale UserContext.metadata into customer.update"
 * pattern that's been the source of silent data loss across the
 * storefront. The fix is to do the read AND the write on the server,
 * inside the same handler:
 *
 *   1. Resolve the customer fresh (single-statement read).
 *   2. Apply the caller's patch on top (shallow merge — TOP-LEVEL keys
 *      get replaced, sub-objects get fully replaced too — same shape
 *      as the client used to do, just with FRESH base meta).
 *   3. Optional `delete_keys` array lets the caller explicitly remove
 *      keys (the only way a caller can shrink the metadata).
 *   4. Write back via Medusa's updateCustomers.
 *
 * Body: { patch?: Record<string, any>, delete_keys?: string[] }
 *
 * Defenses:
 *   - Patch + delete_keys are validated by zod; arbitrary type is
 *     allowed in patch values (it's free-form JSON).
 *   - `delete_keys` cannot remove ANCHOR keys (PII or auth state):
 *     phone_verified, phone_verified_at, email_verified, email_verified_at,
 *     pan_hash, aadhaar_hash, totp_enabled, totp_secret_encrypted.
 *     The DB trigger also enforces this as a backstop.
 *   - The audit trigger logs the metadata change with app_context
 *     "store.me.metadata.patch" so forensics can attribute mutations
 *     to this single funnel rather than scattering across 8 routes.
 *
 * Why this exists rather than letting the client call /store/customers/me
 * directly: Medusa's customer.update REPLACES the metadata field
 * wholesale (no deep merge). The client's spread `{...user.metadata, …}`
 * was as fresh as the UserContext snapshot at the time of read, which
 * lagged actual writes by 1+ tick. Race + concurrent-tab + stale-cache
 * = silent key loss. This route eliminates the read-side staleness.
 */

const PROTECTED_KEYS = new Set([
  "phone_verified",
  "phone_verified_at",
  "email_verified",
  "email_verified_at",
  "pan_hash",
  "pan_record_id",
  "aadhaar_hash",
  "totp_enabled",
  "totp_secret_encrypted",
  "totp_recovery_code_hashes",
  "webauthn_enabled",
])

const BodySchema = z.object({
  patch: z.record(z.string(), z.unknown()).optional(),
  delete_keys: z.array(z.string()).optional(),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata?.customer_id as
    | string
    | undefined
  if (!customerId) {
    return respondErr(res, 401, "auth.unauthenticated", "Not authenticated")
  }

  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return respondErr(
      res,
      400,
      "store.me.metadata.invalid_payload",
      "Invalid payload",
      { errors: parsed.error.flatten() },
    )
  }
  const { patch = {}, delete_keys = [] } = parsed.data

  // Refuse attempts to delete anchor keys at the API layer (the DB
  // trigger is the backstop). Cleaner error than "trigger raised".
  const illegalDeletes = delete_keys.filter((k) => PROTECTED_KEYS.has(k))
  if (illegalDeletes.length > 0) {
    return respondErr(
      res,
      400,
      "store.me.metadata.protected_key_delete",
      `Cannot remove protected keys via this endpoint: ${illegalDeletes.join(", ")}. These are PII/auth anchors and can only be cleared via dedicated routes (e.g., /store/me/2fa/disable for totp_*).`,
    )
  }

  // Refuse attempts to OVERWRITE anchor keys with falsy values (someone
  // could try to bypass delete_keys by sending {patch: {phone_verified: false}}).
  const illegalPatch = Object.entries(patch).filter(
    ([k, v]) => PROTECTED_KEYS.has(k) && (v === false || v === null || v === ""),
  )
  if (illegalPatch.length > 0) {
    return respondErr(
      res,
      400,
      "store.me.metadata.protected_key_clear",
      `Cannot clear protected keys via this endpoint: ${illegalPatch.map(([k]) => k).join(", ")}.`,
    )
  }

  const customerModule = req.scope.resolve(Modules.CUSTOMER) as any
  const fresh = await customerModule
    .retrieveCustomer(customerId, { select: ["id", "metadata"] })
    .catch(() => null)
  if (!fresh) {
    return respondErr(res, 404, "store.me.metadata.customer_missing", "Customer not found")
  }

  // Build the new metadata: fresh base + patch + key removals.
  const baseMeta = (fresh.metadata ?? {}) as Record<string, unknown>
  const nextMeta: Record<string, unknown> = { ...baseMeta, ...patch }
  for (const k of delete_keys) {
    delete nextMeta[k]
  }

  try {
    await customerModule.updateCustomers(customerId, {
      metadata: nextMeta,
    })
  } catch (err) {
    logger.error("store.me.metadata.patch failed", {
      customer_id: customerId,
      error: (err as Error).message,
    })
    return respondErr(
      res,
      500,
      "store.me.metadata.update_failed",
      (err as Error).message || "Failed to update metadata",
    )
  }

  return respondOk(res, {
    metadata: nextMeta,
    keys: Object.keys(nextMeta).sort(),
  })
}
