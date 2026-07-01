"use client";

import * as React from "react";
import { MEDUSA_BASE_URL } from "./medusa";

type B2bStatus =
  | { kind: "loading" }
  | { kind: "unauthenticated" }
  | { kind: "pending" }
  | { kind: "approved" };

let singletonPromise: Promise<boolean> | null = null;
let singletonResolved = false;
let singletonApproved = false;

function fetchB2bApproved(): Promise<boolean> {
  if (singletonResolved) return Promise.resolve(singletonApproved);
  if (singletonPromise) return singletonPromise;

  singletonPromise = (async () => {
    try {
      const token = window.localStorage.getItem("medusa_auth_token");
      if (!token) {
        singletonResolved = true;
        singletonApproved = false;
        return false;
      }
      const res = await fetch(`${MEDUSA_BASE_URL}/store/companies/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-publishable-api-key":
            process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
        },
      });
      const data = await res.json();
      const approved = data?.b2b?.company?.status === "approved";
      singletonResolved = true;
      singletonApproved = approved;
      return approved;
    } catch {
      singletonResolved = true;
      singletonApproved = false;
      return false;
    }
  })();

  return singletonPromise;
}

export function useB2bStatus(): B2bStatus {
  const [status, setStatus] = React.useState<B2bStatus>({ kind: "loading" });

  React.useEffect(() => {
    let cancelled = false;

    const token = window.localStorage.getItem("medusa_auth_token");
    if (!token) {
      setStatus({ kind: "unauthenticated" });
      return;
    }

    fetchB2bApproved().then((approved) => {
      if (cancelled) return;
      setStatus(approved ? { kind: "approved" } : { kind: "pending" });
    });

    return () => { cancelled = true; };
  }, []);

  return status;
}
