import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CurrencyDollar } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Select,
  Switch,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import React, { useCallback, useEffect, useState } from "react"

/**
 * Discount codes (FR-6.01). Create code-based promotions constrained by minimum
 * order units, max usage, and expiry; optionally combinable with tier pricing
 * and/or tracked as a marketing campaign. Backs onto /admin/discount-codes,
 * which creates the Medusa promotion + the PIX discount_code record.
 */

const BASE = "/admin/discount-codes"

type DiscountCode = {
  id: string
  code: string
  discount_type: "percentage" | "fixed"
  value: number
  min_order_units: number
  max_usage: number | null
  expires_at: string | null
  combinable_with_tier: boolean
  active: boolean
}

const empty = {
  code: "",
  discount_type: "percentage" as "percentage" | "fixed",
  value: "10",
  min_order_units: "0",
  max_usage: "",
  expires_at: "",
  combinable_with_tier: false,
  combinable_tier_ids: "",
  track_as_campaign: false,
}

const DiscountCodesPage = () => {
  const [rows, setRows] = useState<DiscountCode[]>([])
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(BASE, { credentials: "include" })
    const body = await res.json()
    setRows(body.discount_codes ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const create = async () => {
    setSaving(true)
    try {
      const res = await fetch(BASE, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          discount_type: form.discount_type,
          value: Number(form.value),
          min_order_units: Number(form.min_order_units || 0),
          max_usage: form.max_usage ? Number(form.max_usage) : null,
          expires_at: form.expires_at
            ? new Date(form.expires_at).toISOString()
            : null,
          combinable_with_tier: form.combinable_with_tier,
          combinable_tier_ids: form.combinable_tier_ids
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          track_as_campaign: form.track_as_campaign,
        }),
      })
      if (!res.ok) {
        throw new Error((await res.json()).message ?? "Failed")
      }
      toast.success(`Created ${form.code}`)
      setForm(empty)
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    await fetch(`${BASE}/${id}`, { method: "DELETE", credentials: "include" })
    await load()
  }

  return (
    <Container>
      <Heading level="h1">Discount codes</Heading>
      <div className="mt-4 grid grid-cols-2 gap-3 max-w-2xl">
        <div>
          <Label size="small">Code</Label>
          <Input
            value={form.code}
            onChange={(e) =>
              setForm({ ...form, code: e.target.value.toUpperCase() })
            }
          />
        </div>
        <div>
          <Label size="small">Type</Label>
          <Select
            value={form.discount_type}
            onValueChange={(v) =>
              setForm({ ...form, discount_type: v as "percentage" | "fixed" })
            }
          >
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="percentage">% off</Select.Item>
              <Select.Item value="fixed">₹ off (paise)</Select.Item>
            </Select.Content>
          </Select>
        </div>
        <div>
          <Label size="small">Value</Label>
          <Input
            type="number"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
          />
        </div>
        <div>
          <Label size="small">Min order units</Label>
          <Input
            type="number"
            value={form.min_order_units}
            onChange={(e) =>
              setForm({ ...form, min_order_units: e.target.value })
            }
          />
        </div>
        <div>
          <Label size="small">Max usage (blank = unlimited)</Label>
          <Input
            type="number"
            value={form.max_usage}
            onChange={(e) => setForm({ ...form, max_usage: e.target.value })}
          />
        </div>
        <div>
          <Label size="small">Expires at</Label>
          <Input
            type="date"
            value={form.expires_at}
            onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={form.combinable_with_tier}
            onCheckedChange={(v) =>
              setForm({ ...form, combinable_with_tier: v })
            }
          />
          <Text>Combine with tier pricing (all tiers)</Text>
        </div>
        <div>
          <Label size="small">
            …or only these tier IDs (comma-sep; ignored if above is on)
          </Label>
          <Input
            value={form.combinable_tier_ids}
            onChange={(e) =>
              setForm({ ...form, combinable_tier_ids: e.target.value })
            }
            placeholder="ctier_abc, ctier_def"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={form.track_as_campaign}
            onCheckedChange={(v) => setForm({ ...form, track_as_campaign: v })}
          />
          <Text>Track as campaign</Text>
        </div>
      </div>
      <Button
        className="mt-3"
        onClick={create}
        isLoading={saving}
        disabled={!form.code}
      >
        Create code
      </Button>

      <Table className="mt-6">
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Code</Table.HeaderCell>
            <Table.HeaderCell>Discount</Table.HeaderCell>
            <Table.HeaderCell>Min units</Table.HeaderCell>
            <Table.HeaderCell>Combinable</Table.HeaderCell>
            <Table.HeaderCell />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((r) => (
            <Table.Row key={r.id}>
              <Table.Cell>{r.code}</Table.Cell>
              <Table.Cell>
                {r.discount_type === "percentage"
                  ? `${r.value}%`
                  : `₹${(r.value / 100).toFixed(2)}`}
              </Table.Cell>
              <Table.Cell>{r.min_order_units}</Table.Cell>
              <Table.Cell>{r.combinable_with_tier ? "yes" : "no"}</Table.Cell>
              <Table.Cell>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => remove(r.id)}
                >
                  Deactivate
                </Button>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Discount codes",
  icon: CurrencyDollar,
})

export default DiscountCodesPage
