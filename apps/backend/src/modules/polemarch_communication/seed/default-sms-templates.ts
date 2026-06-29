/**
 * SMS template body catalog. Each row is the *exact* body RISITEX
 * wants to send via MSG91; the admin separately registers it on TRAI's
 * DLT portal (through MSG91's onboarding partner) and pastes the
 * resulting `dlt_template_id` back into the row.
 *
 * Body conventions:
 *   - Stay under 160 chars where possible — single SMS segment, lower
 *     cost.
 *   - Use {{1}} {{2}} … placeholders MSG91's Flow API maps to var1 /
 *     var2 / … in the recipients[] payload.
 *   - End with a sender header / promo footer ("RISITEX" or "- RISITEX")
 *     to satisfy DLT presentation requirements.
 */

export type DefaultSmsTemplate = {
    slug: string
    label: string
    description: string
    body: string
    is_otp?: boolean
    variables: Array<{
        key: string
        sample: string
        description?: string
        required?: boolean
    }>
}

export const DEFAULT_SMS_TEMPLATES: DefaultSmsTemplate[] = [
    // OTP — always single-purpose, registered under DLT OTP category.
    {
        slug: "auth.phone_otp_login",
        label: "Phone OTP — login (SMS)",
        description: "Fallback when WhatsApp OTP delivery fails for /login/phone.",
        is_otp: true,
        body: "{{1}} is your {{brand}} login OTP. Valid 10 mins. Do not share. - RISITEX",
        variables: [{ key: "otp", sample: "123456", required: true }],
    },
    {
        slug: "auth.phone_verify_otp",
        label: "Phone OTP — verification (SMS)",
        description: "Fallback when WhatsApp verify OTP delivery fails.",
        is_otp: true,
        body: "{{1}} is your {{brand}} verification code. Valid 10 mins. - RISITEX",
        variables: [{ key: "otp", sample: "847291", required: true }],
    },
    // Transactional fallbacks
    {
        slug: "order.placed",
        label: "Order placed (SMS)",
        description: "SMS fallback for the order-placed confirmation.",
        body: "Hi {{1}}, {{brand}} order #{{2}} for {{3}} items totalling Rs{{4}} placed. We'll notify on dispatch. - RISITEX",
        variables: [
            { key: "first_name", sample: "Mira", required: true },
            { key: "order_id", sample: "10234", required: true },
            { key: "item_count", sample: "3", required: true },
            { key: "total_inr", sample: "1,250", required: true },
        ],
    },
    {
        slug: "order.shipped",
        label: "Order shipped (SMS)",
        description: "SMS fallback for the order-shipped notification.",
        body: "Hi {{1}}, {{brand}} order #{{2}} shipped via {{3}}. AWB: {{4}}. Track: {{5}} - RISITEX",
        variables: [
            { key: "first_name", sample: "Mira", required: true },
            { key: "order_id", sample: "10234", required: true },
            { key: "carrier", sample: "Bluedart", required: true },
            { key: "tracking_number", sample: "N12345", required: true },
            {
                key: "tracking_url",
                sample: "https://www.bluedart.com/tracking?awb=N12345",
                required: true,
            },
        ],
    },
    {
        slug: "order.delivered",
        label: "Order delivered (SMS)",
        description: "SMS fallback for the order-delivered notification.",
        body: "Hi {{1}}, your {{brand}} order #{{2}} was delivered. Need an exchange? Open the order in your account. - RISITEX",
        variables: [
            { key: "first_name", sample: "Mira", required: true },
            { key: "order_id", sample: "10234", required: true },
        ],
    },
    {
        slug: "wallet.credited",
        label: "Wallet credited (SMS)",
        description: "SMS fallback for the wallet-credit notification.",
        body: "Hi {{1}}, Rs{{2}} credited to your {{brand}} wallet. New balance: Rs{{3}}. - RISITEX",
        variables: [
            { key: "first_name", sample: "Mira", required: true },
            { key: "amount_inr", sample: "500", required: true },
            { key: "new_balance_inr", sample: "2,340", required: true },
        ],
    },
    {
        slug: "wallet.debited",
        label: "Wallet debited (SMS)",
        description: "SMS fallback for the wallet-debit notification.",
        body: "Hi {{1}}, Rs{{2}} debited from {{brand}} wallet for order #{{3}}. New balance: Rs{{4}}. - RISITEX",
        variables: [
            { key: "first_name", sample: "Mira", required: true },
            { key: "amount_inr", sample: "1,250", required: true },
            { key: "order_id", sample: "10234", required: true },
            { key: "new_balance_inr", sample: "1,090", required: true },
        ],
    },
    {
        slug: "account.welcome",
        label: "Welcome — post-register (SMS)",
        description: "SMS fallback for the welcome notification.",
        body: "Hi {{1}}, welcome to {{brand}}. Open the B2B catalogue at {{storefront_url}}/products. - RISITEX",
        variables: [{ key: "first_name", sample: "Mira", required: true }],
    },
    {
        slug: "account.password_reset",
        label: "Password reset request (SMS)",
        description:
            "LEGACY — paired with the link-based reset email. Retired in favour of auth.password_reset_otp once Phase B's OTP flow rolled out. Kept here so old environments don't break; not bound by the new flow.",
        body: "{{brand}} password-reset link sent to your registered email. Valid 15 mins. If you didn't request, ignore. - RISITEX",
        variables: [],
    },
    // OTP-based password reset SMS (paired with the WA template of the
    // same slug). Used when WA delivery fails or the user explicitly
    // chose phone channel and Polygin → MSG91 fallback fires.
    {
        slug: "auth.password_reset_otp",
        label: "Password reset OTP (SMS)",
        description: "SMS fallback for OTP-based password reset.",
        is_otp: true,
        body: "{{1}} is your {{brand}} password reset code. Valid 10 mins. Do not share. - RISITEX",
        variables: [{ key: "otp", sample: "123456", required: true }],
    },
    // Tamper-evident SMS sent after a successful password change.
    // Per the May-2026 spec: password changes go via WA + SMS.
    {
        slug: "auth.password_changed",
        label: "Password changed (SMS)",
        description:
            "Sent after a customer changes their password. Mirrors the WA + email confirmations.",
        body: "Your {{brand}} password was changed. If this wasn't you, contact support immediately. - RISITEX",
        variables: [],
    },

    // Purchase confirmation — payment captured for an order.
    {
        slug: "order.payment_captured",
        label: "Order — payment received (SMS)",
        description: "SMS fallback for the payment-captured confirmation.",
        body: "Hi {{1}}, {{brand}} received Rs{{2}} for order #{{3}}. Your order is now in fulfillment. - RISITEX",
        variables: [
            { key: "first_name", sample: "Mira", required: true },
            { key: "amount_inr", sample: "1,250", required: true },
            { key: "order_id", sample: "10234", required: true },
        ],
    },

    // Order canceled — closes the loop on a placed order.
    {
        slug: "order.canceled",
        label: "Order — canceled (SMS)",
        description: "SMS fallback for the order-canceled notification.",
        body: "Hi {{1}}, {{brand}} order #{{2}} canceled: {{3}}. Any debit will refund to wallet in 1 business day. - RISITEX",
        variables: [
            { key: "first_name", sample: "Mira", required: true },
            { key: "order_id", sample: "10234", required: true },
            { key: "reason", sample: "Customer requested", required: true },
        ],
    },

    // Wholesale / B2B onboarding outcomes.
    {
        slug: "company.approved",
        label: "Wholesale approved (SMS)",
        description: "SMS fallback for the wholesale-approved notification.",
        body: "Hi {{1}}, your {{brand}} wholesale account is live. Tier: {{2}}. Open the B2B catalogue from your account. - RISITEX",
        variables: [
            { key: "first_name", sample: "Mira", required: true },
            { key: "tier_name", sample: "Silver", required: true },
        ],
    },
    {
        slug: "company.rejected",
        label: "Wholesale rejected (SMS)",
        description: "SMS fallback for the wholesale-rejected notification.",
        body: "Hi {{1}}, we couldn't approve your {{brand}} wholesale application: {{2}}. Update from your account or reply for help. - RISITEX",
        variables: [
            { key: "first_name", sample: "Mira", required: true },
            {
                key: "reason",
                sample: "GSTIN couldn't be verified",
                required: true,
            },
        ],
    },
]
