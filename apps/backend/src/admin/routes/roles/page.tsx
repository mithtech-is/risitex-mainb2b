import { defineRouteConfig } from "@medusajs/admin-sdk";
import { ShieldCheck } from "@medusajs/icons";
import {
  Badge,
  Button,
  FocusModal,
  Heading,
  Input,
  Label,
  Select,
  Textarea,
  toast,
} from "@medusajs/ui";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, buildQuery } from "../../lib/admin-client";
import { ListShell } from "../../lib/list-shell";

const SCOPES = ["admin", "b2b_company", "sales_rep"] as const;

type Role = {
  id: string;
  code: string;
  display_name: string;
  description: string | null;
  scope: (typeof SCOPES)[number];
  is_system: boolean;
  active: boolean;
  created_at: string;
};

type ListResponse = {
  roles: Role[];
  count: number;
  limit: number;
  offset: number;
};

const PAGE_SIZE = 50;

const RolesPage = () => {
  const navigate = useNavigate();
  const [scope, setScope] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildQuery({
        limit: PAGE_SIZE,
        offset,
        scope: scope || undefined,
      });
      const r = await api.get<ListResponse>(`/admin/roles${qs}`);
      setData(r);
    } catch (e) {
      toast.error("Failed to load", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [scope, offset]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ListShell<Role>
      title="Roles"
      description="RBAC roles. System roles are seeded and cannot be deleted."
      rightAction={<CreateRoleButton onCreated={load} />}
      loading={loading}
      rows={data?.roles ?? []}
      rowKey={(r) => r.id}
      totalCount={data?.count ?? 0}
      pageSize={PAGE_SIZE}
      offset={offset}
      onOffsetChange={setOffset}
      onRowClick={(r) => navigate(`/roles/${r.id}`)}
      onReload={load}
      filters={
        <div className="flex flex-col gap-1">
          <Label size="xsmall">Scope</Label>
          <Select
            value={scope || "all"}
            onValueChange={(v) => {
              setOffset(0);
              setScope(v === "all" ? "" : v);
            }}
          >
            <Select.Trigger className="w-44">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="all">All</Select.Item>
              {SCOPES.map((s) => (
                <Select.Item key={s} value={s}>
                  {s}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
      }
      columns={[
        { header: "Code", render: (r) => r.code, mono: true },
        { header: "Display name", render: (r) => r.display_name },
        {
          header: "Scope",
          render: (r) => <Badge size="xsmall">{r.scope}</Badge>,
        },
        {
          header: "System",
          render: (r) =>
            r.is_system ? (
              <Badge size="xsmall" color="purple">
                seeded
              </Badge>
            ) : (
              <Badge size="xsmall">custom</Badge>
            ),
        },
        {
          header: "Active",
          render: (r) =>
            r.active ? (
              <Badge color="green" size="xsmall">
                yes
              </Badge>
            ) : (
              <Badge color="grey" size="xsmall">
                no
              </Badge>
            ),
        },
        {
          header: "Description",
          render: (r) => r.description ?? "—",
        },
      ]}
    />
  );
};

function CreateRoleButton({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    code: "",
    display_name: "",
    description: "",
    scope: "admin" as (typeof SCOPES)[number],
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        code: form.code,
        display_name: form.display_name,
        scope: form.scope,
      };
      if (form.description) payload.description = form.description;
      await api.post("/admin/roles", payload);
      toast.success("Role created");
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
        <Button>New role</Button>
      </FocusModal.Trigger>
      <FocusModal.Content>
        <FocusModal.Header>
          <Heading>Create role</Heading>
        </FocusModal.Header>
        <form onSubmit={submit} className="flex h-full flex-col">
          <FocusModal.Body className="grid grid-cols-2 gap-4 p-6">
            <Field label="Code (snake_case) *">
              <Input
                value={form.code}
                onChange={(e) =>
                  setForm({
                    ...form,
                    code: e.currentTarget.value.toLowerCase(),
                  })
                }
                required
              />
            </Field>
            <Field label="Display name *">
              <Input
                value={form.display_name}
                onChange={(e) =>
                  setForm({ ...form, display_name: e.currentTarget.value })
                }
                required
              />
            </Field>
            <Field label="Scope">
              <Select
                value={form.scope}
                onValueChange={(v) =>
                  setForm({ ...form, scope: v as typeof form.scope })
                }
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {SCOPES.map((s) => (
                    <Select.Item key={s} value={s}>
                      {s}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </Field>
            <div className="col-span-2">
              <Label size="xsmall">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.currentTarget.value })
                }
                rows={3}
              />
            </div>
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
  label: "Roles",
  icon: ShieldCheck,
});

export default RolesPage;
