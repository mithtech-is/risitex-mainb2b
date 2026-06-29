import { model } from "@medusajs/framework/utils"

/**
 * One row per OTP send. The `channel` column distinguishes phone-OTP
 * (WhatsApp / SMS, the original use-case) from email-OTP (RISITEX
 * Phase A — mandatory for account verification).
 *
 * Lifecycle (identical for both channels):
 *
 *   1. createPhoneOtp() / createEmailOtp() → row created, otp_hash +
 *                              salt persisted, attempts = 0, sent_via
 *                              set to the channel that actually
 *                              delivered (whatsapp / sms / email).
 *   2. verifyPhoneOtp() / verifyEmailOtp() → on each attempt,
 *                              attempts++. On match, consumed_at is
 *                              stamped and the row is "burned" (any
 *                              further verify returns already-consumed).
 *   3. expires_at < now()    → row is dead (verify returns expired).
 *
 * Plaintext OTP is NEVER stored. The hash is sha256(pepper + salt + otp)
 * where:
 *   pepper = process.env.OTP_PEPPER  — server-wide, secret
 *   salt   = randomBytes(16).toString("hex")  — per row, public
 *
 * Even if the table is exfiltrated, the attacker has to brute-force a
 * 6-digit space against a peppered hash — and `attempts` caps at 5, so
 * a live attacker can't grind verifies anyway.
 *
 * `purpose` distinguishes:
 *   - "login"  — used to mint a session for an existing customer.
 *                (Phone-OTP login is retired; kept for legacy rows.)
 *   - "verify" — used to set `customer.phone` + `metadata.phone_verified`
 *                or `customer.metadata.email_verified` on the currently-
 *                authenticated customer.
 *
 * `channel` distinguishes the contact rail:
 *   - "phone" — phone_e164 is set, email is null.
 *   - "email" — email is set, phone_e164 is null.
 */
export const OtpRequest = model.define("polemarch_otp_request", {
    id: model.id().primaryKey(),
    channel: model.enum(["phone", "email"]).index().default("phone"),
    phone_e164: model.text().index().nullable(),
    email: model.text().index().nullable(),
    purpose: model.enum(["login", "verify"]).index(),
    /** Set only for `purpose=verify` (the customer is already known) or
     *  for `purpose=login` after a successful verify (we record which
     *  customer the OTP minted a session for). */
    customer_id: model.text().index().nullable(),
    otp_hash: model.text(),
    salt: model.text(),
    attempts: model.number().default(0),
    max_attempts: model.number().default(5),
    expires_at: model.dateTime(),
    consumed_at: model.dateTime().nullable(),
    sent_via: model.enum(["whatsapp", "sms", "email", "failed"]).nullable(),
    /** Concatenated provider message ids — comma-separated when both
     *  channels were attempted. Mostly a debugging breadcrumb. */
    provider_message_id: model.text().nullable(),
    /** SHA-256 hex of the request IP — kept for rate-limiting + abuse
     *  forensics. The raw IP itself is never stored. */
    ip_hash: model.text().index().nullable(),
})
