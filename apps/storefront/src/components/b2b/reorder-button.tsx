"use client";

import * as React from "react";
import { Button } from "@risitex/ui/components";
import { RotateCcw } from "lucide-react";
import { medusa } from "@/lib/medusa";

export function ReorderButton({ orderId }: { orderId: string }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(false);

  const onClick = async () => {
    setBusy(true);
    setErr(false);
    try {
      const res = (await medusa().store.order.retrieve(orderId, {
        fields: "items.variant_id,items.quantity",
      })) as { order?: { items?: Array<{ variant_id?: string; quantity?: number }> } };
      const items = res?.order?.items ?? [];
      const params = new URLSearchParams();
      for (const it of items) {
        if (it.variant_id && it.quantity) {
          params.append("variant", `${it.variant_id}:${it.quantity}`);
        }
      }
      window.location.href = `/b2b/purchase-orders/new?${params.toString()}`;
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      isLoading={busy}
      onClick={onClick}
      disabled={err}
    >
      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
      {err ? "Couldn't reorder" : "Reorder"}
    </Button>
  );
}
