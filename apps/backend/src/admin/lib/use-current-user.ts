import { useEffect, useState } from "react";
import { api } from "./admin-client";

type CurrentUser = { id: string; email: string };
type MeResponse = { user: CurrentUser };

/**
 * Caches the current admin user id so action calls (approve / reject) can
 * pass it as `approved_by_user_id` without prompting.
 */
let CACHED: CurrentUser | null = null;
let INFLIGHT: Promise<CurrentUser> | null = null;

export function useCurrentAdminUser(): CurrentUser | null {
  const [user, setUser] = useState<CurrentUser | null>(CACHED);

  useEffect(() => {
    if (user) return;
    if (!INFLIGHT) {
      INFLIGHT = api
        .get<MeResponse>("/admin/users/me")
        .then((r) => {
          CACHED = r.user;
          return r.user;
        })
        .finally(() => {
          INFLIGHT = null;
        });
    }
    INFLIGHT.then(setUser).catch(() => setUser(null));
  }, [user]);

  return user;
}
