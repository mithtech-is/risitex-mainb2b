import { Module } from "@medusajs/framework/utils"
import CommunicationModuleService from "./service"
import seedDefaults from "./loaders/seed-defaults"

/**
 * Risitex Communication module.
 *
 * Single-source-of-truth for all outbound customer communication:
 *   - Email (SMTP) — outgoing transactional email via nodemailer.
 *   - SMS (MSG91)  — outgoing SMS via the MSG91 Flow API.
 *   - WhatsApp (Polygin) — outgoing WhatsApp messages via Polygin's REST API.
 *   - Phone OTP    — generated server-side, delivered through the WhatsApp →
 *                    SMS fallback router. Used for storefront phone-OTP login
 *                    and phone-number verification.
 *
 * The module was previously called `polemarch_email` and only handled
 * SMTP. The folder was renamed to `polemarch_communication` and the
 * canonical module key + service class were broadened in scope. The
 * `POLEMARCH_EMAIL_MODULE` constant + `EmailModuleService` re-export
 * are kept as aliases so older subscribers and the existing notification
 * provider continue to compile against the same DI symbols.
 */
export const POLEMARCH_COMMUNICATION_MODULE = "polemarch_communication"

/** Back-compat alias — points at the broader module. New code should
 *  prefer POLEMARCH_COMMUNICATION_MODULE. */
export const POLEMARCH_EMAIL_MODULE = POLEMARCH_COMMUNICATION_MODULE

export default Module(POLEMARCH_COMMUNICATION_MODULE, {
    service: CommunicationModuleService,
    loaders: [seedDefaults],
})

export { CommunicationModuleService }

/** Back-compat alias — kept so files that imported `EmailModuleService`
 *  from this module continue to type-check. The class itself is the
 *  same; only the conceptual name has been broadened. */
export { CommunicationModuleService as EmailModuleService }
