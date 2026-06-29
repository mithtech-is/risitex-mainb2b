# RISITEX ↔ ERPNext architecture

Last updated: 2026-06-16. Owner: Manoj.

---

## 1. Audit summary

### Frappe bench (`\\wsl.localhost\Ubuntu\home\divya\frappe-bench`)

| | |
|---|---|
| Frappe | 16.22.0 |
| ERPNext | 16.22.0 (downloaded, not installed on site) |
| HRMS | 16.22.0 (downloaded, not installed on site) |
| Sites | `site1.local` only |
| Installed on site | `frappe` only — ERPNext + HRMS need `bench install-app` |
| DB | MariaDB |
| Ports | 8000 webserver, 13000 redis cache, 11000 redis queue |
| Custom app | **none yet** — `risitex_erp` will be created in Phase 3 |

### Polemarch ERP reference (`D:\sync\ERPchecklist`)

Nine `.docx` files. Skimmed — they are **generic Indian-business ERPNext setup
checklists** (GST, e-invoicing, e-way bill, TDS, FIFO/MA valuation, supplier price
lists, lead workflow). No RISITEX-specific business logic. They confirm: use
standard ERPNext for accounting / GST / inventory accounting, lean on **India
Compliance app patterns** (the same `pan`, `gstin`, `gst_category` custom fields
that Polemarch wires up).

### Medusa-side ERPNext bridge (`packages/medusa-plugin-erpnext`)

Already enterprise-grade. Inherited from Polemarch, generic by design:

- `erpnext_setting` — connection config (URL + API key + webhook secret)
- `erpnext_mapping` — operator-configurable Medusa-entity ↔ Frappe-doctype pairs
  with per-field direction overrides
- `erpnext_sync_event` — durable audit log of every push, with retry + dead-letter
- `mapping-engine.ts` — applies field mappings with transforms (lowercase /
  uppercase / etc.)
- `canonical-mappings.ts` — **seed data, currently Polemarch financial-services
  flavoured (PAN/Aadhaar/KYC/Demat)** — needs rewrite for RISITEX
- `subscribers/erpnext-forward.ts` — Medusa events → ERPNext push
- `subscribers/erpnext-forward-wallet.ts` — wallet-specific push
- `jobs/pull-from-erpnext.ts` — pull cron, incremental on `modified > last_pull_at`
- `jobs/reconciliation.ts` — periodic backfill of missed events
- `jobs/retry-events.ts` — DLQ retry job
- `api/webhooks/erpnext-inbound/route.ts` — inbound from Frappe
- `api/admin/erpnext/*` — admin UI with Settings + Mappings + Events tabs

**Decision: keep the engine. Replace the canonical mappings + add RISITEX-specific
doctypes.** No new Medusa-side infrastructure work needed.

---

## 2. Source-of-truth split

| Entity | Source of truth | Why |
|---|---|---|
| Product catalog (Item, Variant, Image, Description) | Medusa | The storefront renders directly from Medusa; round-tripping via ERPNext adds latency for no benefit. ERPNext gets a thin Item stub for inventory accounting. |
| Inventory levels | ERPNext | Real warehouse operations happen in ERPNext (Stock Entry, Material Receipt, Delivery Note). Medusa is fed `actual_qty` from ERPNext via the pull job. |
| Customer profile | **Both**, per-field | Medusa owns `email`, `phone`, `addresses`. ERPNext owns `customer_name` (legal), `gstin`, `pan`, `customer_group`, `territory`. Per-field direction in the mapping. |
| Company (RISITEX-side trade name, GSTIN) | ERPNext | Companies Act compliance lives in ERPNext. Medusa's `company` row is a denormalised cache. |
| Cart, checkout state, payment session | Medusa | Sub-second UX; ERPNext never sees an unfinished cart. |
| Order (placed) | Medusa → ERPNext Sales Order | Medusa fires `order.placed`; ERPNext creates a Sales Order with the canonical name `MEDUSA-ORD-<display_id>`. |
| Sales Invoice / GST invoice | ERPNext | Invoice numbering, tax calc, GSTR-1/3B, e-invoice IRP all live in ERPNext. Medusa's PDF invoice (Round 11) is for customer self-service download. |
| Delivery Note | ERPNext | Warehouse pick / pack / dispatch is ERPNext's job. Medusa shipments are denormalised from Delivery Note submit. |
| Wallet balance | Medusa (`cashfree_wallet.wallet_account`) | Real-time UI; settlements flow to ERPNext as journal entries via Wallet Settlement. |
| Wallet ledger | Both | `wallet_transaction` rows in Medusa are append-only. Periodic batch creates ERPNext Journal Entries. |
| Commission accrual | Medusa (`commission_record`) | Computed from order events in real time. |
| Commission payout | ERPNext | Once a payout batch is approved, ERPNext writes Payment Entries. |
| Affiliate / referral profile | **Custom doctype** `RISITEX Affiliate Partner` in ERPNext | Independent of Customer doctype because affiliates aren't necessarily customers. |
| Customer tier | **Custom doctype** `RISITEX Customer Tier` in ERPNext | Tier is the ERPNext-side master; Medusa's `customer_tier` table is a cache. |
| Credit limit | ERPNext (standard Customer.credit_limits) | ERPNext already has Credit Limits. No new doctype. |
| Purchase Order (B2B) | ERPNext Sales Order with `is_purchase_order` flag + linked file | Standard ERPNext Sales Order, no new doctype. The PO PDF the customer uploaded becomes a Sales Order attachment. |

---

## 3. Doctype plan

### 3.1 Reuse standard ERPNext (no new doctype)

| Concern | Standard doctype |
|---|---|
| Customer | `Customer` (+ India Compliance custom fields for `pan` / `gstin` / `gst_category`) |
| B2B company | `Customer` (with `customer_type=Company`) or `Lead`/`Opportunity` for unapproved |
| Product | `Item` |
| Variant | `Item` with `variant_of` |
| Warehouse | `Warehouse` |
| Inventory | `Bin`, `Stock Entry`, `Stock Ledger Entry` |
| Sales Order | `Sales Order` |
| Purchase Order (uploaded) | `Sales Order` with attached file + custom field |
| Invoice | `Sales Invoice` |
| Delivery Note | `Delivery Note` |
| GL Entry | `GL Entry` |
| Payment | `Payment Entry` |
| Credit limit | Already on `Customer` |
| Pricing rule | `Pricing Rule` |
| Item Price | `Item Price` |

### 3.2 RISITEX-specific custom doctypes (6)

| # | Doctype | Purpose | Key fields |
|---|---|---|---|
| 1 | `RISITEX Customer Tier` | Volume band master (local_mbo, high_footfall_mbo, regional_distributor). ERPNext owns the catalog; Medusa pulls. | code, name, priority, default_payment_terms (Link → Payment Term), default_commission_pct, default_pricing_rule |
| 2 | `RISITEX Affiliate Partner` | Independent affiliate who earns commission on referrals. Distinct from Customer. | partner_code, name, email, phone, pan, gstin, bank_account, tier (Link → Customer Tier), default_commission_pct, status (active/suspended), medusa_partner_id |
| 3 | `RISITEX Commission Ledger` | Append-only ledger of accrued / paid commissions. Created when Medusa fires `order.placed` and rolled up by the affiliate-payout workflow. | partner (Link → Affiliate Partner), order_ref (Link → Sales Order), event_type (accrual / payout / reversal), amount, gst_amount, currency, status (pending / approved / paid), payout_batch_id, medusa_record_id |
| 4 | `RISITEX Wallet Settlement` | Batch of wallet credits / debits posted to ERPNext as one Journal Entry. Created by the Medusa wallet-settlement cron. | settlement_batch_id, period_from, period_to, total_credits, total_debits, net_amount, journal_entry (Link → Journal Entry), status (pending / posted / failed), medusa_settlement_id |
| 5 | `RISITEX Matrix Order` | Size × colour matrix the wholesale checkout supports (FR-10.04). Header + child table of variant cells. Maps to a parent Sales Order with one row per non-zero cell. | matrix_order_id, customer (Link → Customer), parent_sales_order (Link → Sales Order), grid (child: RISITEX Matrix Cell with size / colour / qty / unit_price), total_qty, total_amount, medusa_matrix_id |
| 6 | `RISITEX ERP Sync Log` | Frappe-side mirror of Medusa's `erpnext_sync_event`. Every webhook RISITEX receives from Medusa logs one row; every outbound Frappe Webhook to Medusa logs one row. Used to reconcile mismatched state. | event_id (Medusa's event.id), direction (inbound/outbound), event_name, doctype_target, doc_name, payload, status (received / processed / failed), error_message, attempts, processed_at |

Plus one child doctype:

| # | Child doctype | Parent | Purpose |
|---|---|---|---|
| 7 | `RISITEX Matrix Cell` | `RISITEX Matrix Order` | One row per non-zero (size × colour) cell. |

### 3.3 Custom fields on standard doctypes

Added via `fixtures/custom_field.json`:

| Doctype | Field | Why |
|---|---|---|
| `Customer` | `medusa_customer_id` (Data, unique) | Stable join key from Medusa side. |
| `Customer` | `risitex_tier` (Link → RISITEX Customer Tier) | Per-customer tier override. |
| `Customer` | `wallet_balance_paise` (Int, read-only) | Cached for reports; refreshed by pull job. |
| `Item` | `medusa_variant_id` (Data, unique) | Maps Medusa variant → ERPNext Item. |
| `Item` | `medusa_product_id` (Data) | Parent product reference. |
| `Sales Order` | `medusa_order_id` (Data, unique) | Maps Medusa order. |
| `Sales Order` | `medusa_display_id` (Data) | Customer-facing `RST-000XYZ`. |
| `Sales Order` | `risitex_po_file` (Attach) | The PO PDF uploaded at wholesale checkout. |
| `Sales Order` | `risitex_po_number` (Data) | Customer's internal PO number. |
| `Sales Order` | `risitex_wallet_applied_paise` (Int) | How much wallet covered this order. |
| `Sales Invoice` | `medusa_order_id` (Data) | Trace back. |
| `Delivery Note` | `medusa_order_id` (Data) | Trace back. |
| `Delivery Note` | `transporter_code` (Data) | Carrier (bluedart / delhivery / dtdc / porter). |
| `Delivery Note` | `awb` (Data) | Tracking number. |

---

## 4. Workflows (ERPNext Workflow Engine)

| # | Workflow | States | Transitions |
|---|---|---|---|
| 1 | Retailer Approval | Draft → Pending KYC → Approved → Suspended | Auto-pending on Medusa company-apply webhook; manual approve by Finance; auto-suspend on policy breach |
| 2 | Distributor Approval | Draft → Sales Review → Finance Review → Approved → Suspended | Two-stage approval; Sales rep first, Finance second |
| 3 | Purchase Order Approval (B2B Net-terms) | Submitted → Credit Check → Approved → Rejected | Auto credit-check against `Customer.credit_limit_balance`; manual override |
| 4 | Affiliate Payout Approval | Accrual → Pending Approval → Approved → Paid → Reversed | Monthly batch; Finance approve; Bank file generation; Payment Entry on completion |
| 5 | Dispatch Approval | Picked → Packed → QC Done → Dispatched → Delivered | Drives Delivery Note submit + Medusa shipment webhook out |

---

## 5. Reports / Dashboards

Native ERPNext where possible; minimal custom queries.

| Report | Source | Type |
|---|---|---|
| Sales by Tier | Sales Invoice + Customer.risitex_tier | Query report |
| Affiliate Earnings by Partner | RISITEX Commission Ledger | Script report |
| Wallet Settlement Trail | RISITEX Wallet Settlement + Journal Entry | Print Format |
| GST Dashboard | Standard (India Compliance) | Built-in |
| Inventory Health (low / critical / OOS) | Stock Ledger Entry + Item Reorder | Standard |
| Credit Utilisation | Standard Customer Credit Balance | Built-in |
| MOQ / Matrix Compliance | RISITEX Matrix Order | Script report |

---

## 6. Integration design — direction & cadence

| Pair | Direction | Trigger | Cadence |
|---|---|---|---|
| Medusa Customer ↔ ERPNext Customer | both | Medusa: `customer.*` events → push; Frappe: Customer save → webhook | push instant, pull 5-min |
| Medusa Order → ERPNext Sales Order | push | `order.placed` | instant |
| Medusa Order → ERPNext Sales Invoice | push | `order.payment_captured` | instant |
| ERPNext Item → Medusa Item | pull | Pull cron on `modified > last_pull_at` | 5 min |
| ERPNext Stock Ledger → Medusa Inventory | pull | Pull cron + on Stock Entry submit webhook | webhook instant, pull 5-min |
| ERPNext Delivery Note → Medusa Shipment | push (Frappe → Medusa) | Frappe Webhook on Delivery Note submit | instant |
| Medusa Commission Record → ERPNext Commission Ledger | push | `commission.accrued` (subscriber on order.placed) | instant |
| ERPNext Payment Entry (affiliate payout) → Medusa | push (Frappe → Medusa) | Frappe Webhook on Payment Entry submit | instant |
| Medusa Wallet Transaction → ERPNext Wallet Settlement (batched) | push | Daily cron in Medusa | once / day |
| Medusa Saved Cart, Saved Cart Share | n/a | no ERPNext side | — |

---

## 7. Implementation roadmap (this session)

1. ✅ Phase 1 audit (this section above)
2. ✅ Phase 2 architecture report (this document)
3. ⏳ Phase 3 — scaffold `risitex_erp` Frappe app + 6 custom doctypes
4. ⏳ Phase 4 — custom fields on standard doctypes (fixtures)
5. ⏳ Phase 5 — rewrite `canonical-mappings.ts` for RISITEX
6. ⏳ Phase 6 — inbound webhook handler on Frappe side
7. ⏳ Phase 7 — owner action items (install steps) + commit

Phases 3-7 are scaffolds; running the integration end-to-end requires the
owner to install + configure (see "Action required from owner" at the end).
