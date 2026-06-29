import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Switch,
  Table,
  Text,
  toast,
} from "@medusajs/ui";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../../lib/admin-client";
import { InfoGrid } from "../../../lib/info-grid";

type Role = {
  id: string;
  code: string;
  display_name: string;
  description: string | null;
  scope: string;
  is_system: boolean;
  active: boolean;
};

type Permission = {
  id: string;
  permission: string;
  allow: boolean;
};

const RoleDetailPage = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newPerm, setNewPerm] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        api.get<{ role: Role }>(`/admin/roles/${id}`),
        api.get<{ permissions: Permission[] }>(
          `/admin/roles/${id}/permissions`,
        ),
      ]);
      setRole(r1.role);
      setPermissions(r2.permissions);
      setDirty(false);
    } catch (e) {
      toast.error("Failed to load", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const togglePermission = (perm: Permission) => {
    setPermissions((ps) =>
      ps.map((p) => (p.id === perm.id ? { ...p, allow: !p.allow } : p)),
    );
    setDirty(true);
  };

  const removePermission = (perm: Permission) => {
    setPermissions((ps) => ps.filter((p) => p.id !== perm.id));
    setDirty(true);
  };

  const addPermission = () => {
    const v = newPerm.trim();
    if (!v) return;
    if (permissions.some((p) => p.permission === v)) {
      toast.error("Already in list");
      return;
    }
    setPermissions((ps) => [
      ...ps,
      { id: `new-${Date.now()}-${Math.random()}`, permission: v, allow: true },
    ]);
    setNewPerm("");
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.post(`/admin/roles/${id}/permissions`, {
        permissions: permissions.map((p) => ({
          permission: p.permission,
          allow: p.allow,
        })),
      });
      toast.success("Permissions saved");
      await loadAll();
    } catch (e) {
      toast.error("Save failed", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Container className="p-6">
        <Text>Loading…</Text>
      </Container>
    );
  }
  if (!role) {
    return (
      <Container className="p-6">
        <Text>Not found.</Text>
      </Container>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Container className="divide-y p-0">
        <div className="flex items-start justify-between gap-4 px-6 py-4">
          <div>
            <Button
              variant="transparent"
              onClick={() => navigate("/roles")}
              className="-ml-2 mb-1"
              size="small"
            >
              ← Roles
            </Button>
            <Heading>{role.display_name}</Heading>
            <div className="mt-1 flex items-center gap-2">
              <Badge>{role.scope}</Badge>
              <span className="font-mono text-sm">{role.code}</span>
              {role.is_system && <Badge color="purple">seeded</Badge>}
            </div>
          </div>
        </div>
        <InfoGrid
          items={[
            { label: "Code", value: role.code, mono: true },
            { label: "Scope", value: role.scope },
            { label: "Description", value: role.description ?? "—" },
            { label: "Active", value: role.active ? "Yes" : "No" },
          ]}
        />
      </Container>

      <Container className="p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading level="h2">Permissions</Heading>
            <Text className="text-ui-fg-subtle" size="small">
              Dot-paths: <code>orders.read</code>, <code>orders.*</code>, or{" "}
              <code>*</code>. Deny rules trump allow.
            </Text>
          </div>
          <Button onClick={save} isLoading={saving} disabled={!dirty}>
            {dirty ? "Save" : "No changes"}
          </Button>
        </div>
        <div className="px-6 pb-4">
          <div className="mb-3 flex gap-2">
            <Input
              value={newPerm}
              onChange={(e) =>
                setNewPerm(e.currentTarget.value.toLowerCase())
              }
              placeholder="e.g. orders.* or wallets.credit"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPermission();
                }
              }}
              className="max-w-md"
            />
            <Button variant="secondary" onClick={addPermission}>
              Add
            </Button>
          </div>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Permission</Table.HeaderCell>
                <Table.HeaderCell>Allow</Table.HeaderCell>
                <Table.HeaderCell>Remove</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {permissions.length === 0 && (
                <Table.Row>
                  <Table.Cell
                    {...({ colSpan: 3 } as Record<string, unknown>)}
                  >
                    <Text className="text-ui-fg-subtle">No permissions.</Text>
                  </Table.Cell>
                </Table.Row>
              )}
              {permissions.map((p) => (
                <Table.Row key={p.id}>
                  <Table.Cell>
                    <Text className="font-mono">{p.permission}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={p.allow}
                        onCheckedChange={() => togglePermission(p)}
                      />
                      <Label size="xsmall">{p.allow ? "allow" : "deny"}</Label>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <Button
                      size="small"
                      variant="transparent"
                      onClick={() => removePermission(p)}
                    >
                      Remove
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      </Container>
    </div>
  );
};

export default RoleDetailPage;
