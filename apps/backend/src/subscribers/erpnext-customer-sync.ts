import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework/subscribers"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

// The plugin registers as the string "erpnext" — see
// packages/medusa-plugin-erpnext/src/modules/erpnext/index.ts. The plugin
// doesn't export a top-level barrel we can import from outside its src/,
// so we resolve the module by registration name instead.
const ERPNEXT_MODULE = "erpnext"

/**
 * Push Medusa customer + linked company into ERPNext.
 *
 * Listens for:
 *   - `customer.created` — fires on signup; pushes the bare customer.
 *   - `customer.updated` — fires on metadata writes (email/phone verify,
 *     KYC, company link); pushes the latest snapshot.
 *
 * The plugin's `bulkPush({ event, items })` queues a sync event in the
 * `erpnext_sync_event` table; the worker drains the queue and POSTs to
 * the configured ERPNext webhook URL with retry + idempotency.
 *
 * Idempotent: a re-emit just updates the existing ERPNext Customer
 * doctype with the latest payload (idempotency key = customer.id).
 *
 * Best-effort: failures are logged but never re-thrown — Medusa's event
 * bus would otherwise retry the whole subscriber chain and (eg) re-fire
 * the welcome email.
 */
async function pushCustomerToErpnext({
  event,
  container,
}: SubscriberArgs<any>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const customerId = event?.data?.id
    if (!customerId) return

    const customerModule: any = container.resolve(Modules.CUSTOMER)
    const customer = await customerModule
      .retrieveCustomer(customerId, { relations: ["addresses"] })
      .catch(() => null)
    if (!customer) {
      logger.warn(`[erpnext-sync] customer ${customerId} not found`)
      return
    }

    // Only push the customer when we have a real email (avoid pushing
    // half-formed rows that an admin/system action just created).
    if (!customer.email) {
      return
    }

    let erpnext: { bulkPush?: (a: unknown) => Promise<unknown> } | null = null
    try {
      erpnext = container.resolve(ERPNEXT_MODULE)
    } catch {
      // Plugin not registered / disabled — silently skip.
      return
    }
    if (!erpnext?.bulkPush) return

    await erpnext.bulkPush({
      event: "customer.synced",
      items: [
        {
          id: customer.id,
          payload: {
            id: customer.id,
            email: customer.email,
            first_name: customer.first_name,
            last_name: customer.last_name,
            phone: customer.phone ?? null,
            company_id: customer.metadata?.company_id ?? null,
            metadata: customer.metadata ?? null,
            addresses: customer.addresses ?? [],
          },
        },
      ],
    })
    logger.info(`[erpnext-sync] pushed customer ${customer.id}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error(`[erpnext-sync] failed: ${msg}`)
  }
}

export default pushCustomerToErpnext

export const config: SubscriberConfig = {
  event: ["customer.created", "customer.updated"],
}
