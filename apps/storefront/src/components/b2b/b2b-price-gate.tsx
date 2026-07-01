"use client";

import * as React from "react";
import { useB2bStatus } from "@/lib/use-b2b-status";

type Props = {
  approved: React.ReactNode;
  pending?: React.ReactNode;
  unauthenticated?: React.ReactNode;
};

export function B2bPriceGate({ approved, pending, unauthenticated }: Props) {
  const status = useB2bStatus();

  if (status.kind === "loading") {
    return <span className="text-text-muted italic text-caption">Loading...</span>;
  }

  if (status.kind === "approved") {
    return <>{approved}</>;
  }

  if (status.kind === "unauthenticated") {
    return <>{unauthenticated ?? <span className="text-text-muted italic text-caption">Login to view</span>}</>;
  }

  return <>{pending ?? <span className="text-text-muted italic text-caption">Pending approval</span>}</>;
}
