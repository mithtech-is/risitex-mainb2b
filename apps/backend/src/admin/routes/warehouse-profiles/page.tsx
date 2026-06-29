import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Buildings } from "@medusajs/icons";
import {
  Badge,
  Button,
  FocusModal,
  Heading,
  Input,
  Label,
  toast,
} from "@medusajs/ui";
import { useCallback, useEffect, useState } from "react";
import { api, buildQuery } from "../../lib/admin-client";
import { formatDate, shortId } from "../../lib/format";
import { ListShell } from "../../lib/list-shell";

type Profile = {
  id: string;
  stock_location_id: string;
  gst_number: string | null;
  is_owned: boolean;
  daily_dispatch_capacity: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  active: boolean;
  created_at: string;
};

type ListResponse = {
  warehouse_profiles: Profile[];
  count: number;
  limit: number;
  offset: number;
};

const PAGE_SIZE = 50;

const WarehouseProfilesPage = () => {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildQuery({ limit: PAGE_SIZE, offset });
      const r = await api.get<ListResponse>(`/admin/warehouse-profiles${qs}`);
      setData(r);
    } catch (e) {
      toast.error("Failed to load", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ListShell<Profile>
      title="Warehouse profiles"
      description="RISITEX-specific metadata for Medusa stock locations (GST, capacity, contact)."
      rightAction={<EnsureProfileButton onCreated={load} />}
      loading={loading}
      rows={data?.warehouse_profiles ?? []}
      rowKey={(p) => p.id}
      totalCount={data?.count ?? 0}
      pageSize={PAGE_SIZE}
      offset={offset}
      onOffsetChange={setOffset}
      onReload={load}
      columns={[
        {
          header: "Stock location",
          render: (p) => shortId(p.stock_location_id, 14),
          mono: true,
        },
        {
          header: "GSTIN",
          render: (p) => (
            <span className="font-mono text-xs">{p.gst_number ?? "—"}</span>
          ),
        },
        {
          header: "Owned",
          render: (p) =>
            p.is_owned ? (
              <Badge color="green" size="xsmall">
                owned
              </Badge>
            ) : (
              <Badge size="xsmall">3PL</Badge>
            ),
        },
        {
          header: "Daily capacity",
          render: (p) =>
            p.daily_dispatch_capacity
              ? `${p.daily_dispatch_capacity.toLocaleString()} pcs`
              : "—",
        },
        {
          header: "Contact",
          render: (p) =>
            p.contact_name || p.contact_phone ? (
              <div className="flex flex-col">
                {p.contact_name && <span>{p.contact_name}</span>}
                {p.contact_phone && (
                  <span className="text-ui-fg-subtle text-xs">
                    {p.contact_phone}
                  </span>
                )}
              </div>
            ) : (
              "—"
            ),
        },
        {
          header: "Active",
          render: (p) =>
            p.active ? (
              <Badge color="green" size="xsmall">
                yes
              </Badge>
            ) : (
              <Badge color="grey" size="xsmall">
                no
              </Badge>
            ),
        },
        { header: "Created", render: (p) => formatDate(p.created_at) },
      ]}
    />
  );
};

function EnsureProfileButton({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    stock_location_id: "",
    gst_number: "",
    is_owned: true,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        stock_location_id: form.stock_location_id,
        is_owned: form.is_owned,
      };
      if (form.gst_number) payload.gst_number = form.gst_number;
      await api.post("/admin/warehouse-profiles", payload);
      toast.success("Profile created");
      setOpen(false);
      onCreated();
    } catch (e2) {
      toast.error("Create failed", { description: (e2 as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FocusModal open={open} onOpenChange={setOpen}>
      <FocusModal.Trigger asChild>
        <Button>Ensure profile</Button>
      </FocusModal.Trigger>
      <FocusModal.Content>
        <FocusModal.Header>
          <Heading>Ensure warehouse profile</Heading>
        </FocusModal.Header>
        <form onSubmit={submit} className="flex h-full flex-col">
          <FocusModal.Body className="grid grid-cols-2 gap-4 p-6">
            <Field label="Stock location ID *">
              <Input
                value={form.stock_location_id}
                onChange={(e) =>
                  setForm({
                    ...form,
                    stock_location_id: e.currentTarget.value,
                  })
                }
                placeholder="sloc_…"
                required
              />
            </Field>
            <Field label="GSTIN (15 chars)">
              <Input
                value={form.gst_number}
                onChange={(e) =>
                  setForm({
                    ...form,
                    gst_number: e.currentTarget.value.toUpperCase(),
                  })
                }
              />
            </Field>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_owned}
                onChange={(e) =>
                  setForm({ ...form, is_owned: e.currentTarget.checked })
                }
              />
              <span className="text-sm">Owned warehouse (uncheck for 3PL)</span>
            </label>
          </FocusModal.Body>
          <FocusModal.Footer>
            <FocusModal.Close asChild>
              <Button variant="secondary" type="button">
                Cancel
              </Button>
            </FocusModal.Close>
            <Button type="submit" isLoading={submitting}>
              Create
            </Button>
          </FocusModal.Footer>
        </form>
      </FocusModal.Content>
    </FocusModal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label size="xsmall">{label}</Label>
      {children}
    </div>
  );
}

export const config = defineRouteConfig({
  label: "Warehouses",
  icon: Buildings,
});

export default WarehouseProfilesPage;
