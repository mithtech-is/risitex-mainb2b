import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework/subscribers"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Free a deleted customer's email for re-registration (RISITEX).
 *
 * Medusa deletes the `customer` row but leaves the `provider_identity` /
 * `auth_identity` (the emailpass credential) behind. That makes
 * /store/auth/account-exists keep reporting the email as "registered" and
 * blocks re-signup — even though the account is gone from the admin. When a
 * customer is deleted, this subscriber removes the orphaned auth identity so
 * the email is fully released and the storefront syncs automatically.
 *
 * Safety: emailpass is ALSO used by admin users, so we only delete when NO
 * live customer AND NO admin user still uses that email.
 */
export default async function customerAuthCleanup({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const customerId = event?.data?.id
  if (!customerId) return

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as {
    raw: (sql: string, b?: unknown[]) => Promise<{ rows?: any[] }>
  }

  try {
    // The customer is soft-deleted (row still present) — read its email.
    const cr = await pg.raw(
      `SELECT email FROM customer WHERE id = ? LIMIT 1`,
      [customerId],
    )
    const email = (cr.rows?.[0]?.email as string | undefined)?.toLowerCase()
    if (!email) return

    // Never remove an identity a live customer or an admin still uses.
    const guard = await pg.raw(
      `SELECT
         (SELECT count(*) FROM customer c WHERE lower(c.email)=? AND c.deleted_at IS NULL) AS live_cust,
         (SELECT count(*) FROM "user" u WHERE lower(u.email)=? AND u.deleted_at IS NULL) AS admin_user`,
      [email, email],
    )
    const g = guard.rows?.[0]
    if (Number(g?.live_cust ?? 0) > 0 || Number(g?.admin_user ?? 0) > 0) return

    // Remove the emailpass credential + any now-empty auth identity.
    await pg.raw(
      `DELETE FROM provider_identity WHERE provider='emailpass' AND lower(entity_id)=?`,
      [email],
    )
    await pg.raw(
      `DELETE FROM auth_identity ai
         WHERE ai.app_metadata->>'customer_id' = ?
           AND NOT EXISTS (SELECT 1 FROM provider_identity p WHERE p.auth_identity_id = ai.id)`,
      [customerId],
    )
    logger.info(
      `[customer-auth-cleanup] released auth identity for deleted customer ${customerId} (${email})`,
    )
  } catch (err) {
    logger.warn(
      `[customer-auth-cleanup] failed for ${customerId}: ${(err as Error).message}`,
    )
  }
}

export const config: SubscriberConfig = {
  event: "customer.deleted",
}
