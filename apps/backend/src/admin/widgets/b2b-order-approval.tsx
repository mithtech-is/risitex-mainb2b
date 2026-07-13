import React, { useEffect, useState } from "react"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Label, Text, toast } from "@medusajs/ui"

/**
 * B2B Order Approval widget — lets the admin approve a B2B order and
 * record its transporter + tracking directly from the native Order
 * details page. Replaces the separate PO-approvals page.
 *
 * State is read from the order's own metadata (mirrored there by the
 * b2b-approve / b2b-dispatch routes) so no second lookup is needed.
 */

type OrderMeta = {
  b2b_approved_at?: string | null
  b2b_approved_by_name?: string | null
  b2b_dispatched_at?: string | null
  b2b_transporter?: string | null
  b2b_tracking?: string | null
}

const B2BOrderApprovalWidget = ({ data: order }: { data: any }) => {
  const meta = (order?.metadata ?? {}) as OrderMeta

  const [approvedAt, setApprovedAt] = useState<string | null>(
    meta.b2b_approved_at ?? null,
  )
  const [dispatchedAt, setDispatchedAt] = useState<string | null>(
    meta.b2b_dispatched_at ?? null,
  )
  const [transporterSaved, setTransporterSaved] = useState<string | null>(
    meta.b2b_transporter ?? null,
  )
  const [trackingSaved, setTrackingSaved] = useState<string | null>(
    meta.b2b_tracking ?? null,
  )

  const [transporter, setTransporter] = useState("")
  const [tracking, setTracking] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setApprovedAt(meta.b2b_approved_at ?? null)
    setDispatchedAt(meta.b2b_dispatched_at ?? null)
    setTransporterSaved(meta.b2b_transporter ?? null)
    setTrackingSaved(meta.b2b_tracking ?? null)
  }, [order?.id, order?.metadata])

  const approve = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/admin/orders/${order.id}/b2b-approve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      })
      const body = await res.json().catch(() => ({}) as { message?: string })
      if (!res.ok) {
        throw new Error(body.message ?? `HTTP ${res.status}`)
      }
      toast.success("Order approved")
      window.location.reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approval failed")
    } finally {
      setBusy(false)
    }
  }

  const dispatch = async () => {
    if (!transporter.trim()) {
      toast.error("Enter a transporter name before marking dispatched.")
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/admin/orders/${order.id}/b2b-dispatch`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transporter: transporter.trim(),
          tracking_number: tracking.trim() || undefined,
        }),
      })
      const body = await res.json().catch(() => ({}) as { message?: string })
      if (!res.ok) {
        throw new Error(body.message ?? `HTTP ${res.status}`)
      }
      toast.success("Order marked dispatched")
      window.location.reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mark dispatched failed")
    } finally {
      setBusy(false)
    }
  }

  const isDispatched = !!dispatchedAt
  const isApproved = !!approvedAt

  return (
    <Container className="p-6">
      <div className="flex items-center justify-between mb-4">
        <Heading level="h2">B2B Order Approval</Heading>
        {isDispatched ? (
          <Badge color="green">Dispatched</Badge>
        ) : isApproved ? (
          <Badge color="green">Approved</Badge>
        ) : (
          <Badge color="orange">Awaiting approval</Badge>
        )}
      </div>

      {!isApproved && (
        <div className="flex flex-col gap-y-3">
          <Text size="small" className="text-ui-fg-subtle">
            Approve this B2B order to unblock dispatch recording. No buyer
            payment proof is required.
          </Text>
          <Button
            variant="primary"
            size="small"
            disabled={busy}
            onClick={() => void approve()}
          >
            Approve order
          </Button>
        </div>
      )}

      {isApproved && !isDispatched && (
        <div className="flex flex-col gap-y-3">
          <Text size="small" className="text-ui-fg-subtle">
            Approved{" "}
            {approvedAt ? new Date(approvedAt).toLocaleString() : ""}
            {meta.b2b_approved_by_name
              ? ` by ${meta.b2b_approved_by_name}`
              : ""}
            .
          </Text>
          <div className="flex flex-col gap-y-1">
            <Label size="xsmall">Transporter</Label>
            <Input
              placeholder="e.g. Blue Dart"
              value={transporter}
              onChange={(e) => setTransporter(e.currentTarget.value)}
            />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="xsmall">Tracking number</Label>
            <Input
              placeholder="Optional"
              value={tracking}
              onChange={(e) => setTracking(e.currentTarget.value)}
            />
          </div>
          <Button
            variant="secondary"
            size="small"
            disabled={busy}
            onClick={() => void dispatch()}
          >
            Mark dispatched
          </Button>
        </div>
      )}

      {isDispatched && (
        <div className="flex flex-col gap-y-1">
          <Text size="small">
            <span className="font-medium">{transporterSaved ?? "—"}</span>
            {trackingSaved ? (
              <>
                {" · "}
                <span className="font-mono">{trackingSaved}</span>
              </>
            ) : null}
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            Dispatched{" "}
            {dispatchedAt ? new Date(dispatchedAt).toLocaleString() : "—"}
          </Text>
        </div>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default B2BOrderApprovalWidget
