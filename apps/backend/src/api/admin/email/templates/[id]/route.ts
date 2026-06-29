import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
    POLEMARCH_EMAIL_MODULE,
    EmailModuleService,
} from "../../../../../modules/polemarch_communication"

/**
 * GET /admin/email/templates/:id
 * PUT /admin/email/templates/:id  — edit subject/html/name/description/sample_data.
 *   `slug` is NEVER editable (it's the stable identifier subscribers key
 *   off of). `is_system` is NEVER editable here.
 * DELETE /admin/email/templates/:id — only allowed for non-system rows.
 */

const UpdateSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    subject: z.string().min(1).max(500).optional(),
    html: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    sample_data: z.record(z.string(), z.any()).nullable().optional(),
})

async function loadTemplate(req: MedusaRequest, id: string) {
    const mod = req.scope.resolve(POLEMARCH_EMAIL_MODULE) as EmailModuleService
    const rows = await (mod as any).listEmailTemplates({ id })
    return { mod, template: rows?.[0] ?? null }
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    const id = (req.params as any).id as string
    try {
        const { template } = await loadTemplate(req, id)
        if (!template) return res.status(404).json({ message: "Template not found" })
        return res.json({ template })
    } catch (err: any) {
        console.error("[admin/email/templates/:id] GET failed:", err)
        return res.status(500).json({ message: err?.message || "Failed to load template" })
    }
}

export const PUT = async (req: MedusaRequest, res: MedusaResponse) => {
    const id = (req.params as any).id as string
    try {
        const parsed = UpdateSchema.safeParse(req.body)
        if (!parsed.success) {
            return res
                .status(400)
                .json({ message: "Invalid payload", errors: parsed.error.flatten() })
        }
        const { mod, template } = await loadTemplate(req, id)
        if (!template) return res.status(404).json({ message: "Template not found" })

        await (mod as any).updateEmailTemplates({ id, ...parsed.data })
        const updated = await (mod as any).listEmailTemplates({ id })
        return res.json({ template: updated?.[0] ?? null })
    } catch (err: any) {
        console.error("[admin/email/templates/:id] PUT failed:", err)
        return res.status(500).json({ message: err?.message || "Failed to update template" })
    }
}

export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
    const id = (req.params as any).id as string
    try {
        const { mod, template } = await loadTemplate(req, id)
        if (!template) return res.status(404).json({ message: "Template not found" })
        if (template.is_system) {
            return res.status(400).json({
                message: "System templates cannot be deleted. Edit them instead.",
            })
        }
        await (mod as any).deleteEmailTemplates([id])
        return res.json({ deleted: true, id })
    } catch (err: any) {
        console.error("[admin/email/templates/:id] DELETE failed:", err)
        return res.status(500).json({ message: err?.message || "Failed to delete template" })
    }
}
