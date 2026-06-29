import { model } from "@medusajs/framework/utils"

/**
 * Singleton row holding all Cashfree integration credentials + module-wide
 * config.
 *
 * Cashfree exposes five products we care about, each with its own API key
 * pair and (usually) its own webhook signing secret:
 *
 *   1. Payment Gateway (`pg`)       — checkout + Auto-Collect VBA
 *   2. Payouts (`payouts`)          — outbound disbursements
 *   3. Subscriptions (`subscriptions`)
 *   4. Cross-border (`cross_border`)
 *   5. Verification Suite (`verification`) — Secure ID (KYC)
 *
 * Storage model: each product has its own `<env>_<product>_<field>` triple,
 * plus a `<product>_active_env` pointer and `<product>_enabled` flag. This
 * lets the admin configure sandbox AND production credentials and flip the
 * active env without losing either set.
 *
 * Verification Suite has no sandbox key-issuance in the Cashfree dashboard,
 * so its `active_env` is forced to 'production' at the service layer and
 * the admin UI hides the env picker. The sandbox slot exists for future
 * affordance.
 *
 * `*_encrypted` columns are AES-256-GCM ciphertext (see `cashfree/crypto.ts`).
 * `AT_REST_ENCRYPTION_KEY` env var must be set.
 *
 * Legacy columns (flat `client_*` / `payouts_*` and the first-generation
 * `{sandbox,production}_client_*` / `{sandbox,production}_payouts_*`) are
 * retained as a read-only fallback for the Verification Suite and Payouts
 * products respectively.
 */
export const CashfreeSetting = model.define("cashfree_setting", {
  id: model.id().primaryKey(),
  singleton_key: model.text().default("default"),

  // ── Global module config ───────────────────────────────────────────
  /** Legacy global env pointer. Superseded by per-product `<p>_active_env`
   *  but kept for backwards compatibility with old callers. */
  env: model.enum(["sandbox", "production"]).default("sandbox"),
  /** Default beneficiary name shown to remitters on their bank's
   *  transfer screen when no per-customer override applies (e.g. a
   *  marketing landing-page VBA). Per-customer VBAs created via
   *  `provisionVirtualAccountForCustomer` always override this with
   *  the customer's PAN-verified name. Renamed from `vba_prefix` on
   *  2026-05-04 — the old name implied a string concatenation that
   *  never happened; this is the literal beneficiary name. */
  beneficiary_name: model.text().nullable(),
  /** Name of the Cashfree Auto-Collect notification group to attach to
   *  every VBA we provision via `/pg/vba`. Required by Cashfree's 2024-
   *  07-10 API version; without it VBA creation fails with
   *  `notif_group_not_exists`. The name must match a group the merchant
   *  has pre-created in Cashfree dashboard → Auto-Collect →
   *  Notifications. One name works across sandbox + production as long
   *  as the merchant has created it in both envs. */
  pg_notification_group: model.text().nullable(),
  updated_by_user_id: model.text().nullable(),
  // ── Platform fee ─────────────────────────────────────────────
  // Storefront reads these via `GET /store/fees`. Decimal form
  // (0.02 = 2%). Admin UI shows/collects as percent — conversion
  // happens at the API layer.
  //
  // `processing_fee_max_inr` is an OPTIONAL per-scrip cap in whole
  // rupees. The fee for each line item is `min(line_subtotal × rate,
  // max_inr)`. NULL = no cap (uncapped %-fee). 0 effectively disables
  // the fee (semantically same as `enabled = false`). The cap is
  // per scrip — i.e. evaluated independently on each cart line item
  // — so a cart with multiple scrips bills `cap × N`, not one cap
  // across the whole cart.
  processing_fee_enabled: model.boolean().default(true),
  processing_fee_rate: model.number().default(0.02),
  processing_fee_max_inr: model.number().nullable(),

  // ── Low-quantity flat fee ────────────────────────────────────
  // A flat ₹X added to small orders to make them economic.
  //   threshold_inr — apply the flat fee whenever investment
  //                   subtotal is BELOW this number (₹).
  //   amount_inr    — flat ₹ to add (per order, not per item).
  // Storefront reads these via `GET /store/fees` alongside the
  // processing fee. Same admin UI at /app/fees.
  low_qty_fee_enabled: model.boolean().default(true),
  low_qty_fee_threshold_inr: model.number().default(10000),
  low_qty_fee_amount_inr: model.number().default(250),

  // ── Statutory fees (stamp duty + GST) ─────────────────────────
  // Stamp duty is a government levy on every share purchase.
  // GST is charged on platform fees, low-order fees, and stamp duty.
  // Admin can update these here when rates change — no redeploy needed.
  /** Stamp duty rate as a decimal. Default 0.00015 = 0.015%. */
  stamp_duty_rate: model.number().default(0.00015),
  /** GST rate as a decimal. Default 0.18 = 18%. */
  gst_rate: model.number().default(0.18),
  /** Whether to collect a GSTIN from the customer at checkout. Default
   *  OFF — GST is still charged on fees regardless; this only controls
   *  whether the optional GSTIN input is shown. Will be gated to
   *  company/business customers later. */
  gstin_collection_enabled: model.boolean().default(false),

  // ── Promo balance utilisation cap (per-transaction) ────────────
  // Promo balance is a finance-controlled incentive bucket. At checkout,
  // the wallet provider drains promo first, then main —
  // but capped per transaction at:
  //
  //   max(promo_max_pct_of_subtotal × cart_subtotal, promo_max_flat_inr)
  //
  // where cart_subtotal is the line-item investment value BEFORE
  // processing / low-qty fees. Default cap: 2% of investment OR ₹500,
  // whichever is HIGHER.
  promo_payment_enabled: model.boolean().default(true),
  /** Decimal — 0.02 = 2%. Admin UI shows / collects as percent. */
  promo_max_pct_of_subtotal: model.number().default(0.02),
  /** Whole ₹ floor. Default 500 = ₹500. */
  promo_max_flat_inr: model.number().default(500),

  // ── Per-product toggles & active-env pointers ─────────────────────
  pg_enabled: model.boolean().default(false),
  pg_active_env: model.enum(["sandbox", "production"]).default("sandbox"),
  payouts_enabled: model.boolean().default(false),
  payouts_active_env: model.enum(["sandbox", "production"]).default("sandbox"),
  subscriptions_enabled: model.boolean().default(false),
  subscriptions_active_env: model
    .enum(["sandbox", "production"])
    .default("sandbox"),
  cross_border_enabled: model.boolean().default(false),
  cross_border_active_env: model
    .enum(["sandbox", "production"])
    .default("sandbox"),
  /** Verification Suite has no active_env column — always production. */
  verification_enabled: model.boolean().default(false),
  /** Per-kind toggles for Verification Suite. Each kind is independently
   *  togglable within the umbrella `verification_enabled` master switch.
   *  Default TRUE so existing installs that had the master flag on keep
   *  the same behavior. Each per-kind flag gates the corresponding store
   *  route AND is mirrored to the storefront via /store/kyc/status so
   *  the UI can skip/hide the step cleanly.
   *
   *  Semantics: a kind is "live" iff verification_enabled && <kind>_verification_enabled.
   *  - pan_verification_enabled     — /store/kyc/pan/verify
   *  - aadhaar_verification_enabled — /store/kyc/aadhaar/{otp-send,otp-verify}
   *  - bank_verification_enabled    — penny-drop on /store/bank-accounts
   *  - cmr_verification_enabled     — CMR verify on /store/demat-accounts
   */
  pan_verification_enabled: model.boolean().default(true),
  aadhaar_verification_enabled: model.boolean().default(true),
  bank_verification_enabled: model.boolean().default(true),
  cmr_verification_enabled: model.boolean().default(true),

  // ── Legacy flat columns (Verification Suite + Payouts read-fallback) ──
  client_id: model.text().nullable(),
  client_secret_encrypted: model.text().nullable(),
  payouts_client_id: model.text().nullable(),
  payouts_client_secret_encrypted: model.text().nullable(),
  webhook_secret_encrypted: model.text().nullable(),
  verify_webhook_secret_encrypted: model.text().nullable(),

  // ── Per-env columns for Verification Suite (legacy naming, bound to VS) ──
  sandbox_client_id: model.text().nullable(),
  sandbox_client_secret_encrypted: model.text().nullable(),
  production_client_id: model.text().nullable(),
  production_client_secret_encrypted: model.text().nullable(),
  sandbox_verify_webhook_secret_encrypted: model.text().nullable(),
  production_verify_webhook_secret_encrypted: model.text().nullable(),

  // ── Per-env columns for Payouts ───────────────────────────────────
  sandbox_payouts_client_id: model.text().nullable(),
  sandbox_payouts_client_secret_encrypted: model.text().nullable(),
  production_payouts_client_id: model.text().nullable(),
  production_payouts_client_secret_encrypted: model.text().nullable(),
  sandbox_webhook_secret_encrypted: model.text().nullable(),
  production_webhook_secret_encrypted: model.text().nullable(),

  // ── Per-env columns for Payment Gateway (new) ─────────────────────
  sandbox_pg_client_id: model.text().nullable(),
  sandbox_pg_client_secret_encrypted: model.text().nullable(),
  sandbox_pg_webhook_secret_encrypted: model.text().nullable(),
  production_pg_client_id: model.text().nullable(),
  production_pg_client_secret_encrypted: model.text().nullable(),
  production_pg_webhook_secret_encrypted: model.text().nullable(),

  // ── Per-env columns for Subscriptions (new) ───────────────────────
  sandbox_subscriptions_client_id: model.text().nullable(),
  sandbox_subscriptions_client_secret_encrypted: model.text().nullable(),
  sandbox_subscriptions_webhook_secret_encrypted: model.text().nullable(),
  production_subscriptions_client_id: model.text().nullable(),
  production_subscriptions_client_secret_encrypted: model.text().nullable(),
  production_subscriptions_webhook_secret_encrypted: model.text().nullable(),

  // ── Per-env columns for Cross-border (new) ────────────────────────
  sandbox_cross_border_client_id: model.text().nullable(),
  sandbox_cross_border_client_secret_encrypted: model.text().nullable(),
  sandbox_cross_border_webhook_secret_encrypted: model.text().nullable(),
  production_cross_border_client_id: model.text().nullable(),
  production_cross_border_client_secret_encrypted: model.text().nullable(),
  production_cross_border_webhook_secret_encrypted: model.text().nullable(),
})
