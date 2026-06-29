import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect, useRef } from "react"

/**
 * RISITEX login-page branding.
 *
 * Medusa's admin SDK supports `login.before` and `login.after` widget
 * zones (see @medusajs/admin-shared INJECTION_ZONES). We can't replace
 * the whole `/app/login` route — the dashboard package owns it — but
 * we can prepend a branded mark and hide the default Medusa logo +
 * welcome heading so the page reads as a RISITEX surface.
 *
 * Wordmark is rendered as text (no image asset dependency) so brand
 * tweaks don't require an asset round-trip.
 *
 * Render path:
 *   1. The component injects a RISITEX wordmark at the `login.before`
 *      slot — a child of the form group inside Medusa's login card.
 *   2. A `useEffect` hides the Medusa hex logo (1st child of the
 *      login card) and the "Welcome to Medusa" / subtitle block
 *      (2nd child). Selectors keyed on the card's `max-w-[280px]`
 *      class — unique to this page in the dashboard SPA. We re-hide
 *      after a frame to handle React re-renders that re-mount the
 *      heading.
 *
 * Why JS instead of a CSS-only fix: the card classes are scoped to
 * /app/login but `.h1-core` is reused across the dashboard. Touching
 * .h1-core globally would clobber other admin pages. JS lets us
 * pin the hide rules to the login surface only.
 */
const RisitexLoginBranding = () => {
  const triedRef = useRef(false)

  useEffect(() => {
    if (triedRef.current) return
    triedRef.current = true

    // Find the login card — Medusa's dashboard tags it with a
    // `max-w-[280px]` Tailwind utility that's unique in the SPA.
    const findCard = () =>
      document.querySelector<HTMLElement>('[class*="max-w-[280px]"]')

    const hideMedusaBranding = () => {
      const card = findCard()
      if (!card) return false
      const kids = Array.from(card.children) as HTMLElement[]
      if (kids[0]) kids[0].style.display = "none"
      if (kids[1]) kids[1].style.display = "none"
      return true
    }

    if (!hideMedusaBranding()) {
      const retries = [16, 80, 240, 800]
      retries.forEach((ms) => window.setTimeout(hideMedusaBranding, ms))
    }
  }, [])

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        margin: "0 auto 20px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: "26px",
          fontWeight: 800,
          letterSpacing: "0.32em",
          color: "var(--fg-base, #f9f9fa)",
          lineHeight: 1,
        }}
      >
        RISITEX
      </div>
      <div
        style={{
          marginTop: "14px",
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "0.14em",
          color: "var(--fg-base, #f9f9fa)",
          textTransform: "uppercase",
        }}
      >
        Admin console
      </div>
      <div
        style={{
          marginTop: "4px",
          fontSize: "13px",
          color: "var(--fg-subtle, #9ca3af)",
        }}
      >
        Sign in to manage customers, orders, wallets and B2B accounts.
      </div>
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "login.before",
})

export default RisitexLoginBranding
