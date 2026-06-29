import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
    POLEMARCH_EMAIL_MODULE,
    EmailModuleService,
} from "../../../../modules/polemarch_communication"

const CreateSchema = z.object({
    slug: z
        .string()
        .min(1)
        .max(120)
        .regex(/^[a-z0-9][a-z0-9._-]*$/, "slug must be lowercase letters/digits/._-"),
    name: z.string().min(1).max(200),
    subject: z.string().min(1).max(500),
    html: z.string().min(1),
    description: z.string().nullable().optional(),
    sample_data: z.record(z.string(), z.any()).nullable().optional(),
})

/**
 * GET /admin/email/templates — list every template (system + custom).
 * POST /admin/email/templates — create a new custom template. System
 *   templates are seeded at module install and cannot be created here —
 *   the admin UI only gates `is_system = true` via a read-only flag in
 *   the editor, not the list endpoint.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const mod = req.scope.resolve(POLEMARCH_EMAIL_MODULE) as EmailModuleService
        const templates = await (mod as any).listEmailTemplates(
            {},
            { order: { is_system: "DESC", slug: "ASC" }, take: 500 },
        )
        return res.json({ templates })
    } catch (err: any) {
        console.error("[admin/email/templates] GET failed:", err)
        return res
            .status(500)
            .json({ message: err?.message || "Failed to load templates" })
    }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const parsed = CreateSchema.safeParse(req.body)
        if (!parsed.success) {
            return res
                .status(400)
                .json({ message: "Invalid payload", errors: parsed.error.flatten() })
        }
        const mod = req.scope.resolve(POLEMARCH_EMAIL_MODULE) as EmailModuleService

        // Reject duplicate slug up-front for a clearer error than the DB
        // unique-violation — the list page already showed the existing row.
        const existing = await mod.getTemplateBySlug(parsed.data.slug)
        if (existing) {
            return res.status(409).json({
                message: `A template with slug "${parsed.data.slug}" already exists`,
            })
        }

        const [template] = await (mod as any).createEmailTemplates([
            {
                slug: parsed.data.slug,
                name: parsed.data.name,
                subject: parsed.data.subject,
                html: parsed.data.html,
                description: parsed.data.description ?? null,
                sample_data: parsed.data.sample_data ?? null,
                is_system: false,
            },
        ])
        return res.json({ template })
    } catch (err: any) {
        console.error("[admin/email/templates] POST failed:", err)
        return res
            .status(500)
            .json({ message: err?.message || "Failed to create template" })
    }
}
