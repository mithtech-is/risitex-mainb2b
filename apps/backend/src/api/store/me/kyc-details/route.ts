import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  CASHFREE_WALLET_MODULE,
  CashfreeWalletService,
} from "../../../../modules/cashfree_wallet"

/**
 * GET /store/me/kyc-details
 *
 * Returns the signed-in customer's KYC-derived identity fields —
 * for the read-only "Details as per Official Documents" section
 * on /dashboard/account. Joined via customer.metadata.pan_hash and
 * customer.metadata.aadhaar_hash.
 *
 * What's returned:
 *   - PAN: registered_name, name_pan_card, dob, gender, pan_masked
 *   - Aadhaar: name, dob, gender, aadhaar_masked, address (PAN's
 *     address takes precedence; Aadhaar's is the fallback)
 *
 * What's intentionally NOT returned to the storefront:
 *   - Full PAN string (we hold it but the storefront doesn't need
 *     it; admin reveals it via the registry)
 *   - Full Aadhaar string (UIDAI: never expose)
 *   - response_raw blob (verbose; admin-only)
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata?.customer_id as
    | string
    | undefined
  if (!customerId) return res.status(401).json({ message: "Not authenticated" })

  const customerModule = req.scope.resolve(Modules.CUSTOMER) as any
  const walletModule = req.scope.resolve(
    CASHFREE_WALLET_MODULE,
  ) as CashfreeWalletService

  const customer = await customerModule.retrieveCustomer(customerId).catch(() => null)
  if (!customer) return res.status(404).json({ message: "Customer not found" })

  const meta = (customer.metadata ?? {}) as Record<string, unknown>
  const panHash = typeof meta.pan_hash === "string" ? meta.pan_hash : null
  const aadhaarHash =
    typeof meta.aadhaar_hash === "string" ? meta.aadhaar_hash : null

  const [panRecord, aadhaarRecord] = await Promise.all([
    panHash
      ? walletModule.lookupPanRecordByHash(panHash).catch(() => null)
      : Promise.resolve(null),
    aadhaarHash
      ? walletModule.lookupAadhaarRecordByHash(aadhaarHash).catch(() => null)
      : Promise.resolve(null),
  ])

  // Whitelist what we surface — defense in depth. New fields added
  // to pan_record / aadhaar_record don't auto-leak to the storefront.
  const pan = panRecord
    ? {
        pan_masked: panRecord.pan_masked,
        registered_name: panRecord.registered_name,
        name_pan_card: panRecord.name_pan_card ?? null,
        date_of_birth: panRecord.date_of_birth ?? null,
        gender: panRecord.gender ?? null,
        pan_status: panRecord.pan_status ?? null,
        address: panRecord.address ?? null,
      }
    : null

  const aadhaar = aadhaarRecord
    ? {
        aadhaar_masked: aadhaarRecord.aadhaar_masked,
        name: aadhaarRecord.name,
        date_of_birth: aadhaarRecord.date_of_birth ?? null,
        gender: aadhaarRecord.gender ?? null,
        address: aadhaarRecord.address ?? null,
      }
    : null

  res.json({
    pan,
    aadhaar,
    aadhaar_phone:
      typeof meta.aadhaar_phone === "string" ? meta.aadhaar_phone : null,
    correspondence_address:
      meta.correspondence_address &&
      typeof meta.correspondence_address === "object"
        ? (meta.correspondence_address as Record<string, unknown>)
        : null,
  })
}
