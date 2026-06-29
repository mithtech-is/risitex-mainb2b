import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Key } from "@medusajs/icons";
import {
  Badge,
  Button,
  FocusModal,
  Heading,
  Input,
  Label,
  Select,
  toast,
} from "@medusajs/ui";
import { useCallback, useEffect, useState } from "react";
import { api, buildQuery } from "../../lib/admin-client";
import { formatDateTime, shortId } from "../../lib/format";
import { ListShell } from "../../lib/list-shell";

const ACTOR_TYPES = ["user", "customer"] as const;

type UserRole = {
  id: string;
  actor_type: (typeof ACTOR_TYPES)[number];
  actor_id: string;
  role_id: string;
  company_id: string | null;
  expires_at: string | null;
  created_at: string;
};

type ListResponse = {
  user_roles: UserRole[];
  count: number;
  limit: number;
  offset: number;
};

const PAGE_SIZE = 100;

const UserRolesPage = () => {
  const [actorType, setActorType] = useState("");
  const [actorId, setActorId] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildQuery({
        limit: PAGE_SIZE,
        offset,
        actor_type: actorType || undefined,
        actor_id: actorId || undefined,
      });
      const r = await api.get<ListResponse>(`/admin/user-roles${qs}`);
      setData(r);
    } catch (e) {
      toast.error("Failed to load", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [actorType, actorId, offset]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ListShell<UserRole>
      title="Role grants"
      description="Active role assignments. Optional company scope for B2B roles."
      rightAction={
        <div className="flex gap-2">
          <PermissionCheckButton />
          <GrantRoleButton onCreated={load} />
        </div>
      }
      loading={loading}
      rows={data?.user_roles ?? []}
      rowKey={(u) => u.id}
      totalCount={data?.count ?? 0}
      pageSize={PAGE_SIZE}
      offset={offset}
      onOffsetChange={setOffset}
      onReload={load}
      filters={
        <>
          <div className="flex flex-col gap-1">
            <Label size="xsmall">Actor type</Label>
            <Select
              value={actorType || "all"}
              onValueChange={(v) => {
                setOffset(0);
                setActorType(v === "all" ? "" : v);
              }}
            >
              <Select.Trigger className="w-40">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">All</Select.Item>
                {ACTOR_TYPES.map((a) => (
                  <Select.Item key={a} value={a}>
                    {a}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label size="xsmall">Actor ID</Label>
            <Input
              value={actorId}
              onChange={(e) => {
                setOffset(0);
                setActorId(e.currentTarget.value);
              }}
              className="w-64"
            />
          </div>
        </>
      }
      columns={[
        {
          header: "Actor",
          render: (u) => (
            <div className="flex flex-col">
              <Badge size="xsmall">{u.actor_type}</Badge>
              <span className="font-mono text-xs">{u.actor_id}</span>
            </div>
          ),
        },
        {
          header: "Role ID",
          render: (u) => u.role_id,
          mono: true,
        },
        {
          header: "Company scope",
          render: (u) => (u.company_id ? shortId(u.company_id) : "—"),
          mono: true,
        },
        {
          header: "Expires",
          render: (u) =>
            u.expires_at ? (
              formatDateTime(u.expires_at)
            ) : (
              <Badge size="xsmall">never</Badge>
            ),
        },
        { header: "Granted", render: (u) => formatDateTime(u.created_at) },
      ]}
    />
  );
};

function GrantRoleButton({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    actor_type: "user" as (typeof ACTOR_TYPES)[number],
    actor_id: "",
    role_id: "",
    company_id: "",
    expires_at: "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        actor_type: form.actor_type,
        actor_id: form.actor_id,
        role_id: form.role_id,
      };
      if (form.company_id) payload.company_id = form.company_id;
      if (form.expires_at) payload.expires_at = form.expires_at;
      await api.post("/admin/user-roles", payload);
      toast.success("Role granted");
      setOpen(false);
      onCreated();
    } catch (e2) {
      toast.error("Grant failed", { description: (e2 as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FocusModal open={open} onOpenChange={setOpen}>
      <FocusModal.Trigger asChild>
        <Button>Grant role</Button>
      </FocusModal.Trigger>
      <FocusModal.Content>
        <FocusModal.Header>
          <Heading>Grant role</Heading>
        </FocusModal.Header>
        <form onSubmit={submit} className="flex h-full flex-col">
          <FocusModal.Body className="grid grid-cols-2 gap-4 p-6">
            <Field label="Actor type">
              <Select
                value={form.actor_type}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    actor_type: v as typeof form.actor_type,
                  })
                }
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {ACTOR_TYPES.map((a) => (
                    <Select.Item key={a} value={a}>
                      {a}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </Field>
            <Field label="Actor ID *">
              <Input
                value={form.actor_id}
                onChange={(e) =>
                  setForm({ ...form, actor_id: e.currentTarget.value })
                }
                placeholder="user_… / cus_…"
                required
              />
            </Field>
            <Field label="Role ID *">
              <Input
                value={form.role_id}
                onChange={(e) =>
                  setForm({ ...form, role_id: e.currentTarget.value })
                }
                placeholder="role_…"
                required
              />
            </Field>
            <Field label="Company scope (optional)">
              <Input
                value={form.company_id}
                onChange={(e) =>
                  setForm({ ...form, company_id: e.currentTarget.value })
                }
                placeholder="comp_…"
              />
            </Field>
            <Field label="Expires at (optional ISO)">
              <Input
                value={form.expires_at}
                onChange={(e) =>
                  setForm({ ...form, expires_at: e.currentTarget.value })
                }
                placeholder="2027-01-01T00:00:00Z"
              />
            </Field>
          </FocusModal.Body>
          <FocusModal.Footer>
            <FocusModal.Close asChild>
              <Button variant="secondary" type="button">
                Cancel
              </Button>
            </FocusModal.Close>
            <Button type="submit" isLoading={submitting}>
              Grant
            </Button>
          </FocusModal.Footer>
        </form>
      </FocusModal.Content>
    </FocusModal>
  );
}

function PermissionCheckButton() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    actor_type: "user" as (typeof ACTOR_TYPES)[number],
    actor_id: "",
    permission: "",
    company_id: "",
  });
  const [result, setResult] = useState<{ allowed: boolean } | null>(null);

  const submit = async () => {
    try {
      const payload: Record<string, unknown> = {
        actor_type: form.actor_type,
        actor_id: form.actor_id,
        permission: form.permission,
      };
      if (form.company_id) payload.company_id = form.company_id;
      const r = await api.post<{ allowed: boolean }>(
        "/admin/permission-check",
        payload,
      );
      setResult(r);
    } catch (e) {
      toast.error("Check failed", { description: (e as Error).message });
    }
  };

  return (
    <FocusModal open={open} onOpenChange={setOpen}>
      <FocusModal.Trigger asChild>
        <Button variant="secondary">Check permission</Button>
      </FocusModal.Trigger>
      <FocusModal.Content>
        <FocusModal.Header>
          <Heading>Permission check</Heading>
        </FocusModal.Header>
        <FocusModal.Body className="flex flex-col gap-3 p-6">
          <Field label="Actor type">
            <Select
              value={form.actor_type}
              onValueChange={(v) =>
                setForm({ ...form, actor_type: v as typeof form.actor_type })
              }
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {ACTOR_TYPES.map((a) => (
                  <Select.Item key={a} value={a}>
                    {a}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </Field>
          <Field label="Actor ID">
            <Input
              value={form.actor_id}
              onChange={(e) =>
                setForm({ ...form, actor_id: e.currentTarget.value })
              }
            />
          </Field>
          <Field label="Permission (dot-path)">
            <Input
              value={form.permission}
              onChange={(e) =>
                setForm({
                  ...form,
                  permission: e.currentTarget.value.toLowerCase(),
                })
              }
              placeholder="orders.read"
            />
          </Field>
          <Field label="Company scope (optional)">
            <Input
              value={form.company_id}
              onChange={(e) =>
                setForm({ ...form, company_id: e.currentTarget.value })
              }
            />
          </Field>
          {result && (
            <div className="mt-2 rounded-md border p-3">
              {result.allowed ? (
                <Badge color="green">ALLOWED</Badge>
              ) : (
                <Badge color="red">DENIED</Badge>
              )}
            </div>
          )}
        </FocusModal.Body>
        <FocusModal.Footer>
          <FocusModal.Close asChild>
            <Button variant="secondary" type="button">
              Close
            </Button>
          </FocusModal.Close>
          <Button onClick={submit}>Check</Button>
        </FocusModal.Footer>
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
  label: "Role grants",
  icon: Key,
});

export default UserRolesPage;
