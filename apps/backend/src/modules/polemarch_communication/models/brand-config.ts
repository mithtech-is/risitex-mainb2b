import { model } from "@medusajs/framework/utils"

/**
 * Brand configuration — singleton (id = "default"). Drives the
 * placeholder substitution used by every Email / SMS / WhatsApp template
 * across the Communication module.
 *
 * Available placeholders (resolved at push/send time):
 *   {{brand}}          → brand_name      (display name, e.g. "RISITEX")
 *   {{company_name}}   → company_name    (legal entity for footers / compliance lines)
 *   {{storefront_url}} → storefront_url  (e.g. "https://risitex.in")
 *   {{support_email}}  → support_email   (e.g. "support@risitex.in")
 *   {{support_phone}}  → support_phone   (E.164, e.g. "+918041234567")
 *   {{address}}        → address         (registered office / footer line)
 *   {{tagline}}        → tagline         (e.g. "B2B Textile Commerce")
 *   {{whatsapp_bot}}   → whatsapp_bot_label (text on the QUICK_REPLY
 *                        bot button shown on every UTILITY WhatsApp
 *                        template — e.g. "Initiate Bot")
 *
 * Note: WhatsApp templates that have already been approved on Meta keep
 * the OLD brand wording until they're recreated on polyg.in — Meta
 * reviews the literal text. The Communication → Brand tab surfaces a
 * one-click "Reset brand-using templates" action for that flow.
 */
export const BrandConfig = model.define("polemarch_brand_config", {
    id: model.id().primaryKey(),
    /** Display brand name. Default "RISITEX". */
    brand_name: model.text().default("RISITEX"),
    /** Legal company name for footers + compliance lines. */
    company_name: model.text().nullable(),
    /** Storefront URL — used by templates with action buttons. */
    storefront_url: model.text().default("https://risitex.in"),
    /** Support email — used in template footers. */
    support_email: model.text().nullable(),
    /** Support phone (E.164). */
    support_phone: model.text().nullable(),
    /** Postal / registered-office address — multiline ok. */
    address: model.text().nullable(),
    /** Short tagline displayed in WhatsApp template footers. */
    tagline: model.text().nullable(),
    /** Text rendered on the QUICK_REPLY bot button that participating
     *  WhatsApp templates carry. The button delivers the customer to
     *  the polyg.in chatbot for follow-up questions. Meta limits
     *  QUICK_REPLY text to 25 chars; default "Initiate Bot". */
    whatsapp_bot_label: model.text().default("Initiate Bot"),
    /** Which WhatsApp template categories receive the bot button +
     *  "For more info, click '{{whatsapp_bot}}'." footer at refresh
     *  time. JSON-encoded array of category strings. Default
     *  ["UTILITY","MARKETING"] is set at the SQL level (see migration);
     *  we keep the column nullable in the model so a NULL legacy row
     *  doesn't trip Mikro-ORM. */
    whatsapp_bot_categories: model.json().nullable(),
})
