/**
 * Standalone pusher: create every MISSING WhatsApp template from the
 * local catalog on polyg.in (POST /api/user/add_meta_templet). polyg.in
 * forwards each to Meta for review. NO Medusa / DB boot required — this
 * imports the catalog directly and talks to polyg.in over HTTP.
 *
 *   cd apps/backend
 *   # 1. Fill .env.polygin.local (see keys below).
 *   npx tsx scripts/push-polygin-templates.ts --dry-run   # preview only, pushes nothing
 *   npx tsx scripts/push-polygin-templates.ts             # actually create the missing ones
 *
 * Flags:
 *   --dry-run          Print resolved component payloads + create/skip
 *                      decisions and POST nothing.
 *   --only a,b,c       Restrict to these template slugs.
 *   --force            Push even templates already present on polyg.in.
 *   --env <path>       Env file to load (default: ./.env.polygin.local).
 *
 * Required env (put in apps/backend/.env.polygin.local — gitignored):
 *   POLYGIN_TOKEN          REST/send token (shown on polyg.in's "Rest API"
 *                          page). Goes in the request BODY.
 *   POLYGIN_DASHBOARD_JWT  Dashboard session JWT — the value of
 *                          localStorage.wacrm_user on polyg.in. Authenticates
 *                          the /api/user/* endpoints. SHORT-LIVED: capture it
 *                          fresh (DevTools console: copy(localStorage.wacrm_user))
 *                          right before running.
 *
 * Optional brand env (baked into the copy Meta reviews; defaults shown):
 *   BRAND_NAME=RISITEX  STOREFRONT_URL=https://lamongie.in
 *   SUPPORT_EMAIL=contact@lamongie.in  SUPPORT_PHONE=+918660381681
 *   COMPANY_NAME  ADDRESS  TAGLINE=B2B Textile Commerce
 *   WHATSAPP_BOT_LABEL=Initiate Bot
 */
import * as fs from "fs"
import * as path from "path"
import { DEFAULT_WHATSAPP_TEMPLATES } from "../src/modules/polemarch_communication/seed/default-whatsapp-templates"

const POLYGIN_BASE = "https://polyg.in"

type Args = {
    dryRun: boolean
    force: boolean
    only: string[] | null
    envFile: string
}

function parseArgs(argv: string[]): Args {
    const args: Args = {
        dryRun: false,
        force: false,
        only: null,
        envFile: ".env.polygin.local",
    }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === "--dry-run") args.dryRun = true
        else if (a === "--force") args.force = true
        else if (a === "--only")
            args.only = (argv[++i] || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
        else if (a === "--env") args.envFile = argv[++i] || args.envFile
    }
    return args
}

/** Minimal dotenv loader — KEY=VALUE lines, `#` comments, optional quotes.
 *  Never overrides an already-present process.env value. */
function loadEnvFile(file: string): void {
    const abs = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file)
    if (!fs.existsSync(abs)) return
    for (const raw of fs.readFileSync(abs, "utf8").split(/\r?\n/)) {
        const line = raw.trim()
        if (!line || line.startsWith("#")) continue
        const eq = line.indexOf("=")
        if (eq === -1) continue
        const key = line.slice(0, eq).trim()
        let val = line.slice(eq + 1).trim()
        if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
        )
            val = val.slice(1, -1)
        if (!(key in process.env)) process.env[key] = val
    }
}

/** Mirror of the backend's brandReplacementMap (service.ts) so pushed
 *  copy matches what the runtime render/OTP path produces. */
function brandReplacementMap(): Record<string, string> {
    const botLabel = process.env.WHATSAPP_BOT_LABEL || "Initiate Bot"
    return {
        brand: process.env.BRAND_NAME || "RISITEX",
        company_name:
            process.env.COMPANY_NAME || process.env.BRAND_NAME || "RISITEX",
        storefront_url: process.env.STOREFRONT_URL || "https://lamongie.in",
        support_email: process.env.SUPPORT_EMAIL || "",
        support_phone: process.env.SUPPORT_PHONE || "",
        address: process.env.ADDRESS || "",
        tagline: process.env.TAGLINE || "",
        whatsapp_bot: botLabel,
        whatsapp_bot_phone: process.env.WHATSAPP_BOT_PHONE || "918277540332",
        whatsapp_bot_url: encodeURIComponent(botLabel),
    }
}

function applyBrand(s: string, map: Record<string, string>): string {
    let out = s
    for (const [k, v] of Object.entries(map))
        out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), v)
    return out
}

/** Recursively brand-substitute every string in the components tree.
 *  Positional {{1}}, {{2}} slots are left intact (not named keys). */
function substituteBrandInComponents(
    components: any[],
    map: Record<string, string>,
): any[] {
    const walk = (val: any): any => {
        if (typeof val === "string") return applyBrand(val, map)
        if (Array.isArray(val)) return val.map(walk)
        if (val && typeof val === "object") {
            const o: Record<string, any> = {}
            for (const [k, v] of Object.entries(val)) o[k] = walk(v)
            return o
        }
        return val
    }
    return (components || []).map(walk)
}

async function listRemoteNames(dashJwt: string): Promise<Set<string>> {
    const res = await fetch(`${POLYGIN_BASE}/api/user/get_my_meta_templets`, {
        headers: { Authorization: `Bearer ${dashJwt}` },
    })
    const text = await res.text()
    let body: any = null
    try {
        body = text ? JSON.parse(text) : null
    } catch {
        body = null
    }
    if (body && body.success === false) {
        throw new Error(
            `polyg.in list rejected: ${body.msg || body.message || text.slice(0, 200)} ` +
                `(the dashboard JWT is missing/expired — capture a fresh localStorage.wacrm_user)`,
        )
    }
    const list: any[] = Array.isArray(body)
        ? body
        : body?.templates || body?.data || body?.result || []
    const names = new Set<string>()
    for (const t of list) {
        const n = (t?.name || t?.templetName || "").toLowerCase()
        if (n) names.add(n)
    }
    return names
}

async function pushOne(
    tpl: any,
    map: Record<string, string>,
    restToken: string,
    dashJwt: string,
): Promise<{ ok: boolean; reason?: string; body?: any }> {
    const payload = {
        templateType: "STANDARD",
        name: tpl.name,
        language: tpl.language || "en",
        category: tpl.category,
        parameter_format: "POSITIONAL",
        components: substituteBrandInComponents(tpl.components, map),
        token: restToken,
    }
    const res = await fetch(`${POLYGIN_BASE}/api/user/add_meta_templet`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${dashJwt}`,
        },
        body: JSON.stringify(payload),
    })
    const text = await res.text()
    let body: any = null
    try {
        body = text ? JSON.parse(text) : { _raw: text }
    } catch {
        body = { _raw: text }
    }
    const explicitFail =
        (body && body.success === false) ||
        (body && typeof body.error === "string" && body.error.length > 0) ||
        (body && Array.isArray(body.errors) && body.errors.length > 0)
    const httpOk = res.status >= 200 && res.status < 300
    if (!httpOk || explicitFail) {
        const reason =
            body?.message ||
            body?.msg ||
            body?.error ||
            (Array.isArray(body?.errors)
                ? body.errors
                      .map((e: any) =>
                          typeof e === "string" ? e : e?.message || JSON.stringify(e),
                      )
                      .join("; ")
                : "") ||
            `HTTP ${res.status}`
        return { ok: false, reason, body }
    }
    return { ok: true, body }
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2))
    loadEnvFile(args.envFile)

    const restToken = process.env.POLYGIN_TOKEN || ""
    const dashJwt = process.env.POLYGIN_DASHBOARD_JWT || ""
    const map = brandReplacementMap()

    console.log("Brand substitution values:")
    for (const [k, v] of Object.entries(map)) console.log(`  {{${k}}} -> ${v || "(empty)"}`)

    let templates = DEFAULT_WHATSAPP_TEMPLATES as any[]
    if (args.only) {
        const want = new Set(args.only)
        templates = templates.filter((t) => want.has(t.slug))
    }

    if (!args.dryRun) {
        if (!dashJwt) {
            console.error(
                "\nMissing POLYGIN_DASHBOARD_JWT (dashboard session JWT). Aborting. " +
                    "Add it to .env.polygin.local — it's localStorage.wacrm_user on polyg.in.",
            )
            process.exit(1)
        }
        if (!restToken) {
            console.error("\nMissing POLYGIN_TOKEN (REST token). Aborting.")
            process.exit(1)
        }
    }

    let existing = new Set<string>()
    if (!args.force && dashJwt) {
        try {
            existing = await listRemoteNames(dashJwt)
            console.log(`\npolyg.in already has ${existing.size} template(s).`)
        } catch (e: any) {
            if (args.dryRun) {
                console.warn(
                    `\n(dry-run) couldn't list remote templates: ${e?.message} — treating all as missing.`,
                )
            } else {
                throw e
            }
        }
    } else if (!args.force) {
        console.warn(
            "\n(no dashboard JWT) can't check what's already on polyg.in — showing every template as would-create.",
        )
    }

    const toCreate = templates.filter(
        (t) => args.force || !existing.has(String(t.name).toLowerCase()),
    )
    const skipped = templates.filter(
        (t) => !args.force && existing.has(String(t.name).toLowerCase()),
    )

    console.log(
        `\n${templates.length} catalog template(s): ${toCreate.length} to create, ${skipped.length} already present.`,
    )
    for (const t of skipped) console.log(`  = skip (exists): ${t.name}`)

    let ok = 0
    let fail = 0
    for (const t of toCreate) {
        if (args.dryRun) {
            console.log(`\n--- WOULD CREATE: ${t.name} [${t.category}] (${t.slug}) ---`)
            console.log(
                JSON.stringify(substituteBrandInComponents(t.components, map), null, 2),
            )
            continue
        }
        process.stdout.write(`+ create ${t.name} … `)
        const r = await pushOne(t, map, restToken, dashJwt)
        if (r.ok) {
            ok++
            console.log("ok")
        } else {
            fail++
            console.log(`FAILED: ${r.reason}`)
        }
    }

    console.log(
        `\nDone. ${
            args.dryRun
                ? "(dry-run — nothing pushed)"
                : `${ok} created, ${fail} failed, ${skipped.length} skipped`
        }.`,
    )
    if (!args.dryRun) {
        console.log(
            "Meta review is asynchronous. Check status later in " +
                "/admin → Communication → WhatsApp templates (Sync), or re-run this " +
                "script — already-present templates are skipped.",
        )
    }
    if (fail > 0) process.exit(2)
}

main().catch((e) => {
    console.error(e?.stack || String(e))
    process.exit(1)
})
