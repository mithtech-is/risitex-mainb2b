import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
    POLEMARCH_EMAIL_MODULE,
    EmailModuleService,
} from "../../../../modules/polemarch_communication"

/**
 * GET /admin/email/events — every event→template binding.
 * PUT /admin/email/events — upsert one binding (POST semantics,
 *   idempotent on `event_name`).
 */

const UpsertSchema = z.object({
    event_name: z.string().min(1).max(200),
    template_slug: z.string().min(1).max(200),
    to_resolver: z.enum(["customer_email", "admin_email", "static"]).optional(),
    static_to: z.string().email().nullable().optional(),
    enabled: z.boolean().optional(),
})

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const mod = req.scope.resolve(POLEMARCH_EMAIL_MODULE) as EmailModuleService
        const mappings = await (mod as any).listEventTemplateMaps(
            {},
            { order: { event_name: "ASC" }, take: 500 },
        )
        return res.json({ mappings })
    } catch (err: any) {
        console.error("[admin/email/events] GET failed:", err)
        return res.status(500).json({ message: err?.message || "Failed to load events" })
    }
}

export const PUT = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const parsed = UpsertSchema.safeParse(req.body)
        if (!parsed.success) {
            return res
                .status(400)
                .json({ message: "Invalid payload", errors: parsed.error.flatten() })
        }
        const mod = req.scope.resolve(POLEMARCH_EMAIL_MODULE) as EmailModuleService
        const mapping = await mod.upsertEventMapping({
            event_name: parsed.data.event_name,
            template_slug: parsed.data.template_slug,
            to_resolver: parsed.data.to_resolver,
            static_to: parsed.data.static_to ?? undefined,
            enabled: parsed.data.enabled,
        })
        return res.json({ mapping })
    } catch (err: any) {
        console.error("[admin/email/events] PUT failed:", err)
        return res.status(500).json({ message: err?.message || "Failed to save event mapping" })
    }
}
