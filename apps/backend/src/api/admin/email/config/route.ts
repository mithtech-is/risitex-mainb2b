import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
    POLEMARCH_EMAIL_MODULE,
    EmailModuleService,
} from "../../../../modules/polemarch_communication"

const UpsertSchema = z.object({
    host: z.string().min(1).optional(),
    port: z.number().int().min(1).max(65535).optional(),
    secure: z.boolean().optional(),
    username: z.string().nullable().optional(),
    // "" = leave as-is, null = clear, non-empty string = replace
    password: z.string().nullable().optional(),
    from_name: z.string().nullable().optional(),
    from_email: z.string().email().optional(),
    reply_to: z.string().email().nullable().optional(),
    enabled: z.boolean().optional(),
})

/**
 * GET /admin/email/config — fetch SMTP config (password redacted).
 * PUT /admin/email/config — upsert config. Password is encrypted before persist.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const mod = req.scope.resolve(POLEMARCH_EMAIL_MODULE) as EmailModuleService
        const view = await mod.getSmtpConfigView()
        return res.json(view)
    } catch (err: any) {
        console.error("[admin/email/config] GET failed:", err)
        return res.status(500).json({ message: err?.message || "Failed to load SMTP config" })
    }
}

export const PUT = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const parsed = UpsertSchema.safeParse(req.body)
        if (!parsed.success) {
            return res.status(400).json({
                message: "Invalid payload",
                errors: parsed.error.flatten(),
            })
        }
        const input = { ...parsed.data }
        // Empty-string password means "don't change"
        if (typeof input.password === "string" && input.password.length === 0) {
            delete input.password
        }
        const mod = req.scope.resolve(POLEMARCH_EMAIL_MODULE) as EmailModuleService
        const view = await mod.upsertSmtpConfig(input)
        return res.json(view)
    } catch (err: any) {
        console.error("[admin/email/config] PUT failed:", err)
        return res.status(500).json({ message: err?.message || "Failed to save SMTP config" })
    }
}
