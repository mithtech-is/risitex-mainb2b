/**
 * Default system template catalog.
 *
 * Every entry is written as a small `renderShell({...})` call so the
 * HTML stays readable. Variables use Handlebars `{{…}}` syntax — the
 * provider compiles them at send time against the `data` field passed
 * into `notificationModuleService.createNotifications`.
 *
 * Conventions for variable names:
 *   - `customer.first_name`, `customer.email` — always present for
 *     customer-channel sends (resolved by `sendEventEmail`).
 *   - `dashboard_url`, `support_url` — injected by the loader / sender
 *     so the footer links work in every template.
 *   - Amounts: `*_inr` is a pre-formatted INR string (e.g. "1,25,000").
 *     Paise math happens at the call site, not in Handlebars.
 */

import { renderShell } from "./shell"

export type SeedTemplate = {
    slug: string
    name: string
    description: string
    subject: string
    html: string
    sample_data: Record<string, any>
}

const DEFAULT_CTA = {
    label: "Open dashboard",
    href: "{{dashboard_url}}",
}

// ────────────────────────────────────────────────────────────────────
// Customer templates
// ────────────────────────────────────────────────────────────────────

const customer: SeedTemplate[] = [
    {
        slug: "customer.welcome",
        name: "Customer · Welcome",
        description: "Sent right after account creation.",
        subject: "Welcome to RISITEX, {{customer.first_name}}",
        html: renderShell({
            kicker: "Welcome",
            heading: "Welcome aboard, {{customer.first_name}} 👋",
            lead:
                "Your RISITEX wholesale account is live. Browse our catalogue of premium innerwear " +
                "and loungewear with factory-direct pricing.",
            cta: { label: "Browse catalogue", href: "{{storefront_url}}/wholesale/catalogue" },
            footnote:
                "Looking to stock RISITEX in bulk? Apply for a wholesale account from your dashboard.",
            preview: "Your RISITEX account is live — here's what to do next.",
        }),
        sample_data: {
            customer: { first_name: "Aarav", email: "aarav@example.com" },
            dashboard_url: "https://risitex.in/b2b/dashboard",
            explore_url: "https://risitex.in/wholesale/catalogue",
            storefront_url: "https://risitex.in",
            support_url: "https://risitex.in/contact",
        },
    },
    {
        slug: "auth.password_reset_otp",
        name: "Auth · Password reset OTP",
        description:
            "OTP-based password reset. Replaces the legacy email-link flow.",
        subject: "Your RISITEX password reset code: {{otp}}",
        // No CTA — same OTP-as-code-block pattern as auth.email_otp.
        html: renderShell({
            kicker: "Reset",
            accent: "#b45309",
            heading: "Reset your password",
            lead:
                "Use this code on the RISITEX reset page to set a new password." +
                "<div style=\"margin:24px 0;text-align:center;\">" +
                "<div style=\"display:inline-block;background:#f1f5f9;border:1px solid #e5e7eb;border-radius:12px;padding:18px 32px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:0.35em;color:#1f2937;\">{{otp}}</div>" +
                "</div>" +
                "Valid for <strong>{{expires_in}}</strong>. Don't share this code with anyone — RISITEX staff will never ask you for it.",
            footnote:
                "If you didn't request this, ignore this email — your password stays unchanged.",
            preview: "Your RISITEX password reset code: {{otp}}.",
        }),
        sample_data: {
            customer: { first_name: "Aarav", email: "aarav@example.com" },
            otp: "482917",
            expires_in: "10 minutes",
            dashboard_url: "https://risitex.in/b2b/dashboard",
            support_url: "https://risitex.in/contact",
        },
    },
    {
        slug: "auth.password_changed",
        name: "Auth · Password changed",
        description:
            "Sent after a successful password change from /account. Acts as a tamper-evident security notice.",
        subject: "Your RISITEX password was changed",
        html: renderShell({
            kicker: "Security",
            accent: "#b45309",
            heading: "Your password was changed",
            lead:
                "We're confirming that the password on the RISITEX account for " +
                "<strong>{{customer.email}}</strong> was changed at <strong>{{changed_at}}</strong>." +
                "<br><br>" +
                "If this was you, you can ignore this notice. <strong>If it wasn't, contact support immediately</strong> — your account may be compromised.",
            cta: { label: "Contact support", href: "{{support_url}}" },
            footnote:
                "RISITEX will never ask you for your password. If you didn't initiate this change, please reach out via support immediately.",
            preview: "Your RISITEX password was just changed.",
        }),
        sample_data: {
            customer: { first_name: "Aarav", email: "aarav@example.com" },
            changed_at: "3 May 2026, 16:42 IST",
            dashboard_url: "https://risitex.in/b2b/dashboard",
            support_url: "https://risitex.in/contact",
        },
    },
    {
        slug: "auth.password_reset",
        name: "Auth · Password reset (LEGACY)",
        description:
            "LEGACY link-based reset. Retired in favour of auth.password_reset_otp; kept seeded so old environments still have it. Not bound by default in the new event map.",
        subject: "Reset your RISITEX password",
        html: renderShell({
            kicker: "Security",
            accent: "#b45309",
            heading: "Reset your password",
            lead:
                "We received a request to reset the password on the RISITEX account for " +
                "<strong>{{entity_id}}</strong>. If that was you, tap the button below. The link is " +
                "valid for <strong>{{expires_in}}</strong>.",
            cta: { label: "Reset password", href: "{{reset_url}}" },
            footnote:
                "If you didn't request this, ignore this email — your password stays unchanged. " +
                "For extra safety, never share the reset link with anyone.",
            preview: "A password-reset link for your RISITEX account.",
        }),
        sample_data: {
            entity_id: "aarav@example.com",
            reset_url: "https://risitex.in/reset-password?token=abc123",
            expires_in: "15 minutes",
            dashboard_url: "https://risitex.in/b2b/dashboard",
            support_url: "https://risitex.in/contact",
        },
    },
    {
        slug: "auth.email_otp",
        name: "Auth · Email OTP",
        description:
            "6-digit OTP for verifying a customer's email address from /account.",
        subject: "Your RISITEX verification code: {{otp}}",
        // No CTA — earlier versions used a CTA whose label was the OTP
        // and href was /account, which let recipients click the
        // OTP-shaped button expecting it to verify, but the link only
        // opened the page without verifying. The OTP now renders inline
        // as a non-clickable code block; the user copies the code and
        // types it on the account page.
        html: renderShell({
            kicker: "Verify",
            accent: "#0d6efd",
            heading: "Your verification code",
            lead:
                "Use this code on the RISITEX account page to verify your email address." +
                "<div style=\"margin:24px 0;text-align:center;\">" +
                "<div style=\"display:inline-block;background:#f1f5f9;border:1px solid #e5e7eb;border-radius:12px;padding:18px 32px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:0.35em;color:#1f2937;\">{{otp}}</div>" +
                "</div>" +
                "Valid for <strong>{{expires_in}}</strong>. Don't share this code with anyone — RISITEX staff will never ask you for it.",
            footnote:
                "If you didn't request this code, you can ignore this email — your account is safe.",
            preview: "Your RISITEX email verification code: {{otp}}.",
        }),
        sample_data: {
            customer: { first_name: "Aarav", email: "aarav@example.com" },
            otp: "482917",
            expires_in: "10 minutes",
            dashboard_url: "https://risitex.in/b2b/dashboard",
            support_url: "https://risitex.in/contact",
        },
    },
    {
        slug: "order.placed",
        name: "Order · Placed",
        description: "Order confirmation sent the moment an order is created.",
        subject: "Order #{{order.display_id}} placed",
        html: renderShell({
            kicker: "Order update",
            heading: "We've got your order",
            lead:
                "Thanks, {{customer.first_name}} — order <strong>#{{order.display_id}}</strong> is " +
                "in. We'll notify you as soon as it ships.",
            details: {
                title: "Summary",
                rows: [
                    { label: "Order id", value: "#{{order.display_id}}" },
                    { label: "Placed on", value: "{{order.placed_at}}" },
                    { label: "Total", value: "₹{{total_inr}}" },
                    { label: "Payment", value: "{{order.payment_status}}" },
                ],
            },
            cta: { label: "View order", href: "{{order_url}}" },
            preview: "Order #{{order.display_id}} — confirmed.",
        }),
        sample_data: {
            customer: { first_name: "Aarav" },
            order: {
                display_id: "10234",
                placed_at: "16 Apr 2026, 11:42",
                payment_status: "Pending",
            },
            total_inr: "12,500",
            order_url: "https://risitex.in/b2b/orders/10234",
            dashboard_url: "https://risitex.in/b2b/dashboard",
            support_url: "https://risitex.in/contact",
        },
    },
    {
        slug: "order.payment_captured",
        name: "Order · Payment captured",
        description: "Payment has been captured against the order.",
        subject: "Payment received for #{{order.display_id}}",
        html: renderShell({
            kicker: "Payment",
            accent: "#059669",
            heading: "Payment confirmed",
            lead:
                "We've received <strong>₹{{amount_inr}}</strong> for order " +
                "<strong>#{{order.display_id}}</strong>. Your order is now in fulfillment. " +
                "We'll email tracking as soon as it dispatches.",
            details: {
                rows: [
                    { label: "Order", value: "#{{order.display_id}}" },
                    { label: "Amount", value: "₹{{amount_inr}}" },
                    { label: "Wallet balance", value: "₹{{wallet_balance_inr}}" },
                ],
            },
            cta: DEFAULT_CTA,
            preview: "₹{{amount_inr}} payment confirmed.",
        }),
        sample_data: {
            customer: { first_name: "Aarav" },
            order: { display_id: "10234" },
            amount_inr: "12,500",
            wallet_balance_inr: "2,500",
            dashboard_url: "https://risitex.in/b2b/dashboard",
            support_url: "https://risitex.in/contact",
        },
    },
    {
        slug: "order.canceled",
        name: "Order · Canceled",
        description: "Sent when the order is canceled (by customer or admin).",
        subject: "Order #{{order.display_id}} canceled",
        html: renderShell({
            kicker: "Order update",
            accent: "#991b1b",
            heading: "Your order was canceled",
            lead:
                "Order <strong>#{{order.display_id}}</strong> has been canceled. Any amount held " +
                "against it has been released back to your wallet.",
            details: {
                rows: [
                    { label: "Order", value: "#{{order.display_id}}" },
                    { label: "Total", value: "₹{{total_inr}}" },
                    { label: "Reason", value: "{{reason}}" },
                ],
            },
            cta: { label: "Back to dashboard", href: "{{storefront_url}}/b2b/dashboard" },
            preview: "Order #{{order.display_id}} canceled.",
        }),
        sample_data: {
            customer: { first_name: "Aarav" },
            order: { display_id: "10234" },
            total_inr: "12,500",
            reason: "Customer requested",
            storefront_url: "https://risitex.in",
            dashboard_url: "https://risitex.in/b2b/dashboard",
            support_url: "https://risitex.in/contact",
        },
    },
    {
        slug: "order.return_received",
        name: "Order · Return received",
        description: "Return received, items came back.",
        subject: "Return received — #{{order.display_id}}",
        html: renderShell({
            kicker: "Return",
            heading: "Return complete",
            lead:
                "We've received the returned items for order " +
                "<strong>#{{order.display_id}}</strong>. Any refund will reflect in your wallet " +
                "within 2 business days.",
            cta: DEFAULT_CTA,
            preview: "Return received.",
        }),
        sample_data: {
            customer: { first_name: "Aarav" },
            order: { display_id: "10234" },
            dashboard_url: "https://risitex.in/b2b/dashboard",
            support_url: "https://risitex.in/contact",
        },
    },
    {
        slug: "wallet.credited",
        name: "Wallet · Admin credit",
        description: "Admin manually credited the wallet.",
        subject: "₹{{amount_inr}} credited to your wallet",
        html: renderShell({
            kicker: "Wallet",
            accent: "#059669",
            heading: "₹{{amount_inr}} credited",
            lead:
                "Our team just added <strong>₹{{amount_inr}}</strong> to your RISITEX wallet.",
            details: {
                rows: [
                    { label: "Amount", value: "₹{{amount_inr}}" },
                    { label: "Reason", value: "{{reason}}" },
                    { label: "Note", value: "{{note}}" },
                    { label: "New balance", value: "₹{{wallet_balance_inr}}" },
                ],
            },
            cta: { label: "Open wallet", href: "{{wallet_url}}" },
            preview: "₹{{amount_inr}} admin credit.",
        }),
        sample_data: {
            customer: { first_name: "Aarav" },
            amount_inr: "1,000",
            reason: "Goodwill",
            note: "Apology for delayed order #10234.",
            wallet_balance_inr: "3,500",
            wallet_url: "https://risitex.in/b2b/wallet",
            dashboard_url: "https://risitex.in/b2b/dashboard",
            support_url: "https://risitex.in/contact",
        },
    },
    {
        slug: "wallet.debited",
        name: "Wallet · Admin debit",
        description: "Admin manually debited the wallet.",
        subject: "₹{{amount_inr}} debited from your wallet",
        html: renderShell({
            kicker: "Wallet",
            accent: "#991b1b",
            heading: "₹{{amount_inr}} debited",
            lead:
                "We've debited <strong>₹{{amount_inr}}</strong> from your RISITEX wallet. The " +
                "reason is below.",
            details: {
                rows: [
                    { label: "Amount", value: "₹{{amount_inr}}" },
                    { label: "Reason", value: "{{reason}}" },
                    { label: "Note", value: "{{note}}" },
                    { label: "New balance", value: "₹{{wallet_balance_inr}}" },
                ],
            },
            cta: { label: "Open wallet", href: "{{wallet_url}}" },
            footnote:
                "If this doesn't look right, reply to this email and we'll investigate.",
            preview: "₹{{amount_inr}} debited.",
        }),
        sample_data: {
            customer: { first_name: "Aarav" },
            amount_inr: "500",
            reason: "Correction",
            note: "Duplicate credit reversed.",
            wallet_balance_inr: "3,000",
            wallet_url: "https://risitex.in/b2b/wallet",
            dashboard_url: "https://risitex.in/b2b/dashboard",
            support_url: "https://risitex.in/contact",
        },
    },
    {
        slug: "wallet.frozen",
        name: "Wallet · Frozen",
        description: "Admin froze the wallet (no outflows allowed).",
        subject: "Your wallet has been frozen",
        html: renderShell({
            kicker: "Wallet",
            accent: "#991b1b",
            heading: "Your wallet is on hold",
            lead:
                "We've paused activity on your RISITEX wallet. Deposits will still land, but " +
                "you can't place new orders until we lift the hold.",
            details: {
                rows: [{ label: "Note from us", value: "{{note}}" }],
            },
            cta: { label: "Contact support", href: "{{support_url}}" },
            preview: "Your wallet is on hold.",
        }),
        sample_data: {
            customer: { first_name: "Aarav" },
            note: "Pending payment review.",
            dashboard_url: "https://risitex.in/b2b/dashboard",
            support_url: "https://risitex.in/contact",
        },
    },
    {
        slug: "account.email_verified",
        name: "Account · Email verified",
        description:
            "Confirms a successful email-OTP verification. Email-only.",
        subject: "Email verified — keep going",
        html: renderShell({
            kicker: "Account",
            accent: "#0d6efd",
            heading: "Email verified",
            lead:
                "Order receipts, dispatch updates, and account-recovery links can now reach you reliably." +
                "<br><br>Your account is ready. Browse the catalogue or apply for a wholesale account.",
            cta: { label: "Browse catalogue", href: "{{storefront_url}}/wholesale/catalogue" },
            footnote:
                "If you didn't request this verification, contact support immediately.",
            preview: "Your RISITEX email is verified.",
        }),
        sample_data: {
            customer: { first_name: "Aarav", email: "aarav@example.com" },
            storefront_url: "https://risitex.in",
            dashboard_url: "https://risitex.in/b2b/dashboard",
            support_url: "https://risitex.in/contact",
        },
    },
    {
        slug: "cart.abandoned_1h",
        name: "Cart · Abandoned 1h",
        description:
            "First recovery nudge: fires ~1h after the last cart update if the cart isn't paid.",
        subject:
            "Still interested in {{first_item_name}}, {{customer.first_name}}?",
        html: renderShell({
            kicker: "Your cart",
            heading: "{{first_item_name}} is waiting in your cart",
            lead:
                "You added <strong>{{item_count}} item(s)</strong> worth " +
                "<strong>{{total_display}}</strong> about an hour ago on RISITEX. " +
                "Come back when you're ready — sizes can sell out faster than we restock.",
            cta: { label: "Resume checkout", href: "{{resume_url}}" },
            footnote:
                "Not interested? Safe to ignore. We'll check in once more tomorrow and then again in a week.",
            preview: "Your cart from an hour ago is still here.",
        }),
        sample_data: {
            customer: { first_name: "Manoj", email: "manoj@example.com" },
            first_item_name: "PIX Boxer Shorts",
            first_item_handle: "pix-boxer-shorts",
            item_count: 1,
            total_display: "₹1,250",
            resume_url: "https://risitex.in/products/cotton-boxer-shorts",
            cart_url: "https://risitex.in/cart",
            dashboard_url: "https://risitex.in/b2b/dashboard",
            support_url: "https://risitex.in/contact",
        },
    },
    {
        slug: "cart.abandoned_1d",
        name: "Cart · Abandoned 1 day",
        description:
            "Second recovery nudge: fires ~24h after the last cart update.",
        subject:
            "{{first_item_name}} is still in your cart, {{customer.first_name}}",
        html: renderShell({
            kicker: "Your cart · day 1",
            heading: "You left {{first_item_name}} in your cart yesterday",
            lead:
                "Sizes can sell out faster than we restock — we'd hate for you to miss out. " +
                "Your RISITEX cart has <strong>{{item_count}} item(s)</strong> worth " +
                "<strong>{{total_display}}</strong>.",
            cta: { label: "Resume where you left off", href: "{{resume_url}}" },
            footnote:
                "We'll check in once more in a week if the cart is still pending.",
            preview: "Your size is still in stock — finish your cart when you're ready.",
        }),
        sample_data: {
            customer: { first_name: "Manoj", email: "manoj@example.com" },
            first_item_name: "PIX Boxer Shorts",
            first_item_handle: "pix-boxer-shorts",
            item_count: 1,
            total_display: "₹1,250",
            resume_url: "https://risitex.in/products/cotton-boxer-shorts",
            cart_url: "https://risitex.in/cart",
            dashboard_url: "https://risitex.in/b2b/dashboard",
            support_url: "https://risitex.in/contact",
        },
    },
    // Legacy 48h template kept so historical EmailLog rows referencing
    // it still render correctly in the admin viewer. The matching
    // event-map row is seeded `enabled: false` — no new sends go
    // through this slug.
    {
        slug: "cart.abandoned_48h",
        name: "Cart · Abandoned 48h (legacy)",
        description:
            "Retired. The 48h sweep was replaced by separate 1h / 1d tiers. " +
            "Template kept for backward compat with old EmailLog rows.",
        subject:
            "{{first_item_name}} is still in your cart, {{customer.first_name}}",
        html: renderShell({
            kicker: "Your cart",
            heading: "You left {{first_item_name}} in your cart",
            lead:
                "Sizes can sell out faster than we restock on RISITEX — we'd hate for you " +
                "to miss out. Your cart has <strong>{{item_count}} item(s)</strong> " +
                "worth <strong>{{total_display}}</strong>.",
            cta: { label: "Resume where you left off", href: "{{resume_url}}" },
            footnote:
                "Not interested anymore? Ignore this email — we won't bring it up again.",
            preview:
                "Your size is still in stock — finish your cart when you're ready.",
        }),
        sample_data: {
            customer: { first_name: "Manoj", email: "manoj@example.com" },
            first_item_name: "PIX Boxer Shorts",
            first_item_handle: "pix-boxer-shorts",
            item_count: 1,
            total_display: "₹1,250",
            resume_url: "https://risitex.in/products/cotton-boxer-shorts",
            cart_url: "https://risitex.in/cart",
            dashboard_url: "https://risitex.in/b2b/dashboard",
            support_url: "https://risitex.in/contact",
        },
    },
    {
        slug: "cart.abandoned_7d",
        name: "Cart · Abandoned 7 days",
        description:
            "Third recovery nudge: fires 7 days after the last cart update.",
        subject:
            "Still deciding on {{first_item_name}}? Here's where it stands.",
        html: renderShell({
            kicker: "One week later",
            accent: "#b45309",
            heading: "Your cart is still here, {{customer.first_name}}",
            lead:
                "{{first_item_name}} is still in your RISITEX cart from last week. Sizes " +
                "can sell out faster than we restock — take another look and see " +
                "what's still available in your size.",
            cta: { label: "Review your cart", href: "{{cart_url}}" },
            footnote:
                "One last reminder a few weeks out if the cart is still pending; after that we'll stop nudging.",
            preview: "Your cart from last week — here's where it stands.",
        }),
        sample_data: {
            customer: { first_name: "Manoj", email: "manoj@example.com" },
            first_item_name: "PIX Boxer Shorts",
            first_item_handle: "pix-boxer-shorts",
            item_count: 1,
            total_display: "₹1,250",
            resume_url: "https://risitex.in/products/cotton-boxer-shorts",
            cart_url: "https://risitex.in/cart",
            dashboard_url: "https://risitex.in/b2b/dashboard",
            support_url: "https://risitex.in/contact",
        },
    },
    {
        slug: "cart.abandoned_30d",
        name: "Cart · Abandoned 30 days",
        description:
            "Fourth + final recovery nudge: fires ~30 days after the last cart update. After this the cart is dropped from the sweep.",
        subject:
            "Last check-in on {{first_item_name}}",
        html: renderShell({
            kicker: "One month later",
            accent: "#6b7280",
            heading: "Still thinking about {{first_item_name}}?",
            lead:
                "It's been about a month since you added " +
                "{{first_item_name}} to your RISITEX cart. Availability " +
                "and sizes have likely shifted since then. Take a fresh look, or let " +
                "us know if you'd rather watch for restocks instead.",
            cta: { label: "See the current view", href: "{{resume_url}}" },
            footnote:
                "This is the last recovery email for this cart. For ongoing signals add the product to your wishlist — we'll alert on restocks rather than sit in your inbox.",
            preview: "One final check-in on your cart before we stop nudging.",
        }),
        sample_data: {
            customer: { first_name: "Manoj", email: "manoj@example.com" },
            first_item_name: "PIX Boxer Shorts",
            first_item_handle: "pix-boxer-shorts",
            item_count: 1,
            total_display: "₹1,250",
            resume_url: "https://risitex.in/products/cotton-boxer-shorts",
            cart_url: "https://risitex.in/cart",
            dashboard_url: "https://risitex.in/b2b/dashboard",
            support_url: "https://risitex.in/contact",
        },
    },
    // ────────────────────────────────────────────────────────────────
    // B2B wholesale onboarding + textile-specific order lifecycle
    // ────────────────────────────────────────────────────────────────
    {
        slug: "company.application_received",
        name: "Company · Application received",
        description:
            "Customer just submitted a B2B / wholesale account application via /companies/apply. UTILITY-style confirmation.",
        subject: "Your wholesale application is in review",
        html: renderShell({
            kicker: "Wholesale",
            heading: "Application in review",
            lead:
                "Hi {{customer.first_name}}, thanks for applying for a wholesale account with RISITEX. " +
                "We'll review your GSTIN and business details, and you'll hear back within 1-2 business days.",
            details: {
                rows: [
                    { label: "Trade name", value: "{{trade_name}}" },
                    { label: "GSTIN", value: "{{gstin}}" },
                ],
            },
            cta: { label: "View application", href: "{{storefront_url}}/b2b/dashboard" },
            preview: "Your RISITEX wholesale application is in review.",
        }),
        sample_data: {
            customer: { first_name: "Aarav", email: "aarav@example.com" },
            trade_name: "Coimbatore Textile Distributors",
            gstin: "33ABCCC1234A1Z5",
            storefront_url: "https://risitex.in",
            dashboard_url: "https://risitex.in/b2b/dashboard",
            support_url: "https://risitex.in/contact",
        },
    },
    {
        slug: "company.approved",
        name: "Company · Wholesale approved",
        description:
            "Admin approved the customer's B2B wholesale account.",
        subject: "Your wholesale account is live",
        html: renderShell({
            kicker: "Wholesale",
            accent: "#059669",
            heading: "You're approved",
            lead:
                "Great news, {{customer.first_name}} — your RISITEX wholesale account is approved. " +
                "You can now see tier pricing, place bulk orders, and access the B2B catalog.",
            details: {
                rows: [
                    { label: "Trade name", value: "{{trade_name}}" },
                    { label: "GSTIN", value: "{{gstin}}" },
                    { label: "Tier", value: "{{tier_name}}" },
                    { label: "Payment terms", value: "{{payment_terms}}" },
                ],
            },
            cta: { label: "Open B2B catalog", href: "{{storefront_url}}/wholesale/catalogue" },
            preview: "Your RISITEX wholesale account is live.",
        }),
        sample_data: {
            customer: { first_name: "Aarav", email: "aarav@example.com" },
            trade_name: "Coimbatore Textile Distributors",
            gstin: "33ABCCC1234A1Z5",
            tier_name: "Silver",
            payment_terms: "Net 30",
            storefront_url: "https://risitex.in",
            dashboard_url: "https://risitex.in/b2b/dashboard",
            support_url: "https://risitex.in/contact",
        },
    },
    {
        slug: "company.rejected",
        name: "Company · Wholesale rejected",
        description:
            "Admin couldn't approve the wholesale application this round.",
        subject: "We couldn't approve your wholesale application yet",
        html: renderShell({
            kicker: "Wholesale",
            accent: "#991b1b",
            heading: "We couldn't approve it yet",
            lead:
                "Thanks for applying, {{customer.first_name}}. We couldn't approve your wholesale " +
                "application this round. The reason from our team:",
            details: {
                rows: [
                    { label: "Reason", value: "{{reason}}" },
                    { label: "Trade name", value: "{{trade_name}}" },
                    { label: "GSTIN", value: "{{gstin}}" },
                ],
            },
            cta: { label: "Update application", href: "{{storefront_url}}/b2b/dashboard" },
            footnote:
                "If you think this is a mistake or want to re-apply with more details, reply to this email.",
            preview: "Wholesale application not approved this round.",
        }),
        sample_data: {
            customer: { first_name: "Aarav", email: "aarav@example.com" },
            trade_name: "Coimbatore Textile Distributors",
            gstin: "33ABCCC1234A1Z5",
            reason: "GSTIN couldn't be verified against state portal.",
            storefront_url: "https://risitex.in",
            dashboard_url: "https://risitex.in/b2b/dashboard",
            support_url: "https://risitex.in/contact",
        },
    },
    {
        slug: "order.shipped",
        name: "Order · Shipped",
        description: "Carrier has picked up the order; tracking is live.",
        subject: "Order #{{order.display_id}} dispatched",
        html: renderShell({
            kicker: "Shipped",
            accent: "#059669",
            heading: "Your order is on the way",
            lead:
                "We've shipped order <strong>#{{order.display_id}}</strong> via {{carrier}}. " +
                "Tracking AWB: <strong>{{tracking_number}}</strong>.",
            details: {
                rows: [
                    { label: "Order", value: "#{{order.display_id}}" },
                    { label: "Carrier", value: "{{carrier}}" },
                    { label: "AWB", value: "{{tracking_number}}" },
                    { label: "Expected delivery", value: "{{expected_delivery}}" },
                ],
            },
            cta: { label: "Track shipment", href: "{{tracking_url}}" },
            preview: "Order #{{order.display_id}} dispatched via {{carrier}}.",
        }),
        sample_data: {
            customer: { first_name: "Aarav" },
            order: { display_id: "10234" },
            carrier: "Bluedart",
            tracking_number: "N12345",
            tracking_url: "https://www.bluedart.com/tracking?awb=N12345",
            expected_delivery: "18 Jun 2026",
            dashboard_url: "https://risitex.in/b2b/dashboard",
            support_url: "https://risitex.in/contact",
        },
    },
    {
        slug: "order.delivered",
        name: "Order · Delivered",
        description: "Order has been marked delivered by the carrier.",
        subject: "Order #{{order.display_id}} delivered",
        html: renderShell({
            kicker: "Delivered",
            accent: "#059669",
            heading: "Delivered — hope you love it",
            lead:
                "Your RISITEX order #{{order.display_id}} was delivered. Hope you love it. " +
                "If anything's not right, we offer 14-day exchange on most items.",
            cta: { label: "Request a return / exchange", href: "{{storefront_url}}/b2b/orders/{{order.display_id}}" },
            preview: "Your RISITEX order #{{order.display_id}} was delivered.",
        }),
        sample_data: {
            customer: { first_name: "Aarav" },
            order: { display_id: "10234" },
            storefront_url: "https://risitex.in",
            dashboard_url: "https://risitex.in/b2b/dashboard",
            support_url: "https://risitex.in/contact",
        },
    },
]

// ────────────────────────────────────────────────────────────────────
// Admin templates
// ────────────────────────────────────────────────────────────────────

const admin: SeedTemplate[] = [
    {
        slug: "admin.new_order",
        name: "Admin · New order",
        description: "Ops heads-up on a new order.",
        subject: "New order #{{order.display_id}} · ₹{{total_inr}}",
        html: renderShell({
            kicker: "Ops · Orders",
            heading: "New order #{{order.display_id}}",
            lead:
                "<strong>{{customer.email}}</strong> placed a new order on RISITEX.",
            details: {
                rows: [
                    { label: "Order", value: "#{{order.display_id}}" },
                    { label: "Customer", value: "{{customer.email}}" },
                    { label: "Total", value: "₹{{total_inr}}" },
                    { label: "Payment status", value: "{{order.payment_status}}" },
                ],
            },
            cta: { label: "Open in admin", href: "{{admin_order_url}}" },
            preview: "New order ₹{{total_inr}}.",
        }),
        sample_data: {
            customer: { email: "aarav@example.com" },
            order: { display_id: "10234", payment_status: "Pending" },
            total_inr: "12,500",
            admin_order_url: "https://admin.risitex.in/app/orders/ord_01…",
            dashboard_url: "https://admin.risitex.in/app",
            support_url: "https://risitex.in/contact",
        },
    },
    {
        slug: "admin.new_company_application",
        name: "Admin · New wholesale application",
        description: "Customer submitted a B2B onboarding application via /companies/apply.",
        subject: "Company application · {{company_name}}",
        html: renderShell({
            kicker: "Ops · Wholesale",
            heading: "{{company_name}} · new application",
            lead:
                "<strong>{{customer.email}}</strong> submitted a B2B onboarding application.",
            details: {
                rows: [
                    { label: "Customer", value: "{{customer.email}}" },
                    { label: "Company name", value: "{{company_name}}" },
                    { label: "GSTIN", value: "{{gstin}}" },
                    { label: "Trade name", value: "{{trade_name}}" },
                ],
            },
            cta: { label: "Review in admin", href: "{{admin_review_url}}" },
            preview: "Wholesale application {{company_name}}.",
        }),
        sample_data: {
            customer: { email: "aarav@example.com" },
            company_name: "Coimbatore Textile Distributors",
            trade_name: "Coimbatore Textile Distributors",
            gstin: "33ABCCC1234A1Z5",
            admin_review_url: "https://admin.risitex.in/app/companies",
            dashboard_url: "https://admin.risitex.in/app",
            support_url: "https://risitex.in/contact",
        },
    },
    {
        slug: "admin.new_contact_submission",
        name: "Admin · Contact form",
        description: "New inbound from the public contact form.",
        subject: "Contact · {{subject}}",
        html: renderShell({
            kicker: "Ops · Contact",
            heading: "{{subject}}",
            lead: "<strong>{{name}}</strong> (&lt;{{email}}&gt;) sent a message to RISITEX.",
            details: {
                rows: [
                    { label: "Name", value: "{{name}}" },
                    { label: "Email", value: "{{email}}" },
                    { label: "Phone", value: "{{phone}}" },
                    { label: "Subject", value: "{{subject}}" },
                ],
            },
            footnote: "<em>Message:</em><br>{{message}}",
            preview: "{{subject}} — {{name}}",
        }),
        sample_data: {
            name: "Aarav Sharma",
            email: "aarav@example.com",
            phone: "+91 90000 00000",
            subject: "Account access issue",
            message:
                "Hi team, I'm unable to log in on my phone after updating the app. Could you help?",
            dashboard_url: "https://admin.risitex.in/app",
            support_url: "https://risitex.in/contact",
        },
    },
]

export const DEFAULT_TEMPLATES: SeedTemplate[] = [...customer, ...admin]

