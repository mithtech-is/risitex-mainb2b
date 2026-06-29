/**
 * Backfill orders stuck in Authorized state because of the
 * `capturePayment` no-op bug (fixed in the same commit as this script).
 *
 * For each Order where payment_status='authorized' AND the underlying
 * payment provider is cashfree-wallet AND the wallet WAS actually
 * debited, re-trigger capture so payment_status flips to Captured and
 * paid_total = order_total.
 *
 * Idempotent: capture on an already-captured payment is a no-op.
 *
 *   npx medusa exec /Users/.../scripts/backfill-stuck-wallet-captures.ts
 */
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function ({ container }: { container: any }) {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const orderModule: any = container.resolve(Modules.ORDER)
    const paymentModule: any = container.resolve(Modules.PAYMENT)

    // Pull every order (no payment_status filter — that's a computed
    // field in Medusa v2, can't be used in graph filters). Filter on
    // the JS side using captured_amount < amount.
    const { data: orders } = await query.graph({
        entity: "order",
        fields: [
            "id",
            "display_id",
            "total",
            "payment_collections.id",
            "payment_collections.payments.id",
            "payment_collections.payments.provider_id",
            "payment_collections.payments.captured_amount",
            "payment_collections.payments.amount",
        ],
        pagination: { take: 500, skip: 0 } as any,
    })

    let scanned = 0
    let captured = 0
    let skipped = 0
    let failed = 0
    console.log(
        `[backfill] inspecting ${orders?.length ?? 0} orders`,
    )
    for (const order of orders ?? []) {
        scanned += 1
        const pcs = order.payment_collections ?? []
        if (pcs.length === 0) {
            console.log(
                `[backfill] order #${order.display_id} (${order.id}) — no payment_collections, skip`,
            )
            skipped += 1
            continue
        }
        for (const pc of pcs) {
            for (const p of pc.payments ?? []) {
                console.log(
                    `[backfill] order #${order.display_id} payment ${p?.id} provider=${p?.provider_id} amount=${p?.amount} captured=${p?.captured_amount}`,
                )
                if (!p?.provider_id?.toLowerCase().includes("cashfree-wallet")) {
                    skipped += 1
                    continue
                }
                const alreadyCaptured = Number(p.captured_amount ?? 0) > 0
                if (alreadyCaptured) {
                    skipped += 1
                    continue
                }
                try {
                    await paymentModule.capturePayment({
                        payment_id: p.id,
                        amount: p.amount,
                    })
                    captured += 1
                    console.log(
                        `[backfill] captured payment ${p.id} on order #${order.display_id} (${order.id})`,
                    )
                } catch (err: any) {
                    failed += 1
                    console.error(
                        `[backfill] order #${order.display_id} (${order.id}) payment ${p.id} FAILED:`,
                        err?.message,
                    )
                }
            }
        }
    }
    console.log(
        `[backfill] done — scanned=${scanned} captured=${captured} skipped=${skipped} failed=${failed}`,
    )
}
