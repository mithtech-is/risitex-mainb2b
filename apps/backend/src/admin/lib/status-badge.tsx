import { Badge } from "@medusajs/ui";

type BadgeColor = "green" | "red" | "orange" | "blue" | "grey" | "purple";

const APPROVAL_COLOR: Record<string, BadgeColor> = {
  pending: "orange",
  approved: "green",
  rejected: "red",
  suspended: "grey",
};

export function ApprovalStatusBadge({ status }: { status: string }) {
  const color = APPROVAL_COLOR[status] ?? "grey";
  return <Badge color={color}>{status}</Badge>;
}

const GENERIC_COLOR: Record<string, BadgeColor> = {
  active: "green",
  inactive: "grey",
  paid: "green",
  void: "red",
  pending: "orange",
  failed: "red",
  dead: "red",
  retrying: "orange",
  in_progress: "blue",
  delivered: "green",
  cancelled: "grey",
};

export function GenericStatusBadge({ status }: { status: string }) {
  const color = GENERIC_COLOR[status] ?? "grey";
  return <Badge color={color}>{status}</Badge>;
}
