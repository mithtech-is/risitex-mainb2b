/**
 * RISITEX canonical mapping definitions — the "starter pack" Mappings
 * rows the plugin seeds on first install, AND the suggestion source
 * the admin Mapping editor uses when the operator clicks "Suggest
 * field pairs".
 *
 * Replaces the previous Polemarch financial-services entries
 * (PAN / Aadhaar / Demat / CMR / Cashfree-VBA). RISITEX is textile
 * commerce — the source-of-truth split is documented in
 * `risitex-v2/docs/erp-architecture.md`.
 *
 * Edit rules unchanged from the Polemarch version:
 *   - Every entry MUST have a `medusa_entity` matching a key from
 *     `registry.ts::listMedusaEntities`. The seeder skips entries
 *     with unknown entities (logs a warning).
 *   - `doctype` must exist on the connected Frappe instance, else
 *     the seeded row will exist but doctype-meta calls will 502.
 *     Verify against your target instance before adding new rows.
 *   - `field_mappings` is the SUGGESTED set, not the exhaustive set.
 *     Pick fields the operator is most likely to want — they can
 *     add more from the doctype field picker.
 *
 * Idempotency:
 *   The seeder upserts by `name`, so renaming an entry creates a
 *   second row. Pick names you don't intend to change.
 */
import type { MappingFieldPair, MappingDirection } from "./mapping-engine"

export type CanonicalMapping = {
    name: string
    description: string
    enabled: boolean
    medusa_entity: string
    doctype: string
    direction: MappingDirection
    events: string[]
    pull_filter: any
    pull_page_size: number
    key_medusa_field: string
    key_erpnext_field: string
    field_mappings: MappingFieldPair[]
}

/**
 * Customer ↔ Customer.
 *
 * RISITEX customers (B2C + B2B) sync to the standard ERPNext
 * Customer doctype. Identity key: email (Medusa-native) ↔ email_id.
 * Tier + GSTIN + PAN custom fields live on Customer via the
 * `risitex_erp` app's fixtures/custom_field.json.
 */
const CUSTOMER_CUSTOMER: CanonicalMapping = {
    name: "Customer ↔ Customer",
    description:
        "Bidirectional customer sync. Medusa owns email/phone/addresses; ERPNext owns legal customer_name, GSTIN, PAN, customer_group, territory. Per-field direction overrides keep each side from clobbering the other's authoritative columns.",
    enabled: true,
    medusa_entity: "customer",
    doctype: "Customer",
    direction: "both",
    events: ["customer.created", "customer.updated", "customer.deleted"],
    pull_filter: [["disabled", "=", 0]],
    pull_page_size: 200,
    key_medusa_field: "email",
    key_erpnext_field: "email_id",
    field_mappings: [
        // ── Identity (Medusa-owned) ─────────────────────────────
        { medusa_path: "email", erpnext_field: "email_id", direction: "push", transform: "lowercase" },
        { medusa_path: "phone", erpnext_field: "mobile_no", direction: "push" },
        { medusa_path: "id", erpnext_field: "medusa_customer_id", direction: "push" },

        // ── Display name from Medusa first+last name ────────────
        // For B2C this is the actual person; for B2B it's the
        // wholesale buyer. ERPNext invoices use customer_name as
        // the legal name on print formats.
        { medusa_path: "first_name", erpnext_field: "customer_name", direction: "push" },

        // ── Tier (ERPNext-owned, pulled into Medusa) ────────────
        // Tier master lives in ERPNext (RISITEX Customer Tier).
        // Frappe operators set per-customer tier; Medusa caches it
        // on `metadata.customer_tier_code` so the storefront's
        // pricing decisions don't have to round-trip.
        { medusa_path: "metadata.customer_tier_code", erpnext_field: "risitex_tier", direction: "pull" },

        // ── GSTIN + PAN (ERPNext-owned for B2B) ─────────────────
        // GSTIN and PAN sync BOTH ways: a B2B customer enters their
        // GSTIN at storefront signup (customer.metadata) and it pushes
        // into the ERPNext Customer for GST invoicing; the accounting
        // team can correct it in ERPNext Desk and the pull mirrors it
        // back onto customer.metadata for storefront GST invoice
        // preview. (Custom fields added by risitex_erp; install India
        // Compliance later for full GST validation.)
        { medusa_path: "metadata.gstin", erpnext_field: "gstin", direction: "both", transform: "uppercase" },
        { medusa_path: "metadata.pan", erpnext_field: "pan", direction: "both", transform: "uppercase" },

        // ── Customer group (B2B vs B2C, ERPNext-owned) ──────────
        // ERPNext's `customer_group` drives accounting buckets +
        // pricing rule eligibility. Medusa flags B2B via the
        // company_id link; on push the subscriber maps that to
        // `Wholesale` vs `Retail` upfront.
        { medusa_path: "metadata.erpnext_customer_group", erpnext_field: "customer_group", direction: "pull" },

        // ── Wallet balance cache (push-only, read-only on Frappe) ─
        // Mirrored hourly so the Accounts team can see customer
        // wallet balance directly on the Customer form. The cached
        // value is paise; render with /100 on the print format.
        { medusa_path: "wallet_balance_paise", erpnext_field: "wallet_balance_paise", direction: "push" },
    ],
}

/**
 * Item ↔ Item.
 *
 * The catalog lives in Medusa; ERPNext gets thin Item stubs so
 * stock entries, sales orders, and accounting can reference them.
 * Push-on-create plus pull for inventory levels (see
 * STOCK_INVENTORY below).
 */
const PRODUCT_ITEM: CanonicalMapping = {
    name: "Product Variant ↔ Item",
    description:
        "Push every Medusa product variant to a Frappe Item. Variant id and parent product id land in custom_field columns added by the risitex_erp app so warehouse + accounting can trace the storefront's exact SKU.",
    enabled: true,
    medusa_entity: "product",
    doctype: "Item",
    direction: "push",
    events: ["product.created", "product.updated"],
    pull_filter: [["disabled", "=", 0]],
    pull_page_size: 100,
    key_medusa_field: "id",
    key_erpnext_field: "medusa_product_id",
    field_mappings: [
        { medusa_path: "id", erpnext_field: "medusa_product_id", direction: "push" },
        { medusa_path: "title", erpnext_field: "item_name", direction: "push" },
        { medusa_path: "description", erpnext_field: "description", direction: "push" },
        { medusa_path: "handle", erpnext_field: "item_code", direction: "push" },
        { medusa_path: "thumbnail", erpnext_field: "image", direction: "push" },
        // Always push as Stock Item so warehouse can pick.
        { medusa_path: "_const.stock_item", erpnext_field: "is_stock_item", direction: "push", default: 1 },
    ],
}

/**
 * Order ↔ Sales Order.
 *
 * On `order.placed`, push a Sales Order to ERPNext with the
 * customer link, line items, wallet-applied amount, and (for B2B
 * Net terms) the uploaded PO file URL. The customer-facing RST-
 * 000XYZ display id lands in `medusa_display_id` so warehouse can
 * cross-reference with the storefront's order detail.
 */
const ORDER_SALES_ORDER: CanonicalMapping = {
    name: "Order → Sales Order",
    description:
        "Push every newly-placed Medusa order to ERPNext as a Sales Order. medusa_order_id + medusa_display_id are added to Sales Order via the risitex_erp app's custom fields, so accounting can reconcile orders by either side's identifier.",
    enabled: true,
    medusa_entity: "order",
    doctype: "Sales Order",
    direction: "push",
    events: ["order.placed", "order.updated", "order.canceled"],
    pull_filter: null,
    pull_page_size: 50,
    key_medusa_field: "id",
    key_erpnext_field: "medusa_order_id",
    field_mappings: [
        { medusa_path: "id", erpnext_field: "medusa_order_id", direction: "push" },
        { medusa_path: "display_id", erpnext_field: "medusa_display_id", direction: "push" },
        { medusa_path: "email", erpnext_field: "contact_email", direction: "push" },
        { medusa_path: "currency_code", erpnext_field: "currency", direction: "push", transform: "uppercase" },
        { medusa_path: "total", erpnext_field: "grand_total", direction: "push" },
        // The PO upload from the wholesale checkout step. Optional —
        // only B2B Net-terms orders carry one.
        { medusa_path: "metadata.purchase_order_file_url", erpnext_field: "risitex_po_file", direction: "push" },
        { medusa_path: "metadata.purchase_order_number", erpnext_field: "risitex_po_number", direction: "push" },
        // Wallet applied at checkout, in paise. Drives a credit
        // note offset on the Sales Invoice that gets billed next.
        { medusa_path: "metadata.wallet_apply.amount_paise", erpnext_field: "risitex_wallet_applied_paise", direction: "push" },
    ],
}

/**
 * Order → Sales Invoice.
 *
 * On `order.payment_captured`, push a Sales Invoice. ERPNext's
 * GST calculation engine (India Compliance app) computes the
 * tax breakup; we just supply the line items and customer.
 */
const ORDER_SALES_INVOICE: CanonicalMapping = {
    name: "Order → Sales Invoice",
    description:
        "Push a Sales Invoice when Medusa's order is paid. ERPNext owns invoice numbering + GST calc. The Sales Invoice's medusa_order_id lets the customer's RISITEX self-service invoice PDF cross-reference with the GST-compliant ERPNext invoice.",
    enabled: true,
    medusa_entity: "order",
    doctype: "Sales Invoice",
    direction: "push",
    events: ["order.payment_captured"],
    pull_filter: null,
    pull_page_size: 50,
    key_medusa_field: "id",
    key_erpnext_field: "medusa_order_id",
    field_mappings: [
        { medusa_path: "id", erpnext_field: "medusa_order_id", direction: "push" },
        { medusa_path: "email", erpnext_field: "contact_email", direction: "push" },
        { medusa_path: "currency_code", erpnext_field: "currency", direction: "push", transform: "uppercase" },
        { medusa_path: "total", erpnext_field: "grand_total", direction: "push" },
    ],
}

/**
 * Wallet Transaction → Wallet Settlement batch (daily).
 *
 * NOT a per-event push. The Medusa-side daily cron aggregates the
 * day's credits + debits, computes a net, and POSTs ONE row.
 * ERPNext creates a Journal Entry under the hood (the linkage
 * lives on RISITEX Wallet Settlement.journal_entry).
 */
const WALLET_SETTLEMENT: CanonicalMapping = {
    name: "Wallet Settlement → RISITEX Wallet Settlement",
    description:
        "Daily batched push. The Medusa-side wallet-settlement cron sums credits + debits for the prior day and pushes a single RISITEX Wallet Settlement row. The ERPNext-side workflow attaches a Journal Entry on Posted.",
    enabled: true,
    medusa_entity: "wallet_transaction",
    doctype: "RISITEX Wallet Settlement",
    direction: "push",
    events: ["wallet.settlement_batch.created"],
    pull_filter: null,
    pull_page_size: 50,
    key_medusa_field: "settlement_batch_id",
    key_erpnext_field: "settlement_batch_id",
    field_mappings: [
        { medusa_path: "settlement_batch_id", erpnext_field: "settlement_batch_id", direction: "push" },
        { medusa_path: "period_from", erpnext_field: "period_from", direction: "push" },
        { medusa_path: "period_to", erpnext_field: "period_to", direction: "push" },
        { medusa_path: "total_credits_inr", erpnext_field: "total_credits", direction: "push" },
        { medusa_path: "total_debits_inr", erpnext_field: "total_debits", direction: "push" },
        { medusa_path: "net_amount_inr", erpnext_field: "net_amount", direction: "push" },
        { medusa_path: "id", erpnext_field: "medusa_settlement_id", direction: "push" },
    ],
}

/**
 * Fulfillment → Delivery Note.
 *
 * Pull-only — ERPNext is the source of truth for dispatch /
 * delivery. The Frappe-side webhook on Delivery Note.on_submit
 * (wired in risitex_erp/hooks.py) pushes the transporter + AWB
 * back to Medusa's logistics module.
 */
const FULFILLMENT_DELIVERY_NOTE: CanonicalMapping = {
    name: "Delivery Note → Fulfillment",
    description:
        "Pull-only. ERPNext owns the dispatch workflow; the risitex_erp app's on_submit hook for Delivery Note pushes the carrier + AWB back to Medusa. This mapping powers the suggestion engine and the reverse-direction reconcile.",
    enabled: true,
    medusa_entity: "fulfillment",
    doctype: "Delivery Note",
    direction: "pull",
    events: [],
    pull_filter: [["docstatus", "=", 1]],
    pull_page_size: 50,
    key_medusa_field: "id",
    key_erpnext_field: "medusa_order_id",
    field_mappings: [
        { medusa_path: "metadata.medusa_order_id", erpnext_field: "medusa_order_id", direction: "pull" },
        { medusa_path: "labels.0.tracking_number", erpnext_field: "awb", direction: "pull" },
        { medusa_path: "metadata.transporter_code", erpnext_field: "transporter_code", direction: "pull" },
        { medusa_path: "shipped_at", erpnext_field: "posting_date", direction: "pull" },
    ],
}

/**
 * Inventory Item ↔ Bin / Stock Ledger.
 *
 * Pull-only — ERPNext owns inventory accounting. The pull cron
 * reads Bin.actual_qty for each (item, warehouse) and updates
 * Medusa's inventory_item.stocked_quantity.
 *
 * FR-9.02: we also cache Bin.reserved_qty (stock allocated to submitted
 * Sales Orders) in metadata so the storefront can show MBOs "Available"
 * (= actual_qty − reserved_qty) rather than raw physical stock and avoid
 * overselling. The subtraction lives in src/lib/inventory-availability.ts.
 */
const INVENTORY_BIN: CanonicalMapping = {
    name: "Inventory Item ← Bin",
    description:
        "Pull-only inventory level sync. ERPNext's Stock Ledger Entry is the source of truth — Medusa caches `actual_qty` (physical) and `reserved_qty` (allocated to pending Sales Orders) per (item, warehouse) so the storefront can show Available stock without round-tripping through ERPNext for every PDP render.",
    enabled: true,
    medusa_entity: "inventory_item",
    doctype: "Bin",
    direction: "pull",
    events: [],
    // FR-9.04: only pull stock from the finished-goods godown so raw-material /
    // WIP warehouses never surface to MBOs. Set ERPNEXT_FINISHED_GOODS_WAREHOUSE
    // to the exact ERPNext warehouse name (e.g. "Finished Goods - RX"); when
    // unset we fall back to pulling every warehouse (prior behaviour).
    pull_filter: process.env.ERPNEXT_FINISHED_GOODS_WAREHOUSE
        ? [["warehouse", "=", process.env.ERPNEXT_FINISHED_GOODS_WAREHOUSE]]
        : null,
    pull_page_size: 200,
    key_medusa_field: "sku",
    key_erpnext_field: "item_code",
    field_mappings: [
        { medusa_path: "sku", erpnext_field: "item_code", direction: "pull" },
        { medusa_path: "stocked_quantity", erpnext_field: "actual_qty", direction: "pull" },
        { medusa_path: "metadata.erpnext_reserved_qty", erpnext_field: "reserved_qty", direction: "pull" },
        { medusa_path: "metadata.warehouse", erpnext_field: "warehouse", direction: "pull" },
    ],
}

export const CANONICAL_MAPPINGS: CanonicalMapping[] = [
    CUSTOMER_CUSTOMER,
    PRODUCT_ITEM,
    ORDER_SALES_ORDER,
    ORDER_SALES_INVOICE,
    WALLET_SETTLEMENT,
    FULFILLMENT_DELIVERY_NOTE,
    INVENTORY_BIN,
]

/**
 * Lookup helper used by the admin editor's "Suggest field pairs"
 * button. Returns the canonical mapping (if any) for an
 * `(entity, doctype)` pair so the UI can pre-fill `field_mappings`.
 *
 * Doctype match is case-insensitive (Frappe is case-sensitive in
 * URLs but operators often type lowercase). Returns null when no
 * canonical entry exists — the UI then offers a heuristic name-
 * matching fallback.
 */
export function findCanonicalMapping(
    entity: string,
    doctype: string,
): CanonicalMapping | null {
    const e = (entity || "").trim().toLowerCase()
    const d = (doctype || "").trim().toLowerCase()
    for (const m of CANONICAL_MAPPINGS) {
        if (m.medusa_entity.toLowerCase() === e && m.doctype.toLowerCase() === d) {
            return m
        }
    }
    return null
}
