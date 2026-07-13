// apps/backend/src/admin/routes/payment-settings/page.tsx
import React, { useEffect, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CurrencyDollar } from "@medusajs/icons"
import { Button, Container, Heading, Input, Label, Switch, Text, toast } from "@medusajs/ui"

type Settings = {
  manual_upi_enabled: boolean
  razorpay_enabled: boolean
  upi_id: string
  upi_qr_image_url: string | null
  gateway_charge_percent: number
  razorpay_mode: string
  auto_capture: boolean
}

const PaymentSettingsPage = () => {
  const [s, setS] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch("/admin/payment-settings", { credentials: "include" })
      .then((r) => r.json())
      .then((b) => setS(b.payment_settings))
      .catch(() => toast.error("Couldn't load payment settings"))
  }, [])

  const save = async () => {
    if (!s) return
    setBusy(true)
    try {
      const res = await fetch("/admin/payment-settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manual_upi_enabled: s.manual_upi_enabled,
          razorpay_enabled: s.razorpay_enabled,
          upi_id: s.upi_id,
          upi_qr_image_url: s.upi_qr_image_url || null,
          gateway_charge_percent: Number(s.gateway_charge_percent) || 0,
          razorpay_mode: s.razorpay_mode === "production" ? "production" : "sandbox",
          auto_capture: s.auto_capture,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast.success("Payment settings saved")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  if (!s) return <Container className="p-6"><Text>Loading…</Text></Container>

  return (
    <Container className="p-6">
      <Heading level="h1" className="mb-6">Payment Settings</Heading>
      <div className="flex flex-col gap-y-6 max-w-xl">
        <div className="flex items-center justify-between">
          <Label>Enable Manual UPI</Label>
          <Switch checked={s.manual_upi_enabled} onCheckedChange={(v) => setS({ ...s, manual_upi_enabled: v })} />
        </div>
        <div className="flex items-center justify-between">
          <Label>Enable Razorpay</Label>
          <Switch checked={s.razorpay_enabled} onCheckedChange={(v) => setS({ ...s, razorpay_enabled: v })} />
        </div>
        <div className="flex flex-col gap-y-1">
          <Label>UPI ID</Label>
          <Input value={s.upi_id} onChange={(e) => setS({ ...s, upi_id: e.currentTarget.value })} />
        </div>
        <div className="flex flex-col gap-y-1">
          <Label>UPI QR image URL (optional)</Label>
          <Input placeholder="/uploads/… or https://…" value={s.upi_qr_image_url ?? ""} onChange={(e) => setS({ ...s, upi_qr_image_url: e.currentTarget.value })} />
        </div>
        <div className="flex flex-col gap-y-1">
          <Label>Gateway Charge % (Razorpay)</Label>
          <Input type="number" step="0.1" min="0" max="100" value={String(s.gateway_charge_percent)} onChange={(e) => setS({ ...s, gateway_charge_percent: Number(e.currentTarget.value) })} />
        </div>
        <div className="flex flex-col gap-y-1">
          <Label>Razorpay mode</Label>
          <select className="border rounded px-2 py-1 bg-ui-bg-field" value={s.razorpay_mode} onChange={(e) => setS({ ...s, razorpay_mode: e.currentTarget.value })}>
            <option value="sandbox">Sandbox</option>
            <option value="production">Production</option>
          </select>
          <Text size="small" className="text-ui-fg-subtle">Keys/secrets are read from env, never stored here.</Text>
        </div>
        <div className="flex items-center justify-between">
          <Label>Auto-capture (Phase 2)</Label>
          <Switch checked={s.auto_capture} onCheckedChange={(v) => setS({ ...s, auto_capture: v })} />
        </div>
        <Button variant="primary" disabled={busy} onClick={() => void save()}>Save</Button>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Payment Settings",
  icon: CurrencyDollar,
})

export default PaymentSettingsPage
