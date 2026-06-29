/**
 * Generic transform engine that consumes an `erpnext_mapping` row and
 * a source object (either a Medusa entity or a Frappe doc) and emits
 * the corresponding payload for the other side.
 *
 * Why a dedicated engine vs. case-by-case handlers:
 *   The operator builds field-by-field pairs in the admin UI. The
 *   subscriber and pull cron consume those pairs identically — the
 *   only difference is `direction` (push vs pull). Pulling the
 *   transform logic out keeps both paths thin and lets us unit-test
 *   the gnarliest part of the system in isolation.
 *
 * Not in scope:
 *   - Calling Frappe or Medusa. The engine only transforms in
 *     memory. The push/pull callers handle I/O.
 *   - Schema validation. The Frappe side's REST layer rejects
 *     invalid payloads with a clear error which we capture into
 *     `erpnext_sync_event.last_error`.
 *
 * Transforms (string codes; matched case-insensitively):
 *   lowercase / uppercase / trim
 *   number / integer / boolean   — coerce; non-coercible → null
 *   json                         — JSON.stringify
 *   split:<sep>                  — string → array via sep ("split:,")
 *   join:<sep>                   — array → string via sep ("join: | ")
 *   prefix:<s> / suffix:<s>      — concat constants
 *   slice:<start>:<end>          — substring or array slice
 *   date_iso / date_yyyy_mm_dd   — Date or parseable string → ISO / YYYY-MM-DD
 *
 * Any unknown transform is a no-op (logged, not thrown — operator
 * mistakes shouldn't break the whole sync).
 */

export type MappingDirection = "push" | "pull" | "both"

export type MappingFieldPair = {
    medusa_path: string
    erpnext_field: string
    /** Per-field direction override. Defaults to the parent mapping's
     *  `direction` when absent. */
    direction?: MappingDirection
    /** Optional transform code (see file-doc). Applied AFTER reading
     *  from the source and BEFORE writing to the target. */
    transform?: string | null
    /** Fallback value when the source field is missing/empty/null.
     *  Set to a static string/number/boolean or null. */
    default?: unknown
    /** When true, a missing source value short-circuits the whole
     *  mapping (caller skips with `required_missing` reason). When
     *  false (default), the target field is simply omitted. */
    required?: boolean
}

export type ApplyMappingArgs = {
    direction: "push" | "pull"
    /** The whole field_mappings array off the mapping row. */
    fields: MappingFieldPair[]
    /** Per-mapping direction (`push` | `pull` | `both`) from the row.
     *  Used as the default when a pair has no explicit direction. */
    mappingDirection: MappingDirection
    /** Source object. On push: the enriched Medusa entity (dot-paths).
     *  On pull: the Frappe doc (top-level field names). */
    source: Record<string, any>
}

export type ApplyMappingResult =
    | { ok: true; payload: Record<string, any>; skippedFields: string[] }
    | { ok: false; reason: string; field?: string }

/**
 * Apply one mapping's `field_mappings` to a source object, producing
 * a target payload suitable for the receiving side.
 */
export function applyMapping(args: ApplyMappingArgs): ApplyMappingResult {
    const payload: Record<string, any> = {}
    const skipped: string[] = []

    for (const pair of args.fields ?? []) {
        const effectiveDirection = pair.direction ?? args.mappingDirection
        if (!fieldFlowsInDirection(effectiveDirection, args.direction)) {
            // Operator opted this field out of the current sync
            // direction — leave the target untouched. NOT counted in
            // `skipped` because that's reserved for missing-value
            // skips that ops should see.
            continue
        }

        const sourcePath =
            args.direction === "push" ? pair.medusa_path : pair.erpnext_field
        const targetField =
            args.direction === "push" ? pair.erpnext_field : pair.medusa_path

        if (!sourcePath || !targetField) {
            skipped.push(targetField || sourcePath || "<unset>")
            continue
        }

        const raw = getByPath(args.source, sourcePath)
        let value: unknown = raw

        if (isEmpty(value)) {
            if (pair.default !== undefined) {
                value = pair.default
            } else if (pair.required) {
                return {
                    ok: false,
                    reason: "required_field_missing",
                    field: sourcePath,
                }
            } else {
                skipped.push(sourcePath)
                continue
            }
        }

        value = applyTransform(value, pair.transform)

        if (args.direction === "push") {
            // Frappe payloads are flat objects keyed by fieldname.
            // No dot-path expansion needed on the target side.
            payload[targetField] = value
        } else {
            // On pull we write back into Medusa with dot-paths so a
            // single mapping can land into `metadata.kyc_pan` etc.
            setByPath(payload, targetField, value)
        }
    }

    return { ok: true, payload, skippedFields: skipped }
}

/**
 * Resolve whether a per-field (or per-mapping) direction allows the
 * current sync direction to flow. "both" is permissive in either
 * direction; "push" and "pull" are exclusive.
 */
function fieldFlowsInDirection(
    fieldDir: MappingDirection,
    runDir: "push" | "pull",
): boolean {
    if (fieldDir === "both") return true
    return fieldDir === runDir
}

/**
 * Walk a dot-path through an object, returning undefined on any miss
 * (no throws). Array indices in the path are supported via numeric
 * tokens — "items.0.title" → object["items"][0]["title"].
 */
export function getByPath(src: any, path: string): unknown {
    if (src == null) return undefined
    if (!path) return src
    const tokens = path.split(".")
    let cur: any = src
    for (const tok of tokens) {
        if (cur == null) return undefined
        const idx = Number.isInteger(Number(tok)) ? Number(tok) : null
        if (Array.isArray(cur) && idx !== null) {
            cur = cur[idx]
        } else if (typeof cur === "object") {
            cur = cur[tok]
        } else {
            return undefined
        }
    }
    return cur
}

/**
 * Write a value into a target object via dot-path, creating any
 * missing intermediate plain objects. Doesn't materialise arrays —
 * a path with numeric tokens still creates an object at that level
 * (callers building pull payloads for Medusa want object shape, not
 * array shape).
 */
export function setByPath(
    target: Record<string, any>,
    path: string,
    value: unknown,
): void {
    if (!path) return
    const tokens = path.split(".")
    let cur: any = target
    for (let i = 0; i < tokens.length; i += 1) {
        const tok = tokens[i]
        if (i === tokens.length - 1) {
            cur[tok] = value
            return
        }
        if (cur[tok] == null || typeof cur[tok] !== "object") {
            cur[tok] = {}
        }
        cur = cur[tok]
    }
}

function isEmpty(v: unknown): boolean {
    if (v === null || v === undefined) return true
    if (typeof v === "string" && v.trim() === "") return true
    if (Array.isArray(v) && v.length === 0) return true
    return false
}

/**
 * Apply a transform code to a value. Returns the (possibly type-
 * changed) result. Unknown codes are no-ops. Failures within a
 * transform return the original value rather than throwing — operator
 * mistakes shouldn't break the whole sync run.
 */
export function applyTransform(value: unknown, code?: string | null): unknown {
    if (!code) return value
    const [name, ...rawArgs] = code.split(":")
    const arg = rawArgs.join(":")
    const norm = (name ?? "").trim().toLowerCase()

    try {
        switch (norm) {
            case "":
                return value
            case "lowercase":
                return typeof value === "string" ? value.toLowerCase() : value
            case "uppercase":
                return typeof value === "string" ? value.toUpperCase() : value
            case "trim":
                return typeof value === "string" ? value.trim() : value
            case "number": {
                const n = Number(value)
                return Number.isFinite(n) ? n : null
            }
            case "integer": {
                const n = Number(value)
                return Number.isFinite(n) ? Math.trunc(n) : null
            }
            case "boolean": {
                if (typeof value === "boolean") return value
                if (value == null) return false
                if (typeof value === "number") return value !== 0
                const s = String(value).trim().toLowerCase()
                if (["true", "1", "yes", "y", "on"].includes(s)) return true
                if (["false", "0", "no", "n", "off", ""].includes(s)) return false
                return Boolean(value)
            }
            case "json":
                return JSON.stringify(value)
            case "split":
                return typeof value === "string"
                    ? value.split(arg || ",")
                    : value
            case "join":
                return Array.isArray(value) ? value.join(arg || ",") : value
            case "prefix":
                return value == null ? value : `${arg}${value}`
            case "suffix":
                return value == null ? value : `${value}${arg}`
            case "slice": {
                const [a, b] = (arg || "").split(":")
                const start = Number(a)
                const end = b !== undefined && b !== "" ? Number(b) : undefined
                if (typeof value === "string") {
                    return value.slice(
                        Number.isFinite(start) ? start : 0,
                        Number.isFinite(end as number) ? (end as number) : undefined,
                    )
                }
                if (Array.isArray(value)) {
                    return value.slice(
                        Number.isFinite(start) ? start : 0,
                        Number.isFinite(end as number) ? (end as number) : undefined,
                    )
                }
                return value
            }
            case "date_iso": {
                const d = value instanceof Date ? value : new Date(value as any)
                return Number.isNaN(d.getTime()) ? null : d.toISOString()
            }
            case "date_yyyy_mm_dd": {
                const d = value instanceof Date ? value : new Date(value as any)
                if (Number.isNaN(d.getTime())) return null
                return d.toISOString().slice(0, 10)
            }
            default:
                // Unknown transform — leave the value untouched. We
                // could throw, but a typo in the admin form
                // shouldn't pin every sync run.
                return value
        }
    } catch {
        return value
    }
}
