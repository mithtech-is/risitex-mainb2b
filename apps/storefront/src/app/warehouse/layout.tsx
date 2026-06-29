"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DashboardShell,
  DashboardSidebar,
  ThemeSwitch,
  type SidebarGroup,
} from "@risitex/ui/components";
import { LayoutDashboard, Truck, Boxes, PackageCheck, ArrowRightLeft } from "lucide-react";
import { Wordmark } from "@/components/site/wordmark";
import { Guard } from "@/components/auth/route-guard";

const GROUPS: SidebarGroup[] = [
  {
    items: [
      { href: "/warehouse/dashboard", label: "Dashboard", icon: <LayoutDashboard /> },
      { href: "/warehouse/pick-pack", label: "Pick & pack", icon: <PackageCheck /> },
      { href: "/warehouse/dispatch", label: "Dispatch", icon: <Truck /> },
      { href: "/warehouse/stock", label: "Stock", icon: <Boxes /> },
      { href: "/warehouse/transfers", label: "Transfers", icon: <ArrowRightLeft /> },
    ],
  },
];

export default function WarehouseLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  return (
    <DashboardShell
      sidebar={
        <DashboardSidebar
          brand={
            <Link href="/warehouse/dashboard" className="flex items-center gap-2">
              <Wordmark showMonogram />
              <span className="text-caption text-text-muted">· Warehouse</span>
            </Link>
          }
          groups={GROUPS}
          activeHref={pathname}
          footer={<ThemeSwitch />}
          renderItem={(item, _, inner) => (
            <Link href={item.href} className="block relative">
              {inner}
            </Link>
          )}
        />
      }
    >
      <Guard requirement="auth">{children}</Guard>
    </DashboardShell>
  );
}
