"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  ShipmentTimeline,
  StatCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@risitex/ui/components";
import { Package, Search, ExternalLink } from "lucide-react";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { MEDUSA_BASE_URL } from "@/lib/medusa";
import { downloadOrderInvoice } from "@/lib/invoice";
import { listAllPurchaseOrders, type DraftPurchaseOrder } from "@/lib/purchase-orders";

/**
 * /b2b/shipments — reads /store/shipments, which joins each
 * fulfillment with its logistics.ShipmentTransporter row.
 *
 * Carrier-live tracking (FR-5.02):
 *   The backend courier-poll job queries each carrier's adapter for the latest
 *   transit status and caches it on the transporter row; when present it shows
 *   as the "Live:" line and the "Live-tracked" stat. The base status still
 *   derives from fulfillment.shipped_at / .delivered_at / .canceled_at, so
 *   carriers without a configured adapter (e.g. Porter before PORTER_TRACKING_URL
 *   is set) simply show dispatch state without the live line.
 */

type ShipmentRow = {
  fulfillment_id: string;
  order_id: string;
  order_display_id: number | string;
  destination: string | null;
  country_code: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  canceled_at: string | null;
  provider_id: string | null;
  awb: string | null;
  status: "label_generated" | "in_transit" | "delivered" | "canceled";
  transporter: {
    code: string;
    display_name: string | null;
    vehicle_number: string | null;
    dispatched_at: string | null;
    notes: string | null;
    // FR-5.02 live carrier tracking (cached by the backend courier-poll job)
    live_status?: string | null;
    live_status_event?: string | null;
    live_status_at?: string | null;
  } | null;
};

const LIVE_STATUS_LABELS: Record<string, string> = {
  pending: "Pending pickup",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  failed: "Delivery issue",
};

const STAGE_LABELS = {
  label_generated: "Label generated",
  in_transit: "In transit",
  delivered: "Delivered",
  canceled: "Cancelled",
} as const;

// The UI timeline component expects 5 stages — we only have 3 real
// signals (label / shipped / delivered), so we stretch picked_up +
// out_for_delivery as inferred ticks around shipped_at.
const TIMELINE_STAGES = [
  "label_generated",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
] as const;
const TIMELINE_LABELS: Record<(typeof TIMELINE_STAGES)[number], string> = {
  label_generated: "Label generated",
  picked_up: "Picked up",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
};

/**
 * Map a transporter_code into the deep-link URL pattern its public
 * tracking page expects. Returns null when we don't have a public
 * URL (Porter, internal couriers).
 */
function carrierTrackingUrl(
  transporterCode: string | null,
  awb: string | null,
): string | null {
  if (!awb) return null;
  const encoded = encodeURIComponent(awb);
  switch ((transporterCode ?? "").toLowerCase()) {
    case "bluedart":
      return `https://www.bluedart.com/tracking?action=track&trackingFor=AWB&trackingNumbers=${encoded}`;
    case "delhivery":
      return `https://www.delhivery.com/track/package/${encoded}`;
    case "dtdc":
      return `https://www.dtdc.in/tracking.asp?strCnno=${encoded}`;
    case "shiprocket":
      return `https://shiprocket.co/tracking/${encoded}`;
    case "indiapost":
      return `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx`;
    case "ekartlogistics":
    case "ekart":
      return `https://ekartlogistics.com/shipmenttrack/${encoded}`;
    case "xpressbees":
      return `https://www.xpressbees.com/track?awbNo=${encoded}`;
    case "ecomexpress":
    case "ecom":
      return `https://ecomexpress.in/tracking/?awb_field=${encoded}`;
    default:
      return null;
  }
}

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

async function fetchShipments(): Promise<ShipmentRow[]> {
  let token: string | null = null;
  if (typeof window !== "undefined") {
    token = window.localStorage.getItem("medusa_auth_token");
  }
  const headers: Record<string, string> = {
    "x-publishable-api-key": PUB_KEY,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${MEDUSA_BASE_URL}/store/shipments`, {
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    let detail = "";
    try {
      const b = (await res.json()) as { message?: string };
      detail = b?.message ?? "";
    } catch {
      // ignore
    }
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { shipments: ShipmentRow[] };
  return body.shipments ?? [];
}

function refLabel(s: ShipmentRow): string {
  return `RST-${String(s.order_display_id).padStart(6, "0")}`;
}
function carrierLabel(s: ShipmentRow): string {
  if (s.transporter?.display_name) return s.transporter.display_name;
  if (s.transporter?.code) return s.transporter.code;
  return s.provider_id ?? "—";
}

export default function B2bShipmentsPage() {
  const searchParams = useSearchParams();
  const focusOrderId = searchParams?.get("order") ?? null;
  const [shipments, setShipments] = React.useState<ShipmentRow[] | null>(null);
  // Pending POs = drafts the buyer placed via /b2b/checkout that haven't been
  // promoted to a Medusa order yet (payment not captured). Surfaced here so
  // a buyer who just finished checkout sees their order in the "track my
  // shipment" view instead of an empty page.
  const [pendingPOs, setPendingPOs] = React.useState<DraftPurchaseOrder[]>([]);
  const [authErr, setAuthErr] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchShipments().catch((err: unknown) => {
        const msg = (err as Error).message ?? "";
        if (/401|Not authenticated/i.test(msg)) {
          if (!cancelled) setAuthErr(true);
        } else if (/account_not_verified|403/i.test(msg)) {
          if (!cancelled)
            setError("Finish verifying your email and phone to see shipments.");
        } else {
          if (!cancelled) setError(msg || "Couldn't load shipments.");
        }
        return [] as ShipmentRow[];
      }),
      listAllPurchaseOrders().catch(() => [] as DraftPurchaseOrder[]),
    ])
      .then(([shipmentRows, poRows]) => {
        if (cancelled) return;
        setShipments(shipmentRows);
        // Keep only POs that haven't been promoted to a Medusa order yet AND
        // aren't cancelled — those are the ones a buyer is actively
        // tracking-but-waiting-on.
        const pending = poRows.filter(
          (p) =>
            (p.status === "draft" || p.status === "in_progress") &&
            !(p as unknown as { order?: { id?: string } | null }).order?.id,
        );
        setPendingPOs(pending);
      })
      .catch(() => {
        if (cancelled) return;
        setShipments([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!shipments || shipments.length === 0) return;
    // Honour the ?order=<id> query param from the B2B orders workspace.
    // "Track shipment" button — auto-select the most recent shipment
    // for that order if one exists.
    if (focusOrderId) {
      const match = shipments.find((s) => s.order_id === focusOrderId);
      if (match) {
        setSelectedId(match.fulfillment_id);
        return;
      }
    }
    if (!selectedId) {
      setSelectedId(shipments[0]!.fulfillment_id);
    }
  }, [shipments, selectedId, focusOrderId]);

  const all = shipments ?? [];
  const filtered = all.filter(
    (s) =>
      !q ||
      (s.awb && s.awb.toLowerCase().includes(q.toLowerCase())) ||
      refLabel(s).toLowerCase().includes(q.toLowerCase()) ||
      (s.destination ?? "")
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  const selected = all.find((s) => s.fulfillment_id === selectedId) ?? null;

  const inTransit = all.filter((s) => s.status === "in_transit").length;
  const delivered = all.filter((s) => s.status === "delivered").length;
  const awaitingDispatch = all.filter(
    (s) => s.status === "label_generated",
  ).length;

  const isLoading = shipments === null && !error && !authErr;

  if (authErr) {
    return (
      <>
        <header className="mb-6">
          <B2bTopbar
            title="Shipments"
            subtitle="Track every box in motion across carriers"
          />
        </header>
        <EmptyState
          icon={<Package className="h-5 w-5" />}
          title="Sign in to see your shipments"
          description="Shipments are tied to your account."
          action={
            <Button asChild>
              <Link href="/auth/sign-in">Sign in</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <header className="mb-6">
        <B2bTopbar
          title="Shipments"
          subtitle="Carrier + AWB + dispatch from in-house tracking"
        />
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-feedback-warning-bg px-3 py-2 text-body-sm text-feedback-warning-text ring-1 ring-feedback-warning-border">
          {error}
        </p>
      )}

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="In transit"
          value={isLoading ? "…" : inTransit.toString()}
        />
        <StatCard
          label="Awaiting dispatch"
          value={isLoading ? "…" : awaitingDispatch.toString()}
        />
        <StatCard
          label="Delivered"
          value={isLoading ? "…" : delivered.toString()}
          tone="muted"
        />
        <StatCard
          label="Live-tracked"
          value={
            isLoading
              ? "…"
              : all
                  .filter((s) => s.transporter?.live_status)
                  .length.toString()
          }
          unit="carrier status synced"
        />
      </section>

      {pendingPOs.length > 0 && (() => {
        const queued = pendingPOs.filter((p) => p.payment_confirmed_at);
        const awaiting = pendingPOs.filter((p) => !p.payment_confirmed_at);
        return (
          <>
            {queued.length > 0 && (
              <section
                aria-label="Purchase orders queued for dispatch"
                className="mt-6 rounded-md border border-feedback-info-border bg-feedback-info-bg p-5"
              >
                <h2 className="text-heading-sm text-feedback-info-text">
                  {queued.length} purchase order{queued.length === 1 ? "" : "s"} queued for dispatch
                </h2>
                <p className="mt-1 text-caption text-feedback-info-text/80">
                  Payment proof recorded; finance reconciles against the
                  bank/gateway statement and ops releases a tracking number
                  next — usually within 1 business day.
                </p>
                <ul className="mt-4 space-y-2">
                  {queued.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-feedback-info-border bg-surface-background p-4"
                    >
                      <div>
                        <p className="font-mono text-body-sm text-text-primary">
                          {p.po_number}
                        </p>
                        <p className="mt-0.5 text-caption text-text-muted">
                          ₹{Number(p.value_major ?? 0).toLocaleString("en-IN")} · placed{" "}
                          {new Date(p.created_at).toLocaleDateString()} · paid via{" "}
                          {p.payment_confirmed_method ?? "—"}
                        </p>
                      </div>
                      <div className="inline-flex gap-2">
                        <Badge tone="info" size="xs">Dispatch queued</Badge>
                        <Button asChild size="xs" variant="tertiary">
                          <Link href={`/b2b/purchase-orders/${encodeURIComponent(p.id)}`}>
                            View PO
                          </Link>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {awaiting.length > 0 && (
              <section
                aria-label="Purchase orders awaiting payment"
                className="mt-6 rounded-md border border-feedback-warning-border bg-feedback-warning-bg p-5"
              >
                <h2 className="text-heading-sm text-feedback-warning-text">
                  {awaiting.length} purchase order{awaiting.length === 1 ? "" : "s"} awaiting payment
                </h2>
                <p className="mt-1 text-caption text-feedback-warning-text/80">
                  Open each PO to record payment proof (UTR / Txn ID / Cheque #).
                  Once payment is confirmed, the PO moves to "queued for dispatch"
                  and a tracking number is generated.
                </p>
                <ul className="mt-4 space-y-2">
                  {awaiting.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-feedback-warning-border bg-surface-background p-4"
                    >
                      <div>
                        <p className="font-mono text-body-sm text-text-primary">
                          {p.po_number}
                        </p>
                        <p className="mt-0.5 text-caption text-text-muted">
                          ₹{Number(p.value_major ?? 0).toLocaleString("en-IN")} · placed{" "}
                          {new Date(p.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="inline-flex gap-2">
                        <Badge tone="warning" size="xs">Awaiting payment</Badge>
                        <Button asChild size="xs">
                          <Link href={`/b2b/purchase-orders/${encodeURIComponent(p.id)}`}>
                            Confirm payment
                          </Link>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        );
      })()}

      {isLoading ? (
        <p className="mt-8 text-body-md text-text-muted">Loading…</p>
      ) : all.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<Package className="h-5 w-5" />}
            title={pendingPOs.length > 0 ? "No shipped orders yet" : "No shipments yet"}
            description={
              pendingPOs.length > 0
                ? "Once payment lands on the POs above, tracking numbers will appear here."
                : "Shipments appear here once an order is fulfilled and a tracking number is generated."
            }
            action={
              <Button asChild>
                <Link href="/b2b/orders">View orders</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <aside className="lg:col-span-5">
            <Input
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
              leftAdornment={<Search className="h-4 w-4" />}
              placeholder="AWB, order id, city…"
            />
            <ul className="mt-4 space-y-2">
              {filtered.map((s) => {
                const isActive = s.fulfillment_id === selectedId;
                return (
                  <li key={s.fulfillment_id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(s.fulfillment_id)}
                      className={
                        "block w-full rounded-lg border bg-surface-raised p-4 text-left transition-colors duration-fast " +
                        (isActive
                          ? "border-brand-accent shadow-rest"
                          : "border-border-subtle hover:bg-surface-sunken")
                      }
                    >
                      <div className="flex items-baseline justify-between">
                        <p className="font-mono text-body-sm text-text-primary">
                          {refLabel(s)}
                        </p>
                        <Badge
                          tone={
                            s.status === "delivered"
                              ? "success"
                              : s.status === "canceled"
                                ? "danger"
                                : "info"
                          }
                          size="xs"
                        >
                          {STAGE_LABELS[s.status]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-caption text-text-muted">
                        {carrierLabel(s)}
                        {s.awb ? ` · ${s.awb}` : ""}
                      </p>
                      <p className="text-caption text-text-muted">
                        {s.destination ?? "—"}
                      </p>
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="rounded-md bg-surface-sunken px-4 py-3 text-caption text-text-muted">
                  No matches for &ldquo;{q}&rdquo;.
                </li>
              )}
            </ul>
          </aside>

          <div className="lg:col-span-7 space-y-4">
            {selected ? (
              <SelectedPanel s={selected} />
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}

function SelectedPanel({ s }: { s: ShipmentRow }) {
  const trackUrl = carrierTrackingUrl(s.transporter?.code ?? null, s.awb);
  const events = TIMELINE_STAGES.map((stage) => ({
    status: stage,
    label: TIMELINE_LABELS[stage],
    at:
      stage === "label_generated" && s.shipped_at
        ? new Date(
            new Date(s.shipped_at).getTime() - 2 * 86_400_000,
          ).toISOString()
        : stage === "picked_up" && s.transporter?.dispatched_at
          ? s.transporter.dispatched_at
          : stage === "picked_up" && s.shipped_at
            ? s.shipped_at
            : stage === "in_transit" && s.shipped_at
              ? new Date(
                  new Date(s.shipped_at).getTime() + 86_400_000,
                ).toISOString()
              : stage === "delivered" && s.delivered_at
                ? s.delivered_at
                : undefined,
  }));

  const currentStatus =
    s.status === "delivered"
      ? "delivered"
      : s.status === "canceled"
        ? "label_generated"
        : s.shipped_at
          ? "in_transit"
          : "label_generated";

  return (
    <>
      {/* Transporter detail card */}
      <section className="rounded-lg border border-border-subtle bg-surface-raised p-5">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-micro text-text-muted">Carrier</p>
            <h3 className="mt-1 font-display text-heading-md text-text-primary">
              {s.transporter?.display_name ?? s.transporter?.code ?? "Not yet dispatched"}
            </h3>
            {s.transporter?.live_status && (
              <p className="mt-1 text-caption text-brand-accent">
                Live:{" "}
                {LIVE_STATUS_LABELS[s.transporter.live_status] ??
                  s.transporter.live_status}
                {s.transporter.live_status_event
                  ? ` · ${s.transporter.live_status_event}`
                  : ""}
              </p>
            )}
            {s.transporter?.notes && (
              <p className="mt-1 text-caption text-text-muted">
                {s.transporter.notes}
              </p>
            )}
          </div>
          {trackUrl && (
            <Button asChild size="sm" variant="secondary">
              <a href={trackUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                Open carrier portal
              </a>
            </Button>
          )}
        </header>
        <dl className="mt-4 grid grid-cols-2 gap-4 numerics-tabular md:grid-cols-3">
          <Field label="AWB / tracking" value={s.awb ?? "—"} mono />
          <Field
            label="Vehicle"
            value={s.transporter?.vehicle_number ?? "—"}
            mono
          />
          <Field
            label="Dispatched"
            value={
              s.transporter?.dispatched_at
                ? new Date(s.transporter.dispatched_at).toLocaleString()
                : "—"
            }
          />
          <Field label="Destination" value={s.destination ?? "—"} />
          <Field
            label="Shipped"
            value={
              s.shipped_at
                ? new Date(s.shipped_at).toLocaleString()
                : "—"
            }
          />
          <Field
            label="Delivered"
            value={
              s.delivered_at
                ? new Date(s.delivered_at).toLocaleString()
                : "—"
            }
          />
        </dl>
      </section>

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="map">Map</TabsTrigger>
        </TabsList>
        <TabsContent value="timeline">
          <ShipmentTimeline
            events={events}
            currentStatus={currentStatus}
            trackingNumber={s.awb ?? "—"}
            carrier={s.transporter?.display_name ?? s.transporter?.code ?? "—"}
          />
        </TabsContent>
        <TabsContent value="map">
          <div className="aspect-video w-full rounded-lg border border-border-subtle bg-surface-sunken">
            <div className="flex h-full items-center justify-center text-body-md text-text-muted">
              Map view ships with the transporter API integration ·
              destination {s.destination ?? "—"}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="secondary">
          <Link href={`/b2b/orders?order=${encodeURIComponent(s.order_id)}`}>Open order</Link>
        </Button>
        <ShipmentInvoiceButton
          orderId={s.order_id}
          displayId={s.order_display_id}
        />
        <Button asChild size="sm" variant="tertiary">
          <a
            href={`mailto:hello@risitex.com?subject=${encodeURIComponent(
              `Shipment issue · ${refLabel(s)}${s.awb ? ` · AWB ${s.awb}` : ""}`,
            )}&body=${encodeURIComponent(
              `Order: ${refLabel(s)}\nAWB: ${s.awb ?? "—"}\nCarrier: ${
                s.transporter?.display_name ??
                s.transporter?.code ??
                "—"
              }\nDestination: ${s.destination ?? "—"}\n\nDescribe the issue:\n`,
            )}`}
          >
            Report issue
          </a>
        </Button>
      </div>
    </>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-micro text-text-muted">{label}</dt>
      <dd
        className={
          "mt-0.5 text-body-md text-text-primary" +
          (mono ? " font-mono" : "")
        }
      >
        {value}
      </dd>
    </div>
  );
}

function ShipmentInvoiceButton({
  orderId,
  displayId,
}: {
  orderId: string;
  displayId: number | string;
}) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      size="sm"
      variant="tertiary"
      isLoading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadOrderInvoice(orderId, displayId);
        } catch {
          // silent on failure; user can retry from the B2B orders workspace.
        } finally {
          setBusy(false);
        }
      }}
    >
      Download invoice
    </Button>
  );
}
