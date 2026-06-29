/**
 * Registry of Medusa-side entities the mapping UI can target.
 *
 * Each entry describes:
 *   - which Medusa module owns the entity (built-in or custom)
 *   - which event names fire on its lifecycle (used as the default
 *     `events` array suggestion in the admin form)
 *   - the dot-paths the operator can pick from in the left column of
 *     the field-mapper (with types + descriptions, so the UI can
 *     render a sensible picker)
 *   - how to fetch a fully-enriched record by id (used by the push
 *     subscriber + the pull cron's upsert path)
 *   - how to upsert a record by an arbitrary key (used by the pull
 *     cron when applying changes from Frappe back into Medusa)
 *   - whether the underlying module is actually installed on this
 *     Medusa deployment — controls whether the entity shows up in
 *     the admin picker
 *
 * Built-in modules (CUSTOMER, ORDER, PRODUCT, CART, REGION, …) are
 * always available — Medusa wires them into every project. Custom
 * polemarch modules (cashfree_wallet, calcula, watchlist, gamification,
 * …) only appear if registered in medusa-config.ts. The availability
 * check is a try/catch around `container.resolve(moduleName)` — no
 * separate registration list to keep in sync.
 *
 * Extending the registry: new entry per entity, ideally via the
 * `genericEntity()` builder so the boilerplate stays tiny. The
 * builder derives the standard `fetchById` / `upsertByKey` /
 * `availableInContainer` adapters from a module name + model name.
 */

import { Modules } from "@medusajs/framework/utils"

export type MedusaFieldType =
    | "string"
    | "number"
    | "boolean"
    | "json"
    | "datetime"
    | "array"
    | "id"

export type MedusaFieldDescriptor = {
    /** Dot-notation path relative to the enriched entity object. */
    path: string
    label: string
    type: MedusaFieldType
    description?: string
    /** Default suggested transform — gives the UI a sensible starting
     *  point ("emails should probably be lowercased on push"). */
    suggested_transform?: string
}

export type EntityFetcher = (
    container: any,
    id: string,
) => Promise<Record<string, any> | null>

export type EntityUpserter = (
    container: any,
    key_field: string,
    key_value: string,
    payload: Record<string, any>,
) => Promise<{ ok: boolean; id?: string; created?: boolean; error?: string }>

export type EntityDescriptor = {
    key: string
    label: string
    /** Source module name. Built-in modules use the `Modules.X`
     *  constant string (e.g. "customer"); custom modules use their
     *  literal name as registered in medusa-config.ts (e.g.
     *  "cashfree_wallet"). The `availableInContainer` adapter uses
     *  this to confirm the module is registered. */
    moduleName: string
    /** Whether this is a Polemarch-side module that may or may not
     *  be installed (vs. a Medusa core module that's always there).
     *  Drives the availability check + a UI badge ("custom module"). */
    isCustomModule: boolean
    /** Suggested Medusa event names this entity fires. The admin UI
     *  pre-fills the events checkbox group; the operator can still
     *  pick any subset / add custom names. */
    events: string[]
    /** Curated list of dot-paths surfaced in the field-mapper. */
    paths: MedusaFieldDescriptor[]
    /** Default identity field used on push — matches the Frappe-side
     *  `name` lookup. Operator can override per-mapping. */
    default_key_path: string
    fetchById: EntityFetcher
    upsertByKey: EntityUpserter
    /** Optional availability check. When omitted, defaults to a
     *  try/resolve on `moduleName`. Override for entities whose
     *  parent module exposes them via a sub-feature flag. */
    availableInContainer?: (container: any) => boolean
}

// ─── Generic builder ─────────────────────────────────────────────────

type GenericEntityArgs = {
    key: string
    label: string
    moduleName: string
    isCustomModule?: boolean
    /** Model name singular (e.g. "Customer", "Wallet"). The adapter
     *  derives the list/update method names from this — "Customer"
     *  → `listCustomers` + `updateCustomers`. Override `methodSuffix`
     *  if your service breaks the plural convention. */
    modelName: string
    /** Method-name suffix used to compose `list<X>` / `update<X>`.
     *  Defaults to `<modelName>s`. Override for irregular plurals
     *  (e.g. CustomerGroup → CustomerGroups). */
    methodSuffix?: string
    /** Default `relations` to load when fetching by id. Empty array
     *  by default. */
    fetchRelations?: string[]
    events: string[]
    default_key_path: string
    paths: MedusaFieldDescriptor[]
    /** Override the default upsertByKey — for entities that need
     *  custom upsert semantics (e.g. wallets that must go through
     *  the service's credit/debit helpers, or immutable ledgers). */
    upsertByKey?: EntityUpserter
}

function genericEntity(args: GenericEntityArgs): EntityDescriptor {
    const suffix = args.methodSuffix ?? `${args.modelName}s`
    const listFn = `list${suffix}`
    const updateFn = `update${suffix}`
    const createFn = `create${suffix}`
    return {
        key: args.key,
        label: args.label,
        moduleName: args.moduleName,
        isCustomModule: args.isCustomModule ?? false,
        events: args.events,
        paths: args.paths,
        default_key_path: args.default_key_path,
        async fetchById(container, id) {
            const m: any = container.resolve(args.moduleName)
            const opts: any = { take: 1 }
            if (args.fetchRelations?.length) opts.relations = args.fetchRelations
            const rows = await m[listFn]({ id }, opts)
            return rows?.[0] ?? null
        },
        async upsertByKey(container, key_field, key_value, payload) {
            if (args.upsertByKey) {
                return args.upsertByKey(container, key_field, key_value, payload)
            }
            const m: any = container.resolve(args.moduleName)
            const filter: any = {}
            filter[key_field] = key_value
            const [existing] = await m[listFn](filter, { take: 1 })
            if (existing) {
                const [updated] = await m[updateFn]([
                    { id: existing.id, ...payload },
                ])
                return { ok: true, id: updated.id, created: false }
            }
            if (typeof m[createFn] === "function") {
                const created = await m[createFn]([payload])
                const row = Array.isArray(created) ? created[0] : created
                return { ok: true, id: row?.id, created: true }
            }
            return {
                ok: false,
                error: `module '${args.moduleName}' has no ${createFn} helper`,
            }
        },
    }
}

// ─── Built-in Medusa entities (always available) ─────────────────────

// Listen to bank/demat verification events too so the same customer-
// push subscriber re-fires whenever a bank account or demat account
// gets verified (or unverified) on the Medusa side. Both events carry
// `{customer_id}` in the payload; the subscriber's fetchById uses
// the customer id to enrich.
const customerEntity = genericEntity({
    key: "customer",
    label: "Customer",
    moduleName: Modules.CUSTOMER,
    modelName: "Customer",
    events: [
        "customer.created",
        "customer.updated",
        "customer.deleted",
        // ── Bank + demat verification → re-push customer to Frappe ──
        // These events are emitted by the cashfree_wallet admin verify
        // routes (bank-accounts/[id]/verify, demat-accounts/[id]/
        // verify). The push payload includes the enriched customer
        // with bank_accounts[] and demat_accounts[] arrays so Frappe
        // can upsert child rows into custom_bank_details / custom_dp_
        // details. The KYC gate (in erpnext-forward.ts) still applies.
        "bank_account.verified",
        "bank_account.unverified",
        "demat_account.verified",
        "demat_account.unverified",
    ],
    default_key_path: "email",
    fetchRelations: ["addresses"],
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "email", label: "Email", type: "string", suggested_transform: "lowercase" },
        { path: "first_name", label: "First name", type: "string" },
        { path: "last_name", label: "Last name", type: "string" },
        { path: "phone", label: "Phone", type: "string", suggested_transform: "trim" },
        { path: "company_name", label: "Company", type: "string" },
        { path: "has_account", label: "Has account", type: "boolean" },
        { path: "addresses.0.address_1", label: "Primary address line 1", type: "string" },
        { path: "addresses.0.address_2", label: "Primary address line 2", type: "string" },
        { path: "addresses.0.city", label: "Primary city", type: "string" },
        { path: "addresses.0.province", label: "Primary state / province", type: "string" },
        { path: "addresses.0.postal_code", label: "Primary postal code", type: "string" },
        { path: "addresses.0.country_code", label: "Primary country (ISO)", type: "string", suggested_transform: "uppercase" },
        { path: "metadata.kyc_pan", label: "KYC PAN (metadata)", type: "string", suggested_transform: "uppercase" },
        { path: "metadata.client_id", label: "Polemarch client id (metadata)", type: "string" },
        { path: "metadata", label: "Whole metadata blob", type: "json", suggested_transform: "json" },
        { path: "created_at", label: "Created at", type: "datetime", suggested_transform: "date_iso" },
        { path: "updated_at", label: "Updated at", type: "datetime", suggested_transform: "date_iso" },
    ],
    upsertByKey: async (container, _kf, _kv, payload) => {
        const m: any = container.resolve(Modules.CUSTOMER)
        const email = payload.email
        if (!email) return { ok: false, error: "customer upsert needs `email` on the payload" }
        const [existing] = await m.listCustomers({ email }, { take: 1 })
        if (existing) {
            const [u] = await m.updateCustomers([{ id: existing.id, ...payload }])
            return { ok: true, id: u.id, created: false }
        }
        const [c] = await m.createCustomers([payload])
        return { ok: true, id: c.id, created: true }
    },
})

/**
 * Override the auto-generated customer.fetchById so the enriched
 * payload pushed to Frappe ALSO carries bank_accounts[] and
 * demat_accounts[] arrays from the cashfree_wallet module. The Frappe
 * side handler (`_handle_customer_updated` in medusa_webhook.py)
 * upserts those arrays into the Customer's `custom_bank_details` and
 * `custom_dp_details` child tables.
 *
 * Why on customerEntity (not separate bank/demat entities): bank +
 * demat are 1:N children of Customer. The Frappe Customer doctype's
 * child-table model is the natural target. Treating them as
 * standalone entities would require their own canonical mappings +
 * webhook handlers AND coordination with the parent customer push;
 * piggybacking on customer.* events is simpler and idempotent.
 *
 * The cashfree_wallet module is resolved by string name (not import)
 * to avoid pulling its barrel into the plugin's build graph.
 */
const _genericFetchById = customerEntity.fetchById
customerEntity.fetchById = async (container, id) => {
    const customer = await _genericFetchById(container, id)
    if (!customer) return null
    try {
        const wallet: any = container.resolve("cashfree_wallet")
        // The Polemarch client ID is issued by the customer_identity
        // module on KYC + bank verification — it's the operator-facing
        // customer reference (8-digit "00022619"-style), stored in the
        // `customer_client_id` table rather than on the customer's
        // metadata. Resolve the module separately so a missing-module
        // fallback (dev env without polemarch wiring) doesn't strip
        // the bank/demat enrichment from the main try block.
        let polemarchClientId: string | null = null
        try {
            const ci: any = container.resolve("customer_identity")
            const row = await ci.getByCustomerId(id).catch(() => null)
            polemarchClientId =
                (row as any)?.client_id ?? null
        } catch {
            // module not registered in this container — skip
        }
        // `listBankAccountsForSync` decrypts the `account_number_
        // encrypted` column per-row and returns the full account
        // number alongside the public fields (last4, IFSC, etc.).
        // Frappe's `_sync_bank_accounts` writes that full number
        // into custom_bank_details.ac_number — without it the
        // operator only sees the trailing 4 digits, which isn't
        // enough to make a payout/transfer.
        const [bankAccounts, dematAccountsRaw, vbaList] = await Promise.all([
            wallet.listBankAccountsForSync(id).catch(() => []),
            wallet.listDematAccounts({ customer_id: id }).catch(() => []),
            wallet
                .listCashfreeVirtualAccounts(
                    { customer_id: id } as any,
                    { take: 5 } as any,
                )
                .catch(() => []),
        ])
        const dematAccounts = dematAccountsRaw ?? []
        if (polemarchClientId) {
            ;(customer as any).polemarch_client_id = polemarchClientId
        }
        // The wallet helper has already stripped the encrypted
        // ciphertext; we forward its scalar projection as-is. NB
        // `account_number` carries the FULL decrypted number — keep
        // this payload off any log surface that isn't already
        // PII-safe.
        ;(customer as any).bank_accounts = bankAccounts ?? []
        ;(customer as any).demat_accounts = dematAccounts.map((d: any) => ({
            id: d.id,
            depository: d.depository,
            dp_id: d.dp_id,
            client_id: d.client_id,
            boid: d.boid,
            dp_name: d.dp_name,
            account_holder_name: d.account_holder_name,
            cmr_file_url: d.cmr_file_url,
            verification_status: d.verification_status,
            is_primary: d.is_primary,
            verified_at: d.verified_at,
        }))

        // ── Synthesised top-level mapping inputs ─────────────────
        // Canonical mappings can't fall back through multiple
        // medusa_paths in a single pair, so we materialise these
        // derived fields on the customer object here. The Customer
        // ↔ Customer mapping references them as plain top-level
        // paths (no `metadata.` prefix), which keeps the field-pair
        // list readable in the admin UI.

        // 1. Primary VBA — Cashfree-issued virtual account number
        //    the customer funds the wallet through. Used by Frappe
        //    operators for inbound transfer reconciliation.
        const vba = (vbaList ?? []).find(
            (v: any) => v?.virtual_account_number,
        )
        if (vba) {
            ;(customer as any).vba_account_number =
                (vba as any).virtual_account_number ?? null
            ;(customer as any).vba_ifsc = (vba as any).ifsc ?? null
        }

        // 2. Primary demat — pick the verified+is_primary row to
        //    populate Customer.custom_demat_number and
        //    Customer.custom_dp_primary at the form-header level
        //    (Frappe operators expect to see the BOID + DP name on
        //    the Customer doc itself, not just inside the DP Details
        //    child table).
        const primaryDemat = dematAccounts.find(
            (d: any) =>
                d?.is_primary === true &&
                d?.verification_status === "verified",
        )
        if (primaryDemat) {
            const depository = String(
                (primaryDemat as any).depository ?? "",
            ).toUpperCase()
            let boid: string = (primaryDemat as any).boid ?? ""
            if (!boid && depository !== "CDSL") {
                const dp = (primaryDemat as any).dp_id ?? ""
                const cl = (primaryDemat as any).client_id ?? ""
                boid = `${dp}${cl}`
            }
            ;(customer as any).primary_demat_boid = boid || null
            ;(customer as any).primary_demat_dp_name =
                (primaryDemat as any).dp_name ?? null
        }

        // 3. DoB — Cashfree returns Aadhaar DoB in DD-MM-YYYY
        //    format, but Frappe's custom_dob is a Date column whose
        //    parser expects YYYY-MM-DD (or ISO 8601 datetime). Pre-
        //    convert here so the mapping pair doesn't need a custom
        //    transform.
        const aadhaarDob = (customer.metadata as any)?.aadhaar_dob
        if (typeof aadhaarDob === "string") {
            const m = aadhaarDob.match(/^(\d{2})-(\d{2})-(\d{4})$/)
            if (m) {
                ;(customer as any).customer_dob_iso = `${m[3]}-${m[2]}-${m[1]}`
            } else if (/^\d{4}-\d{2}-\d{2}/.test(aadhaarDob)) {
                ;(customer as any).customer_dob_iso = aadhaarDob.slice(0, 10)
            }
        }
    } catch (err) {
        // cashfree_wallet not installed (e.g. dev env without it) —
        // fall through with whatever the generic fetch returned.
        ;(customer as any).bank_accounts = []
        ;(customer as any).demat_accounts = []
    }
    return customer
}

const customerGroupEntity = genericEntity({
    key: "customer_group",
    label: "Customer group",
    moduleName: Modules.CUSTOMER,
    modelName: "CustomerGroup",
    events: ["customer_group.created", "customer_group.updated", "customer_group.deleted"],
    default_key_path: "name",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "name", label: "Name", type: "string" },
        { path: "metadata", label: "Metadata", type: "json", suggested_transform: "json" },
        { path: "created_at", label: "Created at", type: "datetime", suggested_transform: "date_iso" },
    ],
})

const orderEntity: EntityDescriptor = {
    key: "order",
    label: "Order",
    moduleName: Modules.ORDER,
    isCustomModule: false,
    events: ["order.placed", "order.payment_captured", "order.fulfillment_created", "order.canceled"],
    default_key_path: "display_id",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "display_id", label: "Display id (#42)", type: "number" },
        { path: "email", label: "Customer email", type: "string", suggested_transform: "lowercase" },
        { path: "currency_code", label: "Currency", type: "string", suggested_transform: "uppercase" },
        { path: "total", label: "Total (minor units)", type: "number" },
        { path: "subtotal", label: "Subtotal (minor units)", type: "number" },
        { path: "tax_total", label: "Tax total (minor units)", type: "number" },
        { path: "discount_total", label: "Discount total (minor units)", type: "number" },
        { path: "payment_status", label: "Payment status", type: "string" },
        { path: "fulfillment_status", label: "Fulfillment status", type: "string" },
        { path: "customer.id", label: "Customer id", type: "id" },
        { path: "shipping_address.address_1", label: "Shipping address line 1", type: "string" },
        { path: "shipping_address.city", label: "Shipping city", type: "string" },
        { path: "shipping_address.country_code", label: "Shipping country (ISO)", type: "string", suggested_transform: "uppercase" },
        { path: "items", label: "Line items (array)", type: "array", suggested_transform: "json" },
        { path: "created_at", label: "Created at", type: "datetime", suggested_transform: "date_iso" },
    ],
    async fetchById(container, id) {
        const m: any = container.resolve(Modules.ORDER)
        const [row] = await m.listOrders({ id }, {
            take: 1,
            relations: [
                "items",
                "items.variant",
                "items.variant.product",
                "shipping_address",
                "billing_address",
                "payment_collections",
            ],
        })
        return row ?? null
    },
    async upsertByKey() {
        return { ok: false, error: "order upsert from ERPNext not supported (Sales Invoices are generated FROM Medusa orders)" }
    },
}

const productEntity: EntityDescriptor = {
    key: "product",
    label: "Product",
    moduleName: Modules.PRODUCT,
    isCustomModule: false,
    events: ["product.created", "product.updated", "product.deleted"],
    default_key_path: "metadata.isin",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "title", label: "Title", type: "string" },
        { path: "handle", label: "Handle (URL slug)", type: "string" },
        { path: "subtitle", label: "Subtitle", type: "string" },
        { path: "description", label: "Description", type: "string" },
        { path: "status", label: "Status (draft/published)", type: "string" },
        { path: "thumbnail", label: "Thumbnail URL", type: "string" },
        { path: "metadata.isin", label: "ISIN (metadata)", type: "string", suggested_transform: "uppercase" },
        { path: "metadata.search_aliases", label: "Search aliases (metadata, csv)", type: "string" },
        { path: "metadata.sector", label: "Sector (metadata)", type: "string" },
        { path: "metadata.industry", label: "Industry (metadata)", type: "string" },
        { path: "metadata.face_value", label: "Face value (metadata)", type: "string" },
        { path: "metadata", label: "Whole metadata blob", type: "json", suggested_transform: "json" },
        { path: "variants.0.sku", label: "First variant SKU", type: "string" },
        { path: "created_at", label: "Created at", type: "datetime", suggested_transform: "date_iso" },
        { path: "updated_at", label: "Updated at", type: "datetime", suggested_transform: "date_iso" },
    ],
    async fetchById(container, id) {
        const m: any = container.resolve(Modules.PRODUCT)
        const [row] = await m.listProducts({ id }, { take: 1, relations: ["variants"] })
        return row ?? null
    },
    async upsertByKey(container, key_field, key_value, payload) {
        const m: any = container.resolve(Modules.PRODUCT)
        const filter: any = {}
        if (key_field.startsWith("metadata.")) {
            filter.metadata = { [key_field.slice("metadata.".length)]: key_value }
        } else {
            filter[key_field] = key_value
        }
        const existing = await m.listProducts(filter, { select: ["id", "metadata"], take: 1 })
        if (existing?.length) {
            const mergedMeta = { ...(existing[0].metadata || {}), ...(payload.metadata || {}) }
            const [updated] = await m.upsertProducts([
                { id: existing[0].id, ...payload, metadata: mergedMeta },
            ])
            return { ok: true, id: updated.id, created: false }
        }
        const [created] = await m.upsertProducts([payload])
        return { ok: true, id: created.id, created: true }
    },
}

const productCategoryEntity = genericEntity({
    key: "product_category",
    label: "Product category",
    moduleName: Modules.PRODUCT,
    modelName: "ProductCategory",
    methodSuffix: "ProductCategories",
    events: ["product-category.created", "product-category.updated", "product-category.deleted"],
    default_key_path: "handle",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "name", label: "Name", type: "string" },
        { path: "handle", label: "Handle", type: "string" },
        { path: "description", label: "Description", type: "string" },
        { path: "is_active", label: "Active", type: "boolean" },
        { path: "is_internal", label: "Internal-only", type: "boolean" },
        { path: "parent_category_id", label: "Parent category id", type: "id" },
    ],
})

const productCollectionEntity = genericEntity({
    key: "product_collection",
    label: "Product collection",
    moduleName: Modules.PRODUCT,
    modelName: "ProductCollection",
    events: ["product-collection.created", "product-collection.updated"],
    default_key_path: "handle",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "title", label: "Title", type: "string" },
        { path: "handle", label: "Handle", type: "string" },
        { path: "metadata", label: "Metadata", type: "json", suggested_transform: "json" },
    ],
})

const userEntity = genericEntity({
    key: "user",
    label: "User (Medusa admin)",
    moduleName: Modules.USER,
    modelName: "User",
    events: ["user.created", "user.updated", "user.deleted"],
    default_key_path: "email",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "email", label: "Email", type: "string", suggested_transform: "lowercase" },
        { path: "first_name", label: "First name", type: "string" },
        { path: "last_name", label: "Last name", type: "string" },
        { path: "created_at", label: "Created at", type: "datetime", suggested_transform: "date_iso" },
    ],
    upsertByKey: async () => ({ ok: false, error: "admin user pull from ERPNext not supported in v1" }),
})

const cartEntity = genericEntity({
    key: "cart",
    label: "Cart",
    moduleName: Modules.CART,
    modelName: "Cart",
    events: ["cart.created", "cart.updated"],
    default_key_path: "id",
    fetchRelations: ["items", "shipping_address", "billing_address"],
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "email", label: "Email", type: "string", suggested_transform: "lowercase" },
        { path: "currency_code", label: "Currency", type: "string", suggested_transform: "uppercase" },
        { path: "region_id", label: "Region id", type: "id" },
        { path: "customer_id", label: "Customer id", type: "id" },
        { path: "sales_channel_id", label: "Sales channel id", type: "id" },
        { path: "items", label: "Line items", type: "array", suggested_transform: "json" },
        { path: "metadata", label: "Metadata", type: "json", suggested_transform: "json" },
        { path: "completed_at", label: "Completed at", type: "datetime", suggested_transform: "date_iso" },
        { path: "created_at", label: "Created at", type: "datetime", suggested_transform: "date_iso" },
    ],
    upsertByKey: async () => ({ ok: false, error: "cart upsert from ERPNext not supported (carts are storefront-owned)" }),
})

const regionEntity = genericEntity({
    key: "region",
    label: "Region",
    moduleName: Modules.REGION,
    modelName: "Region",
    events: ["region.created", "region.updated", "region.deleted"],
    default_key_path: "name",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "name", label: "Name", type: "string" },
        { path: "currency_code", label: "Currency", type: "string", suggested_transform: "uppercase" },
        { path: "automatic_taxes", label: "Automatic taxes", type: "boolean" },
        { path: "countries", label: "Countries", type: "array", suggested_transform: "json" },
        { path: "metadata", label: "Metadata", type: "json", suggested_transform: "json" },
    ],
})

const salesChannelEntity = genericEntity({
    key: "sales_channel",
    label: "Sales channel",
    moduleName: Modules.SALES_CHANNEL,
    modelName: "SalesChannel",
    events: ["sales-channel.created", "sales-channel.updated"],
    default_key_path: "name",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "name", label: "Name", type: "string" },
        { path: "description", label: "Description", type: "string" },
        { path: "is_disabled", label: "Disabled", type: "boolean" },
        { path: "metadata", label: "Metadata", type: "json", suggested_transform: "json" },
    ],
})

const promotionEntity = genericEntity({
    key: "promotion",
    label: "Promotion",
    moduleName: Modules.PROMOTION,
    modelName: "Promotion",
    events: ["promotion.created", "promotion.updated", "promotion.deleted"],
    default_key_path: "code",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "code", label: "Code", type: "string", suggested_transform: "uppercase" },
        { path: "is_automatic", label: "Automatic", type: "boolean" },
        { path: "type", label: "Type (standard / buyget)", type: "string" },
        { path: "campaign_id", label: "Campaign id", type: "id" },
        { path: "metadata", label: "Metadata", type: "json", suggested_transform: "json" },
    ],
})

const stockLocationEntity = genericEntity({
    key: "stock_location",
    label: "Stock location",
    moduleName: Modules.STOCK_LOCATION,
    modelName: "StockLocation",
    events: ["stock-location.created", "stock-location.updated"],
    default_key_path: "name",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "name", label: "Name", type: "string" },
        { path: "address.address_1", label: "Address line 1", type: "string" },
        { path: "address.city", label: "City", type: "string" },
        { path: "address.country_code", label: "Country (ISO)", type: "string", suggested_transform: "uppercase" },
        { path: "metadata", label: "Metadata", type: "json", suggested_transform: "json" },
    ],
})

const inventoryItemEntity = genericEntity({
    key: "inventory_item",
    label: "Inventory item",
    moduleName: Modules.INVENTORY,
    modelName: "InventoryItem",
    events: ["inventory-item.created", "inventory-item.updated"],
    default_key_path: "sku",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "sku", label: "SKU", type: "string" },
        { path: "title", label: "Title", type: "string" },
        { path: "description", label: "Description", type: "string" },
        { path: "weight", label: "Weight", type: "number" },
        { path: "hs_code", label: "HS code", type: "string" },
        { path: "origin_country", label: "Origin country (ISO)", type: "string", suggested_transform: "uppercase" },
        { path: "material", label: "Material", type: "string" },
        { path: "metadata", label: "Metadata", type: "json", suggested_transform: "json" },
    ],
})

const currencyEntity = genericEntity({
    key: "currency",
    label: "Currency",
    moduleName: Modules.CURRENCY,
    modelName: "Currency",
    events: ["currency.created", "currency.updated"],
    default_key_path: "code",
    paths: [
        { path: "code", label: "Code (ISO 4217)", type: "string", suggested_transform: "uppercase" },
        { path: "symbol", label: "Symbol", type: "string" },
        { path: "symbol_native", label: "Symbol (native)", type: "string" },
        { path: "name", label: "Name", type: "string" },
    ],
    upsertByKey: async () => ({ ok: false, error: "currencies are Medusa-seeded; ERPNext-driven inserts not supported" }),
})

const apiKeyEntity = genericEntity({
    key: "api_key",
    label: "API key",
    moduleName: Modules.API_KEY,
    modelName: "ApiKey",
    events: ["api-key.created", "api-key.updated", "api-key.deleted"],
    default_key_path: "title",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "title", label: "Title", type: "string" },
        { path: "type", label: "Type (publishable / secret)", type: "string" },
        { path: "redacted", label: "Redacted preview", type: "string" },
    ],
    upsertByKey: async () => ({ ok: false, error: "API keys must be created in Medusa admin, not synced from ERPNext" }),
})

const paymentCollectionEntity = genericEntity({
    key: "payment_collection",
    label: "Payment collection",
    moduleName: Modules.PAYMENT,
    modelName: "PaymentCollection",
    events: ["payment-collection.created", "payment-collection.updated"],
    default_key_path: "id",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "amount", label: "Amount (minor units)", type: "number" },
        { path: "currency_code", label: "Currency", type: "string", suggested_transform: "uppercase" },
        { path: "status", label: "Status", type: "string" },
    ],
    upsertByKey: async () => ({ ok: false, error: "payment collections are storefront-owned; ERPNext-driven inserts not supported" }),
})

const fulfillmentEntity = genericEntity({
    key: "fulfillment",
    label: "Fulfillment",
    moduleName: Modules.FULFILLMENT,
    modelName: "Fulfillment",
    events: ["fulfillment.created", "fulfillment.shipment_created", "fulfillment.canceled"],
    default_key_path: "id",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "location_id", label: "Stock location id", type: "id" },
        { path: "shipped_at", label: "Shipped at", type: "datetime", suggested_transform: "date_iso" },
        { path: "delivered_at", label: "Delivered at", type: "datetime", suggested_transform: "date_iso" },
        { path: "canceled_at", label: "Canceled at", type: "datetime", suggested_transform: "date_iso" },
        { path: "metadata", label: "Metadata", type: "json", suggested_transform: "json" },
    ],
})

// ─── Polemarch-custom entities (registered only if module installed) ─

const walletEntity: EntityDescriptor = {
    key: "wallet",
    label: "Wallet",
    moduleName: "cashfree_wallet",
    isCustomModule: true,
    events: ["wallet.created", "wallet.updated", "wallet.deleted"],
    default_key_path: "customer_id",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "customer_id", label: "Customer id", type: "id", description: "Unique 1:1 link to the Medusa customer." },
        { path: "balance_inr", label: "Main balance (paise)", type: "number", description: "Withdrawable NEFT/IMPS balance, in paise." },
        { path: "promo_balance_inr", label: "Promo balance (paise)", type: "number", description: "Non-withdrawable promo balance from referrals / points conversion." },
        { path: "version", label: "Version (optimistic-lock counter)", type: "number" },
        { path: "status", label: "Status (active / frozen)", type: "string" },
        { path: "created_at", label: "Created at", type: "datetime", suggested_transform: "date_iso" },
        { path: "updated_at", label: "Updated at", type: "datetime", suggested_transform: "date_iso" },
    ],
    async fetchById(container, id) {
        const m: any = container.resolve("cashfree_wallet")
        const [row] = await m.listWallets({ id }, { take: 1 })
        return row ?? null
    },
    async upsertByKey(container, key_field, key_value, payload) {
        const m: any = container.resolve("cashfree_wallet")
        const filter: any = {}
        filter[key_field] = key_value
        const [existing] = await m.listWallets(filter, { take: 1 })
        if (existing) {
            const safe: any = {}
            if (payload.status !== undefined) safe.status = payload.status
            if (!Object.keys(safe).length) {
                return { ok: true, id: existing.id, created: false }
            }
            const [updated] = await m.updateWallets([{ id: existing.id, ...safe }])
            return { ok: true, id: updated.id, created: false }
        }
        return { ok: false, error: "wallet rows must originate in Medusa (customer-linked); ERPNext-driven inserts not supported" }
    },
}

const walletTxEntity: EntityDescriptor = {
    key: "wallet_transaction",
    label: "Wallet transaction (ledger row)",
    moduleName: "cashfree_wallet",
    isCustomModule: true,
    events: ["wallet_transaction.created"],
    default_key_path: "idempotency_key",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "wallet_id", label: "Wallet id", type: "id" },
        { path: "customer_id", label: "Customer id", type: "id" },
        { path: "direction", label: "Direction (credit / debit)", type: "string" },
        { path: "amount_inr", label: "Amount (paise, signed by direction)", type: "number" },
        { path: "balance_after", label: "Resulting balance (paise)", type: "number" },
        { path: "kind", label: "Kind", type: "string", description: "vba_credit / order_debit / order_reversal / refund / manual_adjust / referral_credit / points_conversion." },
        { path: "bucket", label: "Bucket (main / promo)", type: "string" },
        { path: "reference_type", label: "Reference type", type: "string" },
        { path: "reference_id", label: "Reference id", type: "string" },
        { path: "idempotency_key", label: "Idempotency key", type: "string", description: "Globally unique; required for dedup on retry." },
        { path: "cashfree_event_id", label: "Cashfree webhook event id", type: "string" },
        { path: "note", label: "Note", type: "string" },
        { path: "metadata", label: "Metadata blob", type: "json", suggested_transform: "json" },
        { path: "created_at", label: "Created at", type: "datetime", suggested_transform: "date_iso" },
    ],
    async fetchById(container, id) {
        const m: any = container.resolve("cashfree_wallet")
        const [row] = await m.listWalletTransactions({ id }, { take: 1 })
        return row ?? null
    },
    async upsertByKey() {
        return { ok: false, error: "wallet_transaction rows are immutable (append-only ledger); ERPNext-driven writes not supported" }
    },
}

const calculaCompanyEntity = genericEntity({
    key: "calcula_company_record",
    label: "Calcula company record",
    moduleName: "calcula",
    isCustomModule: true,
    modelName: "CompanyRecord",
    events: ["calcula.company_record.created", "calcula.company_record.updated"],
    default_key_path: "isin",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "isin", label: "ISIN", type: "string", suggested_transform: "uppercase" },
        { path: "company_id", label: "Calcula company id", type: "id" },
        { path: "company_name", label: "Company name", type: "string" },
        { path: "cin", label: "CIN", type: "string", suggested_transform: "uppercase" },
        { path: "sector", label: "Sector", type: "string" },
        { path: "industry", label: "Industry", type: "string" },
        { path: "description", label: "Description", type: "string" },
        { path: "listing_status", label: "Listing status", type: "string" },
        { path: "market_cap", label: "Market cap", type: "string" },
        { path: "share_type", label: "Share type", type: "string" },
        { path: "face_value", label: "Face value", type: "string" },
        { path: "depository", label: "Depository", type: "string" },
        { path: "rta", label: "RTA", type: "string" },
        { path: "pe_ratio", label: "P/E ratio", type: "string" },
        { path: "pb_ratio", label: "P/B ratio", type: "string" },
        { path: "eps", label: "EPS", type: "string" },
        { path: "book_value", label: "Book value", type: "string" },
        { path: "revenue", label: "Revenue", type: "string" },
        { path: "net_profit", label: "Net profit", type: "string" },
        { path: "ebitda_margin", label: "EBITDA margin", type: "string" },
        { path: "founded", label: "Founded", type: "string" },
        { path: "headquarters", label: "Headquarters", type: "string" },
    ],
})

const customerIdentityEntity = genericEntity({
    key: "customer_identity",
    label: "Customer identity (KYC)",
    moduleName: "customer_identity",
    isCustomModule: true,
    modelName: "CustomerIdentity",
    methodSuffix: "CustomerIdentities",
    events: ["customer_identity.created", "customer_identity.updated"],
    default_key_path: "customer_id",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "customer_id", label: "Customer id", type: "id" },
        { path: "pan", label: "PAN", type: "string", suggested_transform: "uppercase" },
        { path: "pan_name", label: "PAN-registered name", type: "string" },
        { path: "kyc_status", label: "KYC status", type: "string" },
        { path: "kyc_verified_at", label: "KYC verified at", type: "datetime", suggested_transform: "date_iso" },
    ],
})

const watchlistEntity = genericEntity({
    key: "watchlist_item",
    label: "Watchlist item",
    moduleName: "watchlist",
    isCustomModule: true,
    modelName: "WatchlistItem",
    events: ["watchlist.created", "watchlist.updated", "watchlist.deleted"],
    default_key_path: "id",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "customer_id", label: "Customer id", type: "id" },
        { path: "product_id", label: "Product id", type: "id" },
        { path: "isin", label: "ISIN", type: "string", suggested_transform: "uppercase" },
        { path: "created_at", label: "Added at", type: "datetime", suggested_transform: "date_iso" },
    ],
})

const shareTransferEntity = genericEntity({
    key: "share_transfer",
    label: "Share transfer",
    moduleName: "share_transfer",
    isCustomModule: true,
    modelName: "ShareTransfer",
    events: ["share_transfer.created", "share_transfer.status_changed"],
    default_key_path: "id",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "order_id", label: "Order id", type: "id" },
        { path: "customer_id", label: "Customer id", type: "id" },
        { path: "isin", label: "ISIN", type: "string", suggested_transform: "uppercase" },
        { path: "quantity", label: "Quantity", type: "number" },
        { path: "status", label: "Status", type: "string" },
        { path: "depository", label: "Depository (NSDL / CDSL)", type: "string" },
        { path: "demat_account", label: "Demat account number", type: "string" },
        { path: "created_at", label: "Created at", type: "datetime", suggested_transform: "date_iso" },
        { path: "completed_at", label: "Completed at", type: "datetime", suggested_transform: "date_iso" },
    ],
})

const gamificationEntity = genericEntity({
    key: "gamification_points_ledger",
    label: "Gamification points ledger",
    moduleName: "gamification",
    isCustomModule: true,
    modelName: "PointsLedger",
    events: ["gamification.points.awarded"],
    default_key_path: "id",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "customer_id", label: "Customer id", type: "id" },
        { path: "delta", label: "Points delta", type: "number" },
        { path: "reason", label: "Reason", type: "string" },
        { path: "kind", label: "Kind", type: "string" },
        { path: "created_at", label: "Awarded at", type: "datetime", suggested_transform: "date_iso" },
    ],
    upsertByKey: async () => ({ ok: false, error: "points ledger is immutable" }),
})

const polemarchEntity = genericEntity({
    key: "polemarch_kyc_session",
    label: "Polemarch KYC session",
    moduleName: "polemarch",
    isCustomModule: true,
    modelName: "KycSession",
    events: ["polemarch.kyc.session.created", "polemarch.kyc.session.updated"],
    default_key_path: "id",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "customer_id", label: "Customer id", type: "id" },
        { path: "status", label: "Status", type: "string" },
        { path: "verified_at", label: "Verified at", type: "datetime", suggested_transform: "date_iso" },
    ],
})

const communicationEntity = genericEntity({
    key: "polemarch_communication",
    label: "Outbound communication",
    moduleName: "polemarch_communication",
    isCustomModule: true,
    modelName: "OutboundMessage",
    events: ["polemarch_communication.sent"],
    default_key_path: "id",
    paths: [
        { path: "id", label: "Medusa id", type: "id" },
        { path: "customer_id", label: "Customer id", type: "id" },
        { path: "channel", label: "Channel (email / sms / push)", type: "string" },
        { path: "template_key", label: "Template key", type: "string" },
        { path: "sent_at", label: "Sent at", type: "datetime", suggested_transform: "date_iso" },
    ],
})

// ─── Registry ─────────────────────────────────────────────────────────

const REGISTRY: Record<string, EntityDescriptor> = {
    // Built-in Medusa modules (always available)
    customer: customerEntity,
    customer_group: customerGroupEntity,
    order: orderEntity,
    product: productEntity,
    product_category: productCategoryEntity,
    product_collection: productCollectionEntity,
    user: userEntity,
    cart: cartEntity,
    region: regionEntity,
    sales_channel: salesChannelEntity,
    promotion: promotionEntity,
    stock_location: stockLocationEntity,
    inventory_item: inventoryItemEntity,
    currency: currencyEntity,
    api_key: apiKeyEntity,
    payment_collection: paymentCollectionEntity,
    fulfillment: fulfillmentEntity,

    // Polemarch custom modules (gated on module being registered)
    wallet: walletEntity,
    wallet_transaction: walletTxEntity,
    calcula_company_record: calculaCompanyEntity,
    customer_identity: customerIdentityEntity,
    watchlist_item: watchlistEntity,
    share_transfer: shareTransferEntity,
    gamification_points_ledger: gamificationEntity,
    polemarch_kyc_session: polemarchEntity,
    polemarch_communication: communicationEntity,
}

/**
 * Resolve whether one entity is actually usable in this Medusa
 * process. For built-in modules the check is trivial (core modules
 * are always wired). For custom modules we try `container.resolve()`
 * — if the module isn't registered in medusa-config.ts the resolve
 * throws and the entity is hidden from the picker.
 */
export function isEntityAvailable(
    entity: EntityDescriptor,
    container: any,
): boolean {
    if (entity.availableInContainer) {
        try {
            return entity.availableInContainer(container)
        } catch {
            return false
        }
    }
    if (!entity.isCustomModule) {
        // Built-in modules — Medusa wires them universally.
        return true
    }
    try {
        const resolved = container.resolve(entity.moduleName)
        return Boolean(resolved)
    } catch {
        return false
    }
}

export function listMedusaEntities(container?: any): EntityDescriptor[] {
    const all = Object.values(REGISTRY)
    if (!container) return all
    return all.filter((e) => isEntityAvailable(e, container))
}

export function getMedusaEntity(key: string): EntityDescriptor | null {
    return REGISTRY[key] ?? null
}
