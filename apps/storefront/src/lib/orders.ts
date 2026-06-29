import { medusa } from "./medusa";

export type StoreOrder = {
  id: string;
  display_id: number | string;
  status: string;
  payment_status?: string | null;
  fulfillment_status?: string | null;
  created_at: string;
  total: number;
  items?: Array<{
    id: string;
    title?: string | null;
    quantity?: number | null;
    product_id?: string | null;
    variant_id?: string | null;
    unit_price?: number | null;
  }> | null;
};

export async function listStoreOrders(limit = 250): Promise<StoreOrder[]> {
  const response = await medusa().store.order.list({
    limit,
    fields:
      "id,display_id,status,payment_status,fulfillment_status,created_at,total,items.id,items.title,items.quantity,items.product_id,items.variant_id,items.unit_price",
  } as Record<string, unknown>);
  return ((response as { orders?: StoreOrder[] }).orders ?? []) as StoreOrder[];
}
