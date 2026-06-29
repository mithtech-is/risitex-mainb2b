/**
 * Risitex branded email shell.
 *
 * Seed templates use {{> layout}} semantics by simply calling
 * `renderBrandedEmail(bodyHtml, { preheader })`. We don't force-wrap
 * admin-edited templates — the raw HTML the admin types is sent as-is
 * (the editor is HTML-code + preview by design). The seed script and
 * any programmatic compose paths should run their body through this
 * helper for a consistent look:
 *
 *   - deep green header band (#224433) with centered logo
 *   - 600px max-width card on a light grey canvas (#f8fafc)
 *   - system-ui typography, 16px body
 *   - muted footer with compliance footer + unsubscribe placeholder
 *
 * All inline — there's no room for external CSS in email clients.
 */

const LOGO_URL =
    process.env.EMAIL_LOGO_URL ||
    `${process.env.MEDUSA_BACKEND_URL || ""}/static/polemarch-logo.png`

const BRAND = {
    deep_green: "#224433",
    accent: "#b8a165", // gold
    text: "#1f2937",
    muted: "#6b7280",
    canvas: "#f8fafc",
    card: "#ffffff",
    border: "#e5e7eb",
}

export type EmailShellOptions = {
    /** Short text shown as the inbox preview pane (invisible in body). */
    preheader?: string
    /** Company name at the top of the green band (fallback when no logo). */
    brand_name?: string
    /** CTA colour override (defaults to deep green). */
    cta_color?: string
    /** Optional extra footer lines (address, support email). */
    footer_lines?: string[]
}

export function renderBrandedEmail(
    bodyHtml: string,
    opts: EmailShellOptions = {}
): string {
    const preheader = opts.preheader ?? ""
    const brand_name = opts.brand_name ?? "Risitex"
    const footer_lines = opts.footer_lines ?? [
        "Risitex — premium men's innerwear & loungewear",
        "This is a transactional email — you're receiving it because you have an account with us.",
    ]

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${brand_name}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.canvas};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.text};">
<!-- preheader: invisible inbox preview text -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${escapeHtml(preheader)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.canvas};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden;">

        <!-- Header band -->
        <tr>
          <td align="center" style="background:${BRAND.deep_green};padding:24px 16px;">
            <a href="${process.env.STOREFRONT_URL || "https://risitex.com"}" style="display:inline-block;text-decoration:none;">
              <img src="${LOGO_URL}" alt="${brand_name}" height="40" style="height:40px;display:block;border:0;outline:none;filter:brightness(0) invert(1);" />
            </a>
          </td>
        </tr>
        <!-- Accent rule -->
        <tr><td style="background:${BRAND.accent};height:3px;line-height:3px;font-size:0;">&nbsp;</td></tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 32px 24px 32px;font-size:16px;line-height:1.6;color:${BRAND.text};">
            ${bodyHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px 28px 32px;border-top:1px solid ${BRAND.border};color:${BRAND.muted};font-size:12px;line-height:1.5;">
            ${footer_lines.map((l) => `<div>${l}</div>`).join("")}
          </td>
        </tr>
      </table>
      <div style="max-width:600px;width:100%;padding:16px 4px;color:${BRAND.muted};font-size:11px;text-align:center;">
        &copy; ${new Date().getFullYear()} Risitex. All rights reserved.
      </div>
    </td>
  </tr>
</table>
</body>
</html>`
}

/** Reusable CTA button HTML — drop into seed templates. */
export function renderCtaButton(text: string, href: string, color = BRAND.deep_green): string {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
  <tr>
    <td align="center" style="background:${color};border-radius:8px;">
      <a href="${href}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none;">${escapeHtml(text)}</a>
    </td>
  </tr>
</table>`
}

function escapeHtml(s: string): string {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
}
