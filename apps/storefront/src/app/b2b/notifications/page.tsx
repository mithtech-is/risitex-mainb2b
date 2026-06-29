"use client";

import * as React from "react";
import { EmptyState } from "@risitex/ui/components";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { MEDUSA_BASE_URL } from "@/lib/medusa";

type Notification = {
  id: string;
  title?: string | null;
  message?: string | null;
  description?: string | null;
  created_at?: string | null;
  read_at?: string | null;
};

export default function NotificationsPage() {
  const [state, setState] = React.useState<{
    loading: boolean;
    error: string | null;
    notifications: Notification[];
  }>({ loading: true, error: null, notifications: [] });

  React.useEffect(() => {
    let cancelled = false;
    const token = window.localStorage.getItem("medusa_auth_token");
    const headers: Record<string, string> = {
      "x-publishable-api-key":
        process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    fetch(`${MEDUSA_BASE_URL}/store/notifications?limit=50`, {
      headers,
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Notifications failed (${res.status})`);
        return (await res.json()) as { notifications?: Notification[] };
      })
      .then((body) => {
        if (!cancelled) {
          setState({
            loading: false,
            error: null,
            notifications: body.notifications ?? [],
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            loading: false,
            error:
              err instanceof Error
                ? err.message
                : "Could not load notifications",
            notifications: [],
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-full flex-col gap-6">
      <B2bTopbar
        title="Notifications"
        subtitle="Order, wallet, shipment, and account updates"
      />
      {state.loading && (
        <div className="rounded-md border border-border-subtle bg-surface-raised p-6">
          <p className="text-body-sm text-text-muted">Loading notifications...</p>
        </div>
      )}
      {state.error && (
        <EmptyState
          title="Could not load notifications"
          description={state.error}
        />
      )}
      {!state.loading && !state.error && state.notifications.length === 0 && (
        <EmptyState
          title="No notifications"
          description="New order, shipment, wallet, approval, and support updates will appear here."
        />
      )}
      {!state.loading && !state.error && state.notifications.length > 0 && (
        <div className="divide-y divide-border-subtle rounded-md border border-border-subtle bg-surface-raised">
          {state.notifications.map((item) => (
            <article key={item.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-body-md font-medium text-text-primary">
                    {item.title ?? "Account update"}
                  </h2>
                  <p className="mt-1 text-body-sm text-text-secondary">
                    {item.message ?? item.description ?? "Notification received."}
                  </p>
                </div>
                <time className="shrink-0 text-caption text-text-muted">
                  {item.created_at
                    ? new Date(item.created_at).toLocaleDateString("en-IN")
                    : "Now"}
                </time>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
