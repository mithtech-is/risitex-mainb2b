"use client";

import * as React from "react";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { cn } from "./utils";

export type ApprovalStatusCardProps = {
  status: "pending" | "approved" | "rejected" | "suspended";
  /** Optional details rendered beneath the headline */
  details?: React.ReactNode;
  /** Optional action slot (e.g. Edit application button) */
  action?: React.ReactNode;
  className?: string;
};

const CONFIG: Record<
  ApprovalStatusCardProps["status"],
  {
    icon: React.ReactNode;
    headline: string;
    body: string;
    iconTone: string;
    surfaceTone: string;
  }
> = {
  pending: {
    icon: <Clock className="h-5 w-5" />,
    headline: "Application under review",
    body: "We verify within one business day. You will receive an email with your tier assignment.",
    iconTone: "text-feedback-warning-text",
    surfaceTone: "bg-feedback-warning-bg ring-feedback-warning-border",
  },
  approved: {
    icon: <CheckCircle2 className="h-5 w-5" />,
    headline: "Account approved",
    body: "Your wholesale account is live. Open the catalogue to see tier pricing.",
    iconTone: "text-feedback-success-text",
    surfaceTone: "bg-feedback-success-bg ring-feedback-success-border",
  },
  rejected: {
    icon: <XCircle className="h-5 w-5" />,
    headline: "Application not approved",
    body: "We couldn't approve this application. Reach out via the contact form if you'd like to resubmit.",
    iconTone: "text-feedback-danger-text",
    surfaceTone: "bg-feedback-danger-bg ring-feedback-danger-border",
  },
  suspended: {
    icon: <AlertTriangle className="h-5 w-5" />,
    headline: "Account suspended",
    body: "New orders cannot be placed while the account is suspended.",
    iconTone: "text-feedback-danger-text",
    surfaceTone: "bg-feedback-danger-bg ring-feedback-danger-border",
  },
};

export function ApprovalStatusCard({
  status,
  details,
  action,
  className,
}: ApprovalStatusCardProps) {
  const cfg = CONFIG[status];
  return (
    <section
      className={cn(
        "flex items-start gap-4 rounded-lg p-5 ring-1",
        cfg.surfaceTone,
        className,
      )}
    >
      <span className={cn("mt-0.5", cfg.iconTone)}>{cfg.icon}</span>
      <div className="flex-1">
        <p className="font-display text-heading-md text-text-primary">
          {cfg.headline}
        </p>
        <p className="mt-1 text-body-md text-text-secondary">{cfg.body}</p>
        {details && <div className="mt-3">{details}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </section>
  );
}
