import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ERPNEXT_MODULE } from "../../../../../../modules/erpnext"

/**
 * POST /admin/erpnext/mappings/:mapping_id/test
 *
 * Dry-run a mapping against a real Medusa record without hitting
 * Frappe. Used by the admin "Test" button in the mapping editor.
 *
 * Body: { record_id: string }
 *
 * Response (success):
 *   {
 *     ok: true,
 *     payload: { ... Frappe-shaped payload that would be POSTed ... },
 *     key_value: "string",        // the Frappe key derived from the source
 *     skipped_fields: ["..."],    // fields that had no source value
 *   }
 *
 * Response (failure):
 *   { ok: false, message: "<reason>" }
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    const erpnext: any = req.scope.resolve(ERPNEXT_MODULE)
    const { mapping_id } = req.params as { mapping_id: string }
    const body = (req.body ?? {}) as { record_id?: string }
    if (!body.record_id) {
        res.status(400).json({ ok: false, message: "record_id is required" })
        return
    }
    try {
        const result = await erpnext.dryRunPush({
            mapping_id,
            record_id: body.record_id,
            container: req.scope,
        })
        if (!result.ok) {
            res.status(400).json(result)
            return
        }
        res.json(result)
    } catch (err: any) {
        res.status(500).json({
            ok: false,
            message: err?.message ?? "dry_run_failed",
        })
    }
}
