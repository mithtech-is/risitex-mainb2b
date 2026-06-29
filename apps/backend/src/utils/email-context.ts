/**
 * Builds the Handlebars context object for an outgoing email.
 *
 * Subscribers call `buildEmailContext(container, { event, payload })`
 * to turn a raw event payload into the `{ customer, order, meta }`
 * shape the seed templates reference.
 *
 * Customer resolution tries the event payload first, then falls back
 * to looking the customer up via the Customer module using `customer_id`.
 */
export type EmailContext = {
    customer: {
        id: string | null
        first_name: string | null
        last_name: string | null
        email: string | null
        full_name: string
    }
    event: {
        name: string
    }
    data: Record<string, any>
    brand: {
        name: string
        storefront_url: string
        support_email: string
    }
}

const DEFAULT_BRAND = {
    name: "Risitex",
    storefront_url: process.env.STOREFRONT_URL || "https://risitex.com",
    support_email: process.env.SUPPORT_EMAIL || "support@risitex.com",
}

export async function resolveCustomerEmail(
    container: any,
    customer_id: string | null | undefined
): Promise<{
    id: string | null
    email: string | null
    first_name: string | null
    last_name: string | null
}> {
    if (!customer_id) {
        return { id: null, email: null, first_name: null, last_name: null }
    }
    try {
        const customerModule = container.resolve("customer") as any
        const customers = await customerModule.listCustomers(
            { id: [customer_id] },
            { select: ["id", "email", "first_name", "last_name"], take: 1 }
        )
        const c = customers?.[0]
        if (!c) return { id: customer_id, email: null, first_name: null, last_name: null }
        return {
            id: c.id,
            email: c.email ?? null,
            first_name: c.first_name ?? null,
            last_name: c.last_name ?? null,
        }
    } catch (err) {
        console.error("[email-context] customer lookup failed:", err)
        return { id: customer_id, email: null, first_name: null, last_name: null }
    }
}

export async function buildEmailContext(
    container: any,
    opts: { event_name: string; payload: any }
): Promise<EmailContext> {
    const { event_name, payload } = opts
    const customer_id =
        payload?.customer_id ?? payload?.customer?.id ?? payload?.customerId ?? null

    const customer = await resolveCustomerEmail(container, customer_id)
    const full_name = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim()

    return {
        customer: {
            ...customer,
            full_name: full_name || "Investor",
        },
        event: { name: event_name },
        data: payload ?? {},
        brand: DEFAULT_BRAND,
    }
}
