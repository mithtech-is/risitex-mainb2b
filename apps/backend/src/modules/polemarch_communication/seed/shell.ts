/**
 * RISITEX email shell — shared HTML scaffold used by every seeded
 * template. Keeps the brand identity (header stripe, palette, typography,
 * footer) in one place so a visual tweak is a single-file diff.
 *
 * The produced HTML is intentionally table-based + inline-styled to
 * survive Gmail/Outlook's aggressive CSS stripping. Nothing here
 * depends on remote stylesheets or custom fonts — everything falls
 * back through a system-UI stack.
 *
 * Handlebars is rendered by the provider at send time; this file only
 * assembles HTML. Drop `{{var}}` placeholders into the content fields
 * and the provider will substitute them against the notification data.
 */

export type ShellDetails = {
    /** Caption shown above the grid of key/value rows. */
    title?: string
    rows: Array<{ label: string; value: string }>
}

export type ShellButton = {
    label: string
    href: string
    /**
     * "primary"   — brand-green pill (default)
     * "secondary" — outlined, uses the brand-green border + text
     */
    style?: "primary" | "secondary"
}

export type ShellOpts = {
    /**
     * Small uppercase tag shown under "RISITEX" in the header stripe —
     * use it to categorize the email at a glance, e.g. "Order update",
     * "Security", "KYC".
     */
    kicker: string

    /** H1 inside the card. Supports Handlebars. */
    heading: string

    /**
     * Primary message — one or two sentences of human copy. Rendered
     * inside a <p> with generous line-height. Supports Handlebars.
     */
    lead: string

    /**
     * Optional details table rendered below the lead — great for order
     * line items, account numbers, etc.
     */
    details?: ShellDetails

    /** Optional CTA button rendered below the details. */
    cta?: ShellButton

    /**
     * Optional secondary paragraph rendered below the CTA in muted tone —
     * use for disclaimers ("This link expires in 15 minutes"), cross-sell
     * links, or anything that shouldn't steal attention from the lead.
     */
    footnote?: string

    /**
     * Optional accent color override for the header stripe (hex string).
     * Defaults to RISITEX primary. Handy for severity-colored templates
     * like rejection notices (`#7f1d1d`) or security alerts (`#b45309`).
     */
    accent?: string

    /**
     * Preview text — shown in most inbox previews next to the subject.
     * Kept at the very top as a zero-size element so it never renders
     * visibly in the email body.
     */
    preview?: string
}

const BRAND_PRIMARY = "#0F0F0D"
const BRAND_ACCENT = "#A0978A"
const BRAND_MUTED = "#64748b"
const BRAND_TEXT = "#0f172a"
const BRAND_BORDER = "#e2e8f0"
const BRAND_BG_PAGE = "#f5f6f7"
const BRAND_BG_FOOT = "#f8fafc"

function renderDetails(d: ShellDetails): string {
    const rows = d.rows
        .map(
            (r) => `
            <tr>
                <td style="padding:10px 0;border-bottom:1px solid ${BRAND_BORDER};color:${BRAND_MUTED};font-size:13px;font-weight:500;width:40%;">${r.label}</td>
                <td style="padding:10px 0;border-bottom:1px solid ${BRAND_BORDER};color:${BRAND_TEXT};font-size:14px;font-weight:600;text-align:right;">${r.value}</td>
            </tr>`,
        )
        .join("")
    const title = d.title
        ? `<div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND_MUTED};margin-bottom:6px;">${d.title}</div>`
        : ""
    return `
    <div style="margin-top:24px;">
        ${title}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${rows}
        </table>
    </div>`
}

function renderCta(b: ShellButton): string {
    const primary = (b.style ?? "primary") === "primary"
    const bg = primary ? BRAND_PRIMARY : "#ffffff"
    const fg = primary ? "#ffffff" : BRAND_PRIMARY
    const border = primary ? BRAND_PRIMARY : BRAND_PRIMARY
    return `
    <div style="margin-top:28px;">
        <a href="${b.href}"
           style="display:inline-block;background:${bg};color:${fg};text-decoration:none;font-weight:700;font-size:14px;line-height:1;padding:14px 22px;border-radius:999px;border:1.5px solid ${border};letter-spacing:-0.01em;">
            ${b.label}
        </a>
    </div>`
}

/**
 * Build a complete HTML document from the given shell options. Returns
 * a string — write it directly into `EmailTemplate.html`.
 */
export function renderShell(opts: ShellOpts): string {
    const accent = opts.accent ?? BRAND_PRIMARY
    const preview = opts.preview
        ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${opts.preview}</div>`
        : ""
    const details = opts.details ? renderDetails(opts.details) : ""
    const cta = opts.cta ? renderCta(opts.cta) : ""
    const footnote = opts.footnote
        ? `<p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:${BRAND_MUTED};">${opts.footnote}</p>`
        : ""

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${opts.kicker}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND_BG_PAGE};font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND_TEXT};-webkit-font-smoothing:antialiased;">
${preview}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_BG_PAGE};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid ${BRAND_BORDER};border-radius:20px;overflow:hidden;box-shadow:0 2px 8px rgba(15,23,42,0.04);">
      <!-- Header stripe -->
      <tr><td style="background:${accent};padding:22px 32px;">
        <div style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.03em;line-height:1;">RISITEX</div>
        <div style="margin-top:6px;color:rgba(255,255,255,0.75);font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">${opts.kicker}</div>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:36px 32px 28px;">
        <h1 style="margin:0 0 14px;font-size:22px;font-weight:800;letter-spacing:-0.02em;color:${BRAND_TEXT};line-height:1.25;">${opts.heading}</h1>
        <p style="margin:0;font-size:15px;line-height:1.65;color:#334155;">${opts.lead}</p>
        ${details}
        ${cta}
        ${footnote}
      </td></tr>
      <!-- Footer -->
      <tr><td style="border-top:1px solid ${BRAND_BORDER};padding:20px 32px;background:${BRAND_BG_FOOT};">
        <p style="margin:0;font-size:11px;line-height:1.6;color:${BRAND_MUTED};">
          <strong style="color:${BRAND_ACCENT};">RISITEX</strong> · B2B textile commerce.<br>
          You received this email because you're registered with RISITEX. If this wasn't you, please contact support.<br>
          <a href="{{support_url}}" style="color:${BRAND_MUTED};text-decoration:underline;">Contact support</a>
          &nbsp;·&nbsp;
          <a href="{{dashboard_url}}" style="color:${BRAND_MUTED};text-decoration:underline;">Open dashboard</a>
        </p>
      </td></tr>
    </table>
    <!-- Tagline below card -->
    <div style="margin-top:14px;font-size:11px;color:${BRAND_MUTED};letter-spacing:0.04em;">
      RISITEX · Erode, Tamil Nadu
    </div>
  </td></tr>
</table>
</body>
</html>`
}
