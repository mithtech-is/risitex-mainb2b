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
import { LayoutDashboard, Users, ShoppingBag, UserRound, FileText } from "lucide-react";
import { Wordmark } from "@/components/site/wordmark";
import { Guard } from "@/components/auth/route-guard";

const GROUPS: SidebarGroup[] = [
  {
    items: [
      { href: "/rep/dashboard", label: "Dashboard", icon: <LayoutDashboard /> },
      { href: "/rep/companies", label: "Companies", icon: <Users /> },
      { href: "/rep/orders", label: "Orders placed", icon: <ShoppingBag /> },
      { href: "/rep/quotes", label: "Quotes", icon: <FileText /> },
      { href: "/rep/profile", label: "Your profile", icon: <UserRound /> },
    ],
  },
];

export default function RepLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  return (
    <DashboardShell
      sidebar={
        <DashboardSidebar
          brand={
            <Link href="/rep/dashboard" className="flex items-center gap-2">
              <Wordmark showMonogram />
              <span className="text-caption text-text-muted">· Sales rep</span>
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
      <Guard requirement="rep">{children}</Guard>
    </DashboardShell>
  );
}
