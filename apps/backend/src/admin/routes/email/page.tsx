import React, { useEffect } from "react"
import { Container, Heading, Text } from "@medusajs/ui"

/**
 * Legacy /app/email route — replaced by the broader /app/communication
 * page that bundles SMTP, MSG91 SMS, Polygin WhatsApp, and the phone
 * OTP log under one roof.
 *
 * This component still resolves so existing bookmarks don't 404; it
 * just bounces the user to the new page with the Email tab pre-selected.
 *
 * `defineRouteConfig` is intentionally NOT exported — that removes the
 * old "Email" entry from the sidebar so the new "Communication" entry
 * is the only one visible.
 */
const EmailPageRedirect = () => {
    useEffect(() => {
        if (typeof window === "undefined") return
        const target = "/app/communication?tab=email"
        // Use replace so the back button doesn't get stuck bouncing
        // between /app/email and /app/communication.
        window.location.replace(target)
    }, [])

    return (
        <Container className="flex flex-col gap-4 p-6">
            <Heading level="h1">Redirecting…</Heading>
            <Text className="text-ui-fg-muted">
                Email settings now live under{" "}
                <a
                    href="/app/communication?tab=email"
                    className="text-ui-fg-interactive underline"
                >
                    Communication
                </a>
                .
            </Text>
        </Container>
    )
}

export default EmailPageRedirect
